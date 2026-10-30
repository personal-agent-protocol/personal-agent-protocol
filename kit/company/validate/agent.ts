// The validator acting as a Personal Agent: every request it sends to a Company's APIs and endpoints
// carries a Session JWT in the Poppy-Session header, signed for that request with a delegated key
// (spec 5.2).

import type { Exchange } from "./http.ts";
import { userIdFor } from "./identity.ts";
import { randomId, signSessionJwt, type SigningKey } from "./jose.ts";
import { conversationEndpoint, type Context } from "./checks/types.ts";

// The validated Company's identifier, which Session JWTs name in aud (spec 3.2, 5.2).
export function audience(ctx: Context): string {
    const value = ctx.discovered.audience;
    if (!value) throw new Error("No Company audience");
    return value;
}

export function userId(ctx: Context): string {
    ctx.session.userId ??= userIdFor(ctx.identity!, audience(ctx));
    return ctx.session.userId;
}

// This run's Session ID: at least 128 random bits (spec 5.2).
export function sessionId(ctx: Context): string {
    ctx.session.sid ??= randomId(16);
    return ctx.session.sid;
}

export type SessionOptions = {
    key?: SigningKey;
    // The delegation to send, or null for none. Defaults to the identity's (spec 5.2).
    delegation?: string | null;
    typ?: string;
    // A header kid other than the delegated key's thumbprint.
    kid?: string;
    sid?: string;
    sub?: string;
    agentId?: string;
    // A method and URL other than the request's, for htm and htu.
    method?: string;
    url?: string;
    accessToken?: string;
    iat?: number;
    extra?: Record<string, unknown>;
};

// A Session JWT for a request, with the identity's delegated key unless options say otherwise.
export function sessionJwt(
    ctx: Context,
    method: string,
    url: string,
    options: SessionOptions = {},
): Promise<string> {
    const identity = ctx.identity!;
    return signSessionJwt({
        key: options.key ?? identity.key,
        delegation: options.delegation === undefined ? identity.delegation : options.delegation,
        iss: identity.clientId,
        aud: audience(ctx),
        sid: options.sid ?? sessionId(ctx),
        sub: options.sub ?? userId(ctx),
        method: options.method ?? method,
        url: options.url ?? url,
        accessToken: options.accessToken,
        typ: options.typ,
        kid: options.kid,
        agentId: options.agentId,
        iat: options.iat,
        extra: options.extra,
    });
}

// A request with the Session header, or with none when `session` is "none".
export async function sessionRequest(
    ctx: Context,
    options: {
        method?: string;
        url: string;
        session?: SessionOptions | "none";
        body?: unknown;
        headers?: Record<string, string>;
        note?: string;
        timeoutMs?: number;
        until?: (body: string) => boolean;
    },
): Promise<Exchange> {
    const method = (options.method ?? "GET").toUpperCase();
    const headers: Record<string, string> = { Accept: "application/json", ...options.headers };
    const session = options.session;
    if (session !== "none")
        headers["Poppy-Session"] = await sessionJwt(ctx, method, options.url, session);
    let body: string | undefined;
    if (options.body !== undefined) {
        body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
        headers["Content-Type"] ??= "application/json";
    }
    const exchange = await ctx.http.request({
        method,
        url: options.url,
        headers,
        body,
        note: options.note,
        timeoutMs: options.timeoutMs,
        until: options.until,
        // After a 429, a fresh Session JWT: the old one's iat may be outside the window.
        refreshHeaders:
            session === "none"
                ? undefined
                : async () => ({
                      ...headers,
                      "Poppy-Session": await sessionJwt(ctx, method, options.url, session),
                  }),
    });
    noteCreated(ctx, exchange, session === "none" ? undefined : session?.sub);
    return exchange;
}

// Remembers a conversation a request started, so the run can close it (spec 8.12).
function noteCreated(ctx: Context, ex: Exchange, sub: string | undefined): void {
    const endpoint = conversationEndpoint(ctx.discovered.poppy);
    const path = ex.url.split("?")[0].replace(/\/+$/, "");
    if (
        ex.method !== "POST" ||
        !endpoint ||
        (!path.startsWith(`${endpoint}/`) && path !== endpoint)
    )
        return;
    if (ex.status === undefined || ex.status < 200 || ex.status >= 300) return;
    const closing = /^\/([A-Za-z0-9_-]+)\/close$/.exec(path.slice(endpoint.length));
    if (closing) {
        const known = ctx.created.find((c) => c.id === closing[1]);
        if (known && ex.status === 200) known.closed = true;
        return;
    }
    if (path !== endpoint) return;
    const id = (ex.json as { conversation_id?: unknown } | undefined)?.conversation_id;
    if (typeof id !== "string" || ctx.created.some((c) => c.id === id)) return;
    ctx.created.push({ endpoint, id, sub: sub ?? userId(ctx) });
}

export function syntheticMessageId(): string {
    return `msg_${randomId(16)}`;
}
