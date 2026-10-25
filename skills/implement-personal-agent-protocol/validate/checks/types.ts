// The shape of check results, the context checks run in, and a recorder that turns check outcomes
// into results with the requirement, links, and redacted exchanges filled in.

import {
    CATALOG,
    checkInfo,
    PROTOCOL_VERSION,
    type CheckInfo,
    type Milestone,
} from "../catalog.ts";
import { errorCode, type Exchange, type Http } from "../http.ts";
import type { Identity } from "../identity.ts";
import type { SigningKey } from "../jose.ts";
import { redactBody, redactHeaders, redactUrl, redactText } from "../redact.ts";

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
        mediated?: { endpoint?: string; fields?: unknown[]; scopes?: string[] };
        scopes?: Record<string, string>;
    };
    agent?: { protocols?: { type?: string; endpoint?: string; resource?: string }[] };
    web?: { browser_session_endpoint?: string };
    feedback?: { endpoint?: string };
    apis?: { type?: string; url?: string; description?: string; resource?: string }[];
    extensions?: Record<string, { version?: string }>;
};

export type Metadata = {
    issuer?: string;
    token_endpoint?: string;
    revocation_endpoint?: string;
    authorization_endpoint?: string;
    device_authorization_endpoint?: string;
    dpop_signing_alg_values_supported?: unknown;
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

export type Discovered = {
    poppy?: Poppy;
    poppyUrl?: string;
    finalHost?: string;
    metadata?: Metadata;
    metadataUrl?: string;
};

// A Session Token the validator holds.
export type HeldToken = {
    accessToken: string;
    tokenType: string;
    dpopKey?: SigningKey;
    resource?: string;
};

export type SessionState = {
    // The DPoP key for this run's Sessions.
    dpopKey?: SigningKey;
    // The latest DPoP nonce from each origin.
    nonces: Record<string, string>;
    // Where the Company asked for a nonce, with the exchange that asked.
    nonceRequests: { origin: string; exchange: Exchange }[];
    // The token from session.start, and the request that got it.
    token?: HeldToken;
    startExchange?: Exchange;
    startProof?: string;
    userId?: string;
    // Tokens issued for a resource, by resource URL.
    resourceTokens: Record<string, HeldToken>;
};

export type CheckOptions = {
    only?: string[];
    milestones: Set<Milestone>;
    probe?: string;
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
};

export function newContext(http: Http, options: CheckOptions, target?: string): Context {
    return {
        http,
        target,
        options,
        discovered: {},
        session: { nonces: {}, nonceRequests: [], resourceTokens: {} },
        notes: [],
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
    return {
        request: `${ex.method} ${redactUrl(ex.url)}`,
        requestHeaders: pick(ex.requestHeaders, [
            "authorization",
            "dpop",
            "content-type",
            "accept",
        ]),
        requestBody: ex.requestBody ? excerpt(redactBody(ex.requestBody), 600) : undefined,
        response: ex.error
            ? `no response: ${ex.error}`
            : `${ex.status} ${ex.statusText ?? ""}`.trim(),
        responseHeaders: pick(ex.responseHeaders, [
            "content-type",
            "www-authenticate",
            "dpop-nonce",
            "cache-control",
            "location",
            "retry-after",
        ]),
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
    if (ex.error) return `no response: ${ex.error}`;
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
};

export type Recorder = {
    results: CheckResult[];
    pass(id: string, detail?: Detail): void;
    // A MUST check that failed; a SHOULD check that failed becomes a warning.
    fail(id: string, detail: Detail): void;
    // A check that can't be decided, or a SHOULD that isn't met.
    warn(id: string, detail: Detail): void;
    skip(id: string, reason: string): void;
    // Whether this check is selected, so it's worth sending its requests.
    wants(id: string): boolean;
};

export function recorder(ctx: Context, results: CheckResult[] = []): Recorder {
    const add = (id: string, status: Status, detail: Detail = {}, reason?: string) => {
        const info = checkInfo(id);
        if (!ctx.options.milestones.has(info.milestone) || !selected(ctx.options, id)) return;
        if (results.some((r) => r.id === id)) return;
        const exchanges = detail.exchange
            ? Array.isArray(detail.exchange)
                ? detail.exchange
                : [detail.exchange]
            : [];
        const last = exchanges[exchanges.length - 1];
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
        if (detail.notes?.length) result.notes = detail.notes.map(redactText);
        results.push(result);
    };
    return {
        results,
        pass: (id, detail) => add(id, "pass", detail),
        fail: (id, detail) => add(id, "fail", detail),
        warn: (id, detail) => add(id, "warn", detail),
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
