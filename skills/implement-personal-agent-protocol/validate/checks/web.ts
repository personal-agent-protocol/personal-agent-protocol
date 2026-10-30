// Milestone 2: joining a browser to a Session (section 6). The validator loads the browser-session
// page as a browser would, checks its headers and join cookie, and authorizes codes with the Session
// header. It submits the form only in ways that must fail: without the join cookie, with a code
// that was already submitted, or with another page's cookie. So a Company that follows section 6
// sets no Session cookie, and one that doesn't sets only a signed-out one.

import { sessionRequest } from "../agent.ts";
import { header, isInvalidSession, jsonError, type Exchange } from "../http.ts";
import { generateKey, randomId } from "../jose.ts";
import { registerSecret } from "../redact.ts";
import { invalidSessionShape } from "./resource.ts";
import { fieldOf, isHttpsUrl, skipRest, type Context, type Recorder } from "./types.ts";

export const WEB_IDS = [
    "web.page-headers",
    "web.page-headers-suggested",
    "web.join-cookie",
    "web.join-cookie-suggested",
    "web.page-cookies",
    "web.authorize",
    "web.authorize-reused",
    "web.authorize-unknown",
    "web.authorize-session",
    "web.form-without-cookie",
    "web.form-code-used",
    "web.cookie-code-pairing",
];

// A cookie the validator sends with each page load, to see whether loading the page changes it.
const PROBE_COOKIE = "validator_probe";

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

// Decodes HTML character references in an attribute value.
export function decodeEntities(value: string): string {
    return value.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, ref: string) => {
        if (ref[0] === "#") {
            const code =
                ref[1] === "x" || ref[1] === "X"
                    ? parseInt(ref.slice(2), 16)
                    : Number(ref.slice(1));
            return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
        }
        return ENTITIES[ref.toLowerCase()] ?? whole;
    });
}

// The attributes of an HTML start tag, lowercased by name, with values decoded.
export function attributes(tag: string): Record<string, string> {
    const out: Record<string, string> = {};
    const body = tag.replace(/^<[a-zA-Z][^\s/>]*/, "").replace(/\/?>$/, "");
    for (const m of body.matchAll(/([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
        const name = m[1].toLowerCase();
        if (!(name in out)) out[name] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
    }
    return out;
}

// The value of the form's hidden `code` field, HTML-decoded.
export function formCode(html: string): string | undefined {
    for (const m of html.matchAll(/<input\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)) {
        const attrs = attributes(m[0]);
        if (attrs.name === "code" && attrs.value) return attrs.value;
    }
    return undefined;
}

// The page's Content-Security-Policy, as one list of directives per policy.
function cspPolicies(value: string | undefined): Map<string, string>[] {
    if (!value) return [];
    return value.split(",").map(
        (policy) =>
            new Map(
                policy
                    .split(";")
                    .map((d) => d.trim().split(/\s+/))
                    .filter((d) => d[0])
                    .map(([name, ...values]) => [name.toLowerCase(), values.join(" ")] as const),
            ),
    );
}

// Why other pages could frame the page, if they could. Only frame-ancestors 'none', or no
// frame-ancestors and X-Frame-Options DENY, stops every other page.
export function framingProblem(ex: Exchange): string | undefined {
    const ancestors = cspPolicies(header(ex, "content-security-policy"))
        .map((p) => p.get("frame-ancestors"))
        .filter((v): v is string => v !== undefined);
    if (ancestors.some((v) => v.trim().toLowerCase() === "'none'")) return undefined;
    if (ancestors.length)
        return `frame-ancestors ${ancestors.join(", ")} lets some pages frame it; only 'none' stops all of them`;
    const xfo = (header(ex, "x-frame-options") ?? "").trim().toLowerCase();
    if (xfo === "deny") return undefined;
    if (xfo === "sameorigin")
        return "X-Frame-Options SAMEORIGIN lets pages on the same origin frame it; only DENY (or frame-ancestors 'none') stops all of them";
    return "neither frame-ancestors 'none' nor X-Frame-Options DENY stops other pages framing it";
}

// Why the page could be cached, framed, or kept as a reference (section 6, step 1), if at all.
function headerProblems(ex: Exchange): string[] {
    const problems: string[] = [];
    if (!/\bno-store\b/i.test(header(ex, "cache-control") ?? ""))
        problems.push("Cache-Control doesn't include no-store, so caches can store the page");
    const framing = framingProblem(ex);
    if (framing) problems.push(framing);
    if ((header(ex, "cross-origin-opener-policy") ?? "").trim().toLowerCase() !== "same-origin")
        problems.push(
            "Cross-Origin-Opener-Policy isn't same-origin, so the opener keeps a reference",
        );
    return problems;
}

// How the page's headers differ from the ones the guides suggest, if at all.
function suggestedHeaderProblems(ex: Exchange): string[] {
    const problems: string[] = [];
    if (
        !cspPolicies(header(ex, "content-security-policy")).some(
            (p) => p.get("frame-ancestors")?.trim().toLowerCase() === "'none'",
        )
    )
        problems.push("Content-Security-Policy doesn't include frame-ancestors 'none'");
    return problems;
}

export type Cookie = {
    pair: string;
    name: string;
    value: string;
    attributes: Map<string, string>;
};

export function parseCookie(value: string): Cookie {
    const [pair, ...rest] = value.split(";").map((a) => a.trim());
    const eq = pair.indexOf("=");
    const attributes = new Map<string, string>();
    for (const a of rest) {
        if (!a) continue;
        const i = a.indexOf("=");
        attributes.set(
            (i === -1 ? a : a.slice(0, i)).trim().toLowerCase(),
            i === -1 ? "" : a.slice(i + 1).trim(),
        );
    }
    return {
        pair,
        name: (eq === -1 ? "" : pair.slice(0, eq)).trim(),
        value: (eq === -1 ? pair : pair.slice(eq + 1)).trim(),
        attributes,
    };
}

// Whether a Set-Cookie removes its cookie rather than setting it.
function removes(cookie: Cookie): boolean {
    const maxAge = cookie.attributes.get("max-age");
    if (maxAge !== undefined && Number(maxAge) <= 0) return true;
    const expires = cookie.attributes.get("expires");
    return expires !== undefined && Date.parse(expires) < Date.now();
}

type Verdict = { kind: "ok" | "unverifiable" | "violates"; problems: string[] };

// Whether a cookie meets section 6's rules for the join cookie: forms on other sites don't send it,
// and other hosts on the domain can't set it.
export function judgeCookie(cookie: Cookie): Verdict {
    const problems: string[] = [];
    const sameSite = cookie.attributes.get("samesite")?.toLowerCase();
    if (sameSite !== "strict" && sameSite !== "lax")
        problems.push(
            sameSite === undefined
                ? "no SameSite, so some browsers send it with a form on another site"
                : `SameSite=${cookie.attributes.get("samesite")}, so a form on another site sends it`,
        );
    if (cookie.attributes.has("domain"))
        problems.push("a Domain attribute, so other hosts on the domain share it and can set it");
    if (cookie.name.startsWith("__Host-")) {
        if (!cookie.attributes.has("secure"))
            problems.push("a __Host- name without Secure, so the browser rejects it");
        if (cookie.attributes.get("path") !== "/")
            problems.push("a __Host- name without Path=/, so the browser rejects it");
    }
    if (problems.length) return { kind: "violates", problems };
    if (!cookie.name.startsWith("__Host-"))
        return {
            kind: "unverifiable",
            problems: [
                "a host-only cookie without the __Host- prefix: another host on the domain can set a cookie with the same name for the whole domain, and the validator can't tell whether the Company tells them apart",
            ],
        };
    return { kind: "ok", problems: [] };
}

// How a cookie differs from the join cookie the guides suggest, if at all.
function suggestedCookieProblems(cookie: Cookie): string[] {
    const problems: string[] = [];
    if (!cookie.name.startsWith("__Host-"))
        problems.push("the cookie's name doesn't start with __Host-, so other hosts can set it");
    if (!cookie.attributes.has("secure")) problems.push("no Secure");
    if (!cookie.attributes.has("httponly")) problems.push("no HttpOnly");
    if (cookie.attributes.get("samesite")?.toLowerCase() !== "strict")
        problems.push("SameSite isn't Strict");
    return problems;
}

type Page = { ex: Exchange; code?: string; cookies: Cookie[]; cookieHeader: string };

async function loadPage(ctx: Context, endpoint: string, note: string): Promise<Page> {
    const ex = await ctx.http.request({
        url: endpoint,
        headers: { Accept: "text/html", Cookie: `${PROBE_COOKIE}=1` },
        note,
    });
    const cookies = ex.setCookies.map(parseCookie).filter((c) => c.name && !removes(c));
    for (const c of cookies) registerSecret(c.value);
    const code = ex.status === 200 ? formCode(ex.body ?? "") : undefined;
    registerSecret(code);
    return {
        ex,
        code,
        cookies,
        cookieHeader: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
    };
}

function submitForm(
    ctx: Context,
    endpoint: string,
    code: string,
    cookie: string | undefined,
    note: string,
): Promise<Exchange> {
    return ctx.http.request({
        method: "POST",
        url: endpoint,
        headers: {
            Accept: "text/html",
            "Content-Type": "application/x-www-form-urlencoded",
            ...(cookie ? { Cookie: cookie } : {}),
        },
        body: `code=${encodeURIComponent(code)}`,
        note,
    });
}

// A form submission that must fail: an error status, and no cookie set.
function expectFormRefused(r: Recorder, id: string, form: Exchange, cause: string): void {
    if (form.status !== undefined && form.status >= 400 && form.setCookies.length === 0) r.pass(id);
    else
        r.fail(id, {
            exchange: form,
            got: form.setCookies.length
                ? `${form.status}, with Set-Cookie ${form.setCookies.map((c) => parseCookie(c).name).join(", ")}`
                : undefined,
            expected: "An error status and no Set-Cookie",
            cause,
        });
}

export async function checkWeb(ctx: Context, r: Recorder): Promise<void> {
    const endpoint = fieldOf(ctx.discovered.poppy, "web", "browser_session_endpoint");
    if (!isHttpsUrl(endpoint)) {
        skipRest(r, WEB_IDS, "poppy.json lists no web.browser_session_endpoint.");
        return;
    }
    const page = await loadPage(
        ctx,
        endpoint,
        "loading the browser-session page, as a browser would",
    );
    if (page.ex.status !== 200) {
        r.fail("web.page-headers", {
            exchange: page.ex,
            expected: "200 with an HTML page holding a form with a code",
            cause: "The endpoint answers a GET with the page whose form the browser submits (section 6, step 1).",
        });
        skipRest(r, WEB_IDS, "The browser-session page didn't load (see web.page-headers).");
        return;
    }
    const headers = headerProblems(page.ex);
    if (headers.length)
        r.fail("web.page-headers", {
            exchange: page.ex,
            got: headers.join("; "),
            expected:
                "a page caches don't store, other pages can't frame, and its opener can't keep a reference to",
            cause: "The page holds a one-time code. Keep it out of caches, and stop other pages from framing it or keeping a reference to its window (10.6).",
        });
    else r.pass("web.page-headers");
    const suggestedHeaders = suggestedHeaderProblems(page.ex);
    if (suggestedHeaders.length)
        r.fail("web.page-headers-suggested", {
            exchange: page.ex,
            got: suggestedHeaders.join("; "),
            expected:
                "Cache-Control: no-store, Content-Security-Policy: frame-ancestors 'none', and Cross-Origin-Opener-Policy: same-origin",
            cause: "The guides suggest these values. Other values can meet section 6 too.",
        });
    else r.pass("web.page-headers-suggested");

    const best = joinCookieChecks(r, page);

    if (r.wants("web.page-cookies")) {
        const touched = page.ex.setCookies.map(parseCookie).filter((c) => c.name === PROBE_COOKIE);
        if (touched.length)
            r.fail("web.page-cookies", {
                exchange: page.ex,
                got: `Set-Cookie for ${PROBE_COOKIE}, a cookie the browser already had`,
                expected: "Set-Cookie only for the page's own join cookie",
                cause: "Loading the page sets only the cookie that ties the code to the browser. It doesn't change the browser's other cookies, or start, end, or change any Session (section 6, step 1).",
            });
        else
            r.pass("web.page-cookies", {
                notes: [
                    "Whether loading the page starts, ends, or changes a Session isn't visible to the validator. Check that by hand.",
                ],
            });
    }

    if (!ctx.identity || !ctx.discovered.audience || ctx.blocked.identity) {
        skipRest(
            r,
            WEB_IDS,
            ctx.blocked.identity ??
                ctx.identityProblem ??
                "No test Personal Agent or Company identity.",
        );
        return;
    }
    const code = page.code;
    if (!code) {
        r.fail("web.authorize", {
            exchange: page.ex,
            got: "no hidden input named code in the page",
            expected: '<input type="hidden" name="code" value="…">',
            cause: "The form has a hidden field named code with the one-time code, which the Personal Agent reads and authorizes (section 6).",
        });
        skipRest(r, WEB_IDS, "The page has no code to authorize (see web.authorize).");
        return;
    }
    const url = `${endpoint.replace(/\/+$/, "")}/authorize`;
    const authorize = (
        c: string,
        note: string,
        session?: Parameters<typeof sessionRequest>[1]["session"],
    ) => sessionRequest(ctx, { method: "POST", url, body: { code: c }, note, session });

    const first = await authorize(
        code,
        "authorizing the page's code with a signed-out Session header",
    );
    if (first.status === 204) r.pass("web.authorize");
    else {
        r.fail("web.authorize", {
            exchange: first,
            expected: "204",
            cause: isInvalidSession(first)
                ? "The endpoint refused the Session header that other endpoints accepted. Check it as at any resource (5.3)."
                : "Check the Session header as at any resource, check that the code is one the endpoint issued and hasn't expired or been authorized, record it as authorized for the Session, and respond with 204 (section 6, step 2).",
        });
        skipRest(r, WEB_IDS, "The code wasn't authorized (see web.authorize).");
        return;
    }

    const again = await authorize(code, "authorizing the same code again");
    if (again.status === 400 && jsonError(again) === "invalid_request")
        r.pass("web.authorize-reused");
    else
        r.fail("web.authorize-reused", {
            exchange: again,
            expected: '400 {"error": "invalid_request"}',
            cause:
                again.status === 204
                    ? "The endpoint authorized a code a second time. A code can be authorized once, so a code from someone else's browser can't be reused (10.6)."
                    : "A code that has already been authorized gets HTTP 400 with invalid_request.",
        });

    if (r.wants("web.authorize-unknown")) {
        const unknown = await authorize(
            `bc_validator${randomId(16)}`,
            "authorizing a code the endpoint never issued",
        );
        if (unknown.status === 400 && jsonError(unknown) === "invalid_request")
            r.pass("web.authorize-unknown");
        else
            r.fail("web.authorize-unknown", {
                exchange: unknown,
                expected: '400 {"error": "invalid_request"}',
                cause: "Check that the code is one the endpoint issued. A code it didn't issue gets HTTP 400 with invalid_request.",
            });
    }

    // Steps 3's checks, with the code authorized above.
    if (r.wants("web.form-without-cookie")) {
        const form = await submitForm(
            ctx,
            endpoint,
            code,
            `${PROBE_COOKIE}=1`,
            "submitting the form with the authorized code, without the join cookie",
        );
        expectFormRefused(
            r,
            "web.form-without-cookie",
            form,
            "Check that the form's request has the cookie from step 1 and that it matches the code. Without it, set no cookie and return an error page, so a browser that didn't load the page can't join the Session (10.6).",
        );
        if (r.wants("web.form-code-used")) {
            if (!best)
                r.skip(
                    "web.form-code-used",
                    "The page set no join cookie to submit the form with.",
                );
            else {
                const used = await submitForm(
                    ctx,
                    endpoint,
                    code,
                    page.cookieHeader,
                    "submitting the same code again, now with the page's cookie",
                );
                expectFormRefused(
                    r,
                    "web.form-code-used",
                    used,
                    "The endpoint accepted a code that a request had already submitted. A code is used by the first request that submits it, whatever the result, so a failed attempt can't be retried with a stolen cookie (section 6, step 3).",
                );
            }
        }
    } else if (r.wants("web.form-code-used"))
        r.skip("web.form-code-used", "Runs after web.form-without-cookie.");

    if (r.wants("web.authorize-session") || r.wants("web.cookie-code-pairing")) {
        await sessionAndPairing(ctx, r, endpoint, authorize, page);
    }
}

// The join cookie: the cookies the page response set, each judged, and the best one returned.
function joinCookieChecks(r: Recorder, page: Page): Cookie | undefined {
    const cookies = page.cookies;
    if (cookies.length === 0) {
        r.fail("web.join-cookie", {
            exchange: page.ex,
            got: "no Set-Cookie header",
            expected: "Set-Cookie with SameSite=Strict or SameSite=Lax, and no Domain attribute",
            cause: "The Company ties the code to the browser that loaded the page with a cookie set in the same response (section 6, step 1).",
        });
        r.fail("web.join-cookie-suggested", {
            exchange: page.ex,
            got: "no Set-Cookie header",
            expected: "Set-Cookie: __Host-…; Path=/; Secure; HttpOnly; SameSite=Strict",
        });
        return undefined;
    }
    const judged = cookies.map((c) => ({ c, v: judgeCookie(c) }));
    const rank = { ok: 0, unverifiable: 1, violates: 2 } as const;
    judged.sort((a, b) => rank[a.v.kind] - rank[b.v.kind]);
    const best = judged[0];
    const others = judged
        .slice(1)
        .map(({ c, v }) =>
            v.kind === "ok"
                ? `${c.name} would also qualify as the join cookie.`
                : `${c.name} isn't the join cookie the validator judged: it has ${v.problems.join("; ")}.`,
        );
    const notes =
        cookies.length > 1
            ? [
                  `The page set ${cookies.length} cookies; the validator judged ${best.c.name} as the join cookie.`,
                  ...others,
              ]
            : undefined;
    if (best.v.kind === "ok") r.pass("web.join-cookie", { summary: `${best.c.name}.`, notes });
    else if (best.v.kind === "unverifiable")
        r.warn("web.join-cookie", {
            exchange: page.ex,
            got: `${best.c.name}: ${best.v.problems.join("; ")}`,
            expected: "A cookie that other hosts on the domain can't set, such as a __Host- cookie",
            cause: "The validator couldn't verify that other hosts on the domain can't set the cookie. The __Host- prefix is how a browser guarantees it; see https://personalagentprotocol.org/docs/0.3/guides#company-browsing.",
            notes,
        });
    else
        r.fail("web.join-cookie", {
            exchange: page.ex,
            got: judged.map(({ c, v }) => `${c.name}: ${v.problems.join("; ")}`).join(" / "),
            expected: "Set-Cookie with SameSite=Strict or SameSite=Lax, and no Domain attribute",
            cause: "The cookie ties the code to the browser that loaded the page, so a form on another site mustn't send it, and other hosts on the domain mustn't be able to set it (10.6).",
        });
    const suggested = suggestedCookieProblems(best.c);
    if (suggested.length)
        r.fail("web.join-cookie-suggested", {
            exchange: page.ex,
            got: `${best.c.name}: ${suggested.join("; ")}`,
            expected: "Set-Cookie: __Host-…; Path=/; Secure; HttpOnly; SameSite=Strict",
            cause: "The guides suggest these attributes. __Host- is the way a browser stops other hosts on your domain from setting the cookie, which section 6 requires.",
        });
    else r.pass("web.join-cookie-suggested");
    return best.v.kind === "violates" ? undefined : best.c;
}

// Authorizing needs a good Session header, and a code is submitted only with its own page's cookie.
async function sessionAndPairing(
    ctx: Context,
    r: Recorder,
    endpoint: string,
    authorize: (
        c: string,
        note: string,
        session?: Parameters<typeof sessionRequest>[1]["session"],
    ) => Promise<Exchange>,
    firstPage: Page,
): Promise<void> {
    const second = await loadPage(ctx, endpoint, "loading the page again, for a second code");
    if (!second.code) {
        skipRest(
            r,
            ["web.authorize-session", "web.cookie-code-pairing"],
            "The second page load had no code.",
        );
        return;
    }
    if (r.wants("web.authorize-session")) {
        const none = await authorize(
            second.code,
            "authorizing a code with no Session header",
            "none",
        );
        const bad = await authorize(
            second.code,
            "authorizing a code with a Session JWT signed by a key its delegation doesn't name",
            { key: await generateKey(false) },
        );
        const wrong = [none, bad].filter((ex) => !isInvalidSession(ex));
        if (wrong.length === 0) r.pass("web.authorize-session");
        else
            r.fail("web.authorize-session", {
                exchange: wrong,
                expected: '400 {"error": "invalid_session"}',
                cause:
                    wrong[0].status === 204
                        ? "The endpoint authorized a code without a valid Session header, so anyone could make a browser join a Session. Check the Session header as at any resource (section 6, step 2)."
                        : (invalidSessionShape(wrong[0]) ??
                          "The endpoint checks the Session header as at any resource (5.3), so a missing or bad one gets HTTP 400 with invalid_session."),
            });
    }
    if (r.wants("web.cookie-code-pairing")) {
        if (!firstPage.cookieHeader) {
            r.skip("web.cookie-code-pairing", "The page set no cookie to pair.");
            return;
        }
        const third = await loadPage(
            ctx,
            endpoint,
            "loading the page a third time, for a code to authorize",
        );
        if (!third.code) {
            r.skip("web.cookie-code-pairing", "The third page load had no code.");
            return;
        }
        const ok = await authorize(third.code, "authorizing the third page's code");
        if (ok.status !== 204) {
            r.skip("web.cookie-code-pairing", "The third page's code wasn't authorized.");
            return;
        }
        const form = await submitForm(
            ctx,
            endpoint,
            third.code,
            second.cookieHeader || firstPage.cookieHeader,
            "submitting the third page's authorized code with the cookie the second page set",
        );
        expectFormRefused(
            r,
            "web.cookie-code-pairing",
            form,
            "The endpoint accepted an authorized code with a cookie from a different page load. The cookie from step 1 must match the code, so only the browser that loaded the page can submit it (section 6, step 3; 10.6).",
        );
    }
}
