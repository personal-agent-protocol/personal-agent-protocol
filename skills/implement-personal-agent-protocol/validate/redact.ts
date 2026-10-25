// Removes tokens, assertions, proofs, codes, and credentials from anything the validator prints or
// saves. A redacted value keeps a short, harmless prefix so it's recognizable, such as
// "eyJhbGci…(redacted)" for a JWT.

export const REDACTED = "…(redacted)";

// Request and response fields whose values are secrets.
const SECRET_FIELDS = new Set([
    "access_token",
    "refresh_token",
    "subject_token",
    "id_token",
    "device_code",
    "assertion",
    "client_assertion",
    "code",
    "code_verifier",
    "token",
    "password",
    "credentials",
    "client_secret",
]);

const SECRET_HEADERS = new Set([
    "authorization",
    "dpop",
    "cookie",
    "set-cookie",
    "proxy-authorization",
]);

const JWT = /eyJ[A-Za-z0-9_-]{2,}(?:\.[A-Za-z0-9_-]*){1,4}/g;

export function redactValue(value: string): string {
    if (value === "") return value;
    if (value.startsWith("eyJ")) return value.slice(0, 8) + REDACTED;
    const prefix = /^[A-Za-z]{2,5}_/.exec(value);
    if (prefix && value.length > prefix[0].length + 4) return prefix[0] + REDACTED;
    return "(redacted)";
}

// Redacts JWTs anywhere in free text.
export function redactText(text: string): string {
    return text.replace(JWT, (jwt) => jwt.slice(0, 8) + REDACTED);
}

export function redactHeader(name: string, value: string): string {
    const lower = name.toLowerCase();
    if (lower === "authorization" || lower === "proxy-authorization") {
        const space = value.indexOf(" ");
        if (space > 0)
            return value.slice(0, space + 1) + redactValue(value.slice(space + 1).trim());
        return redactValue(value);
    }
    if (lower === "set-cookie") {
        const eq = value.indexOf("=");
        const semi = value.indexOf(";");
        if (eq > 0)
            return value.slice(0, eq + 1) + "(redacted)" + (semi > 0 ? value.slice(semi) : "");
    }
    if (SECRET_HEADERS.has(lower)) return redactValue(value);
    return redactText(value);
}

export function redactHeaders(headers: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [name, value] of Object.entries(headers)) out[name] = redactHeader(name, value);
    return out;
}

function redactJson(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(redactJson);
    if (value !== null && typeof value === "object") {
        const out: Record<string, unknown> = {};
        for (const [key, v] of Object.entries(value)) {
            if (SECRET_FIELDS.has(key)) {
                out[key] = typeof v === "string" ? redactValue(v) : "(redacted)";
            } else {
                out[key] = redactJson(v);
            }
        }
        return out;
    }
    if (typeof value === "string") return redactText(value);
    return value;
}

// Redacts a request or response body: JSON by field name, form bodies by parameter name, and JWTs
// anywhere else.
export function redactBody(body: string): string {
    const trimmed = body.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
            return JSON.stringify(redactJson(JSON.parse(trimmed)));
        } catch {
            // Not JSON after all.
        }
    }
    if (/^[A-Za-z0-9_.~%+-]+=[^\s]*(&[A-Za-z0-9_.~%+-]+=[^\s]*)*$/.test(trimmed)) {
        return redactForm(trimmed);
    }
    return redactText(body);
}

function redactForm(form: string): string {
    return form
        .split("&")
        .map((pair) => {
            const eq = pair.indexOf("=");
            const name = decodeURIComponent(pair.slice(0, eq).replace(/\+/g, " "));
            if (!SECRET_FIELDS.has(name)) return pair;
            const value = decodeURIComponent(pair.slice(eq + 1).replace(/\+/g, " "));
            return `${pair.slice(0, eq)}=${redactValue(value)}`;
        })
        .join("&");
}

// Redacts secret query parameters, such as access_token, in a URL.
export function redactUrl(url: string): string {
    const q = url.indexOf("?");
    if (q === -1) return redactText(url);
    const hash = url.indexOf("#", q);
    const query = url.slice(q + 1, hash === -1 ? undefined : hash);
    return redactText(
        url.slice(0, q + 1) + redactForm(query) + (hash === -1 ? "" : url.slice(hash)),
    );
}
