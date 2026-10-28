// Milestone 2: MCP servers' protected resource metadata and challenges (section 7). Signed-in
// tokens need account access and are checked by hand. An MCP server MAY ignore the Session header,
// so signed-out calls aren't required.

import { randomId } from "../jose.ts";
import { getFollowing, header, parseChallenges, type Challenge, type Exchange } from "../http.ts";
import { formatSchemaErrors } from "../schema.ts";
import { check } from "../schemas.ts";
import { apiUrls, skipRest, type Context, type Detail, type Recorder } from "./types.ts";

export const MCP_IDS = [
    "mcp.no-token",
    "mcp.invalid-token",
    "mcp.metadata",
    "mcp.authorization-servers",
];

export const INITIALIZE = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "poppy-validator", version: "0.1" },
    },
};

const MCP_HEADERS = { Accept: "application/json, text/event-stream" };

// The JSON-RPC response to the initialize request in an MCP response, JSON or SSE.
export function initializeResponse(ex: Exchange): unknown {
    if (ex.json !== undefined) return ex.json;
    for (const event of (ex.body ?? "").split(/\r?\n\r?\n/)) {
        const data = event
            .split(/\r?\n/)
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).replace(/^ /, ""))
            .join("\n");
        if (!data) continue;
        try {
            const json = JSON.parse(data) as { id?: unknown };
            if (json && typeof json === "object" && json.id === INITIALIZE.id) return json;
        } catch {
            // Not JSON.
        }
    }
    return undefined;
}

// Whether the body read so far holds the initialize response, so reading can stop.
export function hasInitializeResponse(body: string): boolean {
    return initializeResponse({ body } as Exchange) !== undefined;
}

// Why an MCP response isn't a meaningful initialize result, if it isn't: a JSON-RPC result with
// the protocol version, the server's capabilities, and its info.
export function initializeProblem(ex: Exchange): string | undefined {
    if (ex.status !== 200) return `HTTP ${ex.status}`;
    const json = initializeResponse(ex) as { jsonrpc?: unknown; result?: unknown } | undefined;
    if (!json || typeof json !== "object") return "no JSON-RPC response in the body";
    const result = json.result as
        | { protocolVersion?: unknown; capabilities?: unknown; serverInfo?: unknown }
        | undefined;
    if (!result || typeof result !== "object") return "a JSON-RPC response without a result";
    const missing = [
        typeof result.protocolVersion === "string" ? "" : "protocolVersion",
        result.capabilities && typeof result.capabilities === "object" ? "" : "capabilities",
        result.serverInfo && typeof result.serverInfo === "object" ? "" : "serverInfo",
    ].filter(Boolean);
    return missing.length ? `an initialize result without ${missing.join(", ")}` : undefined;
}

export function initializeOk(ex: Exchange): boolean {
    return initializeProblem(ex) === undefined;
}

// The Bearer challenge in a response, if any.
function bearer(ex: Exchange): Challenge | undefined {
    return parseChallenges(header(ex, "www-authenticate")).find(
        (c) => c.scheme.toLowerCase() === "bearer",
    );
}

export function protectedResourceMetadataUrl(url: string): string {
    const u = new URL(url);
    return `${u.origin}/.well-known/oauth-protected-resource${u.pathname.replace(/\/+$/, "")}`;
}

type Outcome = { status: "pass" | "fail" | "warn"; server: string; detail: Detail };

// Collects outcomes per check across servers, then records one result per check.
function aggregator(r: Recorder) {
    const outcomes: Record<string, Outcome[]> = {};
    return {
        add(id: string, status: Outcome["status"], server: string, detail: Detail = {}) {
            (outcomes[id] ??= []).push({ status, server, detail });
        },
        flush(multiple: boolean) {
            for (const [id, list] of Object.entries(outcomes)) {
                const bad = list.filter((o) => o.status !== "pass");
                if (bad.length === 0) {
                    r.pass(id, {
                        summary:
                            list
                                .map((o) => o.detail.summary)
                                .filter(Boolean)
                                .join("; ") || undefined,
                        notes: list.flatMap((o) => o.detail.notes ?? []),
                    });
                    continue;
                }
                const first = bad[0];
                const label = (o: Outcome, text?: string) =>
                    multiple && text ? `${o.server}: ${text}` : text;
                const detail: Detail = {
                    exchange: bad.flatMap((o) =>
                        o.detail.exchange
                            ? Array.isArray(o.detail.exchange)
                                ? o.detail.exchange
                                : [o.detail.exchange]
                            : [],
                    ),
                    got:
                        bad
                            .map((o) => label(o, o.detail.got))
                            .filter(Boolean)
                            .join("; ") || undefined,
                    sent:
                        bad
                            .map((o) => label(o, o.detail.sent))
                            .filter(Boolean)
                            .join("; ") || undefined,
                    expected: first.detail.expected,
                    cause: first.detail.cause,
                };
                if (bad.some((o) => o.status === "fail")) r.fail(id, detail);
                else r.warn(id, detail);
            }
        },
    };
}

export async function checkMcp(ctx: Context, r: Recorder): Promise<void> {
    const servers = apiUrls(ctx.discovered.poppy, "mcp");
    if (servers.length === 0) {
        skipRest(r, MCP_IDS, "poppy.json lists no MCP servers.");
        return;
    }
    const issuer = ctx.discovered.issuer;
    const agg = aggregator(r);

    for (const url of servers) {
        const initialize = (authorization: string | undefined, note: string) =>
            ctx.http.request({
                method: "POST",
                url,
                body: JSON.stringify(INITIALIZE),
                headers: {
                    ...MCP_HEADERS,
                    "Content-Type": "application/json",
                    ...(authorization ? { Authorization: authorization } : {}),
                },
                // A stream may stay open after the response: stop at the initialize response.
                until: hasInitializeResponse,
                note,
            });

        // No token: either a meaningful initialize result, or a 401 that points at the protected
        // resource metadata.
        const none = await initialize(
            undefined,
            "MCP initialize with no token and no Session header",
        );
        const challenge = bearer(none);
        if (none.status === 401) {
            if (challenge?.params.resource_metadata) agg.add("mcp.no-token", "pass", url);
            else
                agg.add("mcp.no-token", "fail", url, {
                    exchange: none,
                    expected: '401 with WWW-Authenticate: Bearer resource_metadata="…"',
                    cause: challenge
                        ? "The Bearer challenge has no resource_metadata, so MCP clients can't find the authorization server (RFC 9728 §5.1)."
                        : "The 401 has no Bearer challenge. An MCP server's challenges include resource_metadata with its protected resource metadata URL.",
                });
        } else if (none.status === 200 && initializeOk(none))
            agg.add("mcp.no-token", "pass", url, {
                summary: "Initialized without a token, so there's no challenge to check.",
            });
        else
            agg.add("mcp.no-token", "fail", url, {
                exchange: none,
                got: none.status === 200 ? `200 with ${initializeProblem(none)}` : undefined,
                expected:
                    'An initialize result, or 401 with WWW-Authenticate: Bearer resource_metadata="…"',
                cause:
                    none.status === 404
                        ? "The MCP server's url in poppy.json isn't an MCP endpoint. It points to a remote MCP server endpoint using the Streamable HTTP transport (section 7)."
                        : "An MCP server answers initialize, or refuses a request without a token with a challenge that names its protected resource metadata.",
            });

        // An invented token: refused with invalid_token, and a challenge that points at the same
        // metadata.
        const invented = await initialize(
            `Bearer validator_invented_${randomId(16)}`,
            "MCP initialize with an invented access token",
        );
        const inventedChallenge = bearer(invented);
        const expectedPrm = challenge?.params.resource_metadata;
        if (invented.status !== 401)
            agg.add("mcp.invalid-token", "fail", url, {
                exchange: invented,
                expected:
                    '401 with WWW-Authenticate: Bearer error="invalid_token", resource_metadata="…"',
                cause:
                    invented.status !== undefined && invented.status < 300
                        ? "The MCP server accepted an access token the Company never issued."
                        : "An invalid access token gets 401 with invalid_token in the WWW-Authenticate header (RFC 6750 §3.1).",
            });
        else if (
            !inventedChallenge?.params.resource_metadata ||
            inventedChallenge.params.error !== "invalid_token" ||
            (expectedPrm && inventedChallenge.params.resource_metadata !== expectedPrm)
        )
            agg.add("mcp.invalid-token", "fail", url, {
                exchange: invented,
                expected: `WWW-Authenticate: Bearer error="invalid_token", resource_metadata="${expectedPrm ?? protectedResourceMetadataUrl(url)}"`,
                cause: !inventedChallenge
                    ? "The 401 has no Bearer challenge."
                    : inventedChallenge.params.error !== "invalid_token"
                      ? 'Access token errors follow OAuth: an invalid token gets error="invalid_token" in the challenge (RFC 6750 §3.1).'
                      : "An MCP server's challenges include resource_metadata with the server's protected resource metadata URL, the same in every challenge.",
            });
        else agg.add("mcp.invalid-token", "pass", url);

        // Protected resource metadata.
        const prmUrl = challenge?.params.resource_metadata ?? protectedResourceMetadataUrl(url);
        const prm = (
            await getFollowing(ctx.http, prmUrl, {
                max: 3,
                headers: { Accept: "application/json" },
            })
        ).final!;
        const doc = prm.json as { resource?: unknown; authorization_servers?: unknown } | undefined;
        if (prm.status !== 200 || !doc || typeof doc !== "object") {
            agg.add("mcp.metadata", "fail", url, {
                exchange: prm,
                expected: `200 with JSON metadata at ${prmUrl}`,
                cause: "Publish RFC 9728 protected resource metadata for the MCP server.",
            });
            agg.add("mcp.authorization-servers", "fail", url, {
                exchange: prm,
                got: "no metadata",
                expected: `authorization_servers including "${issuer}"`,
            });
        } else {
            const errors = check("protected-resource-metadata.schema.json", doc);
            if (errors.length || doc.resource !== url) {
                agg.add("mcp.metadata", "fail", url, {
                    exchange: prm,
                    got: [
                        ...formatSchemaErrors(errors),
                        doc.resource !== url ? `resource ${JSON.stringify(doc.resource)}` : "",
                    ]
                        .filter(Boolean)
                        .join("; "),
                    expected: `resource "${url}" and authorization_servers`,
                    cause: "RFC 9728 requires resource to equal the server's URL, which clients check before using the metadata.",
                });
            } else agg.add("mcp.metadata", "pass", url);
            const list = Array.isArray(doc.authorization_servers) ? doc.authorization_servers : [];
            if (issuer && list.includes(issuer)) agg.add("mcp.authorization-servers", "pass", url);
            else
                agg.add("mcp.authorization-servers", "fail", url, {
                    exchange: prm,
                    got: `authorization_servers ${JSON.stringify(doc.authorization_servers)}`,
                    expected: `authorization_servers including the Company's issuer, "${issuer}"`,
                    cause: "MCP clients get tokens from the listed authorization servers. List the issuer that the domain's protected resource metadata names (3.2).",
                });
        }
    }
    agg.flush(servers.length > 1);
}
