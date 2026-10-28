// Removes tokens, assertions, Session JWTs, proofs, codes, and credentials from anything the validator prints or
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
    "one_time_code",
    "password",
    "credentials",
    "client_secret",
]);

const SECRET_HEADERS = new Set([
    "authorization",
    "poppy-session",
    "dpop",
    "cookie",
    "set-cookie",
    "proxy-authorization",
]);

const JWT = /eyJ[A-Za-z0-9_-]{2,}(?:\.[A-Za-z0-9_-]*){1,4}/g;

// Values the run has seen that must never be printed or saved, such as a browser-session code or
// cookie, wherever they turn up.
const SECRETS = new Set<string>();

// Redacts this value everywhere from now on. Short values aren't registered, since they'd redact
// ordinary text.
export function registerSecret(value: string | undefined): void {
    if (value && value.length >= 8) SECRETS.add(value);
}

function redactSecrets(text: string): string {
    let out = text;
    for (const secret of SECRETS) {
        if (out.includes(secret)) out = out.split(secret).join("(redacted)");
        const encoded = encodeURIComponent(secret);
        if (encoded !== secret && out.includes(encoded))
            out = out.split(encoded).join("(redacted)");
    }
    return out;
}

export function redactValue(value: string): string {
    if (value === "") return value;
    if (value.startsWith("eyJ")) return value.slice(0, 8) + REDACTED;
    const prefix = /^[A-Za-z]{2,5}_/.exec(value);
    if (prefix && value.length > prefix[0].length + 4) return prefix[0] + REDACTED;
    return "(redacted)";
}

// Redacts JWTs anywhere in free text.
export function redactText(text: string): string {
    return redactSecrets(text).replace(JWT, (jwt) => jwt.slice(0, 8) + REDACTED);
}

// Redacts one Set-Cookie value: the cookie's value, keeping its name and attributes.
export function redactSetCookie(value: string): string {
    const eq = value.indexOf("=");
    const semi = value.indexOf(";");
    if (eq > 0 && (semi === -1 || eq < semi))
        return value.slice(0, eq + 1) + "(redacted)" + (semi > 0 ? value.slice(semi) : "");
    return "(redacted)";
}

export function redactHeader(name: string, value: string): string {
    const lower = name.toLowerCase();
    if (lower === "authorization" || lower === "proxy-authorization") {
        const space = value.indexOf(" ");
        if (space > 0)
            return value.slice(0, space + 1) + redactValue(value.slice(space + 1).trim());
        return redactValue(value);
    }
    if (lower === "set-cookie") return redactSetCookie(value);
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

// Redacts the value of every HTML element whose name, id, or data attribute names a secret field,
// such as <input type="hidden" name="code" value="…">, and any other attribute holding one.
function redactHtml(html: string): string {
    return html.replace(/<[a-zA-Z][^>]*>/g, (tag) => {
        const names = [
            ...tag.matchAll(/\b(?:name|id)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi),
        ].map((m) => (m[1] ?? m[2] ?? m[3] ?? "").toLowerCase());
        let out = tag;
        if (names.some((n) => SECRET_FIELDS.has(n))) {
            out = out.replace(/(\bvalue\s*=\s*)(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '$1"(redacted)"');
        }
        // Attributes such as data-code="…".
        return out.replace(
            /(\bdata-([a-z_-]+)\s*=\s*)(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,
            (whole, prefix: string, name: string) =>
                SECRET_FIELDS.has(name.toLowerCase().replace(/-/g, "_"))
                    ? `${prefix}"(redacted)"`
                    : whole,
        );
    });
}

// Redacts a request or response body: JSON by field name, form bodies by parameter name, HTML by
// element name, and JWTs and registered secrets anywhere.
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
        return redactText(redactForm(trimmed));
    }
    if (/<[a-zA-Z!]/.test(body)) return redactText(redactHtml(body));
    return redactText(body);
}

function redactForm(form: string): string {
    return form
        .split("&")
        .map((pair) => {
            const eq = pair.indexOf("=");
            if (eq === -1) return pair;
            const name = safeDecode(pair.slice(0, eq));
            if (!SECRET_FIELDS.has(name)) return pair;
            return `${pair.slice(0, eq)}=${redactValue(safeDecode(pair.slice(eq + 1)))}`;
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

function safeDecode(text: string): string {
    try {
        return decodeURIComponent(text.replace(/\+/g, " "));
    } catch {
        return text;
    }
}
