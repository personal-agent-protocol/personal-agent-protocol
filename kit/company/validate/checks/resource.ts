// Milestone 1: how APIs and the conversation endpoint verify the Session header (spec 5.2, 5.3).
// The probe is a safe GET: an unknown conversation's events (expected 404 conversation_not_found
// with a good Session header), or a GET operation the engineer names with --probe (expected 2xx).

import { sessionRequest, type SessionOptions } from "../agent.ts";
import {
    header,
    isInvalidSession,
    jsonError,
    parseChallenges,
    parseWwwAuthenticate,
    type Exchange,
} from "../http.ts";
import {
    generateKey,
    MAX_DELEGATION_LIFETIME,
    nowSeconds,
    randomId,
    signDelegation,
    thumbprint,
} from "../jose.ts";
import {
    conversationEndpoint,
    fieldOf,
    isHttpsUrl,
    skipRest,
    type Context,
    type Recorder,
} from "./types.ts";

export const RESOURCE_IDS = [
    "session.missing",
    "session.typ",
    "session.unknown-key",
    "session.kid-thumbprint",
    "session.without-delegation",
    "session.delegation-signature",
    "session.delegation-expired",
    "session.delegation-lifetime",
    "session.delegation-typ",
    "session.delegation-iss",
    "session.delegation-kid",
    "session.iat-after-delegation",
    "session.claims",
    "session.aud",
    "session.htm",
    "session.htu",
    "session.iat",
    "session.ath-without-token",
    "session.invalid-everywhere",
    "token.invented",
    "token.in-url",
];

export const INVALID_SESSION = '400 {"error": "invalid_session"}';

export type Probe = {
    url: string;
    kind: "conversation" | "probe";
    describe: string;
};

export function findProbe(ctx: Context): Probe | undefined {
    // A URL the engineer named comes first.
    if (ctx.options.probe) {
        return { url: ctx.options.probe, kind: "probe", describe: "the --probe URL" };
    }
    const endpoint = conversationEndpoint(ctx.discovered.poppy);
    if (endpoint) {
        return {
            url: `${endpoint}/cnv_validator${randomId(9)}/events`,
            kind: "conversation",
            describe: "the events of a conversation that doesn't exist",
        };
    }
    return undefined;
}

// Whether the probe handled the request as a Session's.
export function accepted(probe: Probe, ex: Exchange): boolean {
    if (probe.kind === "conversation")
        return ex.status === 404 && jsonError(ex) === "conversation_not_found";
    return ex.status !== undefined && ex.status >= 200 && ex.status < 300;
}

// How a refusal differs from HTTP 400 with {"error": "invalid_session"} in a JSON body (5.3), if it
// names invalid_session at all.
export function invalidSessionShape(ex: Exchange): string | undefined {
    const inHeader = parseWwwAuthenticate(header(ex, "www-authenticate")).params.error;
    if (jsonError(ex) === "invalid_session" && ex.status !== 400)
        return `invalid_session with HTTP ${ex.status}. It's always HTTP 400 (section 7).`;
    if (inHeader === "invalid_session" && jsonError(ex) !== "invalid_session")
        return "invalid_session in WWW-Authenticate rather than a JSON body. It goes in the JSON body; WWW-Authenticate is for access token errors (section 7).";
    return undefined;
}

// A rejection check: 400 invalid_session passes; handling the request fails (or warns when the spec
// leaves the limit to the Company); any other answer fails, since a failed Session check is always
// 400 invalid_session (5.3). No response, or a rate limit, is inconclusive.
export function expectInvalidSession(
    r: Recorder,
    id: string,
    ex: Exchange,
    handled: boolean,
    cause: string,
    lenient = false,
): void {
    if (isInvalidSession(ex)) r.pass(id);
    else if (handled)
        (lenient ? r.warn : r.fail)(id, {
            exchange: ex,
            expected: INVALID_SESSION,
            got: `${`${ex.status} ${ex.statusText ?? ""}`.trim()}, the request was handled`,
            cause,
        });
    else
        r.fail(id, {
            exchange: ex,
            expected: INVALID_SESSION,
            cause:
                invalidSessionShape(ex) ??
                "The request was refused, but not with invalid_session. A failed Session header check returns HTTP 400 with invalid_session in a JSON body (5.3), so the Personal Agent knows to start a new Session.",
        });
}

export async function checkResources(ctx: Context, r: Recorder): Promise<void> {
    if (!ctx.identity) {
        skipRest(r, RESOURCE_IDS, ctx.identityProblem ?? "No test Personal Agent.");
        return;
    }
    if (!ctx.session.started) {
        skipRest(
            r,
            RESOURCE_IDS,
            ctx.blocked.identity ?? "No Session was started (see session.start).",
        );
        return;
    }
    const probe = findProbe(ctx);
    if (!probe) {
        skipRest(
            r,
            RESOURCE_IDS,
            "poppy.json lists no conversation endpoint to probe. Pass --probe with the URL of a GET operation in your API.",
        );
        return;
    }
    const expect = (id: string, ex: Exchange, cause: string, lenient = false) =>
        expectInvalidSession(r, id, ex, accepted(probe, ex), cause, lenient);

    const missing = await sessionRequest(ctx, {
        url: probe.url,
        session: "none",
        note: `${probe.describe}, with no Session header`,
    });
    if (isInvalidSession(missing)) r.pass("session.missing");
    else if (probe.kind === "probe" && !ctx.options.probeSession && !missing.error)
        r.skip(
            "session.missing",
            `The --probe URL answered ${missing.status} without the Session header. An API that uses no Session claims or state may do so (5.3). Use --probe-session to check an endpoint that requires Session identity or state.`,
        );
    else if (accepted(probe, missing)) {
        r.fail("session.missing", {
            exchange: missing,
            expected: INVALID_SESSION,
            got: `${missing.status}, the request was handled`,
            cause: "A request that depends on Session claims must carry a verified Session header (5.3), including conversation requests (8.2). Reject a request without one with invalid_session.",
        });
        skipRest(
            r,
            RESOURCE_IDS,
            "The probe handles requests without a Session header, so it can't show whether bad ones are rejected.",
        );
        return;
    } else
        r.fail("session.missing", {
            exchange: missing,
            expected: INVALID_SESSION,
            cause:
                invalidSessionShape(missing) ??
                "A request without the Session header gets HTTP 400 with invalid_session in a JSON body (section 7), so a Personal Agent can tell what to fix. Access token errors are separate, in WWW-Authenticate.",
        });

    const now = nowSeconds();
    const identity = ctx.identity;
    const delegated = identity.key.publicJwk;
    const stranger = await generateKey(false);
    // A delegation whose exp is a few seconds away, for a Session JWT signed "after" it.
    const shortDelegation = await signDelegation({
        root: identity.rootKey,
        delegated,
        iss: identity.clientId,
        iat: now - 3600,
        lifetime: 3600 + 5,
    });
    const cases: [string, SessionOptions, string, string][] = [
        [
            "session.typ",
            { typ: "JWT" },
            "with a Session JWT whose typ is JWT",
            "The endpoint doesn't check typ, so another JWT signed by the same key could be used as a Session JWT. Require poppy-session+jwt.",
        ],
        [
            "session.unknown-key",
            { key: stranger },
            "with a Session JWT signed by a key its delegation doesn't name",
            "The endpoint doesn't verify the Session JWT's signature with the key in the delegation's cnf.jwk.",
        ],
        [
            "session.kid-thumbprint",
            { kid: await thumbprint(stranger.publicJwk) },
            "with a Session JWT whose kid isn't the thumbprint of the key that signed it",
            "The endpoint doesn't check that the Session JWT's kid is the JWK thumbprint of the delegation's cnf.jwk (5.2, step 3).",
        ],
        [
            "session.without-delegation",
            { key: identity.rootKey, delegation: null },
            "with a Session JWT signed directly with the key in jwks.json, and no delegation",
            "Session JWTs are signed only with delegated keys. Reject one without pap_dlg, even when a key in jwks_uri signed it.",
        ],
        [
            "session.delegation-signature",
            {
                delegation: await signDelegation({
                    root: stranger,
                    delegated,
                    iss: identity.clientId,
                    kid: identity.rootKey.publicJwk.kid,
                }),
            },
            "with a Session JWT whose delegation names a key in jwks_uri but was signed by another key",
            "The endpoint doesn't verify the delegation's signature with the key its kid names in the Personal Agent's jwks_uri, so anyone could vouch for a key (5.2, step 1).",
        ],
        [
            "session.delegation-expired",
            {
                delegation: await signDelegation({
                    root: identity.rootKey,
                    delegated,
                    iss: identity.clientId,
                    iat: now - 7200,
                    lifetime: 3600,
                }),
            },
            "with a Session JWT whose delegation expired an hour ago",
            "The endpoint doesn't check the delegation's exp. Removing a key from jwks_uri and short delegations are what limit a stolen delegated key (10.7).",
        ],
        [
            "session.delegation-lifetime",
            {
                delegation: await signDelegation({
                    root: identity.rootKey,
                    delegated,
                    iss: identity.clientId,
                    lifetime: MAX_DELEGATION_LIFETIME + 3600,
                }),
            },
            "with a Session JWT whose delegation lasts 25 hours",
            "The endpoint doesn't check that the delegation's exp is at most 24 hours after its iat.",
        ],
        [
            "session.delegation-typ",
            {
                delegation: await signDelegation({
                    root: identity.rootKey,
                    delegated,
                    iss: identity.clientId,
                    typ: "JWT",
                }),
            },
            "with a Session JWT whose delegation's typ is JWT",
            "The endpoint doesn't check the delegation's typ, so another JWT signed by a key in jwks_uri could be used as a delegation. Require pap-delegation+jwt.",
        ],
        [
            "session.delegation-iss",
            {
                delegation: await signDelegation({
                    root: identity.rootKey,
                    delegated,
                    iss: "https://other-agent.test/agent.json",
                }),
            },
            "with a Session JWT whose delegation's iss is another client_id",
            "The endpoint doesn't check that the delegation's iss is the Session JWT's iss.",
        ],
        [
            "session.delegation-kid",
            {
                delegation: await signDelegation({
                    root: identity.rootKey,
                    delegated,
                    iss: identity.clientId,
                    kid: `validator${randomId(9)}`,
                }),
            },
            "with a Session JWT whose delegation's kid names no key in jwks_uri",
            "The endpoint doesn't verify the delegation with the key its kid names in the Personal Agent's jwks_uri.",
        ],
        [
            "session.iat-after-delegation",
            { delegation: shortDelegation, iat: now + 20 },
            "with a Session JWT whose iat is 15 seconds after its delegation's exp",
            "The endpoint doesn't check that the Session JWT's iat is no later than the delegation's exp (5.2, step 4), so a delegated key could keep signing after its delegation ends.",
        ],
        [
            "session.claims",
            { sid: randomId(16), extra: { sub: undefined } },
            "for a new Session, with a Session JWT that has no sub",
            "The endpoint started a Session without a User ID. Check every claim 5.2 requires before creating a Session (5.3).",
        ],
        [
            "session.aud",
            { extra: { aud: `${ctx.discovered.audience}/other` } },
            "with a Session JWT for a different Company identifier",
            "The endpoint doesn't compare aud with its Company's identifier, character for character, so a Session JWT another Company collected would work here (10.4).",
        ],
        [
            "session.htm",
            { method: "POST" },
            "a GET, with a Session JWT whose htm is POST",
            "The endpoint doesn't compare htm with the request's method, so a Session JWT copied from a read could be used for a write to the same URL.",
        ],
        [
            "session.htu",
            { url: `${new URL(probe.url).origin}/poppy-validator/other-path` },
            "with a Session JWT signed for a different URL",
            "The endpoint doesn't compare htm and htu with the request, so a copied Session JWT works at any URL.",
        ],
        [
            "session.iat",
            { iat: now - 3600 },
            "with a Session JWT signed an hour ago",
            "The endpoint accepted a Session JWT signed an hour ago. The Company chooses its acceptance window, such as one minute, and the spec sets no maximum, but a long window lets a copied Session JWT work longer. If iat isn't checked at all, a copied Session JWT works indefinitely.",
        ],
        [
            "session.ath-without-token",
            { extra: { ath: randomId(32) } },
            "with a Session JWT that has ath but no access token",
            "Without an access token, ath must be absent. Accepting it means ath isn't checked against the request.",
        ],
    ];
    for (const [id, session, note, cause] of cases) {
        if (!r.wants(id)) continue;
        const ex = await sessionRequest(ctx, { url: probe.url, session, note });
        expect(id, ex, cause, id === "session.iat");
    }

    if (r.wants("session.invalid-everywhere")) await invalidEverywhere(ctx, r);
    if (r.wants("token.invented")) await inventedToken(ctx, r, probe);
    if (r.wants("token.in-url")) await tokenInUrl(ctx, r, probe);
}

// Early Session verification is recommended (5.3). Empty bodies make these probes safe, but a
// malformed-body response cannot show whether the endpoint would trust unverified Session claims.
async function invalidEverywhere(ctx: Context, r: Recorder): Promise<void> {
    const poppy = ctx.discovered.poppy;
    const endpoints: { url: string; body: unknown; what: string }[] = [];
    const conversations = conversationEndpoint(poppy);
    if (conversations)
        endpoints.push({ url: conversations, body: {}, what: "the conversation endpoint" });
    const feedback = fieldOf(poppy, "feedback", "endpoint");
    if (isHttpsUrl(feedback)) endpoints.push({ url: feedback, body: {}, what: "feedback" });
    const browser = fieldOf(poppy, "web", "browser_session_endpoint");
    if (isHttpsUrl(browser))
        endpoints.push({
            url: `${browser.replace(/\/+$/, "")}/authorize`,
            body: {},
            what: "browser-session authorize",
        });
    if (endpoints.length === 0) {
        r.skip(
            "session.invalid-everywhere",
            "poppy.json lists no conversation, feedback, or browser-session endpoint.",
        );
        return;
    }
    const stranger = await generateKey(false);
    const bad: Exchange[] = [];
    const problems: string[] = [];
    for (const e of endpoints) {
        const ex = await sessionRequest(ctx, {
            method: "POST",
            url: e.url,
            body: e.body,
            session: { key: stranger },
            note: `to ${e.what}, an empty body, with a Session JWT signed by a key its delegation doesn't name`,
        });
        if (isInvalidSession(ex)) continue;
        bad.push(ex);
        problems.push(
            `${e.what}: ${ex.error ? `no response (${ex.error})` : `${ex.status}${jsonError(ex) ? ` ${jsonError(ex)}` : ""}`}`,
        );
    }
    if (bad.length === 0)
        r.pass("session.invalid-everywhere", {
            summary: `invalid_session at ${endpoints.map((e) => e.what).join(", ")}.`,
        });
    else
        r.fail("session.invalid-everywhere", {
            exchange: bad,
            got: problems.join("; "),
            expected: `${INVALID_SESSION} at every endpoint, before the body is checked`,
            cause: "Session verification is recommended generally and required before trusting Session claims. These empty-body probes cannot establish whether unverified claims were used. Verify Session-dependent requests separately, including conversations and browser join (5.3).",
        });
}

// An access token the Company never issued gets 401 invalid_token, in WWW-Authenticate (section 7).
async function inventedToken(ctx: Context, r: Recorder, probe: Probe): Promise<void> {
    const token = `validator${randomId(24)}`;
    const ex = await sessionRequest(ctx, {
        url: probe.url,
        session: { accessToken: token },
        headers: { Authorization: `Bearer ${token}` },
        note: `${probe.describe}, with an access token the Company never issued`,
    });
    const challenges = parseChallenges(header(ex, "www-authenticate"));
    const tokenChallenge = challenges.find((c) => /^(bearer|dpop)$/i.test(c.scheme));
    if (ex.status === 401 && tokenChallenge?.params.error === "invalid_token")
        r.pass("token.invented");
    else if (isInvalidSession(ex))
        r.inconclusive("token.invented", {
            exchange: ex,
            expected: '401 with WWW-Authenticate: Bearer error="invalid_token"',
            cause: "The endpoint answered invalid_session, as for a token issued to another client_id (5.3), so the validator can't tell how it reports an invalid token.",
        });
    else
        r.fail("token.invented", {
            exchange: ex,
            expected: '401 with WWW-Authenticate: Bearer error="invalid_token"',
            cause:
                ex.status !== undefined && ex.status < 300
                    ? "The endpoint handled a request with an access token it never issued."
                    : ex.status === 401
                      ? "Access token errors are in the WWW-Authenticate header, with a Bearer (or DPoP) challenge whose error is invalid_token (section 7, RFC 6750 §3)."
                      : "An invalid access token gets HTTP 401 with invalid_token in the WWW-Authenticate header, so the Personal Agent knows to refresh it (section 7).",
        });
}

// An access token in the URL isn't accepted (5.6). If the endpoint answers invalid_token for an
// invented one, it read the token from the URL.
async function tokenInUrl(ctx: Context, r: Recorder, probe: Probe): Promise<void> {
    const url = new URL(probe.url);
    url.searchParams.set("access_token", `validator${randomId(24)}`);
    const ex = await sessionRequest(ctx, {
        url: url.toString(),
        note: `${probe.describe}, with an invented access token in the query string`,
    });
    const www = parseWwwAuthenticate(header(ex, "www-authenticate"));
    if (ex.status === 401 && www.params.error === "invalid_token")
        r.fail("token.in-url", {
            exchange: ex,
            expected: "The access_token query parameter ignored or refused, not checked as a token",
            cause: "The endpoint read an access token from the URL and checked it. URLs end up in logs and browser history, so tokens are taken only from the Authorization header (5.6, RFC 6750 §2.3).",
        });
    else if (ex.error || ex.status === 429)
        r.fail("token.in-url", { exchange: ex, expected: "A response" });
    else r.pass("token.in-url", { summary: `Answered ${ex.status}, without checking the token.` });
}
