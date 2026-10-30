// The shape of check results, the context checks run in, and a recorder that turns check outcomes
// into results with the requirement, links, and redacted exchanges filled in.

import {
    CATALOG,
    checkInfo,
    PROTOCOL_VERSION,
    type CheckInfo,
    type Milestone,
} from "../catalog.ts";
import { errorCode, noResponse, type Exchange, type Http } from "../http.ts";
import type { Identity } from "../identity.ts";
import { redactBody, redactHeaders, redactSetCookie, redactUrl, redactText } from "../redact.ts";

export type Status = "pass" | "fail" | "warn" | "skip";

// A request and response, redacted, for output and last-results.json.
export type ExchangeSummary = {
    request: string;
    requestHeaders?: Record<string, string>;
    requestBody?: string;
    response: string;
    responseHeaders?: Record<string, string>;
    responseBody?: string;
};

export type CheckResult = CheckInfo & {
    status: Status;
    // One line on what happened.
    summary?: string;
    sent?: string;
    got?: string;
    expected?: string;
    cause?: string;
    // Why a check was skipped.
    reason?: string;
    // A warning because the validator couldn't decide: no usable response, a rate limit, or the
    // Company declined the validator by policy. Not a finding against the Company.
    inconclusive?: boolean;
    notes?: string[];
    exchanges?: ExchangeSummary[];
    specUrl: string;
    disagreeUrl: string;
};

export type Poppy = {
    protocol_version?: string;
    organization?: { name?: string; domain?: string };
    auth?: {
        issuer?: string;
        scopes?: Record<string, string>;
        scope_hints?: Record<string, { changes: string; personal_data: boolean }>;
    };
    agent?: { protocols?: { type?: string; endpoint?: string; access?: string }[] };
    web?: { browser_session_endpoint?: string };
    feedback?: { endpoint?: string };
    excluded_tasks?: { url?: string };
    apis?: { type?: string; url?: string; description?: string }[];
    extensions?: Record<string, { version?: string }> & {
        "mediated-sign-in"?: {
            version?: string;
            fields?: unknown[];
            scopes?: string[];
        };
    };
};

export type Metadata = {
    issuer?: string;
    token_endpoint?: string;
    revocation_endpoint?: string;
    authorization_endpoint?: string;
    device_authorization_endpoint?: string;
    grant_types_supported?: unknown;
    scopes_supported?: unknown;
    protected_resources?: unknown;
    [field: string]: unknown;
};

// The grant types that say a Company offers Direct and Device Sign-In (spec 3.2).
export const SIGN_IN_GRANTS = {
    direct: "authorization_code",
    device: "urn:ietf:params:oauth:grant-type:device_code",
} as const;

export function offersGrant(metadata: Metadata | undefined, grant: string): boolean {
    const grants = metadata?.grant_types_supported;
    return Array.isArray(grants) && grants.includes(grant);
}

// The domain's protected resource metadata (RFC 9728), which names the issuer (spec 3.2).
export type ResourceMetadata = {
    resource?: unknown;
    authorization_servers?: unknown;
    [field: string]: unknown;
};

export type Discovered = {
    poppy?: Poppy;
    poppyUrl?: string;
    finalHost?: string;
    resourceMetadata?: ResourceMetadata;
    // The Company's issuer, from the protected resource metadata and auth.issuer (spec 3.2).
    issuer?: string;
    // Validated issuer, or domain origin for an issuerless Company (spec 3.2).
    audience?: string;
    metadata?: Metadata;
    metadataUrl?: string;
};

export type SessionState = {
    // This run's Session ID (spec 5.2).
    sid?: string;
    userId?: string;
    // Whether a resource accepted the Session (session.start), and the request it accepted.
    started?: boolean;
    startExchange?: Exchange;
};

export type CheckOptions = {
    only?: string[];
    milestones: Set<Milestone>;
    probe?: string;
    // The engineer confirms this API probe relies on Session identity or state.
    probeSession?: boolean;
    offline?: boolean;
};

export type Context = {
    http: Http;
    target?: string;
    options: CheckOptions;
    identity?: Identity;
    // Why there's no usable identity, if there isn't one.
    identityProblem?: string;
    discovered: Discovered;
    session: SessionState;
    notes: string[];
    // Why a prerequisite isn't usable, by name, such as "poppy" or "issuer". Checks that depend on
    // it skip with the reason.
    blocked: Record<string, string>;
    // Conversations this run created, so they can all be closed at the end (spec 8.8).
    created: CreatedConversation[];
};

export type CreatedConversation = {
    endpoint: string;
    id: string;
    // The User the conversation belongs to: this run's User or the other one (spec 8.2).
    sub: string;
    closed?: boolean;
};

export function newContext(http: Http, options: CheckOptions, target?: string): Context {
    return {
        http,
        target,
        options,
        discovered: {},
        session: {},
        notes: [],
        blocked: {},
        created: [],
    };
}

const SITE = "https://personalagentprotocol.org";
const ISSUES = "https://github.com/personal-agent-protocol/personal-agent-protocol/issues/new";

export function specUrl(section: string): string {
    const [page, id] = section.split("#");
    return `${SITE}/docs/${PROTOCOL_VERSION}/${page}#${id}`;
}

export function disagreeUrl(info: CheckInfo): string {
    const params = new URLSearchParams({
        template: "1-feedback.yml",
        page: "Company kit",
        section: specUrl(info.section),
        kind: "Question",
        description: `Validator check ${info.id} ("${info.title}") reported a problem that I think is wrong.\n\nRequirement: "${info.quote}"\n\nWhy I think the check is wrong:\n`,
    });
    return `${ISSUES}?${params.toString()}`;
}

// Whether a check id is selected by --only (an id or a prefix such as "session." or "session").
export function selected(options: CheckOptions, id: string): boolean {
    if (!options.only || options.only.length === 0) return true;
    return options.only.some((p) => id.startsWith(p));
}

// Whether any check with one of these prefixes is selected and in a selected milestone.
export function wantsAny(ctx: Context, prefixes: string[]): boolean {
    return prefixes.some((prefix) => wants(ctx, prefix));
}

// Whether a check id, or any check under a prefix, is selected and in a selected milestone.
export function wants(ctx: Context, idOrPrefix: string): boolean {
    return CATALOG.some(
        (info) =>
            (info.id === idOrPrefix || info.id.startsWith(idOrPrefix)) &&
            ctx.options.milestones.has(info.milestone) &&
            selected(ctx.options, info.id),
    );
}

export function summarizeExchange(ex: Exchange): ExchangeSummary {
    const pick = (headers: Record<string, string>, names: string[]) => {
        const out: Record<string, string> = {};
        for (const [name, value] of Object.entries(headers)) {
            if (names.includes(name.toLowerCase())) out[name] = value;
        }
        return Object.keys(out).length ? redactHeaders(out) : undefined;
    };
    const body = ex.body ?? "";
    const responseHeaders = pick(ex.responseHeaders, [
        "content-type",
        "www-authenticate",
        "cache-control",
        "content-security-policy",
        "x-frame-options",
        "cross-origin-opener-policy",
        "location",
        "retry-after",
    ]);
    // Each Set-Cookie is redacted on its own, since joined ones can't be split reliably.
    const cookies = ex.setCookies.map(redactSetCookie);
    return {
        request: `${ex.method} ${redactUrl(ex.url)}`,
        requestHeaders: pick(ex.requestHeaders, [
            "poppy-session",
            "authorization",
            "content-type",
            "accept",
        ]),
        requestBody: ex.requestBody ? excerpt(redactBody(ex.requestBody), 600) : undefined,
        response: ex.error
            ? `no response: ${ex.error}`
            : `${ex.status} ${ex.statusText ?? ""}`.trim(),
        responseHeaders:
            responseHeaders || cookies.length
                ? {
                      ...responseHeaders,
                      ...(cookies.length ? { "set-cookie": cookies.join("\n") } : {}),
                  }
                : undefined,
        responseBody: body ? excerpt(redactBody(body), 400) : undefined,
    };
}

export function excerpt(text: string, max: number): string {
    const flat = text.replace(/\s+/g, " ").trim();
    return flat.length > max ? flat.slice(0, max) + "…" : flat;
}

// "POST https://…/token" plus the exchange's note.
export function describeSent(ex: Exchange): string {
    return `${ex.method} ${redactUrl(ex.url)}${ex.note ? `, ${ex.note}` : ""}`;
}

// "400 Bad Request, error invalid_grant" or "no response: timed out".
export function describeGot(ex: Exchange): string {
    if (ex.refused) return `not sent: ${ex.refused}`;
    if (ex.error) return `no response: ${ex.error}`;
    if (ex.rateLimited)
        return `${ex.status} Too Many Requests${ex.rateLimited.retryAfter !== undefined ? `, Retry-After ${ex.rateLimited.retryAfter} s` : ""}`;
    const code = errorCode(ex);
    const status = `${ex.status}${ex.statusText ? " " + ex.statusText : ""}`;
    if (code) return `${status}, error ${code}`;
    return status;
}

export type Detail = {
    summary?: string;
    sent?: string;
    got?: string;
    expected?: string;
    cause?: string;
    notes?: string[];
    exchange?: Exchange | Exchange[];
    // A failed request is the result, as for discovery.https: don't make it inconclusive.
    transportIsResult?: boolean;
};

// Why an exchange can't decide a check, or undefined if it can.
export function inconclusiveCause(ex: Exchange | undefined): string | undefined {
    if (!ex || !noResponse(ex)) return undefined;
    if (ex.refused) return `The validator didn't send the request: ${ex.refused}.`;
    if (ex.status === 429)
        return ex.rateLimited?.retryAfter !== undefined
            ? `The Company rate-limited the request with a Retry-After of ${ex.rateLimited.retryAfter} seconds, longer than the validator waits, so it couldn't tell. Run it again later.`
            : "The Company rate-limited the request without a Retry-After the validator could wait out, so it couldn't tell. Run it again later.";
    return `The request failed (${ex.error}), so the validator couldn't tell. This is a network or transport problem, not a finding.`;
}

export type Recorder = {
    results: CheckResult[];
    pass(id: string, detail?: Detail): void;
    // A MUST check that failed; a SHOULD check that failed becomes a warning.
    fail(id: string, detail: Detail): void;
    // A check that can't be decided, or a SHOULD that isn't met.
    warn(id: string, detail: Detail): void;
    // A check the validator couldn't decide, such as when the Company declined the validator by
    // policy or didn't respond. Reported as a warning marked inconclusive.
    inconclusive(id: string, detail: Detail): void;
    skip(id: string, reason: string): void;
    // Whether this check is selected, so it's worth sending its requests.
    wants(id: string): boolean;
};

export function recorder(ctx: Context, results: CheckResult[] = []): Recorder {
    const add = (
        id: string,
        status: Status,
        detail: Detail = {},
        reason?: string,
        inconclusive = false,
    ) => {
        const info = { ...checkInfo(id) };
        const generalSessionProbe =
            ctx.options.probe && !ctx.options.probeSession && id.startsWith("session.");
        if (generalSessionProbe) {
            info.level = "SHOULD";
            info.section = "spec#session-verification";
            info.quote =
                "Companies SHOULD verify the Session header on every request that carries it.";
            detail = {
                ...detail,
                notes: [
                    ...(detail.notes ?? []),
                    "This API probe has not been declared to use Session claims or state. These are recommendation checks; use --probe-session for a Session-dependent endpoint. Verification is mandatory before trusting Session claims (5.3).",
                ],
            };
        }
        if (!ctx.options.milestones.has(info.milestone) || !selected(ctx.options, id)) return;
        if (results.some((r) => r.id === id)) return;
        const exchanges = detail.exchange
            ? Array.isArray(detail.exchange)
                ? detail.exchange
                : [detail.exchange]
            : [];
        const last = exchanges[exchanges.length - 1];
        const transport =
            (status === "fail" || status === "warn") && !detail.transportIsResult
                ? inconclusiveCause(last)
                : undefined;
        if (transport) {
            status = "warn";
            inconclusive = true;
            detail = { ...detail, cause: transport, expected: undefined };
        }
        const result: CheckResult = {
            ...info,
            status: status === "fail" && info.level === "SHOULD" ? "warn" : status,
            specUrl: specUrl(info.section),
            disagreeUrl: disagreeUrl(info),
        };
        if (detail.summary) result.summary = redactText(detail.summary);
        if (status !== "pass" && status !== "skip") {
            result.sent = redactText(detail.sent ?? (last ? describeSent(last) : "")) || undefined;
            result.got = redactText(detail.got ?? (last ? describeGot(last) : "")) || undefined;
            if (detail.expected) result.expected = redactText(detail.expected);
            if (detail.cause) result.cause = redactText(detail.cause);
            if (exchanges.length) result.exchanges = exchanges.map(summarizeExchange);
        }
        if (reason) result.reason = reason;
        if (inconclusive) result.inconclusive = true;
        if (detail.notes?.length) result.notes = detail.notes.map(redactText);
        results.push(result);
    };
    return {
        results,
        pass: (id, detail) => add(id, "pass", detail),
        fail: (id, detail) => add(id, "fail", detail),
        warn: (id, detail) => add(id, "warn", detail),
        inconclusive: (id, detail) => add(id, "warn", detail, undefined, true),
        skip: (id, reason) => add(id, "skip", {}, reason),
        wants: (id) => {
            const info = checkInfo(id);
            return ctx.options.milestones.has(info.milestone) && selected(ctx.options, id);
        },
    };
}

// Skips every listed check that hasn't produced a result yet.
export function skipRest(r: Recorder, ids: string[], reason: string): void {
    for (const id of ids) r.skip(id, reason);
}

// Skips each check, or the rest of them, when a prerequisite is blocked. Returns whether it was.
export function blockedBy(ctx: Context, r: Recorder, names: string[], ids: string[]): boolean {
    const reason = names.map((n) => ctx.blocked[n]).find(Boolean);
    if (!reason) return false;
    skipRest(r, ids, reason);
    return true;
}

// Safe readers for a poppy.json that may not match its schema, so a malformed document never
// crashes the run.

export function isObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

export type ApiEntry = { type?: unknown; url?: unknown; description?: unknown };

// The entries of apis that are objects.
export function apisOf(poppy: Poppy | undefined): ApiEntry[] {
    const apis = (poppy as { apis?: unknown } | undefined)?.apis;
    return Array.isArray(apis) ? apis.filter(isObject) : [];
}

// The HTTPS URLs of the APIs of a type, such as "openapi".
export function apiUrls(poppy: Poppy | undefined, type: string): string[] {
    return apisOf(poppy)
        .filter((a) => a.type === type && isHttpsUrl(a.url))
        .map((a) => a.url as string);
}

export function protocolsOf(poppy: Poppy | undefined): { type?: unknown; endpoint?: unknown }[] {
    const agent = (poppy as { agent?: unknown } | undefined)?.agent;
    const protocols = isObject(agent) ? agent.protocols : undefined;
    return Array.isArray(protocols) ? protocols.filter(isObject) : [];
}

// The conversation endpoint: agent.protocols' entry with type poppy (spec 8.1).
export function conversationEndpoint(poppy: Poppy | undefined): string | undefined {
    const entry = protocolsOf(poppy).find((p) => p.type === "poppy" && isHttpsUrl(p.endpoint));
    return entry ? (entry.endpoint as string).replace(/\/+$/, "") : undefined;
}

// A string field inside an object field of poppy.json, such as feedback.endpoint.
export function fieldOf(poppy: Poppy | undefined, object: string, field: string): unknown {
    const value = (poppy as Record<string, unknown> | undefined)?.[object];
    return isObject(value) ? value[field] : undefined;
}

// The extensions object, if it is one.
export function extensionsOf(poppy: Poppy | undefined): Record<string, unknown> {
    const value = (poppy as { extensions?: unknown } | undefined)?.extensions;
    return isObject(value) ? value : {};
}

// The Mediated Sign-In extension, when it's listed with a version this validator supports, "1".
export function mediatedSignIn(
    poppy: Poppy | undefined,
): { version: "1"; fields?: unknown; scopes?: unknown } | undefined {
    const entry = extensionsOf(poppy)["mediated-sign-in"];
    return isObject(entry) && entry.version === "1"
        ? (entry as { version: "1"; fields?: unknown; scopes?: unknown })
        : undefined;
}

// Whether a value is an HTTPS URL with a valid host and port, and no spaces or userinfo.
export function isHttpsUrl(value: unknown): value is string {
    if (typeof value !== "string" || /\s/.test(value) || !value.startsWith("https://"))
        return false;
    try {
        const url = new URL(value);
        return url.protocol === "https:" && url.hostname !== "" && !url.username && !url.password;
    } catch {
        return false;
    }
}
