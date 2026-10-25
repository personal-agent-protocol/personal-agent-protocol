// Milestone 1: poppy.json (spec section 3) and the issuer's OAuth server metadata (3.2).

import { PROTOCOL_VERSION } from "../catalog.ts";
import { getFollowing, isJsonContentType, type Exchange } from "../http.ts";
import { formatSchemaErrors } from "../schema.ts";
import { check } from "../schemas.ts";
import { loadOpenApi } from "./openapi.ts";
import {
    describeGot,
    describeSent,
    skipRest,
    type Context,
    offersGrant,
    SIGN_IN_GRANTS,
    type Metadata,
    type Poppy,
    type Recorder,
} from "./types.ts";

export const DISCOVERY_IDS = [
    "discovery.https",
    "discovery.redirects-https",
    "discovery.redirects-well-known",
    "discovery.json",
    "discovery.schema",
    "discovery.protocol-version",
    "discovery.domain-matches-host",
    "discovery.auth-present",
    "discovery.interface-present",
    "discovery.api-types",
];

export const METADATA_IDS = [
    "metadata.published",
    "metadata.schema",
    "metadata.issuer-matches",
    "metadata.protected-resources",
    "metadata.token-endpoint",
    "metadata.revocation-endpoint",
    "metadata.dpop-algs",
    "metadata.grant-types",
    "metadata.authorization-endpoint",
    "metadata.device-authorization-endpoint",
    "metadata.scopes-supported",
    "metadata.scopes-described",
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
        skipRest(
            r,
            DISCOVERY_IDS,
            "poppy.json couldn't be loaded over HTTPS (see discovery.redirects-https).",
        );
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
            expected: `200 with poppy.json at ${url}`,
            cause: `The request failed before a response (${ex.error}). Check that ${new URL(ex.url).host} resolves, serves HTTPS with a valid certificate, and is reachable from the internet.`,
        });
        skipRest(r, DISCOVERY_IDS, "poppy.json couldn't be loaded (see discovery.https).");
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
        skipRest(r, DISCOVERY_IDS, "poppy.json couldn't be loaded (see discovery.https).");
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
        skipRest(
            r,
            DISCOVERY_IDS,
            "Personal Agents won't use this poppy.json (see discovery.redirects-well-known).",
        );
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
        skipRest(r, DISCOVERY_IDS, "poppy.json isn't a JSON object (see discovery.json).");
        return;
    }
    r.pass("discovery.json", { notes });
    const poppy = doc as Poppy;
    ctx.discovered.poppy = poppy;

    // Schema errors, leaving out the two rules that have their own checks below.
    const errors = check("poppy.schema.json", poppy).filter(
        (e) =>
            !(e.path === "" && e.message.startsWith("must include at least one of")) &&
            !(e.path === "/auth" && e.message === "is required"),
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
    } else if (version !== PROTOCOL_VERSION) {
        r.fail("discovery.protocol-version", {
            exchange: ex,
            got: `protocol_version ${version}`,
            expected: `protocol_version ${PROTOCOL_VERSION}`,
            cause: `Before 1.0, each version can break the one before, so Personal Agents that support only draft ${PROTOCOL_VERSION} won't use this document. This validator checks draft ${PROTOCOL_VERSION}: set protocol_version to "${PROTOCOL_VERSION}" once the implementation follows it. See https://personalagentprotocol.org/docs/changelog for what changed.`,
        });
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
    } else {
        r.pass("discovery.domain-matches-host", {
            summary: `organization.domain ${domain} matches the host.`,
        });
    }

    const needsAuth =
        poppy.agent !== undefined ||
        poppy.apis !== undefined ||
        poppy.feedback !== undefined ||
        poppy.web?.browser_session_endpoint !== undefined;
    if (needsAuth && poppy.auth === undefined) {
        const present = [
            poppy.agent !== undefined ? "agent" : "",
            poppy.apis !== undefined ? "apis" : "",
            poppy.feedback !== undefined ? "feedback" : "",
            poppy.web?.browser_session_endpoint !== undefined ? "web.browser_session_endpoint" : "",
        ].filter(Boolean);
        r.fail("discovery.auth-present", {
            exchange: ex,
            got: `${present.join(", ")} present, but no auth`,
            expected: "auth with an issuer",
            cause: "Sessions need auth.issuer: Session Tokens for the Company Agent, APIs, feedback, and browser sessions come from the issuer's token endpoint. Add auth, or remove the entries that need it.",
        });
    } else {
        r.pass("discovery.auth-present", {
            summary: needsAuth ? "auth is present." : "Nothing requires auth.",
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

    const apis = Array.isArray(poppy.apis) ? poppy.apis : [];
    const badTypes = apis
        .map((api, i) => ({ i, type: api?.type }))
        .filter((a) => a.type !== "openapi" && a.type !== "mcp");
    if (badTypes.length) {
        r.fail("discovery.api-types", {
            exchange: ex,
            got: badTypes.map((a) => `apis[${a.i}].type ${JSON.stringify(a.type)}`).join(", "),
            expected: 'Each type "openapi" or "mcp"',
            cause: "Section 6 defines only openapi and mcp. Personal Agents skip other types, so they can't use these entries.",
        });
    } else {
        r.pass("discovery.api-types", { summary: apis.length ? undefined : "No APIs listed." });
    }
}

// Fetches and checks the issuer's RFC 8414 metadata, filling ctx.discovered.metadata.
export async function checkMetadata(ctx: Context, r: Recorder): Promise<void> {
    const poppy = ctx.discovered.poppy;
    const issuer = poppy?.auth?.issuer;
    if (!poppy) {
        skipRest(r, METADATA_IDS, "poppy.json wasn't loaded.");
        return;
    }
    if (poppy.auth === undefined) {
        skipRest(r, METADATA_IDS, "poppy.json has no auth, so there's no OAuth server to check.");
        return;
    }
    if (typeof issuer !== "string" || !issuer.startsWith("https://")) {
        skipRest(r, METADATA_IDS, "auth.issuer isn't an HTTPS URL (see discovery.schema).");
        return;
    }
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
        skipRest(
            r,
            METADATA_IDS,
            "The OAuth server metadata couldn't be loaded (see metadata.published).",
        );
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
            expected: `issuer "${issuer}", exactly as auth.issuer in poppy.json`,
            cause: slash
                ? "They differ only by a trailing slash, but the comparison is exact. Use the same string in both places."
                : "poppy.json and the metadata name different issuers. Personal Agents stop here, because any domain could otherwise claim this issuer. Make auth.issuer the issuer your OAuth server reports.",
        });
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
            cause: `Add "${resource}" to protected_resources. It must list https://{domain} for every domain whose poppy.json names this issuer, exactly as organization.domain says, with no path or trailing slash (case doesn't matter, www. does).`,
        });
    } else {
        r.pass("metadata.protected-resources");
    }

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
                        ? "Personal Agents sign out by revoking Account Tokens here (RFC 7009). Add the endpoint, even before you offer sign-in."
                        : "Personal Agents start Sessions at the token endpoint. Add it to the metadata.",
            });
        }
    }

    const algs = json.dpop_signing_alg_values_supported;
    if (algs === undefined) {
        r.pass("metadata.dpop-algs", {
            summary: "No dpop_signing_alg_values_supported, so Personal Agents sign with ES256.",
        });
    } else if (!Array.isArray(algs) || !algs.includes("ES256")) {
        r.fail("metadata.dpop-algs", {
            exchange: ex,
            got: JSON.stringify(algs),
            expected: "a list that includes ES256",
            cause: "Every Company must accept ES256, so every Personal Agent has an algorithm that works everywhere.",
        });
    } else r.pass("metadata.dpop-algs");

    const grants = json.grant_types_supported;
    const missingGrants = Array.isArray(grants)
        ? ["urn:ietf:params:oauth:grant-type:jwt-bearer", "refresh_token"].filter(
              (g) => !grants.includes(g),
          )
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
            expected:
                "grant_types_supported including urn:ietf:params:oauth:grant-type:jwt-bearer and refresh_token",
            cause: missingGrants
                ? `Add ${missingGrants.join(" and ")}. Personal Agents start Sessions with the JWT bearer grant and use Account Tokens with the refresh token grant.`
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

    const mediated = poppy.auth?.mediated?.scopes;
    const signsIn =
        offersGrant(json, SIGN_IN_GRANTS.direct) ||
        offersGrant(json, SIGN_IN_GRANTS.device) ||
        poppy.auth?.mediated !== undefined;
    const supported = json.scopes_supported;
    if (!signsIn) {
        r.skip("metadata.scopes-supported", "The Company offers no type of sign-in.");
    } else if (!Array.isArray(supported) || supported.length === 0) {
        r.fail("metadata.scopes-supported", {
            exchange: ex,
            got:
                supported === undefined
                    ? "no scopes_supported"
                    : `scopes_supported ${JSON.stringify(supported)}`,
            expected: "scopes_supported, listing every scope a Personal Agent can request",
            cause: "Personal Agents request only scopes from scopes_supported.",
        });
    } else {
        const missing = Array.isArray(mediated)
            ? mediated.filter((scope) => !supported.includes(scope))
            : [];
        if (missing.length) {
            r.fail("metadata.scopes-supported", {
                exchange: ex,
                got: `scopes_supported ${JSON.stringify(supported)}`,
                expected: `scopes_supported including ${missing.join(", ")}`,
                cause: "auth.mediated.scopes lists scopes that scopes_supported doesn't. Add them, so Personal Agents can request them.",
            });
        } else r.pass("metadata.scopes-supported");
        await checkScopesDescribed(ctx, r, supported);
    }
}

// Every scope in scopes_supported is described in auth.scopes or in a listed OpenAPI description.
async function checkScopesDescribed(
    ctx: Context,
    r: Recorder,
    supported: unknown[],
): Promise<void> {
    const poppy = ctx.discovered.poppy!;
    const described = new Set(Object.keys(poppy.auth?.scopes ?? {}));
    let missing = supported.filter((s): s is string => typeof s === "string" && !described.has(s));
    if (missing.length === 0) {
        r.pass("metadata.scopes-described", {
            summary: "Every scope is described in auth.scopes.",
        });
        return;
    }
    const apis = (poppy.apis ?? []).filter(
        (a) => a?.type === "openapi" && typeof a.url === "string",
    );
    const loaded = await Promise.all(apis.map((a) => loadOpenApi(ctx, a.url!)));
    for (const l of loaded) for (const s of l.scopes ?? []) described.add(s);
    missing = missing.filter((s) => !described.has(s));
    if (missing.length === 0) {
        r.pass("metadata.scopes-described");
    } else if (loaded.some((l) => !l.problem && l.scopes === undefined)) {
        r.skip(
            "metadata.scopes-described",
            `${missing.join(", ")} isn't in auth.scopes, and the validator can't read scopes from a YAML OpenAPI description. Check by hand.`,
        );
    } else {
        r.fail("metadata.scopes-described", {
            exchange: loaded.map((l) => l.exchange),
            got: `no description for ${missing.join(", ")}`,
            expected: "a description of every scope in scopes_supported",
            cause: "Personal Agents choose scopes by their descriptions. Describe each scope in the OAuth 2.0 security scheme of an OpenAPI description listed in apis, or in auth.scopes in poppy.json.",
        });
    }
}
