// Milestone 1: client assertions at the token endpoint (spec 4.1). Each request refreshes a refresh
// token that doesn't exist, so nothing is issued: a Company that accepts the assertion answers
// invalid_grant, and one that refuses it answers invalid_client (RFC 7523 §3.2).

import { errorCode, type Exchange } from "../http.ts";
import { generateKey, nowSeconds, randomId, signJwt, signPs384 } from "../jose.ts";
import { mediatedSignIn, skipRest, type Context, type Detail, type Recorder } from "./types.ts";

export const ASSERTION_IDS = [
    "assertion.ps384",
    "assertion.signature",
    "assertion.expired",
    "assertion.claims",
    "assertion.aud-array",
    "assertion.aud-endpoint",
    "assertion.jti-reuse",
];

const ASSERTION_TYPE = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";

type AssertionOptions = {
    aud?: unknown;
    jti?: string;
    // Sign with the RSA key in jwks.json, with PS384.
    rsa?: boolean;
    // Sign with a key that isn't in jwks.json, under the real key's kid.
    stranger?: boolean;
    iat?: number;
    exp?: number;
    // Claims to replace; undefined leaves one out.
    extra?: Record<string, unknown>;
};

async function clientAssertion(ctx: Context, options: AssertionOptions = {}): Promise<string> {
    const identity = ctx.identity!;
    const iat = options.iat ?? nowSeconds();
    const payload = {
        iss: identity.clientId,
        sub: identity.clientId,
        aud: options.aud ?? ctx.discovered.issuer,
        iat,
        exp: options.exp ?? iat + 60,
        jti: options.jti ?? randomId(16),
        ...options.extra,
    };
    if (options.rsa) {
        const root = identity.rsaRootKey!;
        return signPs384(
            { alg: "PS384", typ: "JWT", kid: root.publicJwk.kid },
            payload,
            root.privateKey,
        );
    }
    const key = options.stranger ? await generateKey(false) : identity.rootKey;
    return signJwt(
        { alg: "ES256", typ: "JWT", kid: identity.rootKey.publicJwk.kid },
        payload,
        key.privateKey,
    );
}

function refresh(ctx: Context, endpoint: string, assertion: string, note: string) {
    const body = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: `rt_validator${randomId(16)}`,
        client_id: ctx.identity!.clientId,
        client_assertion_type: ASSERTION_TYPE,
        client_assertion: assertion,
    });
    return ctx.http.request({
        method: "POST",
        url: endpoint,
        headers: {
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
        note,
    });
}

const accepted = (ex: Exchange) => errorCode(ex) === "invalid_grant";
const refused = (ex: Exchange) => errorCode(ex) === "invalid_client";

const REFUSED = '400 or 401 {"error": "invalid_client"}';

// A check that the token endpoint refuses an assertion with invalid_client.
function expectRefused(r: Recorder, id: string, exchanges: Exchange[], cause: string): void {
    const bad = exchanges.filter((ex) => !refused(ex));
    if (bad.length === 0) {
        r.pass(id);
        return;
    }
    const ex = bad[0];
    r.fail(id, {
        exchange: bad,
        expected: REFUSED,
        cause: accepted(ex)
            ? cause
            : "An invalid client assertion gets the OAuth invalid_client error (RFC 7523 §3.2), so the Personal Agent can tell its client authentication failed.",
    });
}

export async function checkAssertions(ctx: Context, r: Recorder): Promise<void> {
    const issuer = ctx.discovered.issuer;
    const endpoint = ctx.discovered.metadata?.token_endpoint;
    if (!ctx.identity || !issuer) {
        skipRest(r, ASSERTION_IDS, ctx.identityProblem ?? "No test Personal Agent or issuer.");
        return;
    }
    if (typeof endpoint !== "string" || !endpoint.startsWith("https://")) {
        skipRest(r, ASSERTION_IDS, "The issuer's metadata has no token_endpoint.");
        return;
    }
    const jti = randomId(16);
    const assertion = await clientAssertion(ctx, { jti });
    const control = await refresh(
        ctx,
        endpoint,
        assertion,
        "a client assertion for the issuer, with a refresh token that doesn't exist",
    );
    if (!accepted(control)) {
        // The validator itself wasn't accepted, or the endpoint doesn't answer in a way that tells
        // accepted assertions from refused ones. Not a finding against the Company.
        const detail: Detail = {
            exchange: control,
            expected:
                '400 {"error": "invalid_grant"}: the assertion accepted, the refresh token unknown',
            cause: refused(control)
                ? "The token endpoint refused a valid client assertion for the issuer, so its other checks can't be told apart. A Company decides which Personal Agents it accepts (spec 4.1). If it accepts only approved Personal Agents, approve the test Personal Agent's client_id and run again."
                : "The token endpoint didn't answer an unknown refresh token with invalid_grant, so its client assertion checks can't be told apart.",
        };
        for (const id of ASSERTION_IDS) r.inconclusive(id, detail);
        return;
    }

    if (r.wants("assertion.ps384")) {
        if (!ctx.identity.rsaRootKey)
            r.skip(
                "assertion.ps384",
                "The test Personal Agent has no RSA key. Run keygen --force and host the new agent.json and jwks.json.",
            );
        else {
            const ex = await refresh(
                ctx,
                endpoint,
                await clientAssertion(ctx, { rsa: true }),
                "a client assertion signed with PS384 by the RSA key in jwks_uri",
            );
            if (accepted(ex)) r.pass("assertion.ps384");
            else
                r.fail("assertion.ps384", {
                    exchange: ex,
                    expected:
                        '400 {"error": "invalid_grant"}: the assertion accepted, the refresh token unknown',
                    cause: "Companies accept client assertions signed with ES256 and with PS384, which lets a Personal Agent have them signed blindly (4.1, 10.7). Verify the assertion with the RSA key its kid names in jwks_uri.",
                });
        }
    }

    if (r.wants("assertion.signature")) {
        const ex = await refresh(
            ctx,
            endpoint,
            await clientAssertion(ctx, { stranger: true }),
            "a client assertion signed by a key that isn't in jwks_uri, under the kid of one that is",
        );
        expectRefused(
            r,
            "assertion.signature",
            [ex],
            "The token endpoint accepted a client assertion whose signature doesn't verify with the key its kid names. Verify it with the Personal Agent's key from jwks_uri (RFC 7523 §3).",
        );
    }

    if (r.wants("assertion.expired")) {
        const now = nowSeconds();
        const ex = await refresh(
            ctx,
            endpoint,
            await clientAssertion(ctx, { iat: now - 600, exp: now - 300 }),
            "a client assertion that expired five minutes ago",
        );
        expectRefused(
            r,
            "assertion.expired",
            [ex],
            "The token endpoint accepted an expired client assertion. Reject one whose exp has passed (RFC 7523 §3).",
        );
    }

    if (r.wants("assertion.claims")) {
        const noExp = await refresh(
            ctx,
            endpoint,
            await clientAssertion(ctx, { extra: { exp: undefined } }),
            "a client assertion with no exp",
        );
        const noSub = await refresh(
            ctx,
            endpoint,
            await clientAssertion(ctx, { extra: { sub: undefined } }),
            "a client assertion with no sub",
        );
        expectRefused(
            r,
            "assertion.claims",
            [noExp, noSub],
            "The token endpoint accepted a client assertion missing a claim RFC 7523 §3 requires: iss, sub (the client_id), aud, and exp.",
        );
    }

    if (r.wants("assertion.aud-array")) {
        const ex = await refresh(
            ctx,
            endpoint,
            await clientAssertion(ctx, { aud: [issuer, `${issuer.replace(/\/+$/, "")}/other`] }),
            "a client assertion whose aud is an array holding the issuer and another value",
        );
        expectRefused(
            r,
            "assertion.aud-array",
            [ex],
            "The token endpoint accepted a client assertion whose aud is an array. aud is the issuer as a single string, and any other aud is rejected (4.1), so an assertion meant for several audiences can't be used here (10.4).",
        );
    }

    if (r.wants("assertion.jti-reuse")) {
        const again = await refresh(ctx, endpoint, assertion, "the same client assertion again");
        if (refused(again)) r.pass("assertion.jti-reuse");
        else
            r.fail("assertion.jti-reuse", {
                exchange: again,
                expected: '{"error": "invalid_client"}',
                cause: "The token endpoint accepted a client assertion whose jti it had already seen. The guides suggest rejecting a reused jti from the same client_id until the assertion expires.",
            });
    }

    if (r.wants("assertion.aud-endpoint")) {
        if (endpoint === issuer) {
            r.skip("assertion.aud-endpoint", "The token endpoint's URL is the issuer.");
            return;
        }
        const ex = await refresh(
            ctx,
            endpoint,
            await clientAssertion(ctx, { aud: endpoint }),
            "a client assertion with aud set to the token endpoint URL",
        );
        expectRefused(
            r,
            "assertion.aud-endpoint",
            [ex],
            "The token endpoint accepted a client assertion whose aud is its own URL. Accept only aud equal to the issuer, compared character for character, so an assertion meant for another Company's endpoint can't be used here (10.4).",
        );
    }
}

const MEDIATED_GRANT = "https://personalagentprotocol.org/grant/mediated-sign-in";

// Mediated Sign-In (Mediated Sign-In 4, 5): a sign_in_id the Company never issued gets
// invalid_grant. The request has the test Personal Agent's client assertion and an invented code,
// and no credentials, so it can't sign anyone in.
export async function checkMediatedSignIn(ctx: Context, r: Recorder): Promise<void> {
    const id = "mediated.unknown-sign-in";
    if (!r.wants(id)) return;
    const endpoint = ctx.discovered.metadata?.token_endpoint;
    if (!mediatedSignIn(ctx.discovered.poppy)) {
        r.skip(id, "poppy.json doesn't list Mediated Sign-In version 1.");
        return;
    }
    if (!ctx.identity || !ctx.discovered.issuer) {
        r.skip(id, ctx.identityProblem ?? "No test Personal Agent or issuer.");
        return;
    }
    if (typeof endpoint !== "string" || !endpoint.startsWith("https://")) {
        r.skip(id, "The issuer's metadata has no token_endpoint.");
        return;
    }
    const body = new URLSearchParams({
        grant_type: MEDIATED_GRANT,
        sign_in_id: `sgn_validator${randomId(12)}`,
        one_time_code: "000000",
        client_id: ctx.identity.clientId,
        client_assertion_type: ASSERTION_TYPE,
        client_assertion: await clientAssertion(ctx),
    });
    const ex = await ctx.http.request({
        method: "POST",
        url: endpoint,
        headers: {
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
        note: "a Mediated Sign-In code for a sign_in_id the Company never issued",
    });
    if (ex.status === 400 && errorCode(ex) === "invalid_grant") r.pass(id);
    else if (refused(ex))
        r.inconclusive(id, {
            exchange: ex,
            expected: '400 {"error": "invalid_grant"}',
            cause: "The token endpoint refused the test Personal Agent's client assertion, so the sign_in_id wasn't checked. A Company decides which Personal Agents it accepts (spec 4.1). If it accepts only approved Personal Agents, approve the test Personal Agent's client_id and run again.",
        });
    else
        r.fail(id, {
            exchange: ex,
            expected: '400 {"error": "invalid_grant"}',
            cause:
                ex.status !== undefined && ex.status < 300
                    ? "The token endpoint issued tokens for a sign_in_id it never issued."
                    : "A sign_in_id that is unknown, or belongs to another client, gets invalid_grant (Mediated Sign-In 5).",
        });
}
