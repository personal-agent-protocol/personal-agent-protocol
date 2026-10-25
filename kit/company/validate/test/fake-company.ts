// A small in-memory Company, as a fake fetch, for testing checks end to end. It follows the spec
// by default; `flaws` turn off individual behaviors so tests can see the failures they cause.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PROTOCOL_VERSION } from "../catalog.ts";
import type { FetchLike } from "../http.ts";
import { decodeJwt, randomId, sha256, thumbprint, verifyJwt, type EcPublicJwk } from "../jose.ts";

export type Flaws = {
    acceptReplayedTokenProof?: boolean;
    acceptReplayedAssertion?: boolean;
    domain?: string;
    httpRedirect?: boolean;
    noStore?: boolean;
    acceptBearerEverywhere?: boolean;
    acceptQueryToken?: boolean;
    retryCreatesNewConversation?: boolean;
    requireNonce?: boolean;
    // No jti cache at the APIs and conversation endpoint, which the spec allows (a SHOULD).
    acceptReplayedResourceProof?: boolean;
    // DPoP failures at the APIs answered with 400 instead of 401.
    resourceDpopErrors400?: boolean;
    noDpopAlgs?: boolean;
    dpopAlgsWithoutEs256?: boolean;
    acceptTokenEndpointAud?: boolean;
    // The MCP server supports DPoP.
    mcpDpop?: boolean;
    // Issues a Bearer token for the MCP server even when it supports DPoP.
    bearerAtDpopMcp?: boolean;
    // Issues a DPoP token, not a Bearer one, in exchange for the MCP server without DPoP.
    dpopAtBearerMcp?: boolean;
    // A scope in scopes_supported with no description anywhere.
    undescribedScope?: boolean;
    // Describes its scopes in auth.scopes instead of the OpenAPI description.
    scopesInPoppy?: boolean;
    // Doesn't check which User ID a Session Key's Session belongs to.
    ignoreKeyUser?: boolean;
};

export const ORIGIN = "https://shop.test";
const TOKEN = `${ORIGIN}/oauth/token`;
const CONV = `${ORIGIN}/poppy/conversations`;
const MCP = `${ORIGIN}/mcp`;

type Token = { type: "DPoP" | "Bearer"; jkt?: string; resource?: string };
type Conversation = {
    id: string;
    events: Record<string, unknown>[];
    status: string;
    firstResponse: string;
};

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json", ...headers },
    });
}

export function fakeCompany(agentDir: string, flaws: Flaws = {}): FetchLike {
    const seenProofs = new Set<string>();
    const seenAssertions = new Set<string>();
    const tokens = new Map<string, Token>();
    // Each Session's User ID, by the thumbprint of its Session Key.
    const sessions = new Map<string, string>();
    const convs = new Map<string, Conversation>();
    const messageIds = new Map<string, { conv: string; content: string }>();
    const nonce = "n_" + randomId(8);
    let eventCounter = 0;

    const agentFile = (name: string) => readFileSync(join(agentDir, name), "utf8");

    async function verifyProof(
        proof: string | null,
        method: string,
        url: string,
        accessToken?: string,
        allowReplay = false,
    ): Promise<string | undefined> {
        if (!proof) return undefined;
        let decoded;
        try {
            decoded = decodeJwt(proof);
        } catch {
            return undefined;
        }
        const jwk = decoded.header.jwk as EcPublicJwk;
        if (decoded.header.typ !== "dpop+jwt" || !jwk || !(await verifyJwt(proof, jwk)))
            return undefined;
        const p = decoded.payload;
        const u = new URL(url);
        if (p.htm !== method || p.htu !== `${u.origin}${u.pathname}`) return undefined;
        if (accessToken !== undefined && p.ath !== (await sha256(accessToken))) return undefined;
        if (flaws.requireNonce && p.nonce !== nonce) return "nonce";
        if (seenProofs.has(String(p.jti)) && !allowReplay) return undefined;
        seenProofs.add(String(p.jti));
        return thumbprint(jwk);
    }

    async function agentKey(): Promise<EcPublicJwk> {
        return (JSON.parse(agentFile("jwks.json")) as { keys: EcPublicJwk[] }).keys[0];
    }

    async function tokenEndpoint(headers: Headers, body: string): Promise<Response> {
        const form = new URLSearchParams(body);
        const result = await verifyProof(
            headers.get("dpop"),
            "POST",
            TOKEN,
            undefined,
            flaws.acceptReplayedTokenProof,
        );
        if (result === "nonce")
            return json(400, { error: "use_dpop_nonce" }, { "dpop-nonce": nonce });
        if (!result) return json(400, { error: "invalid_dpop_proof" });
        const jkt = result;
        const key = await agentKey();
        const clientAssertion = form.get("client_assertion") ?? "";
        const client = await verifyJwt(clientAssertion, key);
        if (!client) return json(401, { error: "invalid_client" });
        const audiences = flaws.acceptTokenEndpointAud ? [ORIGIN, TOKEN] : [ORIGIN];
        if (!audiences.includes(String(client.payload.aud)))
            return json(401, { error: "invalid_client" });
        const resource = form.get("resource") ?? undefined;
        const grant = form.get("grant_type");
        let type: Token["type"] = "DPoP";
        if (grant === "urn:ietf:params:oauth:grant-type:token-exchange") {
            const subject = tokens.get(form.get("subject_token") ?? "");
            if (!subject || subject.type !== "DPoP" || subject.jkt !== jkt)
                return json(400, { error: "invalid_grant" });
            if (resource !== MCP || (flaws.mcpDpop && !flaws.bearerAtDpopMcp))
                return json(400, { error: "invalid_target" });
            if (!flaws.dpopAtBearerMcp) type = "Bearer";
        } else if (grant === "urn:ietf:params:oauth:grant-type:jwt-bearer") {
            const assertion = form.get("assertion") ?? "";
            const verified = await verifyJwt(assertion, key);
            if (
                !verified ||
                verified.header.typ === "poppy-browser+jwt" ||
                verified.payload.aud !== ORIGIN
            )
                return json(400, { error: "invalid_grant" });
            const jti = String(verified.payload.jti);
            if (seenAssertions.has(jti) && !flaws.acceptReplayedAssertion)
                return json(400, { error: "invalid_grant" });
            seenAssertions.add(jti);
            const sub = String(verified.payload.sub);
            const owner = sessions.get(jkt);
            if (owner && owner !== sub && !flaws.ignoreKeyUser)
                return json(400, { error: "invalid_grant" });
            if (!owner) sessions.set(jkt, sub);
            if (resource && (resource !== MCP || !flaws.mcpDpop))
                return json(400, { error: "invalid_target" });
        } else return json(400, { error: "unsupported_grant_type" });
        const access = randomId(24);
        tokens.set(access, { type, jkt: type === "DPoP" ? jkt : undefined, resource });
        return json(
            200,
            {
                access_token: access,
                token_type: type,
                expires_in: 3600,
                scope: "",
            },
            flaws.noStore ? {} : { "cache-control": "no-store" },
        );
    }

    async function authorize(
        method: string,
        url: string,
        headers: Headers,
    ): Promise<Response | undefined> {
        const auth = headers.get("authorization") ?? "";
        const query = new URL(url).searchParams.get("access_token");
        if (!auth && query && flaws.acceptQueryToken && tokens.has(query)) return undefined;
        const [scheme, value] = auth.split(" ");
        const token = value ? tokens.get(value) : undefined;
        const challenge = { "www-authenticate": 'DPoP error="invalid_token"' };
        if (!token) return json(401, { error: "invalid_token" }, challenge);
        if (scheme === "Bearer") {
            if (token.type === "Bearer" && flaws.acceptBearerEverywhere) return undefined;
            return json(401, { error: "invalid_token" }, challenge);
        }
        if (scheme !== "DPoP" || token.type !== "DPoP" || token.resource)
            return json(401, { error: "invalid_token" }, challenge);
        const result = await verifyProof(
            headers.get("dpop"),
            method,
            url,
            value,
            flaws.acceptReplayedResourceProof,
        );
        if (result === "nonce")
            return json(
                401,
                { error: "use_dpop_nonce" },
                { "www-authenticate": 'DPoP error="use_dpop_nonce"', "dpop-nonce": nonce },
            );
        if (!result || result !== token.jkt)
            return json(
                flaws.resourceDpopErrors400 ? 400 : 401,
                { error: "invalid_dpop_proof" },
                { "www-authenticate": 'DPoP error="invalid_dpop_proof"' },
            );
        return undefined;
    }

    function addEvent(conv: Conversation, event: Record<string, unknown>): void {
        conv.events.push({
            id: `evt_${++eventCounter}`,
            created_at: "2026-10-08T19:03:00Z",
            ...event,
        });
    }

    function readEvents(conv: Conversation, url: URL): Response {
        const wait = url.searchParams.get("wait");
        if (wait !== null && !/^\d+$/.test(wait)) return json(400, { error: "invalid_request" });
        const cursor = url.searchParams.get("cursor");
        let start = 0;
        if (cursor) {
            const i = conv.events.findIndex((e) => e.id === cursor);
            if (i === -1) return json(400, { error: "invalid_cursor" });
            start = i + 1;
        }
        const events = conv.events.slice(start);
        return json(200, {
            conversation_id: conv.id,
            events,
            cursor: events.length ? events[events.length - 1].id : cursor,
            has_more: false,
            status: conv.status,
            responder: "agent",
        });
    }

    async function conversation(method: string, url: URL, body: string): Promise<Response> {
        const rest = url.pathname.slice(new URL(CONV).pathname.length).split("/").filter(Boolean);
        const payload = body ? (JSON.parse(body) as { message?: Record<string, unknown> }) : {};
        const message = payload.message;
        const validMessage = () =>
            message &&
            typeof message.id === "string" &&
            /^[A-Za-z0-9_-]{1,256}$/.test(message.id) &&
            (message.text !== undefined ||
                message.data !== undefined ||
                message.context !== undefined);
        if (rest.length === 0 && method === "POST") {
            if (!validMessage()) return json(400, { error: "invalid_request" });
            const id = String(message!.id);
            const content = JSON.stringify(message);
            const prior = messageIds.get(id);
            if (prior && !flaws.retryCreatesNewConversation) {
                if (prior.content !== content) return json(409, { error: "message_id_conflict" });
                return new Response(convs.get(prior.conv)!.firstResponse, {
                    status: 201,
                    headers: { "content-type": "application/json" },
                });
            }
            const conv: Conversation = {
                id: "cnv_" + randomId(6),
                events: [],
                status: "idle",
                firstResponse: "",
            };
            conv.firstResponse = JSON.stringify({
                conversation_id: conv.id,
                status: "idle",
                responder: "agent",
            });
            convs.set(conv.id, conv);
            messageIds.set(id, { conv: conv.id, content });
            addEvent(conv, { type: "message", message: { ...message, role: "user" } });
            return new Response(conv.firstResponse, {
                status: 201,
                headers: { "content-type": "application/json" },
            });
        }
        const conv = convs.get(rest[0]);
        if (!conv) return json(404, { error: "conversation_not_found" });
        const action = rest[1];
        if (action === "events" && method === "GET") return readEvents(conv, url);
        if (action === "close" && method === "POST") {
            if (conv.status !== "closed") {
                conv.status = "closed";
                addEvent(conv, { type: "state", status: "closed", responder: "agent" });
            }
            return json(200, { status: "closed", responder: "agent" });
        }
        if ((action === "messages" || action === "handoff") && method === "POST") {
            if (conv.status === "closed") return json(409, { error: "conversation_closed" });
            if (action === "handoff") return json(202, { status: "queued", responder: "agent" });
            if (!validMessage()) return json(400, { error: "invalid_request" });
            addEvent(conv, { type: "message", message: { ...message, role: "user" } });
            return json(202, { conversation_id: conv.id, status: conv.status, responder: "agent" });
        }
        return json(404, { error: "not_found" });
    }

    const poppy = () => ({
        protocol_version: PROTOCOL_VERSION,
        organization: { name: "Shop", domain: flaws.domain ?? "shop.test" },
        auth: {
            issuer: ORIGIN,
            ...(flaws.scopesInPoppy ? { scopes: { "orders:read": "See your orders" } } : {}),
        },
        agent: { protocols: [{ type: "poppy", endpoint: CONV }] },
        apis: [
            { type: "openapi", url: `${ORIGIN}/openapi.json`, description: "Orders" },
            { type: "mcp", url: MCP, description: "Search" },
        ],
    });

    return async (input, init) => {
        const url = new URL(input);
        const method = (init.method ?? "GET").toUpperCase();
        const headers = new Headers(init.headers);
        const body = typeof init.body === "string" ? init.body : "";
        const path = url.pathname;
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
                        : `${ORIGIN}/.well-known/poppy.json`,
                },
            });
        }
        if (url.origin !== ORIGIN) throw new TypeError("fetch failed");
        if (path === "/.well-known/poppy.json")
            return json(200, poppy(), { "cache-control": "max-age=300" });
        if (path === "/.well-known/oauth-authorization-server") {
            return json(200, {
                issuer: ORIGIN,
                token_endpoint: TOKEN,
                revocation_endpoint: `${ORIGIN}/oauth/revoke`,
                ...(flaws.noDpopAlgs
                    ? {}
                    : {
                          dpop_signing_alg_values_supported: flaws.dpopAlgsWithoutEs256
                              ? ["RS256"]
                              : ["ES256"],
                      }),
                authorization_endpoint: `${ORIGIN}/oauth/authorize`,
                grant_types_supported: [
                    "urn:ietf:params:oauth:grant-type:jwt-bearer",
                    "refresh_token",
                    "authorization_code",
                    "urn:ietf:params:oauth:grant-type:token-exchange",
                ],
                scopes_supported: flaws.undescribedScope
                    ? ["orders:read", "addresses"]
                    : ["orders:read"],
                protected_resources: ["https://shop.test"],
            });
        }
        if (path === "/openapi.json")
            return json(200, {
                openapi: "3.1.0",
                info: { title: "Shop" },
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
        if (path === "/.well-known/oauth-protected-resource/mcp")
            return json(200, {
                resource: MCP,
                authorization_servers: [ORIGIN],
                ...(flaws.mcpDpop ? { dpop_signing_alg_values_supported: ["ES256"] } : {}),
            });
        if (url.toString() === TOKEN && method === "POST") return tokenEndpoint(headers, body);
        if (url.toString() === MCP) {
            const [scheme, value] = (headers.get("authorization") ?? "").split(" ");
            const token = value ? tokens.get(value) : undefined;
            const bearerOk = scheme === "Bearer" && token?.type === "Bearer";
            const dpopOk =
                flaws.mcpDpop &&
                scheme === "DPoP" &&
                token?.type === "DPoP" &&
                (await verifyProof(headers.get("dpop"), method, MCP, value)) === token.jkt;
            if (!token || token.resource !== MCP || !(bearerOk || dpopOk)) {
                return json(
                    401,
                    { error: "invalid_token" },
                    {
                        "www-authenticate": `Bearer resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/mcp"`,
                    },
                );
            }
            return json(200, {
                jsonrpc: "2.0",
                id: 1,
                result: {
                    protocolVersion: "2025-06-18",
                    capabilities: {},
                    serverInfo: { name: "shop" },
                },
            });
        }
        if (url.toString().startsWith(CONV)) {
            const denied = await authorize(method, url.toString(), headers);
            if (denied) return denied;
            return conversation(method, url, body);
        }
        return json(404, { error: "not_found" });
    };
}
