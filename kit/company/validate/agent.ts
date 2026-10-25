// The validator acting as a Personal Agent: client assertions, Session assertions, token requests,
// and requests with a Session Token and DPoP Proof, including the nonce retry RFC 9449 describes.

import { errorCode, header, type Exchange } from "./http.ts";
import { userIdFor } from "./identity.ts";
import { dpopProof, generateKey, randomId, signAssertion, type SigningKey } from "./jose.ts";
import type { Context, HeldToken } from "./checks/types.ts";

export const JWT_BEARER = "urn:ietf:params:oauth:grant-type:jwt-bearer";
const CLIENT_ASSERTION_TYPE = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";
export const TOKEN_EXCHANGE = "urn:ietf:params:oauth:grant-type:token-exchange";
const ACCESS_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:access_token";

export function tokenEndpoint(ctx: Context): string {
    const endpoint = ctx.discovered.metadata?.token_endpoint;
    if (!endpoint) throw new Error("No token_endpoint");
    return endpoint;
}

// The Company's auth.issuer, which every assertion names in aud (4.1, 4.2).
export function issuer(ctx: Context): string {
    const value = ctx.discovered.poppy?.auth?.issuer;
    if (!value) throw new Error("No auth.issuer");
    return value;
}

export async function dpopKey(ctx: Context): Promise<SigningKey> {
    ctx.session.dpopKey ??= await generateKey(false);
    return ctx.session.dpopKey;
}

export function userId(ctx: Context): string {
    const issuer = ctx.discovered.poppy?.auth?.issuer ?? "";
    ctx.session.userId ??= userIdFor(ctx.identity!, issuer);
    return ctx.session.userId;
}

export function clientAssertion(ctx: Context, key?: SigningKey, aud?: string): Promise<string> {
    const identity = ctx.identity!;
    return signAssertion({
        key: key ?? identity.key,
        iss: identity.clientId,
        sub: identity.clientId,
        aud: aud ?? issuer(ctx),
    });
}

export function sessionAssertion(
    ctx: Context,
    options: {
        key?: SigningKey;
        typ?: string;
        jti?: string;
        sub?: string;
        extra?: Record<string, unknown>;
    } = {},
): Promise<string> {
    const identity = ctx.identity!;
    return signAssertion({
        key: options.key ?? identity.key,
        iss: identity.clientId,
        sub: options.sub ?? userId(ctx),
        aud: issuer(ctx),
        typ: options.typ,
        jti: options.jti,
        extra: options.extra,
    });
}

function originOf(url: string): string {
    return new URL(url).origin;
}

// Records a DPoP-Nonce header, and whether the response asked for a nonce.
function noteNonce(ctx: Context, ex: Exchange): boolean {
    const nonce = header(ex, "dpop-nonce");
    if (nonce) ctx.session.nonces[originOf(ex.url)] = nonce;
    const asked = errorCode(ex) === "use_dpop_nonce";
    if (asked) ctx.session.nonceRequests.push({ origin: originOf(ex.url), exchange: ex });
    return asked && nonce !== undefined;
}

export type ProofMode =
    // A fresh proof with the current nonce, retried once on use_dpop_nonce.
    | "auto"
    // No DPoP header at all.
    | "none"
    // This exact proof, sent as is.
    | { proof: string }
    // A fresh proof with changes, sent once.
    | { key?: SigningKey; url?: string; method?: string; accessToken?: string };

export type Attempt = { ex: Exchange; proof?: string; exchanges: Exchange[] };

async function makeProof(
    ctx: Context,
    mode: ProofMode,
    method: string,
    url: string,
    accessToken: string | undefined,
): Promise<string | undefined> {
    if (mode === "none") return undefined;
    if (typeof mode === "object" && "proof" in mode) return mode.proof;
    const custom = typeof mode === "object" ? mode : {};
    return dpopProof({
        key: custom.key ?? (await dpopKey(ctx)),
        method: custom.method ?? method,
        url: custom.url ?? url,
        accessToken: custom.accessToken ?? accessToken,
        nonce: ctx.session.nonces[originOf(url)],
    });
}

// A token request. `params` is called for each attempt, so a retry gets fresh assertions.
export async function tokenRequest(
    ctx: Context,
    params: () => Promise<Record<string, string>>,
    options: { proof?: ProofMode; clientKey?: SigningKey; clientAud?: string; note?: string } = {},
): Promise<Attempt> {
    const url = tokenEndpoint(ctx);
    const mode = options.proof ?? "auto";
    const exchanges: Exchange[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
        const body = new URLSearchParams({
            ...(await params()),
            client_id: ctx.identity!.clientId,
            client_assertion_type: CLIENT_ASSERTION_TYPE,
            client_assertion: await clientAssertion(ctx, options.clientKey, options.clientAud),
        });
        const proof = await makeProof(ctx, mode, "POST", url, undefined);
        const headers: Record<string, string> = {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
        };
        if (proof) headers.DPoP = proof;
        const ex = await ctx.http.request({
            method: "POST",
            url,
            headers,
            body: body.toString(),
            note: options.note,
        });
        exchanges.push(ex);
        const retry = noteNonce(ctx, ex);
        if (!(retry && mode === "auto" && attempt === 0)) return { ex, proof, exchanges };
    }
    throw new Error("unreachable");
}

// A request with a Session Token. `scheme` defaults to the token's type.
export async function authedRequest(
    ctx: Context,
    options: {
        method?: string;
        url: string;
        token?: HeldToken;
        scheme?: string;
        proof?: ProofMode;
        body?: unknown;
        headers?: Record<string, string>;
        note?: string;
        timeoutMs?: number;
    },
): Promise<Attempt> {
    const method = (options.method ?? "GET").toUpperCase();
    const token = options.token;
    const mode =
        options.proof ?? (token && token.tokenType.toLowerCase() === "bearer" ? "none" : "auto");
    const exchanges: Exchange[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
        const headers: Record<string, string> = { Accept: "application/json", ...options.headers };
        if (token)
            headers.Authorization = `${options.scheme ?? (token.tokenType.toLowerCase() === "bearer" ? "Bearer" : "DPoP")} ${token.accessToken}`;
        const proof = await makeProof(ctx, mode, method, options.url, token?.accessToken);
        if (proof) headers.DPoP = proof;
        let body: string | undefined;
        if (options.body !== undefined) {
            body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
            headers["Content-Type"] ??= "application/json";
        }
        const ex = await ctx.http.request({
            method,
            url: options.url,
            headers,
            body,
            note: options.note,
            timeoutMs: options.timeoutMs,
        });
        exchanges.push(ex);
        const retry = noteNonce(ctx, ex);
        if (!(retry && mode === "auto" && attempt === 0)) return { ex, proof, exchanges };
    }
    throw new Error("unreachable");
}

export function heldToken(
    ex: Exchange,
    dpop: SigningKey | undefined,
    resource?: string,
): HeldToken | undefined {
    const json = ex.json as Record<string, unknown> | undefined;
    if (ex.status !== 200 || !json || typeof json.access_token !== "string") return undefined;
    return {
        accessToken: json.access_token,
        tokenType: typeof json.token_type === "string" ? json.token_type : "",
        dpopKey: dpop,
        resource,
    };
}

// Params for starting a Session with the JWT bearer grant. With the Session's DPoP key, the same
// request renews it (4.2).
export function sessionParams(
    ctx: Context,
    extra: Record<string, string> = {},
    assertion?: string,
): () => Promise<Record<string, string>> {
    return async () => ({
        grant_type: JWT_BEARER,
        assertion: assertion ?? (await sessionAssertion(ctx)),
        ...extra,
    });
}

// A token for a service entry with a `resource` (4.3), requested once and reused.
export async function tokenForResource(
    ctx: Context,
    resource: string | undefined,
): Promise<HeldToken | undefined> {
    const base = ctx.session.token;
    if (!base || !resource) return base;
    if (ctx.session.resourceTokens[resource]) return ctx.session.resourceTokens[resource];
    const attempt = await tokenRequest(ctx, sessionParams(ctx, { resource }), {
        note: `renewing the Session with resource=${resource}`,
    });
    const token = heldToken(attempt.ex, ctx.session.dpopKey, resource);
    if (token) ctx.session.resourceTokens[resource] = token;
    return token;
}

// Params for exchanging a DPoP Session Token for a Bearer one for an MCP server (4.3, RFC 8693).
export function exchangeParams(
    subject: HeldToken,
    resource: string,
): () => Promise<Record<string, string>> {
    return async () => ({
        grant_type: TOKEN_EXCHANGE,
        subject_token: subject.accessToken,
        subject_token_type: ACCESS_TOKEN_TYPE,
        resource,
    });
}

export function syntheticMessageId(): string {
    return `msg_${randomId(16)}`;
}
