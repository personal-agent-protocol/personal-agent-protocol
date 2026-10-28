// The validator's HTTP client. It records every exchange, so checks can report exactly what was
// sent and what came back, and it enforces the rules a Personal Agent follows when it connects to a
// Company (spec 3, 5.6):
//
// - Every URL is HTTPS. Anything else is refused before it's sent.
// - It never connects to a loopback, private, or link-local address, unless it was configured to on
//   purpose (--allow-private-addresses, or POPPY_VALIDATOR_ALLOW_PRIVATE=1). The address is checked
//   when the host is resolved, and again when the connection is made.
// - Redirects are never followed automatically: each hop is its own exchange.
// - A 429 with a Retry-After of at most a minute is waited out and the request sent again; a longer
//   one stops that request, which the check then reports as inconclusive.
// - Work is bounded: at most `concurrency` requests at once, `maxRequests` in a run, and each one
//   times out.

import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";
import { Readable } from "node:stream";

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

// Resolves a host name to every address it has.
export type LookupAll = (host: string) => Promise<string[]>;

export type HttpRequest = {
    method?: string;
    url: string;
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
    // A short note on what makes this request special, such as "for a conversation that doesn't
    // exist". Shown as part of "Sent".
    note?: string;
    // New headers for sending the request again after a 429, such as a freshly signed Session JWT.
    refreshHeaders?: () => Promise<Record<string, string>>;
    // Stops reading the body once this returns true for the text so far, such as after the first
    // complete server-sent event.
    until?: (body: string) => boolean;
};

export type Exchange = {
    method: string;
    url: string;
    requestHeaders: Record<string, string>;
    requestBody?: string;
    note?: string;
    status?: number;
    statusText?: string;
    responseHeaders: Record<string, string>;
    // Every Set-Cookie header, which responseHeaders can't hold apart.
    setCookies: string[];
    body?: string;
    json?: unknown;
    error?: string;
    // Why the validator refused to send the request, such as a private address. Set with `error`.
    refused?: string;
    // A 429 the validator didn't wait out, with its Retry-After in seconds if it had one.
    rateLimited?: { retryAfter?: number };
    // How many times the request was sent again after a 429.
    retries?: number;
    ms: number;
};

export type Http = {
    request(req: HttpRequest): Promise<Exchange>;
    log: Exchange[];
};

export type HttpOptions = {
    // For tests: a fetch to use instead of the network.
    fetch?: FetchLike;
    timeoutMs?: number;
    // Connect to loopback, private, and link-local addresses too, for testing a local deployment.
    allowPrivateAddresses?: boolean;
    // For tests: how host names resolve.
    lookup?: LookupAll;
    // The most requests a run sends.
    maxRequests?: number;
    // The most requests in flight at once.
    concurrency?: number;
    // The longest Retry-After the validator waits out, in seconds.
    maxRetryAfter?: number;
    // For tests: how to wait.
    sleep?: (ms: number) => Promise<void>;
};

export const USER_AGENT = "poppy-validator/0.1 (+https://personalagentprotocol.org)";
const MAX_BODY = 1_000_000;
export const MAX_REQUESTS = 400;
export const MAX_RETRY_AFTER = 60;
const RATE_LIMIT_RETRIES = 2;

export const ALLOW_PRIVATE_ENV = "POPPY_VALIDATOR_ALLOW_PRIVATE";

// Loopback, private, link-local, and other non-public ranges (RFC 6890).
const BLOCKED = new BlockList();
for (const [net, prefix] of [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
] as const)
    BLOCKED.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of [
    ["::", 128],
    ["::1", 128],
    ["fc00::", 7],
    ["fe80::", 10],
    ["ff00::", 8],
] as const)
    BLOCKED.addSubnet(net, prefix, "ipv6");

// Why an address isn't public, or undefined if it is.
export function blockedAddress(address: string): string | undefined {
    const bare = address.replace(/^\[|\]$/g, "");
    const family = isIP(bare);
    if (family === 0) return undefined;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(bare);
    if (mapped) return blockedAddress(mapped[1]);
    const blocked = BLOCKED.check(bare, family === 4 ? "ipv4" : "ipv6");
    if (!blocked) return undefined;
    if (/^127\./.test(bare) || bare === "::1") return `${bare} is a loopback address`;
    if (/^169\.254\./.test(bare) || /^fe[89ab]/i.test(bare))
        return `${bare} is a link-local address`;
    return `${bare} is a private or reserved address`;
}

const systemLookupAll: LookupAll = (host) =>
    new Promise((resolve, reject) =>
        dnsLookup(host, { all: true }, (error, addresses: LookupAddress[]) =>
            error ? reject(error) : resolve(addresses.map((a) => a.address)),
        ),
    );

class PolicyError extends Error {}

// A lookup for node:https that refuses non-public addresses at connection time, so a host that
// resolves differently the second time (DNS rebinding) still can't reach one.
function guardedLookup(
    hostname: string,
    options: { all?: boolean; family?: number },
    callback: (...args: unknown[]) => void,
): void {
    dnsLookup(hostname, { ...options, all: true }, (error, addresses: LookupAddress[]) => {
        if (error) return callback(error);
        const bad = addresses.map((a) => blockedAddress(a.address)).find(Boolean);
        if (bad) return callback(new PolicyError(`${hostname} resolves to ${bad}`));
        if (options.all) return callback(null, addresses);
        callback(null, addresses[0].address, addresses[0].family);
    });
}

// fetch over node:https, so the connection's address can be checked.
function nodeFetch(allowPrivate: boolean): FetchLike {
    return (url, init) =>
        new Promise((resolve, reject) => {
            const req = httpsRequest(
                new URL(url),
                {
                    method: init.method,
                    headers: init.headers as Record<string, string>,
                    signal: init.signal ?? undefined,
                    ...(allowPrivate ? {} : { lookup: guardedLookup as never }),
                },
                (res) => {
                    const headers = new Headers();
                    for (let i = 0; i + 1 < res.rawHeaders.length; i += 2) {
                        try {
                            headers.append(res.rawHeaders[i], res.rawHeaders[i + 1]);
                        } catch {
                            // A header value fetch wouldn't accept either.
                        }
                    }
                    const status = res.statusCode ?? 0;
                    const empty = [204, 205, 304].includes(status) || init.method === "HEAD";
                    if (empty) res.resume();
                    try {
                        resolve(
                            new Response(
                                empty ? null : (Readable.toWeb(res) as ReadableStream<Uint8Array>),
                                { status, statusText: res.statusMessage, headers },
                            ),
                        );
                    } catch (error) {
                        res.destroy();
                        reject(error);
                    }
                },
            );
            req.on("error", reject);
            if (typeof init.body === "string") req.write(init.body);
            req.end();
        });
}

async function readBody(
    response: Response,
    until?: (body: string) => boolean,
): Promise<{ text: string; error?: unknown }> {
    if (!response.body) return { text: "" };
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    let size = 0;
    try {
        while (size < MAX_BODY) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.length;
            text += decoder.decode(value, { stream: true });
            if (until?.(text)) break;
        }
        text += decoder.decode();
    } catch (error) {
        return { text, error };
    } finally {
        await reader.cancel().catch(() => undefined);
    }
    return { text: text.length > MAX_BODY ? text.slice(0, MAX_BODY) : text };
}

// Retry-After in seconds, from a number of seconds or an HTTP date.
export function retryAfterSeconds(value: string | undefined, now = Date.now()): number | undefined {
    if (!value) return undefined;
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) return Number(trimmed);
    const date = Date.parse(trimmed);
    if (Number.isNaN(date)) return undefined;
    return Math.max(0, Math.ceil((date - now) / 1000));
}

export function createHttp(options: HttpOptions = {}): Http {
    const allowPrivate = options.allowPrivateAddresses ?? process.env[ALLOW_PRIVATE_ENV] === "1";
    const doFetch: FetchLike = options.fetch ?? nodeFetch(allowPrivate);
    const lookupAll = options.lookup ?? systemLookupAll;
    const maxRequests = options.maxRequests ?? MAX_REQUESTS;
    const maxRetryAfter = options.maxRetryAfter ?? MAX_RETRY_AFTER;
    const sleep = options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
    const log: Exchange[] = [];
    let sent = 0;

    // A small semaphore, so OpenAPI descriptions and other parallel work stay bounded.
    const limit = Math.max(1, options.concurrency ?? 4);
    let active = 0;
    const waiting: (() => void)[] = [];
    const acquire = async () => {
        if (active >= limit) await new Promise<void>((resolve) => waiting.push(resolve));
        active++;
    };
    const release = () => {
        active--;
        waiting.shift()?.();
    };

    // Why the validator won't send a request to this URL, if it won't.
    async function refusal(url: string): Promise<string | undefined> {
        let parsed: URL;
        try {
            parsed = new URL(url);
        } catch {
            return `${url} isn't a valid URL`;
        }
        if (parsed.protocol !== "https:")
            return `${url} isn't an HTTPS URL, and Personal Agents use only HTTPS URLs (spec 3)`;
        if (allowPrivate) return undefined;
        const host = parsed.hostname.replace(/^\[|\]$/g, "");
        const why = (detail: string) =>
            `${detail}. Personal Agents don't connect to loopback, private, or link-local addresses for a URL a Company gave them (spec 3). To test a local deployment, run with --allow-private-addresses`;
        if (isIP(host)) {
            const bad = blockedAddress(host);
            return bad ? why(bad) : undefined;
        }
        let addresses: string[];
        try {
            addresses = await lookupAll(host);
        } catch {
            // A failed lookup is a transport error, reported when the request fails.
            return undefined;
        }
        const bad = addresses.map(blockedAddress).find(Boolean);
        return bad ? why(`${host} resolves to ${bad}`) : undefined;
    }

    async function send(req: HttpRequest, exchange: Exchange): Promise<void> {
        const response = await doFetch(req.url, {
            method: exchange.method,
            headers: exchange.requestHeaders,
            body: req.body,
            redirect: "manual",
            signal: AbortSignal.timeout(req.timeoutMs ?? options.timeoutMs ?? 20_000),
        });
        exchange.status = response.status;
        exchange.statusText = response.statusText;
        exchange.responseHeaders = {};
        response.headers.forEach((value, name) => {
            exchange.responseHeaders[name.toLowerCase()] = value;
        });
        exchange.setCookies = response.headers.getSetCookie();
        if (exchange.setCookies.length)
            exchange.responseHeaders["set-cookie"] = exchange.setCookies.join(", ");
        const { text, error } = await readBody(response, req.until);
        exchange.body = text;
        if (error) exchange.error = `${describeError(error)} while reading the body`;
        const trimmed = text.trim();
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
            try {
                exchange.json = JSON.parse(trimmed);
            } catch {
                // Left as text.
            }
        }
    }

    return {
        log,
        async request(req) {
            const method = (req.method ?? "GET").toUpperCase();
            const exchange: Exchange = {
                method,
                url: req.url,
                requestHeaders: { "User-Agent": USER_AGENT, ...req.headers },
                requestBody: req.body,
                note: req.note,
                responseHeaders: {},
                setCookies: [],
                ms: 0,
            };
            const started = Date.now();
            const refused =
                sent >= maxRequests
                    ? `not sent: the run reached its limit of ${maxRequests} requests`
                    : await refusal(req.url);
            if (refused) {
                exchange.refused = refused;
                exchange.error = `not sent: ${refused}`.replace("not sent: not sent:", "not sent:");
                log.push(exchange);
                return exchange;
            }
            await acquire();
            try {
                for (let attempt = 0; ; attempt++) {
                    sent++;
                    try {
                        await send(req, exchange);
                    } catch (error) {
                        exchange.error = describeError(error);
                        if (error instanceof PolicyError || hasPolicyCause(error)) {
                            exchange.refused = exchange.error;
                        }
                    }
                    if (exchange.status !== 429) break;
                    const wait = retryAfterSeconds(header(exchange, "retry-after"));
                    if (
                        wait === undefined ||
                        wait > maxRetryAfter ||
                        attempt >= RATE_LIMIT_RETRIES ||
                        sent >= maxRequests
                    ) {
                        exchange.rateLimited = { retryAfter: wait };
                        break;
                    }
                    await sleep(wait * 1000);
                    exchange.retries = attempt + 1;
                    if (req.refreshHeaders)
                        exchange.requestHeaders = {
                            "User-Agent": USER_AGENT,
                            ...(await req.refreshHeaders()),
                        };
                }
            } finally {
                release();
            }
            exchange.ms = Date.now() - started;
            log.push(exchange);
            return exchange;
        },
    };
}

function hasPolicyCause(error: unknown): boolean {
    const cause = (error as { cause?: unknown } | undefined)?.cause;
    return cause instanceof PolicyError;
}

function describeError(error: unknown): string {
    if (error instanceof Error) {
        if (error.name === "TimeoutError" || error.name === "AbortError") return "timed out";
        const cause = (error as Error & { cause?: unknown }).cause;
        if (cause instanceof Error) {
            const code = (cause as Error & { code?: string }).code;
            return `${error.message}: ${code ? code + " " : ""}${cause.message}`;
        }
        return error.message;
    }
    return String(error);
}

export function header(exchange: Exchange, name: string): string | undefined {
    return exchange.responseHeaders[name.toLowerCase()];
}

// The `error` code from a JSON body, or from a WWW-Authenticate header.
export function errorCode(exchange: Exchange): string | undefined {
    return (
        jsonError(exchange) ??
        parseWwwAuthenticate(header(exchange, "www-authenticate")).params.error
    );
}

// The `error` code from a JSON body only.
export function jsonError(exchange: Exchange): string | undefined {
    const json = exchange.json as { error?: unknown } | undefined;
    if (json && typeof json === "object" && !Array.isArray(json) && typeof json.error === "string")
        return json.error;
    return undefined;
}

// Whether a response is HTTP 400 with {"error": "invalid_session"} in a JSON body (spec 5.3).
export function isInvalidSession(exchange: Exchange): boolean {
    return exchange.status === 400 && jsonError(exchange) === "invalid_session";
}

// Whether the exchange got no usable response: a transport error, a refusal, or a 429.
export function noResponse(exchange: Exchange | undefined): boolean {
    return Boolean(exchange && (exchange.error || exchange.status === 429));
}

export function isJsonContentType(exchange: Exchange): boolean {
    const type = header(exchange, "content-type") ?? "";
    return /^application\/([a-z0-9.+-]*\+)?json\b/i.test(type);
}

export type Challenge = { scheme: string; params: Record<string, string> };

// Parses every challenge of a WWW-Authenticate header, such as
// `Bearer error="invalid_token", resource_metadata="…", DPoP algs="ES256"`.
export function parseChallenges(value: string | undefined): Challenge[] {
    const challenges: Challenge[] = [];
    if (!value) return challenges;
    const token = /[A-Za-z0-9!#$%&'*+.^_`|~-]+/y;
    let i = 0;
    let current: Challenge | undefined;
    const skip = () => {
        while (i < value.length && /[\s,]/.test(value[i])) i++;
    };
    while (i < value.length) {
        skip();
        token.lastIndex = i;
        const m = token.exec(value);
        if (!m) {
            i++;
            continue;
        }
        const name = m[0];
        i = token.lastIndex;
        let j = i;
        while (j < value.length && value[j] === " ") j++;
        if (value[j] === "=" && current) {
            // A parameter of the current challenge.
            j++;
            while (j < value.length && value[j] === " ") j++;
            let v = "";
            if (value[j] === '"') {
                j++;
                while (j < value.length && value[j] !== '"') {
                    if (value[j] === "\\" && j + 1 < value.length) j++;
                    v += value[j++];
                }
                j++;
            } else {
                while (j < value.length && !/[\s,]/.test(value[j])) v += value[j++];
            }
            const key = name.toLowerCase();
            if (!(key in current.params)) current.params[key] = v;
            i = j;
        } else if (value[j] === "=") {
            i = j + 1;
        } else {
            current = { scheme: name, params: {} };
            challenges.push(current);
            // A token68, such as Basic's, isn't a parameter.
            const t68 = /^ +[A-Za-z0-9._~+/-]+=*(?=\s*(,|$))/.exec(value.slice(i));
            if (t68 && !/=\s*"/.test(t68[0]) && !value.slice(i + t68[0].length).startsWith("="))
                i += t68[0].length;
        }
    }
    return challenges;
}

// The first challenge of a WWW-Authenticate header, its schemes, and its parameters.
export function parseWwwAuthenticate(value: string | undefined): {
    scheme?: string;
    schemes: string[];
    params: Record<string, string>;
} {
    const challenges = parseChallenges(value);
    return {
        scheme: challenges[0]?.scheme,
        schemes: challenges.map((c) => c.scheme),
        params: challenges[0]?.params ?? {},
    };
}

export type FollowResult = {
    chain: Exchange[];
    final?: Exchange;
    // Set when a redirect went to a non-HTTPS URL, there were too many, or a Location was missing.
    problem?: string;
    nonHttpsRedirect?: string;
};

// GETs a URL, following up to `max` redirects by hand so each hop is recorded. Stops at a redirect
// to a URL that isn't HTTPS.
export async function getFollowing(
    http: Http,
    url: string,
    options: { max?: number; headers?: Record<string, string> } = {},
): Promise<FollowResult> {
    const chain: Exchange[] = [];
    let current = url;
    for (let hop = 0; hop <= (options.max ?? 5); hop++) {
        const exchange = await http.request({ url: current, headers: options.headers });
        chain.push(exchange);
        const status = exchange.status ?? 0;
        if (status < 300 || status >= 400 || status === 304) return { chain, final: exchange };
        const location = header(exchange, "location");
        if (!location) {
            return {
                chain,
                final: exchange,
                problem: `${status} redirect without a Location header`,
            };
        }
        let next: string;
        try {
            next = new URL(location, current).toString();
        } catch {
            return { chain, final: exchange, problem: `redirected to an invalid URL, ${location}` };
        }
        if (!next.startsWith("https://")) {
            return {
                chain,
                final: exchange,
                problem: `redirected to ${next}, which isn't HTTPS`,
                nonHttpsRedirect: next,
            };
        }
        current = next;
    }
    return { chain, final: chain[chain.length - 1], problem: "too many redirects" };
}
