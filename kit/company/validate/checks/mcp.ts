// Milestone 2: listed MCP servers (sections 4.3 and 6): protected resource metadata, Session Tokens
// bound to each server's url (DPoP at a server that supports it, Bearer by Token Exchange otherwise),
// invalid_target for the other kind of request, and the general DPoP token refused.

import {
    authedRequest,
    dpopKey,
    exchangeParams,
    heldToken,
    sessionParams,
    TOKEN_EXCHANGE,
    tokenRequest,
} from "../agent.ts";
import { errorCode, getFollowing, header, parseWwwAuthenticate, type Exchange } from "../http.ts";
import { formatSchemaErrors } from "../schema.ts";
import { check } from "../schemas.ts";
import { accepted as probeAccepted, findProbe } from "./resource.ts";
import {
    offersGrant,
    skipRest,
    type Context,
    type Detail,
    type HeldToken,
    type Recorder,
} from "./types.ts";

export const MCP_IDS = [
    "mcp.no-token",
    "mcp.metadata",
    "mcp.authorization-servers",
    "mcp.token-exchange-grant",
    "mcp.bearer-token",
    "mcp.bearer-server-no-dpop",
    "mcp.bearer-accepted",
    "mcp.dpop-server-token",
    "mcp.dpop-server-no-bearer",
    "mcp.dpop-server-accepted",
    "mcp.dpop-token-rejected",
    "mcp.other-resource-rejected",
    "mcp.bearer-elsewhere-rejected",
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

// Whether a token request was refused with 400 invalid_target.
function invalidTarget(ex: Exchange): boolean {
    return ex.status === 400 && errorCode(ex) === "invalid_target";
}

// Whether an MCP response is a successful initialize result (JSON or SSE).
export function initializeOk(ex: Exchange): boolean {
    if (ex.status !== 200) return false;
    let json = ex.json as { result?: unknown } | undefined;
    if (!json && ex.body) {
        for (const line of ex.body.split("\n")) {
            if (!line.startsWith("data:")) continue;
            try {
                json = JSON.parse(line.slice(5).trim());
                break;
            } catch {
                // Not JSON.
            }
        }
    }
    return Boolean(json && typeof json === "object" && "result" in json);
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
    const servers = (ctx.discovered.poppy?.apis ?? [])
        .filter((a) => a?.type === "mcp" && typeof a.url === "string")
        .map((a) => a.url!);
    if (servers.length === 0) {
        skipRest(r, MCP_IDS, "poppy.json lists no MCP servers.");
        return;
    }
    const issuer = ctx.discovered.poppy?.auth?.issuer;
    const agg = aggregator(r);
    const bearer: Record<string, HeldToken> = {};
    let dpopServers = 0;

    for (const url of servers) {
        // No token: 401 pointing at the protected resource metadata.
        const none = (
            await authedRequest(ctx, {
                method: "POST",
                url,
                body: INITIALIZE,
                proof: "none",
                headers: MCP_HEADERS,
                note: "MCP initialize with no token",
            })
        ).ex;
        const www = parseWwwAuthenticate(header(none, "www-authenticate"));
        if (none.status === 401 && www.params.resource_metadata)
            agg.add("mcp.no-token", "pass", url);
        else
            agg.add("mcp.no-token", "fail", url, {
                exchange: none,
                expected: '401 with WWW-Authenticate: Bearer resource_metadata="…"',
                cause:
                    none.status === 401
                        ? "MCP 2025-06-18 requires the 401 to name the protected resource metadata URL in WWW-Authenticate, so MCP clients can find the authorization server."
                        : "The MCP server should refuse requests without a token with 401.",
            });

        // Protected resource metadata.
        const prmUrl = www.params.resource_metadata ?? protectedResourceMetadataUrl(url);
        const prm = (
            await getFollowing(ctx.http, prmUrl, {
                max: 3,
                headers: { Accept: "application/json" },
            })
        ).final!;
        const doc = prm.json as
            | {
                  resource?: unknown;
                  authorization_servers?: unknown;
                  dpop_signing_alg_values_supported?: unknown;
              }
            | undefined;
        const supportsDpop = Array.isArray(doc?.dpop_signing_alg_values_supported);
        if (supportsDpop) dpopServers++;
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
                    expected: `authorization_servers including "${issuer}", exactly as auth.issuer`,
                    cause: "MCP clients get tokens from the listed authorization servers; list the Poppy issuer.",
                });
        }

        const metadata = ctx.discovered.metadata;
        if (!supportsDpop && metadata) {
            if (offersGrant(metadata, TOKEN_EXCHANGE))
                agg.add("mcp.token-exchange-grant", "pass", url);
            else
                agg.add("mcp.token-exchange-grant", "fail", url, {
                    got: `grant_types_supported ${JSON.stringify(metadata.grant_types_supported)}`,
                    expected: `grant_types_supported including ${TOKEN_EXCHANGE}`,
                    cause: "The server's protected resource metadata has no dpop_signing_alg_values_supported, so Personal Agents get its tokens by Token Exchange, and read grant_types_supported to learn the Company supports it.",
                });
        }

        if (!ctx.session.token) continue;
        const subject = ctx.session.token;

        let token: HeldToken | undefined;
        if (supportsDpop) {
            // A DPoP server: a DPoP token from the usual request, and no Bearer token by exchange.
            const key = await dpopKey(ctx);
            const dpopEx = (
                await tokenRequest(ctx, sessionParams(ctx, { resource: url }), {
                    note: `renewing the Session with resource=${url}`,
                })
            ).ex;
            const issued = heldToken(dpopEx, key, url);
            if (!issued || issued.tokenType.toLowerCase() !== "dpop") {
                agg.add("mcp.dpop-server-token", "fail", url, {
                    exchange: dpopEx,
                    got: issued ? `token_type ${issued.tokenType}` : undefined,
                    expected: "200 with token_type DPoP",
                    cause: "The server's protected resource metadata lists dpop_signing_alg_values_supported, so the token endpoint should issue a DPoP Session Token for it.",
                });
            } else {
                agg.add("mcp.dpop-server-token", "pass", url);
                token = issued;
            }
            const bearerEx = (
                await tokenRequest(ctx, exchangeParams(subject, url), {
                    note: `exchanging the DPoP Session Token for a Bearer one, resource=${url}`,
                })
            ).ex;
            if (invalidTarget(bearerEx)) agg.add("mcp.dpop-server-no-bearer", "pass", url);
            else if (heldToken(bearerEx, undefined, url))
                agg.add("mcp.dpop-server-no-bearer", "fail", url, {
                    exchange: bearerEx,
                    got: "200 with a token",
                    expected: "400 invalid_target",
                    cause: "The server supports DPoP, so Personal Agents get only DPoP Session Tokens for it.",
                });
            else
                agg.add("mcp.dpop-server-no-bearer", "fail", url, {
                    exchange: bearerEx,
                    expected: "400 invalid_target",
                    cause: "invalid_target tells the Personal Agent that the server needs a different type of token (4.2), so it can renew the Session for a DPoP one instead.",
                });
            if (!token) continue;
        } else {
            // A server without DPoP: a Bearer token by Token Exchange.
            const attempt = await tokenRequest(ctx, exchangeParams(subject, url), {
                note: `exchanging the DPoP Session Token for a Bearer one, resource=${url}`,
            });
            const issued = heldToken(attempt.ex, undefined, url);
            if (!issued)
                agg.add("mcp.bearer-token", "fail", url, {
                    exchange: attempt.exchanges,
                    expected: "200 with a Bearer Session Token",
                    cause: "A Company that lists an MCP server without DPoP must support the token exchange grant (RFC 8693), and issue a Bearer Session Token for the server in exchange for a DPoP one.",
                });
            else if (issued.tokenType.toLowerCase() !== "bearer")
                agg.add("mcp.bearer-token", "fail", url, {
                    exchange: attempt.ex,
                    got: `token_type ${issued.tokenType}`,
                    expected: "token_type Bearer",
                    cause: "The server doesn't support DPoP, so its tokens are Bearer tokens.",
                });
            else {
                agg.add("mcp.bearer-token", "pass", url);
                token = { ...issued, tokenType: "Bearer" };
            }

            // Any other token request for the server gets invalid_target, not a token.
            const renewEx = (
                await tokenRequest(ctx, sessionParams(ctx, { resource: url }), {
                    note: `renewing the Session with resource=${url}`,
                })
            ).ex;
            if (invalidTarget(renewEx)) agg.add("mcp.bearer-server-no-dpop", "pass", url);
            else {
                const renewed = heldToken(renewEx, undefined, url);
                agg.add("mcp.bearer-server-no-dpop", "fail", url, {
                    exchange: renewEx,
                    got: renewed ? `200 with token_type ${renewed.tokenType}` : undefined,
                    expected: "400 invalid_target",
                    cause: renewed
                        ? "The server doesn't support DPoP, so the Company issues tokens for it only by Token Exchange."
                        : "invalid_target tells the Personal Agent that the server needs a different type of token (4.2), so it can use Token Exchange instead.",
                });
            }

            if (!token) continue;
            bearer[url] = token;
        }

        const ok = (
            await authedRequest(ctx, {
                method: "POST",
                url,
                token,
                body: INITIALIZE,
                headers: MCP_HEADERS,
                note: `MCP initialize with the ${token.tokenType} Session Token for this server`,
            })
        ).ex;
        const acceptedId = supportsDpop ? "mcp.dpop-server-accepted" : "mcp.bearer-accepted";
        if (initializeOk(ok)) agg.add(acceptedId, "pass", url);
        else
            agg.add(acceptedId, "fail", url, {
                exchange: ok,
                expected: "200 with an initialize result",
                cause: "The MCP server should accept Session Tokens issued for its url as access tokens.",
            });

        const dpop = (
            await authedRequest(ctx, {
                method: "POST",
                url,
                token: ctx.session.token,
                body: INITIALIZE,
                headers: MCP_HEADERS,
                note: "MCP initialize with the general DPoP Session Token and a proof",
            })
        ).ex;
        if (initializeOk(dpop))
            agg.add("mcp.dpop-token-rejected", "fail", url, {
                exchange: dpop,
                got: "200, initialize succeeded",
                expected: "401",
                cause: "The MCP server accepts tokens that weren't issued for its url.",
            });
        else agg.add("mcp.dpop-token-rejected", "pass", url);
    }

    // A Bearer token for another resource.
    if (ctx.session.token) {
        for (const url of servers) {
            if (!bearer[url]) continue;
            const other = servers.find((s) => s !== url && bearer[s]);
            let token = other ? bearer[other] : undefined;
            if (!token) {
                const resource = `${new URL(url).origin}/poppy-validator-not-a-resource`;
                const ex = (
                    await tokenRequest(ctx, exchangeParams(ctx.session.token, resource), {
                        note: `exchanging for a Bearer token for resource=${resource}, which isn't listed`,
                    })
                ).ex;
                const issued = heldToken(ex, undefined, resource);
                if (!issued) {
                    agg.add("mcp.other-resource-rejected", "pass", url, {
                        summary: "The token endpoint refused a token for an unlisted resource.",
                    });
                    continue;
                }
                token = { ...issued, tokenType: "Bearer" };
            }
            const ex = (
                await authedRequest(ctx, {
                    method: "POST",
                    url,
                    token,
                    body: INITIALIZE,
                    headers: MCP_HEADERS,
                    note: `MCP initialize with a Bearer token issued for ${token.resource}`,
                })
            ).ex;
            if (initializeOk(ex))
                agg.add("mcp.other-resource-rejected", "fail", url, {
                    exchange: ex,
                    got: "200, initialize succeeded",
                    expected: "401",
                    cause: "The MCP server doesn't check that the token was issued for its url (the token's audience).",
                });
            else agg.add("mcp.other-resource-rejected", "pass", url);
        }

        const probe = findProbe(ctx);
        const anyBearer = Object.values(bearer)[0];
        if (probe && anyBearer) {
            const ex = (
                await authedRequest(ctx, {
                    url: probe.url,
                    token: anyBearer,
                    note: `${probe.describe}, with the MCP Bearer token`,
                })
            ).ex;
            if (probeAccepted(probe, ex))
                agg.add("mcp.bearer-elsewhere-rejected", "fail", servers[0], {
                    exchange: ex,
                    expected: "401",
                    cause: "A Bearer token for the MCP server works at another endpoint. Accept Bearer tokens only on MCP servers.",
                });
            else agg.add("mcp.bearer-elsewhere-rejected", "pass", servers[0]);
        } else
            r.skip(
                "mcp.bearer-elsewhere-rejected",
                probe
                    ? "No Bearer token was issued."
                    : "No conversation endpoint or --probe URL to try it at.",
            );
    }
    agg.flush(servers.length > 1);
    if (dpopServers === 0)
        skipRest(
            r,
            ["mcp.dpop-server-token", "mcp.dpop-server-no-bearer", "mcp.dpop-server-accepted"],
            "No listed MCP server supports DPoP.",
        );
    if (dpopServers === servers.length)
        skipRest(
            r,
            [
                "mcp.token-exchange-grant",
                "mcp.bearer-token",
                "mcp.bearer-server-no-dpop",
                "mcp.bearer-accepted",
                "mcp.other-resource-rejected",
                "mcp.bearer-elsewhere-rejected",
            ],
            "Every listed MCP server supports DPoP, so none uses Bearer tokens.",
        );
    const reason = ctx.identity
        ? "No Session Token (see session.start)."
        : (ctx.identityProblem ?? "No test Personal Agent.");
    skipRest(r, MCP_IDS, reason);
}
