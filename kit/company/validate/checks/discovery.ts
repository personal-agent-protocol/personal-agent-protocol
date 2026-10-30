// Milestone 1: poppy.json (spec section 3) and the issuer's OAuth server metadata (3.2).

import { PROTOCOL_VERSION } from "../catalog.ts";
import { getFollowing, isJsonContentType, type Exchange } from "../http.ts";
import { formatSchemaErrors } from "../schema.ts";
import { check } from "../schemas.ts";
import { loadOpenApi } from "./openapi.ts";
import {
    apisOf,
    apiUrls,
    describeGot,
    describeSent,
    extensionsOf,
    isObject,
    mediatedSignIn,
    skipRest,
    type Context,
    offersGrant,
    SIGN_IN_GRANTS,
    type Metadata,
    type Poppy,
    type Recorder,
    type ResourceMetadata,
} from "./types.ts";

export const DISCOVERY_IDS = [
    "discovery.https",
    "discovery.redirects-https",
    "discovery.redirects-well-known",
    "discovery.json",
    "discovery.schema",
    "discovery.protocol-version",
    "discovery.domain-matches-host",
    "discovery.interface-present",
    "discovery.extension-names",
];

export const EXCLUDED_TASKS_IDS = ["discovery.excluded-tasks", "discovery.alternative-references"];

export const METADATA_IDS = [
    "metadata.issuer-required",
    "metadata.resource-metadata",
    "metadata.issuer-chosen",
    "metadata.published",
    "metadata.schema",
    "metadata.issuer-matches",
    "metadata.protected-resources",
    "metadata.token-endpoint",
    "metadata.revocation-endpoint",
    "metadata.grant-types",
    "metadata.authorization-endpoint",
    "metadata.device-authorization-endpoint",
    "metadata.scopes-supported",
    "metadata.scopes-described",
    "metadata.same-issuer",
    "metadata.same-auth",
    "metadata.mediated-grant",
];

// The origin to check, from a URL or a bare domain.
export function targetOrigin(target: string): string {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(target) ? target : `https://${target}`;
    const url = new URL(withScheme);
    return `https://${url.host}`;
}

export function wellKnownPoppy(target: string): string {
    return `${targetOrigin(target)}/.well-known/poppy.json`;
}

// RFC 8414 section 3: the well-known suffix goes between the host and any path of the issuer.
export function metadataUrlFor(issuer: string): string {
    const url = new URL(issuer);
    const path = url.pathname.replace(/\/+$/, "");
    return `${url.origin}/.well-known/oauth-authorization-server${path}`;
}

function chainText(chain: Exchange[]): string {
    return chain.map((ex) => `${ex.url} → ${ex.error ? ex.error : ex.status}`).join(", ");
}

// Marks poppy.json unusable, so checks that depend on it skip with this reason.
function blockPoppy(ctx: Context, reason: string): void {
    ctx.blocked.poppy ??= reason;
}

// Fetches and checks poppy.json, filling ctx.discovered.poppy.
export async function checkPoppyOnline(ctx: Context, r: Recorder): Promise<void> {
    const url = wellKnownPoppy(ctx.target!);
    const follow = await getFollowing(ctx.http, url, { headers: { Accept: "application/json" } });
    const first = follow.chain[0];
    const final = follow.final!;
    const redirects = follow.chain.slice(0, -1);

    if (follow.nonHttpsRedirect) {
        r.fail("discovery.redirects-https", {
            exchange: follow.chain,
            sent: `GET ${url}, following redirects`,
            got: `${final.status} redirect to ${follow.nonHttpsRedirect}`,
            expected: "Every redirect to an https:// URL",
            cause: "A redirect rule sends the well-known path to http://. This is often a proxy or CDN rule that builds the Location from the scheme it received internally. Redirect to https:// explicitly.",
        });
        blockPoppy(
            ctx,
            "poppy.json couldn't be loaded over HTTPS (see discovery.redirects-https).",
        );
        skipRest(r, DISCOVERY_IDS, ctx.blocked.poppy!);
        return;
    }
    if (redirects.length) {
        r.pass("discovery.redirects-https", { summary: `Redirects: ${chainText(follow.chain)}` });
    } else {
        r.pass("discovery.redirects-https", { summary: "No redirects." });
    }

    if (first.error || final.error) {
        const ex = final.error ? final : first;
        r.fail("discovery.https", {
            exchange: ex,
            transportIsResult: !ex.refused && !ex.rateLimited,
            expected: `200 with poppy.json at ${url}`,
            cause: `The request failed before a response (${ex.error}). Check that ${new URL(ex.url).host} resolves, serves HTTPS with a valid certificate, and is reachable from the internet.`,
        });
        blockPoppy(ctx, "poppy.json couldn't be loaded (see discovery.https).");
        skipRest(r, DISCOVERY_IDS, ctx.blocked.poppy!);
        return;
    }
    if (final.status !== 200) {
        const notFound = final.status === 404;
        r.fail("discovery.https", {
            exchange: follow.chain,
            sent: `GET ${url}${redirects.length ? ", following redirects" : ""}`,
            got: `${describeGot(final)}${redirects.length ? ` at ${final.url}` : ""}`,
            expected: "200 with the poppy.json document",
            cause: follow.problem
                ? `The redirects didn't end at the document: ${follow.problem}.`
                : notFound
                  ? `Nothing is published at ${final.url}. Serve poppy.json at /.well-known/poppy.json on the domain Personal Agents look up. Some frameworks and static hosts skip dot-directories like .well-known unless configured to serve them.`
                  : `The well-known URL returned ${final.status}. Personal Agents treat anything other than 200 as no poppy.json.`,
        });
        blockPoppy(ctx, "poppy.json couldn't be loaded (see discovery.https).");
        skipRest(r, DISCOVERY_IDS, ctx.blocked.poppy!);
        return;
    }
    r.pass("discovery.https", {
        summary: `Served at ${final.url}${redirects.length ? ` after ${redirects.length} redirect(s)` : ""}.`,
    });

    const finalUrl = new URL(final.url);
    if (finalUrl.pathname !== "/.well-known/poppy.json" || finalUrl.search) {
        r.fail("discovery.redirects-well-known", {
            exchange: follow.chain,
            sent: `GET ${url}, following redirects`,
            got: `The redirects end at ${final.url}`,
            expected: "The last URL's path is exactly /.well-known/poppy.json, with no query",
            cause: "Personal Agents ignore a poppy.json served from any other path, so a file uploaded elsewhere on a domain can't speak for it. Redirect to /.well-known/poppy.json on the target host.",
        });
        blockPoppy(
            ctx,
            "Personal Agents won't use this poppy.json (see discovery.redirects-well-known).",
        );
        skipRest(r, DISCOVERY_IDS, ctx.blocked.poppy!);
        return;
    }
    r.pass("discovery.redirects-well-known", {
        summary: redirects.length ? `Ends at ${final.url}.` : "No redirects.",
    });

    const notes: string[] = [];
    if (!isJsonContentType(final)) {
        notes.push(
            `Content-Type is ${final.responseHeaders["content-type"] ?? "missing"}; application/json is what clients expect.`,
        );
    }
    if (!final.responseHeaders["cache-control"]) {
        notes.push(
            "No Cache-Control header. Personal Agents SHOULD cache poppy.json according to its caching headers (spec 3), so consider setting one.",
        );
    }
    const finalHost = new URL(final.url).host;
    ctx.discovered.poppyUrl = final.url;
    ctx.discovered.finalHost = finalHost;
    checkPoppyDocument(ctx, r, final, notes);
}

// Checks a loaded poppy.json body. `ex` is the exchange it came from, or undefined for --file.
export function checkPoppyDocument(
    ctx: Context,
    r: Recorder,
    ex: Exchange | undefined,
    notes: string[] = [],
    fileText?: string,
): void {
    let doc: unknown;
    if (ex) {
        doc = ex.json;
    } else {
        try {
            doc = JSON.parse(fileText ?? "");
        } catch (error) {
            doc = undefined;
            notes.push(error instanceof Error ? error.message : String(error));
        }
    }
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
        r.fail("discovery.json", {
            exchange: ex,
            sent: ex ? undefined : "(read from --file)",
            got: ex
                ? `${describeGot(ex)}, a body that isn't a JSON object`
                : "a file that isn't a JSON object",
            expected: "A JSON object",
            cause: ex
                ? "The URL serves something other than the JSON document, such as an HTML page from a catch-all route, or JSON with a syntax error."
                : `The file isn't a JSON object${notes.length ? ` (${notes.join("; ")})` : ""}.`,
        });
        blockPoppy(ctx, "poppy.json isn't a JSON object (see discovery.json).");
        skipRest(r, DISCOVERY_IDS, ctx.blocked.poppy!);
        return;
    }
    r.pass("discovery.json", { notes });
    const poppy = doc as Poppy;
    ctx.discovered.poppy = poppy;
    // Checks that failed, so Personal Agents wouldn't use the document.
    const unusable: string[] = [];

    // Schema errors, leaving out the rule that has its own check below.
    const errors = check("poppy.schema.json", poppy).filter(
        (e) => !(e.path === "" && e.message.startsWith("must include at least one of")),
    );
    if (errors.length) {
        r.fail("discovery.schema", {
            exchange: ex,
            sent: ex ? describeSent(ex) : "(read from --file)",
            got: formatSchemaErrors(errors).join("; "),
            expected:
                "Every field in the form section 3.1 describes (kit/company/schemas/poppy.schema.json)",
            cause: "Fix each field listed. Unknown fields are fine; these are fields the spec defines with the wrong type or form, or required ones that are missing.",
        });
        unusable.push("discovery.schema");
    } else {
        r.pass("discovery.schema");
    }

    const version = poppy.protocol_version;
    const match = typeof version === "string" ? /^(\d+)\.(\d+)$/.exec(version) : null;
    if (!match) {
        r.fail("discovery.protocol-version", {
            exchange: ex,
            got: `protocol_version is ${JSON.stringify(version)}`,
            expected: `A string "major.minor", such as "${PROTOCOL_VERSION}"`,
            cause: `Set protocol_version to "${PROTOCOL_VERSION}", the draft this validator checks.`,
        });
        unusable.push("discovery.protocol-version");
    } else if (version !== PROTOCOL_VERSION) {
        r.fail("discovery.protocol-version", {
            exchange: ex,
            got: `protocol_version ${version}`,
            expected: `protocol_version ${PROTOCOL_VERSION}`,
            cause: `Before 1.0, each version can break the one before, so Personal Agents that support only draft ${PROTOCOL_VERSION} won't use this document. This validator checks draft ${PROTOCOL_VERSION}: set protocol_version to "${PROTOCOL_VERSION}" once the implementation follows it. See https://personalagentprotocol.org/docs/changelog for what changed.`,
        });
        unusable.push("discovery.protocol-version");
    } else {
        r.pass("discovery.protocol-version", { summary: `protocol_version ${version}.` });
    }

    const domain = poppy.organization?.domain;
    if (!ex) {
        r.skip(
            "discovery.domain-matches-host",
            "Offline (--file): the host that serves the document isn't known.",
        );
    } else if (typeof domain !== "string") {
        r.fail("discovery.domain-matches-host", {
            exchange: ex,
            got: "organization.domain is missing",
            expected: `organization.domain "${ctx.discovered.finalHost}"`,
            cause: "Add organization.domain with the host that serves poppy.json.",
        });
        unusable.push("discovery.domain-matches-host");
    } else if (domain.toLowerCase() !== ctx.discovered.finalHost!.toLowerCase()) {
        const host = ctx.discovered.finalHost!;
        const wwwOnly =
            domain.toLowerCase().replace(/^www\./, "") === host.toLowerCase().replace(/^www\./, "");
        r.fail("discovery.domain-matches-host", {
            exchange: ex,
            sent: `GET ${wellKnownPoppy(ctx.target!)}${ctx.discovered.poppyUrl !== wellKnownPoppy(ctx.target!) ? `, which ended at ${ctx.discovered.poppyUrl}` : ""}`,
            got: `organization.domain "${domain}", served by ${host}`,
            expected: `organization.domain "${host}"`,
            cause: wwwOnly
                ? `Domains are compared ignoring case and nothing else, so ${domain} and ${host} are different domains. Either set organization.domain to "${host}", or serve poppy.json from ${domain} (for example, stop redirecting the well-known path there).`
                : `The document names a different domain than the host that serves it. Set organization.domain to "${host}", or serve this document from ${domain}. A provider hosting poppy.json must serve it on the Company's own domain.`,
        });
        unusable.push("discovery.domain-matches-host");
    } else {
        r.pass("discovery.domain-matches-host", {
            summary: `organization.domain ${domain} matches the host.`,
        });
    }

    if (poppy.agent === undefined && poppy.apis === undefined && poppy.web === undefined) {
        r.fail("discovery.interface-present", {
            exchange: ex,
            got: "none of agent, apis, or web",
            expected: "At least one of agent, apis, or web",
            cause: "List the interfaces Personal Agents can use: the Company Agent, APIs, or the website.",
        });
    } else {
        r.pass("discovery.interface-present");
    }

    checkExtensionNames(r, poppy, ex);

    // Personal Agents skip API types they don't recognize (section 7), so another type isn't a
    // problem for the Company, but this validator can't check it.
    const otherTypes = apisOf(poppy)
        .map((api) => api.type)
        .filter((type) => type !== "openapi" && type !== "mcp");
    if (otherTypes.length)
        ctx.notes.push(
            `poppy.json lists API types this version doesn't define (${[...new Set(otherTypes.map((t) => JSON.stringify(t)))].join(", ")}). That's allowed, and Personal Agents that don't recognize them skip them, so the validator doesn't check them.`,
        );

    if (unusable.length)
        blockPoppy(
            ctx,
            `Personal Agents wouldn't use this poppy.json (see ${unusable.join(", ")}), so checks that depend on it are skipped.`,
        );
}

// The extensions this version of the protocol defines, whose plain names are reserved for them.
export const PROTOCOL_EXTENSIONS = ["mediated-sign-in", "operations"];

// An extension name that starts with a domain, such as example.com/gift-wrap.
const DOMAIN_NAME =
    /^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+\/\S+$/;

// Extension names: plain names are reserved for the protocol's own extensions, and anyone else
// starts the name with a domain (3.3).
function checkExtensionNames(r: Recorder, poppy: Poppy, ex: Exchange | undefined): void {
    const names = Object.keys(extensionsOf(poppy));
    if (names.length === 0) {
        r.skip("discovery.extension-names", "poppy.json lists no extensions.");
        return;
    }
    const bad = names.filter((n) => !PROTOCOL_EXTENSIONS.includes(n) && !DOMAIN_NAME.test(n));
    if (bad.length === 0) r.pass("discovery.extension-names");
    else
        r.fail("discovery.extension-names", {
            exchange: ex,
            got: `extensions ${bad.map((n) => JSON.stringify(n)).join(", ")}`,
            expected: `Either an extension this protocol defines (${PROTOCOL_EXTENSIONS.join(", ")}), or a name that starts with a domain, such as example.com/gift-wrap`,
            cause: "Plain names are reserved for extensions defined with this protocol, so a Company's own extension can't clash with one the protocol adds later. Start the name with a domain you control.",
        });
}

// Fetches and checks the excluded-tasks document that poppy.json names, if any (spec 9.1, 9.2).
export async function checkExcludedTasks(ctx: Context, r: Recorder): Promise<void> {
    const poppy = ctx.discovered.poppy;
    if (!poppy || ctx.blocked.poppy) {
        skipRest(r, EXCLUDED_TASKS_IDS, ctx.blocked.poppy ?? "poppy.json wasn't loaded.");
        return;
    }
    const url = isObject(poppy.excluded_tasks) ? poppy.excluded_tasks.url : undefined;
    if (url === undefined) {
        skipRest(r, EXCLUDED_TASKS_IDS, "poppy.json lists no excluded_tasks.");
        return;
    }
    if (typeof url !== "string" || !url.startsWith("https://")) {
        skipRest(
            r,
            EXCLUDED_TASKS_IDS,
            "excluded_tasks.url isn't an HTTPS URL (see discovery.schema).",
        );
        return;
    }
    const follow = await getFollowing(ctx.http, url, { headers: { Accept: "application/json" } });
    const ex = follow.final!;
    const doc = ex.json as { tasks?: { task?: unknown; alternative?: unknown }[] } | undefined;
    if (ex.error || ex.status !== 200 || !isObject(doc)) {
        r.fail("discovery.excluded-tasks", {
            exchange: follow.chain,
            expected: `200 with a JSON object at ${url}`,
            cause: ex.error
                ? `The request failed before a response (${ex.error}).`
                : follow.nonHttpsRedirect
                  ? `A redirect went to ${follow.nonHttpsRedirect}, which isn't HTTPS.`
                  : "Serve the document that excluded_tasks.url in poppy.json names, as JSON, without a token.",
        });
        skipRest(r, EXCLUDED_TASKS_IDS, "The excluded-tasks document couldn't be loaded.");
        return;
    }
    const errors = check("excluded-tasks.schema.json", doc);
    if (errors.length) {
        r.fail("discovery.excluded-tasks", {
            exchange: ex,
            got: formatSchemaErrors(errors).join("; "),
            expected: "The fields in 9.1 and 9.2 (kit/company/schemas/excluded-tasks.schema.json)",
            cause: "Fix each field listed.",
        });
    } else {
        const count = Array.isArray(doc.tasks) ? doc.tasks.length : 0;
        r.pass("discovery.excluded-tasks", { summary: `${count} excluded task(s).` });
    }

    const listed = new Set(apisOf(poppy).map((api) => `${api.type} ${api.url}`));
    const unlisted: string[] = [];
    for (const [i, entry] of (Array.isArray(doc.tasks) ? doc.tasks : []).entries()) {
        const alternative = (isObject(entry) ? entry.alternative : undefined) as
            | { references?: unknown }
            | undefined;
        const references = Array.isArray(alternative?.references) ? alternative.references : [];
        for (const [j, ref] of references.entries()) {
            const { type, url: refUrl } = (isObject(ref) ? ref : {}) as {
                type?: unknown;
                url?: unknown;
            };
            if ((type === "openapi" || type === "mcp") && !listed.has(`${type} ${refUrl}`)) {
                unlisted.push(`tasks[${i}].alternative.references[${j}] (${type} ${refUrl})`);
            }
        }
    }
    if (unlisted.length) {
        r.fail("discovery.alternative-references", {
            exchange: ex,
            got: unlisted.join(", "),
            expected:
                "Each openapi or mcp reference's url is the url of an apis entry of that type",
            cause: "Personal Agents ignore a reference to an API that poppy.json doesn't list. List the API in apis, or fix the url to match its entry exactly.",
        });
    } else {
        r.pass("discovery.alternative-references");
    }
}

// Explicit declarations that cannot be used without an OAuth issuer (spec 3.2).
export function needsIssuer(poppy: Poppy): string[] {
    return [
        poppy.auth?.issuer !== undefined ? "auth.issuer" : "",
        poppy.agent?.protocols?.some((p) => p.type === "poppy" && p.access === "signed_in")
            ? "agent.protocols.access signed_in"
            : "",
        mediatedSignIn(poppy) !== undefined ? "extensions.mediated-sign-in" : "",
    ].filter(Boolean);
}

// Returns false for both issuerless Companies and failed discovery. Only successful discovery
// establishes an audience; callers never infer issuerless operation from an error.
async function discoverIssuer(ctx: Context, r: Recorder): Promise<boolean> {
    const poppy = ctx.discovered.poppy!;
    const domain = poppy.organization?.domain;
    if (typeof domain !== "string") {
        skipRest(r, METADATA_IDS, "poppy.json has no organization.domain (see discovery.schema).");
        return false;
    }
    const needs = needsIssuer(poppy);
    const resource = `https://${domain.toLowerCase()}`;
    const url = `${resource}/.well-known/oauth-protected-resource`;
    const follow = await getFollowing(ctx.http, url, {
        max: 3,
        headers: { Accept: "application/json" },
    });
    const ex = follow.final!;
    const doc = ex.json as ResourceMetadata | undefined;
    const noIssuer = () => {
        if (needs.length) {
            r.fail("metadata.issuer-required", {
                exchange: follow.chain,
                got: `${needs.join(", ")} in poppy.json, but no issuer`,
                expected: "Protected resource metadata naming an OAuth issuer",
                cause: "Publish authorization_servers naming the issuer, or remove the declarations that require account access.",
            });
        } else {
            ctx.discovered.audience = resource;
            r.pass("metadata.issuer-required", {
                summary: `Signed-out only; Session audience ${resource}.`,
            });
        }
        skipRest(r, METADATA_IDS, "The Company has no OAuth issuer.");
        return false;
    };
    if (ex.status === 404 && !ex.error && !follow.nonHttpsRedirect) return noIssuer();
    if (ex.status !== 200 || !doc || typeof doc !== "object" || Array.isArray(doc)) {
        r.fail("metadata.resource-metadata", {
            exchange: follow.chain,
            expected:
                "200 with valid protected resource metadata, or 404 for an issuerless Company",
            cause: "Discovery failed. A timeout, invalid document or other error must not select the domain fallback (3.2).",
        });
        skipRest(
            r,
            METADATA_IDS,
            "No Company identity was established (see metadata.resource-metadata).",
        );
        return false;
    }
    ctx.discovered.resourceMetadata = doc;
    const errors = check("protected-resource-metadata.schema.json", doc);
    const resourceMatches =
        typeof doc.resource === "string" && doc.resource.toLowerCase() === resource.toLowerCase();
    if (errors.length || !resourceMatches) {
        r.fail("metadata.resource-metadata", {
            exchange: ex,
            got: [
                ...formatSchemaErrors(errors),
                resourceMatches ? "" : `resource ${JSON.stringify(doc.resource)}`,
            ]
                .filter(Boolean)
                .join("; "),
            expected: `resource "${resource}" and valid authorization_servers when present`,
            cause: "The resource must match the Company's domain. Invalid metadata cannot establish an issuerless Company.",
        });
        skipRest(r, METADATA_IDS, "Invalid protected resource metadata.");
        return false;
    }
    r.pass("metadata.resource-metadata");
    const servers = (doc.authorization_servers ?? []) as string[];
    if (servers.length === 0) return noIssuer();
    r.pass("metadata.issuer-required");

    const chosen = poppy.auth?.issuer;
    let issuer: string;
    if (servers.length === 1) {
        issuer = servers[0];
        if (chosen !== undefined && chosen !== issuer) {
            r.fail("metadata.issuer-chosen", {
                exchange: ex,
                got: `auth.issuer ${JSON.stringify(chosen)}, authorization_servers ${JSON.stringify(servers)}`,
                expected: `auth.issuer "${issuer}", or no auth.issuer`,
                cause: "auth.issuer must be in the protected resource metadata's authorization_servers. With one server, it can be left out.",
            });
            skipRest(r, METADATA_IDS, "auth.issuer does not match authorization_servers.");
            return false;
        } else
            r.pass("metadata.issuer-chosen", { summary: `One authorization server, ${issuer}.` });
    } else if (typeof chosen === "string" && servers.includes(chosen)) {
        issuer = chosen;
        r.pass("metadata.issuer-chosen", { summary: `auth.issuer ${issuer}.` });
    } else {
        r.fail("metadata.issuer-chosen", {
            exchange: ex,
            got:
                chosen === undefined
                    ? `no auth.issuer, and authorization_servers ${JSON.stringify(servers)}`
                    : `auth.issuer ${JSON.stringify(chosen)}, not in authorization_servers ${JSON.stringify(servers)}`,
            expected: "auth.issuer, exactly as one of authorization_servers",
            cause: "With more than one authorization server, auth.issuer in poppy.json names the one Personal Agents use. Personal Agents stop here otherwise.",
        });
        skipRest(r, METADATA_IDS, "No issuer was found (see metadata.issuer-chosen).");
        return false;
    }
    if (!issuer.startsWith("https://")) {
        skipRest(r, METADATA_IDS, `The issuer ${issuer} isn't an HTTPS URL.`);
        return false;
    }
    ctx.discovered.issuer = issuer;
    return true;
}

// Finds the issuer, then fetches and checks its RFC 8414 metadata, filling ctx.discovered.metadata.
export async function checkMetadata(ctx: Context, r: Recorder): Promise<void> {
    const poppy = ctx.discovered.poppy;
    if (!poppy || ctx.blocked.poppy) {
        skipRest(r, METADATA_IDS, ctx.blocked.poppy ?? "poppy.json wasn't loaded.");
        return;
    }
    if (!(await discoverIssuer(ctx, r))) {
        if (!ctx.discovered.audience)
            ctx.blocked.issuer ??=
                "No usable Company identity was found (see the metadata checks).";
        return;
    }
    // Checks that failed, so Personal Agents wouldn't trust the issuer.
    const untrusted: string[] = [];
    const issuer = ctx.discovered.issuer!;
    const url = metadataUrlFor(issuer);
    ctx.discovered.metadataUrl = url;
    const follow = await getFollowing(ctx.http, url, {
        max: 3,
        headers: { Accept: "application/json" },
    });
    const ex = follow.final!;
    const json = ex.json as Metadata | undefined;
    if (ex.status !== 200 || !json || typeof json !== "object" || Array.isArray(json)) {
        const oidcUrl = `${issuer.replace(/\/+$/, "")}/.well-known/openid-configuration`;
        const oidc = await ctx.http.request({
            url: oidcUrl,
            headers: { Accept: "application/json" },
        });
        const hasOidc = oidc.status === 200 && oidc.json && typeof oidc.json === "object";
        const pathy = new URL(issuer).pathname.replace(/\/+$/, "") !== "";
        r.fail("metadata.published", {
            exchange: follow.chain,
            expected: `200 with a JSON object at ${url}`,
            cause: [
                ex.error
                    ? `The request failed (${ex.error}).`
                    : ex.status === 200
                      ? "The response isn't a JSON object."
                      : `Nothing usable at the RFC 8414 location.`,
                pathy
                    ? `For an issuer with a path, RFC 8414 puts /.well-known/oauth-authorization-server between the host and the path, so the URL is ${url}, not ${issuer.replace(/\/+$/, "")}/.well-known/oauth-authorization-server.`
                    : "",
                hasOidc
                    ? `${oidcUrl} exists, but Personal Agents look only for RFC 8414 metadata. Publish the same fields, plus protected_resources, at ${url}.`
                    : "",
            ]
                .filter(Boolean)
                .join(" "),
        });
        ctx.blocked.issuer =
            "The issuer's OAuth server metadata couldn't be loaded (see metadata.published).";
        skipRest(r, METADATA_IDS, ctx.blocked.issuer);
        return;
    }
    r.pass("metadata.published", { summary: `Loaded from ${ex.url}.` });
    ctx.discovered.metadata = json;

    const errors = check("authorization-server-metadata.schema.json", json).filter(
        // Missing required endpoints, grant types, and protected_resources have their own checks.
        (e) =>
            !(
                e.message === "is required" &&
                /^\/(token_endpoint|revocation_endpoint|grant_types_supported|protected_resources)$/.test(
                    e.path,
                )
            ),
    );
    if (errors.length) {
        r.fail("metadata.schema", {
            exchange: ex,
            got: formatSchemaErrors(errors).join("; "),
            expected:
                "The fields section 3.2 lists, in the right forms (kit/company/schemas/authorization-server-metadata.schema.json)",
            cause: "Fix each field listed. Other RFC 8414 fields are fine.",
        });
        untrusted.push("metadata.schema");
    } else {
        r.pass("metadata.schema");
    }

    if (json.issuer === issuer) {
        r.pass("metadata.issuer-matches");
    } else {
        const slash =
            typeof json.issuer === "string" &&
            json.issuer.replace(/\/+$/, "") === issuer.replace(/\/+$/, "");
        r.fail("metadata.issuer-matches", {
            exchange: ex,
            got: `issuer ${JSON.stringify(json.issuer)}`,
            expected: `issuer "${issuer}", exactly as the protected resource metadata names it`,
            cause: slash
                ? "They differ only by a trailing slash, but the comparison is exact. Use the same string in both places."
                : "The protected resource metadata and the issuer's metadata name different issuers. Personal Agents stop here, because any domain could otherwise claim this issuer. Name the issuer your OAuth server reports.",
        });
        untrusted.push("metadata.issuer-matches");
    }

    const domain = poppy.organization?.domain;
    const resources = Array.isArray(json.protected_resources)
        ? json.protected_resources
        : undefined;
    const resource = `https://${domain}`;
    if (!resources) {
        r.fail("metadata.protected-resources", {
            exchange: ex,
            got:
                json.protected_resources === undefined
                    ? "no protected_resources"
                    : `protected_resources ${JSON.stringify(json.protected_resources)}`,
            expected: `protected_resources, an array that includes "${resource}"`,
            cause: "protected_resources is the RFC 9728 field that lists the resources an authorization server serves. If your OAuth server can't publish it, serve this document from a small handler or a gateway in front of it.",
        });
        untrusted.push("metadata.protected-resources");
    } else if (
        typeof domain === "string" &&
        !resources.some(
            (u: unknown) => typeof u === "string" && u.toLowerCase() === resource.toLowerCase(),
        )
    ) {
        r.fail("metadata.protected-resources", {
            exchange: ex,
            got: `protected_resources ${JSON.stringify(resources)}`,
            expected: `protected_resources including "${resource}" (https:// and organization.domain)`,
            cause: `Add "${resource}" to protected_resources. It must list https://{domain} for every domain whose issuer it is, exactly as organization.domain says, with no path or trailing slash (case doesn't matter, www. does).`,
        });
        untrusted.push("metadata.protected-resources");
    } else {
        r.pass("metadata.protected-resources");
    }
    if (untrusted.length)
        ctx.blocked.issuer = `Personal Agents wouldn't use this issuer (see ${untrusted.join(", ")}), so checks that depend on it are skipped.`;

    for (const [id, field] of [
        ["metadata.token-endpoint", "token_endpoint"],
        ["metadata.revocation-endpoint", "revocation_endpoint"],
    ] as const) {
        if (typeof json[field] === "string" && (json[field] as string).length > 0) {
            r.pass(id);
        } else {
            r.fail(id, {
                exchange: ex,
                got: `no ${field}`,
                expected: `${field}, an HTTPS URL`,
                cause:
                    field === "revocation_endpoint"
                        ? "Personal Agents sign out by revoking refresh tokens here (RFC 7009). Add the endpoint when you publish an OAuth issuer."
                        : "Personal Agents get access and refresh tokens at the token endpoint. Add it to the metadata.",
            });
        }
    }

    const grants = json.grant_types_supported;
    const missingGrants = Array.isArray(grants)
        ? ["refresh_token"].filter((g) => !grants.includes(g))
        : undefined;
    if (missingGrants?.length === 0) {
        r.pass("metadata.grant-types");
    } else {
        r.fail("metadata.grant-types", {
            exchange: ex,
            got:
                grants === undefined
                    ? "no grant_types_supported"
                    : `grant_types_supported ${JSON.stringify(grants)}`,
            expected: "grant_types_supported including refresh_token",
            cause: missingGrants
                ? `Add ${missingGrants.join(" and ")}. Personal Agents use refresh tokens to get access tokens (4.4). Signed-out requests need nothing from the authorization server.`
                : "Personal Agents read grant_types_supported to learn which grants, and which of Direct and Device Sign-In, the Company offers. RFC 8414's default when it's missing doesn't include the grants Poppy uses.",
        });
    }

    for (const [id, field, type] of [
        ["metadata.authorization-endpoint", "authorization_endpoint", "direct"],
        ["metadata.device-authorization-endpoint", "device_authorization_endpoint", "device"],
    ] as const) {
        const grant = SIGN_IN_GRANTS[type];
        if (!offersGrant(json, grant)) {
            r.skip(id, `grant_types_supported doesn't include ${grant}.`);
        } else if (typeof json[field] === "string") {
            r.pass(id);
        } else {
            r.fail(id, {
                exchange: ex,
                got: `${grant} in grant_types_supported, but no ${field}`,
                expected: `${field}, an HTTPS URL`,
                cause: `Add ${field}, or remove ${grant} from grant_types_supported until it's ready.`,
            });
        }
    }

    const mediated = mediatedSignIn(poppy)?.scopes;
    const signsIn =
        offersGrant(json, SIGN_IN_GRANTS.direct) ||
        offersGrant(json, SIGN_IN_GRANTS.device) ||
        mediatedSignIn(poppy) !== undefined;
    const supported = json.scopes_supported;
    if (!signsIn) {
        r.skip("metadata.scopes-supported", "The Company offers no type of sign-in.");
        // Descriptions are recommended even without sign-in grants.
        if (Array.isArray(supported) && supported.length)
            await checkScopesDescribed(ctx, r, supported);
        else r.skip("metadata.scopes-described", "scopes_supported lists no scopes.");
    } else if (!Array.isArray(supported) || supported.length === 0) {
        r.fail("metadata.scopes-supported", {
            exchange: ex,
            got:
                supported === undefined
                    ? "no scopes_supported"
                    : `scopes_supported ${JSON.stringify(supported)}`,
            expected: "scopes_supported, listing every scope a Personal Agent can request",
            cause: "Publishing a complete scope list is recommended. Agents can also request scopes documented by the Company's APIs or sign-in extensions (4.7).",
        });
        r.skip("metadata.scopes-described", "scopes_supported lists no scopes.");
    } else {
        const missing = Array.isArray(mediated)
            ? mediated.filter((scope) => !supported.includes(scope))
            : [];
        if (missing.length) {
            r.fail("metadata.scopes-supported", {
                exchange: ex,
                got: `scopes_supported ${JSON.stringify(supported)}`,
                expected: `scopes_supported including ${missing.join(", ")}`,
                cause: "Including the Mediated Sign-In scopes in scopes_supported is recommended. Agents can also discover them in the extension's scopes (4.7).",
            });
        } else r.pass("metadata.scopes-supported");
        await checkScopesDescribed(ctx, r, supported);
    }
    if (!ctx.blocked.issuer) ctx.discovered.audience = issuer;
    checkMediatedGrant(r, poppy, json, ex);
    await checkSameAuth(ctx, r, json, ex);
}

const MEDIATED_GRANT = "https://personalagentprotocol.org/grant/mediated-sign-in";

// A Company that lists Mediated Sign-In lists its grant type (Mediated Sign-In 2).
function checkMediatedGrant(r: Recorder, poppy: Poppy, json: Metadata, ex: Exchange): void {
    if (!mediatedSignIn(poppy)) {
        r.skip("metadata.mediated-grant", "poppy.json doesn't list Mediated Sign-In version 1.");
        return;
    }
    if (offersGrant(json, MEDIATED_GRANT)) r.pass("metadata.mediated-grant");
    else
        r.fail("metadata.mediated-grant", {
            exchange: ex,
            got: `grant_types_supported ${JSON.stringify(json.grant_types_supported)}`,
            expected: `grant_types_supported including ${MEDIATED_GRANT}`,
            cause: "poppy.json lists Mediated Sign-In, so the issuer's metadata lists its grant type. Personal Agents read grant_types_supported to learn which grants the token endpoint accepts.",
        });
}

// Company domains select the same issuer. Matching scope descriptions and hints are recommended
// separately (3.2). Read a bounded number of other domains.
const MAX_OTHER_DOMAINS = 5;

async function checkSameAuth(
    ctx: Context,
    r: Recorder,
    json: Metadata,
    ex: Exchange,
): Promise<void> {
    if (!r.wants("metadata.same-auth") && !r.wants("metadata.same-issuer")) return;
    const poppy = ctx.discovered.poppy!;
    const own = String(poppy.organization?.domain ?? "").toLowerCase();
    const others = (Array.isArray(json.protected_resources) ? json.protected_resources : [])
        .filter((u): u is string => typeof u === "string" && /^https:\/\/[^/?#:@\s]+$/i.test(u))
        .map((u) => u.slice("https://".length).toLowerCase())
        .filter((d, i, all) => d !== own && all.indexOf(d) === i);
    if (others.length === 0) {
        r.skip("metadata.same-auth", "The issuer's protected_resources lists no other domain.");
        r.skip("metadata.same-issuer", "The issuer's protected_resources lists no other domain.");
        return;
    }
    const checked = others.slice(0, MAX_OTHER_DOMAINS);
    const different: string[] = [];
    const unread: string[] = [];
    const wrongIssuer: string[] = [];
    const unreadIssuer: string[] = [];
    const exchanges: Exchange[] = [ex];
    for (const domain of checked) {
        const follow = await getFollowing(ctx.http, `https://${domain}/.well-known/poppy.json`, {
            max: 3,
            headers: { Accept: "application/json" },
        });
        const other = follow.final!;
        const doc = other.json as Poppy | undefined;
        if (other.status !== 200 || !isObject(doc) || follow.problem) {
            unread.push(`${domain} (${other.refused ?? other.error ?? other.status})`);
            unreadIssuer.push(domain);
            continue;
        }
        if (String(doc.organization?.domain ?? "").toLowerCase() !== domain) {
            unread.push(
                `${domain} (its document names organization.domain ${JSON.stringify(doc.organization?.domain)})`,
            );
            unreadIssuer.push(domain);
            continue;
        }
        if (r.wants("metadata.same-issuer")) {
            const metadata = await getFollowing(
                ctx.http,
                `https://${domain}/.well-known/oauth-protected-resource`,
                {
                    max: 3,
                    headers: { Accept: "application/json" },
                },
            );
            const resource = metadata.final!;
            const prm = resource.json as ResourceMetadata | undefined;
            exchanges.push(...metadata.chain);
            if (resource.status === 404 && !resource.error && !metadata.problem) {
                wrongIssuer.push(domain);
            } else if (
                resource.status !== 200 ||
                metadata.problem ||
                !isObject(prm) ||
                check("protected-resource-metadata.schema.json", prm).length ||
                typeof prm.resource !== "string" ||
                prm.resource.toLowerCase() !== `https://${domain}`
            ) {
                unreadIssuer.push(domain);
            } else {
                const servers = (prm.authorization_servers ?? []) as string[];
                const chosen = doc.auth?.issuer ?? (servers.length === 1 ? servers[0] : undefined);
                if (
                    chosen === undefined ||
                    chosen !== ctx.discovered.issuer ||
                    !servers.includes(chosen)
                )
                    wrongIssuer.push(domain);
            }
        }
        if (
            !sameJson(doc.auth?.scopes, poppy.auth?.scopes) ||
            !sameJson(doc.auth?.scope_hints, poppy.auth?.scope_hints)
        ) {
            different.push(domain);
            exchanges.push(other);
        }
    }
    const notes = [
        ...(others.length > checked.length
            ? [`Only the first ${MAX_OTHER_DOMAINS} of ${others.length} other domains were read.`]
            : []),
        ...(unread.length
            ? [`These domains' poppy.json couldn't be compared: ${unread.join(", ")}.`]
            : []),
    ];
    if (different.length)
        r.fail("metadata.same-auth", {
            exchange: exchanges,
            got: `auth differs on ${different.join(", ")}`,
            expected: "Matching scope descriptions and hints across Company domains",
            cause: "Matching descriptions and hints are recommended. Domains may expose different scopes or capabilities, but must select the same issuer and preserve scope authorization meanings (3.2).",
            notes,
        });
    else if (unread.length === checked.length)
        r.inconclusive("metadata.same-auth", {
            exchange: ex,
            got: `no other domain's poppy.json could be read: ${unread.join(", ")}`,
            cause: "The validator couldn't compare auth with any other domain that has this issuer.",
        });
    else
        r.pass("metadata.same-auth", {
            summary: `Compared with ${checked.length - unread.length} other domain(s).`,
            notes,
        });
    if (wrongIssuer.length)
        r.fail("metadata.same-issuer", {
            exchange: exchanges,
            got: `different or absent selected issuer on ${wrongIssuer.join(", ")}`,
            expected: `Company domains selecting ${ctx.discovered.issuer}`,
            cause: "Shared Company identity requires each domain to select the same issuer. Matching scope descriptions is only a recommendation; issuer identity is mandatory (3.2).",
        });
    else if (unreadIssuer.length)
        r.inconclusive("metadata.same-issuer", {
            exchange: exchanges,
            cause: `Could not establish the selected issuer on ${unreadIssuer.join(", ")}.`,
        });
    else
        r.pass("metadata.same-issuer", {
            summary: `Compared selected issuers on ${checked.length} other domain(s).`,
            notes,
        });
}

function sameJson(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const ka = Object.keys(a as object);
    const kb = Object.keys(b as object);
    return (
        ka.length === kb.length &&
        ka.every((k) =>
            sameJson((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
        )
    );
}

// Every scope in scopes_supported is described in auth.scopes or in a listed OpenAPI description.
async function checkScopesDescribed(
    ctx: Context,
    r: Recorder,
    supported: unknown[],
): Promise<void> {
    const poppy = ctx.discovered.poppy!;
    const scopes = isObject(poppy.auth) ? poppy.auth.scopes : undefined;
    const described = new Set(
        isObject(scopes)
            ? Object.keys(scopes).filter((k) => typeof scopes[k] === "string" && scopes[k] !== "")
            : [],
    );
    let missing = supported.filter((s): s is string => typeof s === "string" && !described.has(s));
    if (missing.length === 0) {
        r.pass("metadata.scopes-described", {
            summary: "Every scope is described in auth.scopes.",
        });
        return;
    }
    const loaded = await Promise.all(apiUrls(poppy, "openapi").map((url) => loadOpenApi(ctx, url)));
    for (const l of loaded) for (const s of l.scopes ?? []) described.add(s);
    missing = missing.filter((s) => !described.has(s));
    if (missing.length === 0) {
        r.pass("metadata.scopes-described");
    } else if (loaded.some((l) => l.inconclusive || l.unresolved?.length)) {
        const unread = loaded.filter((l) => l.inconclusive || l.unresolved?.length);
        r.inconclusive("metadata.scopes-described", {
            exchange: unread.map((l) => l.exchange),
            got: `no description found for ${missing.join(", ")}`,
            cause: `Not every OpenAPI description could be read (${unread
                .map(
                    (l) =>
                        `${l.url}: ${l.problem ?? `security schemes with $refs the validator couldn't resolve: ${l.unresolved!.join(", ")}`}`,
                )
                .join("; ")}), so the validator couldn't tell whether they describe these scopes.`,
        });
    } else {
        const notStrings = loaded.flatMap((l) =>
            (l.badScopes ?? []).filter((s) => missing.includes(s)).map((s) => `${s} in ${l.url}`),
        );
        const broken = loaded.filter((l) => l.problem).map((l) => `${l.url}: ${l.problem}`);
        r.fail("metadata.scopes-described", {
            exchange: loaded.map((l) => l.exchange),
            got: [
                `no description for ${missing.join(", ")}`,
                notStrings.length
                    ? `descriptions that aren't strings: ${notStrings.join(", ")}`
                    : "",
                broken.length ? `descriptions that couldn't be used: ${broken.join("; ")}` : "",
            ]
                .filter(Boolean)
                .join("; "),
            expected: "a description of every scope in scopes_supported",
            cause: "Personal Agents choose scopes by their descriptions. Describe each scope in the OAuth 2.0 security scheme of an OpenAPI description listed in apis, or in auth.scopes in poppy.json.",
        });
    }
}
