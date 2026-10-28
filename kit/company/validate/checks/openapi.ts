// Milestone 2: each listed OpenAPI description loads and declares OpenAPI 3.0 or 3.1 (section 7).

import { getFollowing, type Exchange } from "../http.ts";
import { parseYaml, YamlError } from "../yaml.ts";
import { apiUrls, isObject, type Context, type Recorder } from "./types.ts";

export type OpenApiInfo = {
    url: string;
    exchange: Exchange;
    version?: string;
    title?: string;
    paths?: number;
    // Scope names, with string descriptions, from the description's OAuth 2.0 security schemes.
    scopes?: string[];
    // Scopes whose description isn't a string, and $refs to security schemes that couldn't be
    // resolved.
    badScopes?: string[];
    unresolved?: string[];
    // Why the description can't be used, if it can't.
    problem?: string;
    // Set when the validator couldn't read the description, rather than the description being
    // wrong, such as YAML features the validator's parser doesn't support.
    inconclusive?: boolean;
};

type Parsed = {
    version?: string;
    swagger?: string;
    title?: string;
    infoVersion?: unknown;
    hasInfo: boolean;
    paths?: number;
    scopes: string[];
    badScopes: string[];
    unresolved: string[];
};

// Reads a JSON or YAML description. Returns a problem when it's neither, and an unsupported note
// when it uses YAML the validator can't parse.
export function readOpenApi(ex: Exchange): Parsed | { problem: string; inconclusive?: boolean } {
    let doc: unknown = ex.json;
    if (doc === undefined) {
        try {
            doc = parseYaml(ex.body ?? "");
        } catch (e) {
            if (e instanceof YamlError)
                return e.unsupported
                    ? {
                          problem: `the validator couldn't read the YAML: ${e.message}`,
                          inconclusive: true,
                      }
                    : { problem: `the response isn't valid JSON or YAML: ${e.message}` };
            throw e;
        }
    }
    if (!isObject(doc) || (doc.openapi === undefined && doc.swagger === undefined))
        return { problem: "the response isn't a JSON or YAML OpenAPI description" };
    const info = isObject(doc.info) ? doc.info : undefined;
    const components = isObject(doc.components) ? doc.components : undefined;
    const { scopes, badScopes, unresolved } = oauthScopes(doc, components?.securitySchemes);
    return {
        version:
            typeof doc.openapi === "string"
                ? doc.openapi
                : doc.openapi !== undefined
                  ? JSON.stringify(doc.openapi)
                  : undefined,
        swagger: typeof doc.swagger === "string" ? doc.swagger : undefined,
        title: typeof info?.title === "string" ? info.title : undefined,
        infoVersion: info?.version,
        hasInfo: Boolean(info),
        paths: isObject(doc.paths) ? Object.keys(doc.paths).length : undefined,
        scopes,
        badScopes,
        unresolved,
    };
}

// Resolves a local $ref, such as "#/components/securitySchemes/oauth", following $refs up to a
// depth. Returns undefined for a $ref outside the document or to nothing.
export function resolveRef(doc: unknown, value: unknown, depth = 0): unknown {
    if (!isObject(value) || typeof value.$ref !== "string") return value;
    if (depth > 10 || !value.$ref.startsWith("#")) return undefined;
    let node: unknown = doc;
    for (const raw of value.$ref.slice(1).split("/").slice(1)) {
        const segment = decodeURIComponent(raw).replace(/~1/g, "/").replace(/~0/g, "~");
        if (!isObject(node) && !Array.isArray(node)) return undefined;
        node = (node as Record<string, unknown>)[segment];
        if (node === undefined) return undefined;
    }
    return resolveRef(doc, node, depth + 1);
}

// The scope names in every flow of every OAuth 2.0 security scheme.
function oauthScopes(
    doc: unknown,
    schemes: unknown,
): { scopes: string[]; badScopes: string[]; unresolved: string[] } {
    const scopes: string[] = [];
    const badScopes: string[] = [];
    const unresolved: string[] = [];
    if (!isObject(schemes)) return { scopes, badScopes, unresolved };
    for (const [name, raw] of Object.entries(schemes)) {
        const scheme = resolveRef(doc, raw);
        if (scheme === undefined) {
            unresolved.push(`${name} ($ref ${String((raw as { $ref?: unknown }).$ref)})`);
            continue;
        }
        if (!isObject(scheme) || scheme.type !== "oauth2" || !isObject(scheme.flows)) continue;
        for (const flow of Object.values(scheme.flows)) {
            if (!isObject(flow) || !isObject(flow.scopes)) continue;
            for (const [scope, description] of Object.entries(flow.scopes)) {
                if (typeof description === "string") scopes.push(scope);
                else badScopes.push(scope);
            }
        }
    }
    return { scopes, badScopes, unresolved };
}

// Each description is loaded once per run, however many checks use it.
const loads = new WeakMap<Context, Map<string, Promise<OpenApiInfo>>>();

export function loadOpenApi(ctx: Context, url: string): Promise<OpenApiInfo> {
    let cache = loads.get(ctx);
    if (!cache) loads.set(ctx, (cache = new Map()));
    let load = cache.get(url);
    if (!load) cache.set(url, (load = fetchOpenApi(ctx, url)));
    return load;
}

async function fetchOpenApi(ctx: Context, url: string): Promise<OpenApiInfo> {
    const follow = await getFollowing(ctx.http, url, {
        max: 3,
        headers: { Accept: "application/json, application/yaml;q=0.9, */*;q=0.5" },
    });
    const ex = follow.final!;
    if (follow.problem) return { url, exchange: ex, problem: follow.problem };
    if (ex.refused || ex.error || ex.rateLimited)
        return {
            url,
            exchange: ex,
            problem: `the request didn't get a response (${ex.refused ?? ex.error ?? "rate limited"})`,
            inconclusive: true,
        };
    if (ex.status !== 200) return { url, exchange: ex, problem: `it returned ${ex.status}` };
    const info = readOpenApi(ex);
    if ("problem" in info) return { url, exchange: ex, ...info };
    if (!info.hasInfo || typeof info.title !== "string" || typeof info.infoVersion !== "string")
        return {
            url,
            exchange: ex,
            version: info.version,
            problem:
                "the description has no info object with a title and a version, which OpenAPI requires",
        };
    return {
        url,
        exchange: ex,
        version: info.version ?? (info.swagger ? `swagger ${info.swagger}` : undefined),
        title: info.title,
        paths: info.paths,
        scopes: info.scopes,
        badScopes: info.badScopes,
        unresolved: info.unresolved,
    };
}

export async function checkOpenApi(ctx: Context, r: Recorder): Promise<void> {
    const urls = apiUrls(ctx.discovered.poppy, "openapi");
    if (urls.length === 0) {
        r.skip("openapi.loads", "poppy.json lists no OpenAPI APIs.");
        r.skip("openapi.version", "poppy.json lists no OpenAPI APIs.");
        return;
    }
    const loaded = await Promise.all(urls.map((url) => loadOpenApi(ctx, url)));
    const failed = loaded.filter((l) => l.problem && !l.inconclusive);
    const unread = loaded.filter((l) => l.inconclusive);
    if (failed.length) {
        r.fail("openapi.loads", {
            exchange: failed.map((f) => f.exchange),
            got: failed.map((f) => `${f.url}: ${f.problem}`).join("; "),
            expected: "200 with an OpenAPI description at each url",
            cause: "Serve the description at the url in poppy.json, publicly (Personal Agents fetch it before they have a token).",
        });
    } else if (unread.length)
        r.inconclusive("openapi.loads", {
            exchange: unread.map((f) => f.exchange),
            got: unread.map((f) => `${f.url}: ${f.problem}`).join("; "),
            expected: "200 with an OpenAPI description at each url",
            cause: "The validator couldn't read the description, so it can't say whether it's valid.",
        });
    else
        r.pass("openapi.loads", {
            summary: loaded.map((l) => `${l.url}: ${l.title ?? "untitled"}`).join("; "),
        });
    const ok = loaded.filter((l) => !l.problem);
    const badVersion = ok.filter((l) => !/^3\.[01](\.\d+)?$/.test(l.version ?? ""));
    if (ok.length === 0) r.skip("openapi.version", "No description loaded.");
    else if (badVersion.length) {
        r.fail("openapi.version", {
            exchange: badVersion.map((b) => b.exchange),
            got: badVersion.map((b) => `${b.url}: ${b.version ?? "no openapi field"}`).join("; "),
            expected: "openapi 3.0.x or 3.1.x",
            cause: "Personal Agents expect OpenAPI 3.0 or 3.1. Convert Swagger 2.0 descriptions with a converter.",
        });
    } else r.pass("openapi.version", { summary: ok.map((l) => `openapi ${l.version}`).join("; ") });
}
