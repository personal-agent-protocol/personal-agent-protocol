// A small in-memory Company, as a fake fetch, for testing checks end to end. It follows the spec
// by default; `flaws` turn off individual behaviors so tests can see the failures they cause.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PROTOCOL_VERSION } from "../catalog.ts";
import { createHttp, type FetchLike, type Http, type HttpOptions } from "../http.ts";
import {
    decodeJwt,
    MAX_DELEGATION_LIFETIME,
    randomId,
    sha256,
    thumbprint,
    verifyJwt,
    verifyPs384,
    type DecodedJwt,
    type EcPublicJwk,
    type RsaPublicJwk,
} from "../jose.ts";

export type Flaws = {
    // --- Discovery and metadata ---
    // Changes poppy.json, or the issuer's metadata, after it's built.
    poppy?: (doc: Record<string, any>) => void;
    metadata?: (doc: Record<string, any>) => void;
    // Serves this text as poppy.json.
    poppyRaw?: string;
    poppyStatus?: number;
    domain?: string;
    httpRedirect?: boolean;
    // www.shop.test redirects to a file outside the well-known path.
    redirectToUpload?: boolean;
    // poppy.json names the issuer in auth.issuer.
    authIssuer?: string;
    // An excluded-tasks document that doesn't match its schema.
    excludedTasksInvalid?: boolean;
    // An excluded task whose alternative references an API that poppy.json doesn't list.
    unlistedAlternativeApi?: boolean;
    // The domain publishes no protected resource metadata.
    noResourceMetadata?: boolean;
    // The protected resource metadata's resource has a trailing slash.
    resourceWithSlash?: boolean;
    // The protected resource metadata lists a second authorization server.
    twoAuthorizationServers?: boolean;
    // The issuer publishes no OAuth server metadata.
    noIssuerMetadata?: boolean;
    // A scope in scopes_supported with no description anywhere.
    undescribedScope?: boolean;
    // Describes its scopes in auth.scopes instead of the OpenAPI description.
    scopesInPoppy?: boolean;
    // The other domain with the same issuer has a different auth in its poppy.json.
    otherDomainAuth?: boolean;

    // --- Session header ---
    // Accepts a Session JWT whose signature doesn't verify with its delegation's key.
    acceptUnknownKey?: boolean;
    // Doesn't check that the Session JWT's kid is the delegated key's thumbprint.
    ignoreKidThumbprint?: boolean;
    // Accepts a Session JWT signed directly with the key in jwks.json, with no delegation.
    acceptMissingDelegation?: boolean;
    // Finds the delegation's key by kid, but doesn't verify its signature.
    skipDelegationSignature?: boolean;
    // Checks delegations only with EC keys, so a PS384 delegation fails.
    rejectPs384Delegation?: boolean;
    acceptExpiredDelegation?: boolean;
    // Accepts a Session JWT signed after its delegation expired.
    acceptIatAfterDelegation?: boolean;
    acceptOtherDelegationTyp?: boolean;
    acceptOtherDelegationIss?: boolean;
    // Tries every key in jwks.json, whatever the delegation's kid.
    ignoreDelegationKid?: boolean;
    acceptLongDelegation?: boolean;
    // Starts a Session from a Session JWT that's missing required claims.
    acceptMissingClaims?: boolean;
    // Ties each Session to the delegated key that started it.
    pinSessionKey?: boolean;
    acceptOtherTyp?: boolean;
    acceptOtherAud?: boolean;
    ignoreHtm?: boolean;
    ignoreHtu?: boolean;
    acceptOldIat?: boolean;
    acceptAthWithoutToken?: boolean;
    // Handles requests without the Session header.
    acceptMissingSession?: boolean;
    // Session header failures answered with 401 invalid_token instead of 400 invalid_session.
    sessionErrors401?: boolean;
    // Treats a known sid as a replay and rejects it.
    rejectKnownSid?: boolean;
    // Allows one Session per User, so a new sid for a known User is rejected.
    oneSessionPerUser?: boolean;
    // Doesn't check which User ID or Agent ID a Session belongs to.
    ignoreSessionUser?: boolean;
    ignoreAgentId?: boolean;
    // Refuses the test Personal Agent by policy: invalid_session at resources, invalid_client at
    // the token endpoint.
    refuseClient?: boolean;
    // Ignores the Authorization header, so an invented access token is never checked.
    ignoreAccessToken?: boolean;
    // Reads an access token from the access_token query parameter.
    acceptTokenInUrl?: boolean;

    // --- Client assertions ---
    acceptEndpointAud?: boolean;
    acceptReusedJti?: boolean;
    rejectPs384Assertion?: boolean;
    acceptBadAssertionSignature?: boolean;
    acceptExpiredAssertion?: boolean;
    acceptMissingAssertionClaims?: boolean;
    acceptAudArray?: boolean;
    // Answers an unknown sign_in_id with code_required.
    mediatedUnknownCodeRequired?: boolean;

    // --- APIs ---
    openapiStatus?: number;
    openapiYaml?: boolean;
    // YAML with an anchor, which the validator doesn't parse.
    openapiYamlAnchors?: boolean;
    openapiNoInfoVersion?: boolean;
    openapiSwagger?: boolean;
    // The MCP server takes signed-out calls without a token.
    mcpWithoutToken?: boolean;
    // The MCP server's 401 has no resource_metadata.
    mcpNoResourceMetadata?: boolean;
    mcpStatus404?: boolean;
    // The MCP server's 401 for an invalid token has no error.
    mcpInvalidTokenNoError?: boolean;
    mcpResourceWithSlash?: boolean;
    mcpOtherAuthorizationServer?: boolean;

    // --- Feedback ---
    // Accepts feedback reports without the Session header.
    feedbackWithoutSession?: boolean;
    // Checks the report before the Session header.
    feedbackBodyFirst?: boolean;
    feedbackBody?: boolean;
    feedbackAlternative?: "listed" | "unlisted";
    feedbackNoValidation?: boolean;

    // --- Browser sessions ---
    // The browser-session page without its security headers.
    webNoHeaders?: boolean;
    // frame-ancestors 'self' instead of 'none'.
    webFrameSelf?: boolean;
    // The join cookie without the __Host- prefix.
    webCookieWithoutHostPrefix?: boolean;
    // The join cookie with SameSite=None.
    webCookieSameSiteNone?: boolean;
    // The browser-session page also sets a load balancer cookie, after the join cookie.
    webExtraCookie?: boolean;
    // Loading the page clears the browser's other cookies.
    webPageClearsCookies?: boolean;
    webAuthorizeStatus200?: boolean;
    // Authorizes a browser-session code more than once.
    webReauthorize?: boolean;
    // Authorizes browser-session codes it never issued.
    webAuthorizeUnknownCode?: boolean;
    // Authorizes codes without checking the Session header.
    webAuthorizeWithoutSession?: boolean;
    // Accepts the browser-session form without the join cookie.
    webFormWithoutCookie?: boolean;
    // Accepts any join cookie it issued, not only the code's.
    webAnyJoinCookie?: boolean;
    // Marks a code used only when a submission succeeds.
    webCodeReusableAfterFailure?: boolean;

    // --- Conversations ---
    // poppy.json lists no Company Agent, so checks probe /api/orders, which serves requests without
    // the Session header.
    noAgent?: boolean;
    startReturns200?: boolean;
    retryCreatesNewConversation?: boolean;
    // Returns message_id_conflict with 400 instead of 409.
    conflictStatus400?: boolean;
    followUpWithoutStatus?: boolean;
    followUpRetry200?: boolean;
    // Lets any User read any conversation.
    ignoreConversationOwner?: boolean;
    acceptEmptyMessage?: boolean;
    acceptAnyMessageId?: boolean;
    maxMessageId128?: boolean;
    requireText?: boolean;
    contextNotRecorded?: boolean;
    eventsWithoutHasMore?: boolean;
    // created_at on a day that doesn't exist.
    eventBadCreatedAt?: boolean;
    wrongRole?: boolean;
    dropMessageData?: boolean;
    retryRecordedTwice?: boolean;
    repeatFirstEvent?: boolean;
    noStateEvents?: boolean;
    cursorIgnored?: boolean;
    waitRejected?: boolean;
    acceptAnyWait?: boolean;
    unknownCursorEmpty?: boolean;
    cursorAnyConversation?: boolean;
    messageIdsPerConversation?: boolean;
    noSse?: boolean;
    sseWrongId?: boolean;
    sseIgnoresLastEventId?: boolean;
    // Unknown conversations get {"error": "not_found"}.
    notFoundError?: boolean;
    closeWithoutResponder?: boolean;
    noCloseEvent?: boolean;
    closeAgainAddsEvent?: boolean;
    closedAcceptsMessages?: boolean;
    closedAcceptsHandoff?: boolean;
    // Starts Direct Conversations whatever the parent.
    directIgnoresParent?: boolean;
    // The Company's reply carries an operation.
    returnOperations?: boolean;
};

export const ORIGIN = "https://shop.test";
export const OTHER_DOMAIN = "https://shop-two.test";

// Every test host resolves to a public documentation address (RFC 5737).
export const PUBLIC_LOOKUP = async () => ["203.0.113.7"];

// The validator's HTTP client, talking to the fake Company.
export function fakeHttp(agentDir: string, flaws: Flaws = {}, options: HttpOptions = {}): Http {
    return createHttp({
        fetch: fakeCompany(agentDir, flaws),
        lookup: PUBLIC_LOOKUP,
        sleep: async () => undefined,
        ...options,
    });
}

const TOKEN = `${ORIGIN}/oauth/token`;
const CONV = `${ORIGIN}/poppy/conversations`;
export const MCP_URL = `${ORIGIN}/mcp`;
const MCP = MCP_URL;
const MCP_PRM = `${ORIGIN}/.well-known/oauth-protected-resource/mcp`;
const FEEDBACK = `${ORIGIN}/poppy/feedback`;
const BROWSER_SESSION = `${ORIGIN}/poppy/browser-session`;
const MEDIATED_GRANT = "https://personalagentprotocol.org/grant/mediated-sign-in";
const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

type Event = Record<string, unknown> & { id: string };

type Conversation = {
    id: string;
    sub: string;
    events: Event[];
    status: string;
    responder: string;
    direct: boolean;
};

type Stored = { conv: string; content: string; status: number; body: string };

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json", ...headers },
    });
}

const isObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v);

const OPENAPI_YAML = `# The Shop API
openapi: "3.1.0"
info:
  title: Shop   # shown to Personal Agents
  version: '1.0.0'
  description: |
    Orders and returns.
    Signed-in calls need a token.
paths:
  /orders:
    get:
      operationId: listOrders
      responses:
        '200': { description: "The User's orders" }
components:
  securitySchemes:
    oauth:
      $ref: '#/components/x-shared/oauth'
  x-shared:
    oauth:
      type: oauth2
      flows:
        authorizationCode:
          authorizationUrl: https://shop.test/oauth/authorize
          tokenUrl: https://shop.test/oauth/token
          scopes:
            "orders:read": See your orders # a comment
`;

const OPENAPI_YAML_ANCHORS = `openapi: 3.1.0
info: &info
  title: Shop
  version: 1.0.0
paths: {}
`;

export function fakeCompany(agentDir: string, flaws: Flaws = {}): FetchLike {
    // Each Session's User ID, Agent ID, and delegated key thumbprint, by sid.
    const sessions = new Map<string, { sub: string; agentId?: unknown; kid: string }>();
    const convs = new Map<string, Conversation>();
    // Accepted messages, by User and message ID (spec 8.3).
    const messageIds = new Map<string, Stored>();
    // Browser-session codes, their join cookies, and whether each has been authorized or used.
    const codes = new Map<
        string,
        { join: string; authorized: boolean; used: boolean; exp: number; sid?: string }
    >();
    let eventCounter = 0;
    // The jti of each client assertion the token endpoint accepted.
    const assertionJtis = new Set<string>();

    const agentFile = (name: string) => readFileSync(join(agentDir, name), "utf8");
    const clientId = () => String(JSON.parse(agentFile("agent.json")).client_id);
    const roots = () =>
        (JSON.parse(agentFile("jwks.json")) as { keys: (EcPublicJwk | RsaPublicJwk)[] }).keys;
    const now = () => Math.floor(Date.now() / 1000);

    // Verifies a Session JWT's delegation and signature as spec 5.2 describes. Returns the decoded
    // JWT, or null.
    async function verifyDelegated(jwt: string): Promise<DecodedJwt | null> {
        const keys = roots().filter((k) => !flaws.rejectPs384Delegation || k.kty === "EC");
        const token = decodeJwt(jwt);
        const dlg = token.header.pap_dlg;
        if (typeof dlg !== "string") {
            if (!flaws.acceptMissingDelegation) return null;
            const ec = keys.find((k): k is EcPublicJwk => k.kty === "EC")!;
            return verifyJwt(jwt, ec);
        }
        const dlgHeader = decodeJwt(dlg).header;
        const candidates = flaws.ignoreDelegationKid
            ? keys
            : keys.filter((k) => k.kid === dlgHeader.kid);
        let delegation: DecodedJwt | null = null;
        for (const root of candidates) {
            if (flaws.skipDelegationSignature) {
                delegation ??= decodeJwt(dlg);
                continue;
            }
            delegation ??=
                root.kty === "RSA" && dlgHeader.alg === "PS384"
                    ? await verifyPs384(dlg, root)
                    : root.kty === "EC" && dlgHeader.alg === "ES256"
                      ? await verifyJwt(dlg, root)
                      : null;
        }
        if (!delegation) return null;
        if (delegation.header.typ !== "pap-delegation+jwt" && !flaws.acceptOtherDelegationTyp)
            return null;
        const d = delegation.payload as { iss?: unknown; iat?: number; exp?: number };
        if (d.iss !== clientId() && !flaws.acceptOtherDelegationIss) return null;
        if (typeof d.exp !== "number" || typeof d.iat !== "number") return null;
        if (d.exp <= now() && !flaws.acceptExpiredDelegation) return null;
        if (d.exp - d.iat > MAX_DELEGATION_LIFETIME && !flaws.acceptLongDelegation) return null;
        const jwk = (delegation.payload.cnf as { jwk?: EcPublicJwk } | undefined)?.jwk;
        if (!jwk || jwk.kty !== "EC" || "d" in jwk) return null;
        const verified = await verifyJwt(jwt, jwk);
        if (!verified) return flaws.acceptUnknownKey ? token : null;
        if (verified.header.kid !== (await thumbprint(jwk)) && !flaws.ignoreKidThumbprint)
            return null;
        if (Number(verified.payload.iat) > d.exp && !flaws.acceptIatAfterDelegation) return null;
        return verified;
    }

    const invalidSession = () =>
        flaws.sessionErrors401
            ? json(
                  401,
                  { error: "invalid_token" },
                  { "www-authenticate": 'Bearer error="invalid_token"' },
              )
            : json(400, { error: "invalid_session" });
    const invalidToken = () =>
        new Response(null, {
            status: 401,
            headers: { "www-authenticate": 'Bearer error="invalid_token"' },
        });

    type Checked = { error?: Response; sub: string; sid?: string };

    // Checks the Session header, and any access token, as spec 5.3 describes. Returns an error
    // response, or the Session's User ID.
    async function authorize(method: string, url: string, headers: Headers): Promise<Checked> {
        const u = new URL(url);
        if (flaws.acceptTokenInUrl && u.searchParams.has("access_token"))
            return { error: invalidToken(), sub: "" };
        const jwt = headers.get("poppy-session");
        if (!jwt)
            return flaws.acceptMissingSession ? { sub: "" } : { error: invalidSession(), sub: "" };
        if (flaws.refuseClient) return { error: invalidSession(), sub: "" };
        let token;
        try {
            token = await verifyDelegated(jwt);
        } catch {
            return { error: invalidSession(), sub: "" };
        }
        if (!token) return { error: invalidSession(), sub: "" };
        const { header, payload } = token;
        const bad = () => ({ error: invalidSession(), sub: "" });
        const required = ["iss", "aud", "sid", "sub", "htm", "htu", "iat", "jti"];
        if (!flaws.acceptMissingClaims && required.some((c) => payload[c] === undefined))
            return bad();
        if (header.typ !== "poppy-session+jwt" && !flaws.acceptOtherTyp) return bad();
        if (payload.iss !== clientId()) return bad();
        if (payload.aud !== ORIGIN && !flaws.acceptOtherAud) return bad();
        if (payload.htm !== method && !flaws.ignoreHtm) return bad();
        if (payload.htu !== `${u.origin}${u.pathname}` && !flaws.ignoreHtu) return bad();
        if (Math.abs(now() - Number(payload.iat)) > 60 && !flaws.acceptOldIat) return bad();
        const auth = headers.get("authorization");
        if (!auth && payload.ath !== undefined && !flaws.acceptAthWithoutToken) return bad();
        if (auth && payload.ath !== (await sha256(auth.split(" ")[1] ?? ""))) return bad();
        const sid = String(payload.sid);
        const sub = String(payload.sub);
        const kid = String(header.kid);
        const session = sessions.get(sid);
        if (session) {
            if (flaws.rejectKnownSid) return bad();
            if (session.sub !== sub && !flaws.ignoreSessionUser) return bad();
            if (session.agentId !== payload.agent_id && !flaws.ignoreAgentId) return bad();
            if (session.kid !== kid && flaws.pinSessionKey) return bad();
        } else {
            if (flaws.oneSessionPerUser && [...sessions.values()].some((s) => s.sub === sub))
                return bad();
            sessions.set(sid, { sub, agentId: payload.agent_id, kid });
        }
        // The Company issued no access tokens, so any is invalid.
        if (auth && !flaws.ignoreAccessToken) return { error: invalidToken(), sub, sid };
        return { sub, sid };
    }

    // Checks a token request's client assertion as spec 4.1 describes. Returns true if it's valid.
    async function clientAuthenticated(form: URLSearchParams): Promise<boolean> {
        const assertion = form.get("client_assertion");
        if (flaws.refuseClient) return false;
        if (!assertion || form.get("client_id") !== clientId()) return false;
        const alg = decodeJwt(assertion).header.alg;
        const key = roots().find(
            (k) =>
                k.kid === decodeJwt(assertion).header.kid &&
                ((k.kty === "EC" && alg === "ES256") ||
                    (k.kty === "RSA" && alg === "PS384" && !flaws.rejectPs384Assertion)),
        );
        if (!key) return false;
        const verified = flaws.acceptBadAssertionSignature
            ? decodeJwt(assertion)
            : key.kty === "RSA"
              ? await verifyPs384(assertion, key)
              : await verifyJwt(assertion, key);
        if (!verified) return false;
        const { iss, sub, aud, exp, jti } = verified.payload;
        if (iss !== clientId()) return false;
        if (sub !== clientId() && !(sub === undefined && flaws.acceptMissingAssertionClaims))
            return false;
        if (typeof exp !== "number") {
            if (!flaws.acceptMissingAssertionClaims) return false;
        } else if (exp <= now() && !flaws.acceptExpiredAssertion) return false;
        const audOk =
            aud === ORIGIN ||
            (aud === TOKEN && flaws.acceptEndpointAud) ||
            (Array.isArray(aud) && aud.includes(ORIGIN) && flaws.acceptAudArray);
        if (!audOk) return false;
        if (assertionJtis.has(String(jti)) && !flaws.acceptReusedJti) return false;
        assertionJtis.add(String(jti));
        return true;
    }

    function browserSessionPage(headers: Headers): Response {
        const code = `bc_${randomId(16)}`;
        const join = randomId(8);
        codes.set(code, { join, authorized: false, used: false, exp: now() + 60 });
        const out = new Headers({ "content-type": "text/html" });
        if (!flaws.webNoHeaders) {
            out.set("cache-control", "no-store");
            out.set(
                "content-security-policy",
                flaws.webFrameSelf ? "frame-ancestors 'self'" : "frame-ancestors 'none'",
            );
            out.set("cross-origin-opener-policy", "same-origin");
        }
        out.append(
            "set-cookie",
            `${flaws.webCookieWithoutHostPrefix ? "" : "__Host-"}poppy_join=${join}; Path=/; Max-Age=60; Secure; HttpOnly; SameSite=${flaws.webCookieSameSiteNone ? "None" : "Strict"}`,
        );
        if (flaws.webExtraCookie)
            out.append("set-cookie", `lb=${randomId(4)}; Path=/; Secure; SameSite=None`);
        if (flaws.webPageClearsCookies)
            for (const pair of (headers.get("cookie") ?? "").split(";")) {
                const name = pair.split("=")[0].trim();
                if (name && !name.endsWith("poppy_join"))
                    out.append("set-cookie", `${name}=; Path=/; Max-Age=0`);
            }
        // The code's value is HTML-escaped, as a template would: & becomes &amp;.
        return new Response(
            `<!doctype html>\n<title>Connecting</title>\n<form method="post" action="/poppy/browser-session">\n  <input type="hidden" name="code" value="${code.replace(/_/, "&#95;")}">\n  <button>Continue</button>\n</form>\n`,
            { status: 200, headers: out },
        );
    }

    async function browserSessionAuthorize(url: string, headers: Headers, body: string) {
        if (!flaws.webAuthorizeWithoutSession) {
            const checked = await authorize("POST", url, headers);
            if (checked.error) return checked.error;
            return authorizeCode(body, checked.sid);
        }
        return authorizeCode(body, undefined);
    }

    function authorizeCode(body: string, sid: string | undefined): Response {
        let value: unknown;
        try {
            value = (JSON.parse(body) as { code?: unknown }).code;
        } catch {
            return json(400, { error: "invalid_request" });
        }
        const code = codes.get(String(value));
        if (!code && flaws.webAuthorizeUnknownCode) return new Response(null, { status: 204 });
        if (!code || code.exp <= now() || (code.authorized && !flaws.webReauthorize))
            return json(400, { error: "invalid_request" });
        code.authorized = true;
        code.sid = sid;
        return flaws.webAuthorizeStatus200 ? json(200, {}) : new Response(null, { status: 204 });
    }

    // Step 3 of section 6: the browser submits the form with the join cookie.
    function browserSessionForm(body: string, headers: Headers): Response {
        const code = codes.get(new URLSearchParams(body).get("code") ?? "");
        const cookie = /(?:^|;\s*)(?:__Host-)?poppy_join=([^;]*)/.exec(
            headers.get("cookie") ?? "",
        )?.[1];
        const fresh = code && !code.used;
        if (code && !flaws.webCodeReusableAfterFailure) code.used = true;
        const cookieOk =
            flaws.webFormWithoutCookie ||
            (code && cookie === code.join) ||
            (flaws.webAnyJoinCookie && [...codes.values()].some((c) => c.join === cookie));
        if (!code || !fresh || !code.authorized || code.exp <= now() || !cookieOk)
            return new Response("<!doctype html>\n<title>Try again</title>\n", {
                status: 400,
                headers: { "content-type": "text/html" },
            });
        code.used = true;
        const out = new Headers({ location: `${ORIGIN}/` });
        out.append(
            "set-cookie",
            `__Host-shop_session=${code.sid ?? "s"}.${randomId(16)}; Path=/; Secure; HttpOnly; SameSite=Lax`,
        );
        out.append("set-cookie", "__Host-poppy_join=; Path=/; Secure; Max-Age=0");
        return new Response(null, { status: 303, headers: out });
    }

    function addEvent(conv: Conversation, event: Record<string, unknown>): void {
        conv.events.push({
            id: `evt_${++eventCounter}`,
            created_at: flaws.eventBadCreatedAt ? "2026-02-30T19:03:00Z" : "2026-10-08T19:03:00Z",
            ...event,
        });
    }

    function setState(conv: Conversation, status: string, responder = conv.responder): void {
        conv.status = status;
        conv.responder = responder;
        if (!flaws.noStateEvents) addEvent(conv, { type: "state", status, responder });
    }

    function recordUserMessage(conv: Conversation, message: Record<string, unknown>): void {
        const onlyContext =
            message.context !== undefined &&
            message.text === undefined &&
            message.data === undefined;
        if (onlyContext && flaws.contextNotRecorded) return;
        const recorded: Record<string, unknown> = {
            ...message,
            role: flaws.wrongRole ? "agent" : "user",
        };
        if (flaws.dropMessageData) delete recorded.data;
        addEvent(conv, { type: "message", message: recorded });
    }

    // The Company Agent answers at once, and the conversation goes idle.
    function reply(conv: Conversation): void {
        addEvent(conv, {
            type: "message",
            message: {
                id: `msg_c${++eventCounter}`,
                role: "company",
                author: { type: "agent" },
                text: "Thanks. This is a test Company.",
                ...(flaws.returnOperations
                    ? {
                          operation: {
                              operation_id: "exc_5Rt2",
                              revision: "1",
                              summary: "Exchange a test item.",
                              expires_at: "2026-10-08T20:00:00Z",
                          },
                      }
                    : {}),
            },
        });
        setState(conv, "idle");
    }

    function messageProblem(message: unknown): boolean {
        if (!isObject(message)) return true;
        const id = message.id;
        const idOk =
            typeof id === "string" &&
            (flaws.acceptAnyMessageId
                ? id.length > 0
                : flaws.maxMessageId128
                  ? /^[A-Za-z0-9_-]{1,128}$/.test(id)
                  : /^[A-Za-z0-9_-]{1,256}$/.test(id));
        if (!idOk) return true;
        if (!isObject(message.author) || !["agent", "human"].includes(String(message.author.type)))
            return true;
        if (message.text !== undefined && typeof message.text !== "string") return true;
        if (message.data !== undefined && !isObject(message.data)) return true;
        if (message.context !== undefined && !isObject(message.context)) return true;
        if (flaws.requireText && message.text === undefined) return true;
        const hasContent =
            message.text !== undefined ||
            message.data !== undefined ||
            message.context !== undefined;
        return !hasContent && !flaws.acceptEmptyMessage;
    }

    function stored(s: Stored): Response {
        return new Response(s.body, {
            status: s.status,
            headers: { "content-type": "application/json" },
        });
    }

    function readEvents(conv: Conversation, url: URL, headers: Headers): Response {
        const wait = url.searchParams.get("wait");
        if (wait !== null && flaws.waitRejected) return json(400, { error: "invalid_request" });
        if (wait !== null && !/^\d+$/.test(wait) && !flaws.acceptAnyWait)
            return json(400, { error: "invalid_request" });
        const lastEventId = flaws.sseIgnoresLastEventId ? null : headers.get("last-event-id");
        const cursor = lastEventId ?? url.searchParams.get("cursor");
        let start = 0;
        if (cursor && !flaws.cursorIgnored) {
            const i = conv.events.findIndex((e) => e.id === cursor);
            const elsewhere = [...convs.values()].some((c) =>
                c.events.some((e) => e.id === cursor),
            );
            if (i !== -1) start = i + 1;
            else if (flaws.cursorAnyConversation && elsewhere) start = 0;
            else if (flaws.unknownCursorEmpty) start = conv.events.length;
            else return json(400, { error: "invalid_cursor" });
        }
        const events = conv.events.slice(start);
        if (flaws.repeatFirstEvent && !cursor && events.length) events.push(events[0]);
        if (!flaws.noSse && /text\/event-stream/.test(headers.get("accept") ?? "")) {
            const text = events
                .map(
                    (e) =>
                        `id: ${flaws.sseWrongId ? `x${e.id}` : e.id}\ndata: ${JSON.stringify(e)}\n\n`,
                )
                .join("");
            return new Response(`: stream\n\n${text}`, {
                status: 200,
                headers: { "content-type": "text/event-stream" },
            });
        }
        return json(200, {
            conversation_id: conv.id,
            events,
            cursor: events.length ? events[events.length - 1].id : (cursor ?? null),
            ...(flaws.eventsWithoutHasMore ? {} : { has_more: false }),
            status: conv.status,
            responder: conv.responder,
        });
    }

    async function conversation(
        method: string,
        url: URL,
        body: string,
        headers: Headers,
        sub: string,
    ): Promise<Response> {
        const rest = url.pathname.slice(new URL(CONV).pathname.length).split("/").filter(Boolean);
        let payload: Record<string, unknown> = {};
        try {
            payload = body ? (JSON.parse(body) as Record<string, unknown>) : {};
        } catch {
            return json(400, { error: "invalid_request" });
        }
        const message = payload.message as Record<string, unknown> | undefined;
        if (rest.length === 0 && method === "POST") {
            if (messageProblem(message)) return json(400, { error: "invalid_request" });
            const key = `${sub}\n${message!.id}`;
            const content = JSON.stringify(message);
            const prior = messageIds.get(key);
            if (prior && !flaws.retryCreatesNewConversation) {
                if (prior.content !== content)
                    return json(flaws.conflictStatus400 ? 400 : 409, {
                        error: "message_id_conflict",
                    });
                if (flaws.retryRecordedTwice) recordUserMessage(convs.get(prior.conv)!, message!);
                return stored(prior);
            }
            const parentId = payload.parent_conversation_id;
            if (parentId !== undefined && !flaws.directIgnoresParent) {
                const parent = convs.get(String(parentId));
                if (!parent || parent.sub !== sub)
                    return json(404, { error: "conversation_not_found" });
                if (parent.status === "closed") return json(409, { error: "conversation_closed" });
                if (parent.direct) return json(400, { error: "invalid_request" });
            }
            const conv: Conversation = {
                id: "cnv_" + randomId(6),
                sub,
                events: [],
                status: "working",
                responder: "agent",
                direct: parentId !== undefined,
            };
            convs.set(conv.id, conv);
            const status = flaws.startReturns200 ? 200 : 201;
            const response = JSON.stringify({
                conversation_id: conv.id,
                status: "working",
                responder: "agent",
            });
            messageIds.set(key, { conv: conv.id, content, status, body: response });
            recordUserMessage(conv, message!);
            reply(conv);
            return stored({ conv: conv.id, content, status, body: response });
        }
        const conv = convs.get(rest[0]);
        if (!conv || (conv.sub !== sub && !flaws.ignoreConversationOwner))
            return json(404, {
                error: flaws.notFoundError ? "not_found" : "conversation_not_found",
            });
        const action = rest[1];
        if (action === "events" && method === "GET") return readEvents(conv, url, headers);
        if (action === "close" && method === "POST") {
            if (conv.status !== "closed") {
                conv.status = "closed";
                if (!flaws.noCloseEvent)
                    addEvent(conv, { type: "state", status: "closed", responder: conv.responder });
            } else if (flaws.closeAgainAddsEvent)
                addEvent(conv, { type: "state", status: "closed", responder: conv.responder });
            return json(
                200,
                flaws.closeWithoutResponder
                    ? { status: "closed" }
                    : { status: "closed", responder: conv.responder },
            );
        }
        if (action === "handoff" && method === "POST") {
            if (conv.status === "closed" && !flaws.closedAcceptsHandoff)
                return json(409, { error: "conversation_closed" });
            return json(202, { conversation_id: conv.id, status: "queued", responder: "human" });
        }
        if (action === "messages" && method === "POST") {
            if (conv.status === "closed" && !flaws.closedAcceptsMessages)
                return json(409, { error: "conversation_closed" });
            if (messageProblem(message)) return json(400, { error: "invalid_request" });
            const key = flaws.messageIdsPerConversation
                ? `${conv.id}\n${message!.id}`
                : `${sub}\n${message!.id}`;
            const content = JSON.stringify(message);
            const prior = messageIds.get(key);
            if (prior) {
                if (prior.content !== content)
                    return json(flaws.conflictStatus400 ? 400 : 409, {
                        error: "message_id_conflict",
                    });
                if (flaws.followUpRetry200) return new Response(prior.body, { status: 200 });
                return stored(prior);
            }
            recordUserMessage(conv, message!);
            const response = JSON.stringify(
                flaws.followUpWithoutStatus
                    ? { conversation_id: conv.id }
                    : { conversation_id: conv.id, status: conv.status, responder: conv.responder },
            );
            messageIds.set(key, { conv: conv.id, content, status: 202, body: response });
            return stored({ conv: conv.id, content, status: 202, body: response });
        }
        return json(404, { error: "not_found" });
    }

    const auth = (domain: "main" | "other") => ({
        ...(flaws.authIssuer ? { issuer: flaws.authIssuer } : {}),
        ...(flaws.scopesInPoppy ? { scopes: { "orders:read": "See your orders" } } : {}),
        scope_hints: {
            "orders:read": {
                changes: "none",
                personal_data: !(domain === "other" && flaws.otherDomainAuth),
            },
        },
    });

    const poppy = (domain: string, which: "main" | "other") => {
        const doc: Record<string, any> = {
            protocol_version: PROTOCOL_VERSION,
            organization: { name: "Shop", domain },
            auth: auth(which),
            ...(flaws.noAgent ? {} : { agent: { protocols: [{ type: "poppy", endpoint: CONV }] } }),
            apis: [
                { type: "openapi", url: `${ORIGIN}/openapi.json`, description: "Orders" },
                { type: "mcp", url: MCP, description: "Search" },
            ],
            web: { browser_session_endpoint: BROWSER_SESSION },
            excluded_tasks: { url: `${ORIGIN}/poppy/excluded-tasks.json` },
            feedback: { endpoint: FEEDBACK },
            extensions: {
                "mediated-sign-in": {
                    version: "1",
                    fields: [
                        { name: "email", label: "Email", secret: false },
                        { name: "password", label: "Password", secret: true },
                    ],
                    scopes: ["orders:read"],
                },
                "shop.test/gift-wrap": { version: "1", endpoint: `${ORIGIN}/poppy/gift-wrap` },
            },
        };
        if (which === "main") flaws.poppy?.(doc);
        return doc;
    };

    const metadata = () => {
        const doc: Record<string, any> = {
            issuer: ORIGIN,
            token_endpoint: TOKEN,
            revocation_endpoint: `${ORIGIN}/oauth/revoke`,
            authorization_endpoint: `${ORIGIN}/oauth/authorize`,
            device_authorization_endpoint: `${ORIGIN}/oauth/device`,
            grant_types_supported: [
                "refresh_token",
                "authorization_code",
                DEVICE_GRANT,
                MEDIATED_GRANT,
            ],
            scopes_supported: flaws.undescribedScope
                ? ["orders:read", "addresses"]
                : ["orders:read"],
            protected_resources: [ORIGIN, OTHER_DOMAIN, MCP],
        };
        flaws.metadata?.(doc);
        return doc;
    };

    const excludedTasks = () =>
        flaws.excludedTasksInvalid
            ? { tasks: [{ alternative: "Use the app." }] }
            : {
                  tasks: [
                      {
                          task: "Send a wire transfer",
                          alternative: {
                              instructions: "Wire transfers can only be sent in the Shop app.",
                              references: [
                                  { type: "web", url: `${ORIGIN}/transfers/wire` },
                                  {
                                      type: "openapi",
                                      url: flaws.unlistedAlternativeApi
                                          ? "https://payments.test/openapi.json"
                                          : `${ORIGIN}/openapi.json`,
                                      operation_id: "sendAchTransfer",
                                  },
                              ],
                          },
                      },
                      { task: "Close an account" },
                  ],
              };

    function openapi(): Response {
        if (flaws.openapiStatus) return json(flaws.openapiStatus, { error: "not_found" });
        if (flaws.openapiYaml || flaws.openapiYamlAnchors)
            return new Response(flaws.openapiYamlAnchors ? OPENAPI_YAML_ANCHORS : OPENAPI_YAML, {
                status: 200,
                headers: { "content-type": "application/yaml" },
            });
        return json(200, {
            ...(flaws.openapiSwagger ? { swagger: "2.0" } : { openapi: "3.1.0" }),
            info: { title: "Shop", ...(flaws.openapiNoInfoVersion ? {} : { version: "1.0.0" }) },
            paths: {},
            ...(flaws.scopesInPoppy
                ? {}
                : {
                      components: {
                          securitySchemes: {
                              oauth: {
                                  type: "oauth2",
                                  flows: {
                                      authorizationCode: {
                                          authorizationUrl: `${ORIGIN}/oauth/authorize`,
                                          tokenUrl: TOKEN,
                                          scopes: { "orders:read": "See your orders" },
                                      },
                                  },
                              },
                          },
                      },
                  }),
        });
    }

    function mcp(headers: Headers): Response {
        if (flaws.mcpStatus404) return json(404, { error: "not_found" });
        const authorization = headers.get("authorization");
        const resourceMetadata = `resource_metadata="${MCP_PRM}"`;
        // The MCP server ignores the Session header (spec 7) and needs a token.
        if (!authorization && !flaws.mcpWithoutToken)
            return new Response(null, {
                status: 401,
                headers: {
                    "www-authenticate": flaws.mcpNoResourceMetadata
                        ? "Bearer"
                        : `Bearer ${resourceMetadata}`,
                },
            });
        if (authorization)
            return new Response(null, {
                status: 401,
                headers: {
                    "www-authenticate": flaws.mcpInvalidTokenNoError
                        ? `Bearer ${resourceMetadata}`
                        : `Bearer error="invalid_token", ${resourceMetadata}`,
                },
            });
        return json(200, {
            jsonrpc: "2.0",
            id: 1,
            result: {
                protocolVersion: "2025-06-18",
                capabilities: {},
                serverInfo: { name: "shop", version: "1.0.0" },
            },
        });
    }

    async function feedback(url: string, headers: Headers, body: string): Promise<Response> {
        const check = () => {
            if (flaws.feedbackNoValidation) return undefined;
            let report: unknown;
            try {
                report = JSON.parse(body);
            } catch {
                return json(400, { error: "invalid_request" });
            }
            const r = report as { task?: unknown; description?: unknown };
            const ok =
                isObject(report) &&
                typeof r.task === "string" &&
                r.task.length >= 1 &&
                r.task.length <= 200 &&
                typeof r.description === "string" &&
                r.description.length >= 1 &&
                r.description.length <= 2000;
            return ok ? undefined : json(400, { error: "invalid_request" });
        };
        if (flaws.feedbackBodyFirst) {
            const invalid = check();
            if (invalid) return invalid;
        }
        if (!flaws.feedbackWithoutSession) {
            const checked = await authorize("POST", url, headers);
            if (checked.error) return checked.error;
        }
        const invalid = check();
        if (invalid) return invalid;
        if (flaws.feedbackAlternative)
            return json(200, {
                instructions: "Use the orders API.",
                references: [
                    {
                        type: "openapi",
                        url:
                            flaws.feedbackAlternative === "listed"
                                ? `${ORIGIN}/openapi.json`
                                : "https://payments.test/openapi.json",
                        operation_id: "listOrders",
                    },
                ],
            });
        if (flaws.feedbackBody) return json(202, { received: true });
        return new Response(null, { status: 202 });
    }

    async function tokenEndpoint(body: string): Promise<Response> {
        const form = new URLSearchParams(body);
        if (!(await clientAuthenticated(form))) return json(401, { error: "invalid_client" });
        const grant = form.get("grant_type");
        if (grant === "refresh_token") return json(400, { error: "invalid_grant" });
        if (grant === MEDIATED_GRANT && form.get("sign_in_id"))
            return flaws.mediatedUnknownCodeRequired
                ? json(400, { error: "code_required", sign_in_id: form.get("sign_in_id") })
                : json(400, { error: "invalid_grant" });
        return json(400, { error: "unsupported_grant_type" });
    }

    return async (input, init) => {
        const url = new URL(input);
        const method = (init.method ?? "GET").toUpperCase();
        const headers = new Headers(init.headers);
        const body = typeof init.body === "string" ? init.body : "";
        const path = url.pathname;
        const here = `${url.origin}${path}`;
        if (url.origin === "https://agent.test") {
            const file = path.slice(1);
            return new Response(agentFile(file), {
                status: 200,
                headers: { "content-type": "application/json" },
            });
        }
        if (url.origin === "https://www.shop.test" && path === "/.well-known/poppy.json") {
            return new Response(null, {
                status: 301,
                headers: {
                    location: flaws.httpRedirect
                        ? "http://shop.test/.well-known/poppy.json"
                        : flaws.redirectToUpload
                          ? `${ORIGIN}/uploads/poppy.json`
                          : `${ORIGIN}/.well-known/poppy.json`,
                },
            });
        }
        if (url.origin === OTHER_DOMAIN && path === "/.well-known/poppy.json")
            return json(200, poppy("shop-two.test", "other"));
        if (url.origin !== ORIGIN) throw new TypeError("fetch failed");
        if (
            path === "/.well-known/poppy.json" ||
            (flaws.redirectToUpload && path === "/uploads/poppy.json")
        ) {
            if (flaws.poppyStatus) return json(flaws.poppyStatus, { error: "not_found" });
            if (flaws.poppyRaw !== undefined)
                return new Response(flaws.poppyRaw, {
                    status: 200,
                    headers: { "content-type": "text/html" },
                });
            return json(200, poppy(flaws.domain ?? "shop.test", "main"), {
                "cache-control": "max-age=300",
            });
        }
        if (path === "/poppy/excluded-tasks.json" && method === "GET")
            return json(200, excludedTasks(), { "cache-control": "max-age=300" });
        if (path === "/.well-known/oauth-protected-resource" && !flaws.noResourceMetadata)
            return json(200, {
                resource: flaws.resourceWithSlash ? `${ORIGIN}/` : ORIGIN,
                authorization_servers: [
                    ORIGIN,
                    ...(flaws.twoAuthorizationServers ? ["https://staff.shop.test"] : []),
                ],
            });
        if (path === "/.well-known/oauth-authorization-server" && !flaws.noIssuerMetadata)
            return json(200, metadata());
        if (path === "/openapi.json") return openapi();
        if (here === MCP_PRM)
            return json(200, {
                resource: flaws.mcpResourceWithSlash ? `${MCP}/` : MCP,
                authorization_servers: [
                    flaws.mcpOtherAuthorizationServer ? "https://login.other.test" : ORIGIN,
                ],
            });
        if (here === TOKEN && method === "POST") return tokenEndpoint(body);
        if (here === MCP) return mcp(headers);
        if (here === FEEDBACK && method === "POST") return feedback(here, headers, body);
        if (here === BROWSER_SESSION && method === "GET") return browserSessionPage(headers);
        if (here === `${BROWSER_SESSION}/authorize` && method === "POST")
            return browserSessionAuthorize(url.toString(), headers, body);
        if (here === BROWSER_SESSION && method === "POST") return browserSessionForm(body, headers);
        if (path === "/api/orders" && method === "GET") {
            if (headers.get("poppy-session") || headers.get("authorization")) {
                const checked = await authorize(method, url.toString(), headers);
                if (checked.error) return checked.error;
            }
            return json(200, { orders: [] });
        }
        if (here.startsWith(CONV)) {
            const checked = await authorize(method, url.toString(), headers);
            if (checked.error) return checked.error;
            return conversation(method, url, body, headers, checked.sub);
        }
        return json(404, { error: "not_found" });
    };
}
