// `survey`: read-only. Fetches the well-known documents a domain already publishes and reports what
// they say, as a starting point for plan/survey.md. Sends only GET requests.

import { MILESTONES } from "./catalog.ts";
import {
    checkMetadata,
    checkPoppyOnline,
    metadataUrlFor,
    targetOrigin,
} from "./checks/discovery.ts";
import { protectedResourceMetadataUrl } from "./checks/mcp.ts";
import { loadOpenApi } from "./checks/openapi.ts";
import {
    newContext,
    offersGrant,
    recorder,
    SIGN_IN_GRANTS,
    type Metadata,
    type Poppy,
} from "./checks/types.ts";
import { getFollowing, type Http } from "./http.ts";

export type SurveyReport = {
    target: string;
    poppy: {
        url: string;
        found: boolean;
        finalUrl?: string;
        status?: number | string;
        document?: Poppy;
    };
    authorizationServer?: {
        url: string;
        found: boolean;
        status?: number | string;
        fields?: Record<string, unknown>;
    };
    domainMetadata: { url: string; found: boolean; status?: number | string; issuer?: unknown }[];
    openidConfiguration: {
        url: string;
        found: boolean;
        status?: number | string;
        issuer?: unknown;
    }[];
    mcp: {
        url: string;
        metadataUrl: string;
        found: boolean;
        status?: number | string;
        authorizationServers?: unknown;
        resource?: unknown;
    }[];
    openapi: {
        url: string;
        loaded: boolean;
        version?: string;
        title?: string;
        paths?: number;
        problem?: string;
    }[];
    problems: { id: string; status: string; got?: string; cause?: string; reason?: string }[];
};

const INTERESTING = [
    "issuer",
    "token_endpoint",
    "revocation_endpoint",
    "authorization_endpoint",
    "device_authorization_endpoint",
    "protected_resources",
    "grant_types_supported",
    "token_endpoint_auth_methods_supported",
    "token_endpoint_auth_signing_alg_values_supported",
    "dpop_signing_alg_values_supported",
    "code_challenge_methods_supported",
    "scopes_supported",
    "authorization_response_iss_parameter_supported",
];

async function getJson(http: Http, url: string) {
    const follow = await getFollowing(http, url, {
        max: 3,
        headers: { Accept: "application/json" },
    });
    const ex = follow.final!;
    const json =
        ex.json && typeof ex.json === "object" && !Array.isArray(ex.json)
            ? (ex.json as Record<string, unknown>)
            : undefined;
    return {
        found: ex.status === 200 && json !== undefined,
        status: ex.error ?? ex.status,
        json,
        finalUrl: ex.url,
    };
}

export async function survey(http: Http, target: string): Promise<SurveyReport> {
    const origin = targetOrigin(target);
    const ctx = newContext(
        http,
        { milestones: new Set(MILESTONES.map((m) => m.id)), only: ["discovery.", "metadata."] },
        origin,
    );
    const r = recorder(ctx);
    await checkPoppyOnline(ctx, r);
    await checkMetadata(ctx, r);
    const poppy = ctx.discovered.poppy;
    const report: SurveyReport = {
        target: origin,
        poppy: {
            url: `${origin}/.well-known/poppy.json`,
            found: poppy !== undefined,
            finalUrl: ctx.discovered.poppyUrl,
            document: poppy,
        },
        domainMetadata: [],
        openidConfiguration: [],
        mcp: [],
        openapi: [],
        problems: r.results
            .filter((x) => x.status === "fail" || x.status === "warn")
            .map((x) => ({ id: x.id, status: x.status, got: x.got, cause: x.cause })),
    };

    const issuer = poppy?.auth?.issuer;
    if (typeof issuer === "string" && issuer.startsWith("https://")) {
        const url = metadataUrlFor(issuer);
        const meta = ctx.discovered.metadata;
        report.authorizationServer = {
            url,
            found: meta !== undefined,
            fields: meta
                ? Object.fromEntries(INTERESTING.filter((k) => k in meta).map((k) => [k, meta[k]]))
                : undefined,
        };
    }

    // What the domain and issuer already publish, whether or not poppy.json exists.
    const origins = new Set([
        origin,
        ...(ctx.discovered.poppyUrl ? [new URL(ctx.discovered.poppyUrl).origin] : []),
    ]);
    for (const o of origins) {
        const asm = await getJson(http, `${o}/.well-known/oauth-authorization-server`);
        report.domainMetadata.push({
            url: `${o}/.well-known/oauth-authorization-server`,
            found: asm.found,
            status: asm.status,
            issuer: asm.json?.issuer,
        });
    }
    const oidcUrls = new Set([
        ...[...origins].map((o) => `${o}/.well-known/openid-configuration`),
        ...(issuer ? [`${issuer.replace(/\/+$/, "")}/.well-known/openid-configuration`] : []),
    ]);
    for (const url of oidcUrls) {
        const oidc = await getJson(http, url);
        report.openidConfiguration.push({
            url,
            found: oidc.found,
            status: oidc.status,
            issuer: oidc.json?.issuer,
        });
    }

    for (const api of poppy?.apis ?? []) {
        if (typeof api?.url !== "string" || !api.url.startsWith("https://")) continue;
        if (api.type === "mcp") {
            const metadataUrl = protectedResourceMetadataUrl(api.url);
            const prm = await getJson(http, metadataUrl);
            report.mcp.push({
                url: api.url,
                metadataUrl,
                found: prm.found,
                status: prm.status,
                authorizationServers: prm.json?.authorization_servers,
                resource: prm.json?.resource,
            });
        } else if (api.type === "openapi") {
            const info = await loadOpenApi(ctx, api.url);
            report.openapi.push({
                url: api.url,
                loaded: !info.problem,
                version: info.version,
                title: info.title,
                paths: info.paths,
                problem: info.problem,
            });
        }
    }
    return report;
}

export function formatSurvey(s: SurveyReport): string {
    const out: string[] = [`Survey of ${s.target} (read-only: GET requests only)`, ""];
    const p = s.poppy.document;
    if (!s.poppy.found) {
        out.push(`poppy.json: not found at ${s.poppy.url}`);
    } else {
        out.push(
            `poppy.json: ${s.poppy.finalUrl}${s.poppy.finalUrl !== s.poppy.url ? ` (redirected from ${s.poppy.url})` : ""}`,
        );
        out.push(`  protocol_version  ${p?.protocol_version}`);
        out.push(`  organization      ${p?.organization?.name} (${p?.organization?.domain})`);
        if (p?.auth) {
            out.push(`  auth.issuer       ${p.auth.issuer}`);
            const meta = s.authorizationServer?.fields as Metadata | undefined;
            const direct = offersGrant(meta, SIGN_IN_GRANTS.direct);
            const device = offersGrant(meta, SIGN_IN_GRANTS.device);
            if (direct)
                out.push("  sign-in direct    authorization_code in the OAuth server metadata");
            if (device) out.push("  sign-in device    device_code in the OAuth server metadata");
            if (p.auth.mediated)
                out.push(
                    `  sign-in mediated  scopes ${JSON.stringify(p.auth.mediated.scopes)}, endpoint ${p.auth.mediated.endpoint}`,
                );
            if (!direct && !device && !p.auth.mediated)
                out.push("  sign-in           none (signed-out Sessions only)");
            if (p.auth.scopes)
                out.push(`  scopes            ${Object.keys(p.auth.scopes).join(", ")}`);
        } else out.push("  auth              none");
        for (const proto of p?.agent?.protocols ?? [])
            out.push(
                `  conversations     ${proto.type} ${proto.endpoint}${proto.resource ? ` (resource ${proto.resource})` : ""}`,
            );
        if (p?.web)
            out.push(
                `  web               ${p.web.browser_session_endpoint ? `browser_session_endpoint ${p.web.browser_session_endpoint}` : "listed, no browser_session_endpoint"}`,
            );
        for (const api of p?.apis ?? [])
            out.push(
                `  api               ${api.type} ${api.url}${api.description ? ` — ${api.description}` : ""}`,
            );
        if (p?.feedback) out.push(`  feedback          ${p.feedback.endpoint}`);
        if (p?.excluded_tasks) out.push(`  excluded_tasks    ${p.excluded_tasks.url}`);
        if (p?.extensions)
            out.push(
                `  extensions        ${Object.entries(p.extensions)
                    .map(([k, v]) => `${k} v${v?.version}`)
                    .join(", ")}`,
            );
    }
    if (s.authorizationServer) {
        out.push(
            "",
            `OAuth server metadata (RFC 8414): ${s.authorizationServer.found ? s.authorizationServer.url : `not found at ${s.authorizationServer.url}`}`,
        );
        for (const [k, v] of Object.entries(s.authorizationServer.fields ?? {}))
            out.push(`  ${k.padEnd(48)} ${JSON.stringify(v)}`);
    }
    out.push("", "Other well-known documents:");
    for (const d of [...s.domainMetadata, ...s.openidConfiguration]) {
        out.push(
            `  ${d.url}  ${d.found ? `found${d.issuer ? `, issuer ${d.issuer}` : ""}` : `not found (${d.status})`}`,
        );
    }
    for (const m of s.mcp) {
        out.push(
            `  MCP ${m.url}: metadata ${m.found ? `at ${m.metadataUrl}, authorization_servers ${JSON.stringify(m.authorizationServers)}` : `not found at ${m.metadataUrl} (${m.status}); check also reads WWW-Authenticate`}`,
        );
    }
    for (const o of s.openapi) {
        out.push(
            `  OpenAPI ${o.url}: ${o.loaded ? `${o.version ?? "no version"}, "${o.title ?? "untitled"}"${o.paths !== undefined ? `, ${o.paths} paths` : ""}` : o.problem}`,
        );
    }
    out.push(
        "",
        s.problems.length
            ? "Problems found:"
            : "No problems found in poppy.json or the OAuth server metadata.",
    );
    for (const pr of s.problems) {
        out.push(`  ${pr.status === "fail" ? "✗" : "!"} ${pr.id}: ${pr.got ?? ""}`);
        if (pr.cause) out.push(`      ${pr.cause}`);
    }
    out.push(
        "",
        "Run `check` for the full requirement, the request, and the fix for each problem.",
    );
    return out.join("\n");
}
