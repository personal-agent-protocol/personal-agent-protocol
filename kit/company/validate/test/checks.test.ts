// Runs the checks end to end against an in-memory Company (fake-company.ts), as it should behave and
// with specific flaws, and checks the results.

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { PROTOCOL_VERSION } from "../catalog.ts";
import { sessionJwt } from "../agent.ts";
import { decodeJwt } from "../jose.ts";
import { TEST_REPORT } from "../checks/feedback.ts";
import { newContext, type CheckResult, type CheckOptions } from "../checks/types.ts";
import { keygen, UsageError } from "../identity.ts";
import { parseMilestones, runChecks } from "../run.ts";
import { check } from "../schemas.ts";
import { fakeHttp, ORIGIN, type Flaws } from "./fake-company.ts";

const cwd = mkdtempSync(join(tmpdir(), "poppy-validator-test-"));
await keygen("https://agent.test", { cwd });

async function run(
    flaws: Flaws = {},
    milestone = "interfaces",
    only?: string[],
    probeOptions: Pick<CheckOptions, "probe" | "probeSession"> = {},
) {
    const http = fakeHttp(join(cwd, ".poppy"), flaws);
    const ctx = newContext(
        http,
        { milestones: parseMilestones(milestone)!, only, ...probeOptions },
        ORIGIN,
    );
    const results = await runChecks(ctx, { cwd });
    const byId = (id: string): CheckResult => {
        const result = results.find((x) => x.id === id);
        assert.ok(result, `no result for ${id}`);
        return result;
    };
    return { results, byId, http, ctx };
}

const signedOutOnly: NonNullable<Flaws["poppy"]> = (doc) => {
    delete doc.auth;
    delete doc.extensions["mediated-sign-in"];
};

for (const metadata of [
    { noResourceMetadata: true },
    { emptyAuthorizationServers: true },
    { omitAuthorizationServers: true },
]) {
    test(`issuerless Sessions work with ${Object.keys(metadata)[0]}`, async () => {
        const { ctx, http, byId, results } = await run({ ...metadata, poppy: signedOutOnly });
        assert.equal(ctx.discovered.issuer, undefined);
        assert.equal(ctx.discovered.audience, ORIGIN);
        assert.equal(byId("session.start").status, "pass");
        assert.equal(byId("session.missing").status, "pass");
        assert.equal(byId("session.aud").status, "pass");
        assert.deepEqual(
            results.filter((r) => r.status === "fail").map((r) => r.id),
            [],
        );
        assert.equal(
            http.log.some((ex) => /\/oauth\/|oauth-authorization-server/.test(ex.url)),
            false,
        );
    });
}

for (const flaw of [
    { resourceMetadataStatus: 500 },
    { malformedAuthorizationServers: true },
    { noIssuerMetadata: true },
    {
        metadata: (doc: Record<string, any>) => {
            doc.issuer = "https://other.test";
        },
    },
]) {
    test(`failed discovery never falls back to the domain: ${Object.keys(flaw)[0]}`, async () => {
        const { ctx, byId, results } = await run({ ...flaw, poppy: signedOutOnly }, "foundation");
        assert.equal(ctx.discovered.audience, undefined);
        assert.equal(byId("session.start").status, "skip");
        assert.ok(results.some((r) => r.status === "fail" && r.id.startsWith("metadata.")));
    });
}

test("a conversation that requires sign-in cannot select the domain fallback", async () => {
    const { ctx, byId } = await run(
        {
            noResourceMetadata: true,
            poppy(doc) {
                signedOutOnly(doc);
                doc.agent.protocols[0].access = "signed_in";
            },
        },
        "foundation",
    );
    assert.equal(byId("metadata.issuer-required").status, "fail");
    assert.equal(ctx.discovered.audience, undefined);
    assert.equal(byId("session.start").status, "skip");
});

test("unknown conversation access hints are ignored", async () => {
    const { ctx, byId } = await run(
        {
            noResourceMetadata: true,
            poppy(doc) {
                signedOutOnly(doc);
                doc.agent.protocols[0].access = "future_hint";
            },
        },
        "foundation",
    );
    assert.equal(byId("discovery.schema").status, "pass");
    assert.equal(ctx.discovered.audience, ORIGIN);
    assert.equal(byId("session.missing").status, "pass");
});

test("the Company identifier scopes the Session audience and pairwise User ID", async () => {
    const { ctx } = await run({ noResourceMetadata: true, poppy: signedOutOnly }, "foundation");
    const original = decodeJwt(await sessionJwt(ctx, "GET", `${ORIGIN}/api`))!.payload;
    const changed = newContext(ctx.http, ctx.options, ORIGIN);
    changed.identity = ctx.identity;
    changed.discovered.audience = "https://login.shop.test";
    const migrated = decodeJwt(await sessionJwt(changed, "GET", `${ORIGIN}/api`))!.payload;
    assert.equal(original.aud, ORIGIN);
    assert.equal(migrated.aud, "https://login.shop.test");
    assert.notEqual(migrated.sub, original.sub);
    assert.notEqual(migrated.sid, original.sid);

    const { ctx: withIssuer } = await run({}, "foundation");
    const unchanged = decodeJwt(await sessionJwt(withIssuer, "GET", `${ORIGIN}/api`))!.payload;
    assert.equal(unchanged.aud, original.aud);
    assert.equal(
        unchanged.sub,
        original.sub,
        "an issuer equal to the old identifier preserves the namespace",
    );
});

test("modern MCP discovery carries per-request metadata without initializing", async () => {
    const { byId, http } = await run({ modernMcp: true, mcpWithoutToken: true }, "interfaces", [
        "mcp.",
    ]);
    assert.equal(byId("mcp.no-token").status, "pass");
    const methods = http.log
        .filter((ex) => ex.url === `${ORIGIN}/mcp`)
        .map((ex) => JSON.parse(ex.requestBody!).method);
    assert.ok(methods.includes("server/discover"));
    assert.ok(!methods.includes("initialize"));
});

for (const flaw of [{ mcpMalformedDiscovery: true }, { mcpUnsupportedVersion: true }]) {
    test(`modern MCP errors cannot masquerade as legacy discovery: ${Object.keys(flaw)[0]}`, async () => {
        const { byId, http } = await run(
            { ...flaw, modernMcp: true, mcpWithoutToken: true },
            "interfaces",
            ["mcp."],
        );
        assert.equal(byId("mcp.no-token").status, "fail");
        assert.ok(
            !http.log.some(
                (ex) =>
                    ex.url === `${ORIGIN}/mcp` &&
                    JSON.parse(ex.requestBody!).method === "initialize",
            ),
        );
    });
}

test("keygen writes the identity, keeps the key private, and won't overwrite it", async () => {
    const dir = join(cwd, ".poppy");
    assert.equal(statSync(join(dir, "private-key.jwk")).mode & 0o777, 0o600);
    const agent = JSON.parse(readFileSync(join(dir, "agent.json"), "utf8"));
    assert.equal(agent.client_id, "https://agent.test/agent.json");
    assert.equal(agent.jwks_uri, "https://agent.test/jwks.json");
    const jwks = JSON.parse(readFileSync(join(dir, "jwks.json"), "utf8"));
    assert.equal(jwks.keys[0].d, undefined, "no private key in jwks.json");
    assert.equal(jwks.keys[1].kty, "RSA");
    assert.equal(jwks.keys[1].d, undefined, "no private RSA key in jwks.json");
    assert.equal(statSync(join(dir, "private-key-rsa.jwk")).mode & 0o777, 0o600);
    await assert.rejects(keygen("https://agent.test", { cwd }), UsageError);
    await assert.rejects(
        keygen("http://agent.test", { cwd: mkdtempSync(join(tmpdir(), "poppy-")) }),
        UsageError,
    );
});

test("a Company that follows the spec passes every check", async () => {
    const { results } = await run();
    const notPassing = results.filter((r) => r.status !== "pass" && r.status !== "skip");
    assert.deepEqual(
        notPassing.map((r) => `${r.id}: ${r.got} ${r.cause}`),
        [],
    );
    assert.ok(results.filter((r) => r.status === "pass").length > 45);
});

test("an alternative that references an API poppy.json doesn't list fails discovery.alternative-references", async () => {
    const { byId } = await run({ unlistedAlternativeApi: true }, "foundation", [
        "discovery.alternative-references",
    ]);
    const result = byId("discovery.alternative-references");
    assert.equal(result.status, "fail");
    assert.match(result.got ?? "", /payments\.test/);
});

test("signed-out requests use resources without any token endpoint call", async () => {
    const { ctx, http, byId } = await run({}, "interfaces", [
        "session.",
        "conversations.",
        "feedback.",
    ]);
    assert.equal(byId("session.start").status, "pass");
    assert.equal(byId("session.continue").status, "pass");
    assert.equal(byId("session.new-key").status, "pass");
    assert.ok(ctx.session.started);
    assert.equal(
        http.log.some((ex) => ex.url === `${ORIGIN}/oauth/token`),
        false,
    );
    for (const ex of http.log.filter((ex) => ex.url.startsWith(`${ORIGIN}/poppy/conversations`)))
        assert.ok(
            !Object.keys(ex.requestHeaders).some((h) => h.toLowerCase() === "authorization"),
            "no Authorization header",
        );
    const feedback = http.log.filter((ex) => ex.url === `${ORIGIN}/poppy/feedback`);
    assert.ok(feedback.some((ex) => "Poppy-Session" in ex.requestHeaders));
});

test("a resource that checks delegations only with EC keys warns on session.delegation-ps384", async () => {
    const { byId } = await run({ rejectPs384Delegation: true }, "foundation", ["session."]);
    assert.equal(byId("session.delegation-ps384").status, "warn");
    assert.equal(byId("session.delegation-ps384").level, "SHOULD");
    assert.ok(!byId("session.delegation-ps384").inconclusive);
    assert.equal(byId("session.start").status, "pass");
});

test("an ES256-only token endpoint warns on PS384 without failing assertion checks", async () => {
    const { byId, results } = await run(
        {
            rejectPs384Assertion: true,
            metadata(doc) {
                doc.token_endpoint_auth_signing_alg_values_supported = ["ES256"];
            },
        },
        "foundation",
        ["assertion."],
    );
    assert.equal(byId("assertion.ps384").status, "warn");
    assert.equal(byId("assertion.ps384").level, "SHOULD");
    assert.ok(!byId("assertion.ps384").inconclusive);
    assert.equal(byId("assertion.signature").status, "pass");
    assert.equal(byId("assertion.aud-endpoint").status, "pass");
    assert.deepEqual(
        results.filter((r) => r.status === "fail"),
        [],
    );
});

test("a resource that ties a Session to its delegated key fails session.new-key", async () => {
    const { byId } = await run({ pinSessionKey: true }, "foundation", ["session."]);
    assert.equal(byId("session.new-key").status, "fail");
    assert.equal(byId("session.continue").status, "pass");
});

test("a resource that rejects a known sid fails session.continue", async () => {
    const { byId } = await run({ rejectKnownSid: true }, "foundation", ["session."]);
    assert.equal(byId("session.start").status, "pass");
    assert.equal(byId("session.continue").status, "fail");
});

test("a Session continued with another User ID fails session.other-user", async () => {
    const { byId } = await run({ ignoreSessionUser: true }, "foundation", ["session."]);
    assert.equal(byId("session.continue").status, "pass");
    assert.equal(byId("session.other-user").status, "fail");
});

for (const [flaw, id] of [
    ["acceptMissingSession", "session.missing"],
    ["acceptOtherTyp", "session.typ"],
    ["acceptUnknownKey", "session.unknown-key"],
    ["acceptMissingDelegation", "session.without-delegation"],
    ["acceptExpiredDelegation", "session.delegation-expired"],
    ["acceptLongDelegation", "session.delegation-lifetime"],
    ["acceptOtherDelegationTyp", "session.delegation-typ"],
    ["acceptOtherDelegationIss", "session.delegation-iss"],
    ["ignoreDelegationKid", "session.delegation-kid"],
    ["acceptOtherAud", "session.aud"],
    ["ignoreHtu", "session.htu"],
    ["acceptAthWithoutToken", "session.ath-without-token"],
] as const) {
    test(`a resource with ${flaw} fails ${id}`, async () => {
        // A Session JWT signed now is also signed after an expired delegation's exp.
        const extra = flaw === "acceptExpiredDelegation" ? { acceptIatAfterDelegation: true } : {};
        const { byId } = await run({ [flaw]: true, ...extra }, "foundation", ["session."]);
        const result = byId(id);
        assert.equal(result.status, "fail");
        assert.equal(byId("session.start").status, "pass");
        assert.match(result.sent!, /^GET https:\/\/shop\.test\/poppy\/conversations/);
        assert.equal(result.expected, '400 {"error": "invalid_session"}');
        assert.doesNotMatch(
            JSON.stringify(result),
            /eyJ[A-Za-z0-9_-]{10,}\./,
            "no whole JWT in output",
        );
    });
}

test("a resource that accepts a Session JWT signed an hour ago warns on session.iat", async () => {
    const { byId } = await run({ acceptOldIat: true }, "foundation", ["session."]);
    assert.equal(byId("session.iat").status, "warn");
});

test("a probed API that serves requests without the Session header skips session.missing", async () => {
    const http = fakeHttp(join(cwd, ".poppy"), { noAgent: true });
    const ctx = newContext(
        http,
        {
            milestones: parseMilestones("foundation")!,
            only: ["session."],
            probe: `${ORIGIN}/api/orders`,
        },
        ORIGIN,
    );
    const results = await runChecks(ctx, { cwd });
    const status = (id: string) => results.find((r) => r.id === id)?.status;
    assert.equal(status("session.start"), "pass");
    assert.equal(status("session.missing"), "skip");
    assert.equal(status("session.typ"), "pass");
    assert.equal(status("session.aud"), "pass");
});

test("Session header errors as 401 invalid_token fail", async () => {
    const { byId } = await run({ sessionErrors401: true }, "foundation", ["session."]);
    assert.equal(byId("session.missing").status, "fail");
    assert.equal(byId("session.typ").status, "fail");
    assert.equal(byId("session.aud").status, "fail");
});

test("a stateless API probe warns on Session verification while token validation remains mandatory", async () => {
    const { byId, results } = await run(
        { statelessApi: true, ignoreAccessToken: true },
        "foundation",
        ["session.", "token.invented"],
        { probe: `${ORIGIN}/api/orders` },
    );
    for (const id of [
        "session.unknown-key",
        "session.aud",
        "session.other-user",
        "session.other-agent",
    ]) {
        assert.equal(byId(id).status, "warn");
        assert.equal(byId(id).level, "SHOULD");
        assert.ok(!byId(id).inconclusive);
    }
    assert.deepEqual(
        results.filter((r) => r.status === "fail").map((r) => r.id),
        ["token.invented"],
    );
    assert.equal(byId("token.invented").level, "MUST");
});

test("a Session-dependent API probe still fails forged Session signatures and changed ownership", async () => {
    const { byId } = await run(
        { apiRequiresSession: true, acceptUnknownKey: true, ignoreSessionUser: true },
        "foundation",
        ["session."],
        { probe: `${ORIGIN}/api/orders`, probeSession: true },
    );
    assert.equal(byId("session.missing").status, "pass");
    for (const id of ["session.unknown-key", "session.other-user"]) {
        assert.equal(byId(id).status, "fail");
        assert.equal(byId(id).level, "MUST");
    }
});

test("an MCP server that answers without a token passes mcp.no-token", async () => {
    const { byId } = await run({ mcpWithoutToken: true }, "interfaces", ["mcp."]);
    assert.equal(byId("mcp.no-token").status, "pass");
});

test("an MCP server whose 401 has no resource_metadata fails mcp.no-token", async () => {
    const { byId } = await run({ mcpNoResourceMetadata: true }, "interfaces", ["mcp."]);
    assert.equal(byId("mcp.no-token").status, "fail");
});

test("the token endpoint checks client assertions", async () => {
    let { byId } = await run({}, "foundation", ["assertion."]);
    assert.equal(byId("assertion.aud-endpoint").status, "pass");
    assert.equal(byId("assertion.jti-reuse").status, "pass");
    ({ byId } = await run({ acceptEndpointAud: true }, "foundation", ["assertion."]));
    assert.equal(byId("assertion.aud-endpoint").status, "fail");
    ({ byId } = await run({ acceptReusedJti: true }, "foundation", ["assertion."]));
    assert.equal(byId("assertion.jti-reuse").status, "warn");
});

test("MCP needs a token, ignores the Session header, and lists the issuer", async () => {
    const { byId, http } = await run({}, "interfaces", ["mcp."]);
    assert.equal(byId("mcp.no-token").status, "pass");
    assert.equal(byId("mcp.metadata").status, "pass");
    assert.equal(byId("mcp.authorization-servers").status, "pass");
    const mcp = http.log.filter((ex) => ex.url === `${ORIGIN}/mcp`);
    assert.ok(mcp.length > 0);
    for (const ex of mcp)
        assert.ok(!Object.keys(ex.requestHeaders).some((h) => h.toLowerCase() === "poppy-session"));
});

test("the fake Company's metadata passes the metadata checks", async () => {
    const { results } = await run({}, "foundation", ["metadata."]);
    assert.deepEqual(
        results.filter((r) => r.status !== "pass" && r.status !== "skip").map((r) => r.id),
        [],
    );
});

test("no protected resource metadata fails metadata.issuer-required", async () => {
    const { byId } = await run({ noResourceMetadata: true }, "foundation", [
        "metadata.",
        "session.",
    ]);
    assert.equal(byId("metadata.issuer-required").status, "fail");
    assert.equal(byId("metadata.token-endpoint").status, "skip");
    assert.equal(byId("session.start").status, "skip");
});

test("a resource with a trailing slash fails metadata.resource-metadata", async () => {
    const { byId } = await run({ resourceWithSlash: true }, "foundation", ["metadata."]);
    assert.equal(byId("metadata.resource-metadata").status, "fail");
});

test("several authorization servers need auth.issuer", async () => {
    let { byId } = await run({ twoAuthorizationServers: true }, "foundation", ["metadata."]);
    assert.equal(byId("metadata.issuer-chosen").status, "fail");
    ({ byId } = await run({ twoAuthorizationServers: true, authIssuer: ORIGIN }, "foundation", [
        "metadata.",
    ]));
    assert.equal(byId("metadata.issuer-chosen").status, "pass");
    assert.equal(byId("metadata.issuer-matches").status, "pass");
});

test("auth.issuer that isn't the only authorization server fails metadata.issuer-chosen", async () => {
    const { byId } = await run({ authIssuer: "https://staff.shop.test" }, "foundation", [
        "metadata.",
    ]);
    assert.equal(byId("metadata.issuer-chosen").status, "fail");
});

test("a feedback endpoint that takes unattributed reports warns on feedback.no-session", async () => {
    const { byId } = await run({ feedbackWithoutSession: true }, "interfaces", ["feedback."]);
    assert.equal(byId("feedback.no-session").status, "warn");
    assert.equal(byId("feedback.no-session").level, "SHOULD");
    assert.equal(byId("feedback.accepted").status, "pass");
});

test("the browser-session page and its code pass the web checks", async () => {
    const { byId } = await run({}, "interfaces", ["web."]);
    for (const id of [
        "web.page-headers",
        "web.page-headers-suggested",
        "web.join-cookie",
        "web.join-cookie-suggested",
        "web.authorize",
        "web.authorize-reused",
        "web.authorize-unknown",
        "web.form-without-cookie",
    ])
        assert.equal(byId(id).status, "pass", id);
});

for (const [flaw, id] of [
    ["webNoHeaders", "web.page-headers"],
    ["webCookieSameSiteNone", "web.join-cookie"],
    ["webReauthorize", "web.authorize-reused"],
    ["webAuthorizeUnknownCode", "web.authorize-unknown"],
    ["webFormWithoutCookie", "web.form-without-cookie"],
] as const) {
    test(`a browser-session endpoint with ${flaw} fails ${id}`, async () => {
        const { byId } = await run({ [flaw]: true }, "interfaces", ["web."]);
        assert.equal(byId(id).status, "fail");
        assert.equal(byId("web.authorize").status, "pass");
    });
}

test("a host-only join cookie without the __Host- prefix warns", async () => {
    const { byId } = await run({ webCookieWithoutHostPrefix: true }, "interfaces", ["web."]);
    assert.equal(byId("web.join-cookie").status, "warn");
    assert.equal(byId("web.join-cookie-suggested").status, "warn");
});

test("a join cookie set before another cookie passes web.join-cookie", async () => {
    const { byId } = await run({ webExtraCookie: true }, "interfaces", ["web."]);
    assert.equal(byId("web.join-cookie").status, "pass");
    assert.equal(byId("web.join-cookie-suggested").status, "pass");
});

test("the test feedback report matches the report schema", () => {
    assert.deepEqual(check("feedback-report.schema.json", TEST_REPORT), []);
});

test("another User reading a conversation fails conversations.other-user", async () => {
    const { byId } = await run({ ignoreConversationOwner: true }, "interfaces", ["conversations."]);
    assert.equal(byId("conversations.other-user").status, "fail");
    assert.equal(byId("conversations.start").status, "pass");
});

test("an error code with the wrong status fails", async () => {
    const { byId } = await run({ conflictStatus400: true }, "interfaces", ["conversations."]);
    assert.equal(byId("conversations.message-id-conflict").status, "fail");
});

test("a retried first message that starts a new conversation fails", async () => {
    const { byId } = await run({ retryCreatesNewConversation: true }, "interfaces", [
        "conversations.",
    ]);
    assert.equal(byId("conversations.retry-same-id").status, "fail");
    assert.equal(byId("conversations.close").status, "pass", "the conversation is still closed");
});

test("every scope described, in OpenAPI or auth.scopes, passes metadata.scopes-described", async () => {
    for (const flaws of [{}, { scopesInPoppy: true }]) {
        const { byId } = await run(flaws, "foundation", ["metadata."]);
        assert.equal(byId("metadata.scopes-described").status, "pass");
    }
});

test("a scope in scopes_supported with no description warns on metadata.scopes-described", async () => {
    const { byId } = await run({ undescribedScope: true }, "foundation", ["metadata."]);
    const r = byId("metadata.scopes-described");
    assert.equal(r.status, "warn");
    assert.equal(r.level, "SHOULD");
    assert.match(r.got ?? "", /addresses/);
    assert.doesNotMatch(r.got ?? "", /orders:read/);
});

for (const incomplete of [false, true]) {
    test(`${incomplete ? "incomplete" : "absent"} scope metadata warns without blocking Sessions`, async () => {
        const { byId, results } = await run(
            {
                metadata(doc) {
                    if (incomplete) doc.scopes_supported = ["orders:write"];
                    else delete doc.scopes_supported;
                },
            },
            "foundation",
            ["metadata.", "session.start"],
        );
        assert.equal(byId("metadata.scopes-supported").status, "warn");
        assert.equal(byId("metadata.scopes-supported").level, "SHOULD");
        assert.equal(byId("metadata.schema").status, "pass");
        assert.equal(byId("session.start").status, "pass");
        assert.deepEqual(
            results.filter((r) => r.status === "fail"),
            [],
        );
    });
}

test("different domain hints warn while a different selected issuer fails", async () => {
    const { byId } = await run({ otherDomainAuth: true }, "foundation", ["metadata."]);
    assert.equal(byId("metadata.same-auth").status, "warn");
    assert.equal(byId("metadata.same-auth").level, "SHOULD");
    assert.equal(byId("metadata.same-issuer").status, "pass");
    for (const issuer of [{ otherDomainIssuer: true }, { otherDomainIssuerless: true }]) {
        const { byId: different } = await run(issuer, "foundation", ["metadata."]);
        assert.equal(different("metadata.same-issuer").status, "fail");
        assert.equal(different("metadata.same-issuer").level, "MUST");
    }
});

test("an explicit versus implicit selection of the same issuer needs no identical auth object", async () => {
    const { byId } = await run({ otherDomainExplicitIssuer: true }, "foundation", ["metadata."]);
    assert.equal(byId("metadata.same-issuer").status, "pass");
    assert.equal(byId("metadata.same-auth").status, "pass");
});

test("organization.domain that doesn't match the host fails discovery and skips metadata", async () => {
    const { byId } = await run({ domain: "other.test" }, "foundation", ["discovery.", "metadata."]);
    assert.equal(byId("discovery.domain-matches-host").status, "fail");
    // The issuer would be found from https://other.test, which doesn't answer.
    assert.equal(byId("metadata.issuer-required").status, "skip");
    assert.equal(byId("metadata.protected-resources").status, "skip");
});

test("a redirect to plain HTTP fails", async () => {
    const http = fakeHttp(join(cwd, ".poppy"), { httpRedirect: true });
    const ctx = newContext(
        http,
        { milestones: parseMilestones("foundation")!, only: ["discovery."] },
        "https://www.shop.test",
    );
    const results = await runChecks(ctx, { cwd });
    assert.equal(results.find((r) => r.id === "discovery.redirects-https")?.status, "fail");
});

test("a redirect that ends outside the well-known path fails", async () => {
    const http = fakeHttp(join(cwd, ".poppy"), { redirectToUpload: true });
    const ctx = newContext(
        http,
        { milestones: parseMilestones("foundation")!, only: ["discovery."] },
        "https://www.shop.test",
    );
    const results = await runChecks(ctx, { cwd });
    assert.equal(results.find((r) => r.id === "discovery.redirects-well-known")?.status, "fail");
    assert.equal(results.find((r) => r.id === "discovery.schema")?.status, "skip");
});

test("without an identity, checks that need one are skipped with one note", async () => {
    const empty = mkdtempSync(join(tmpdir(), "poppy-empty-"));
    const http = fakeHttp(join(cwd, ".poppy"));
    const ctx = newContext(http, { milestones: parseMilestones("foundation")! }, ORIGIN);
    const results = await runChecks(ctx, { cwd: empty });
    assert.equal(results.find((r) => r.id === "session.start")?.status, "skip");
    assert.equal(results.find((r) => r.id === "discovery.schema")?.status, "pass");
    assert.equal(ctx.notes.length, 1);
    assert.match(ctx.notes[0], /keygen/);
});

test("only safe requests: GETs, token requests, conversation requests, feedback reports, and browser-session codes", async () => {
    const { http } = await run();
    for (const ex of http.log) {
        const path = new URL(ex.url).pathname;
        const ok =
            ex.method === "GET" ||
            path === "/oauth/token" ||
            path.startsWith("/poppy/conversations") ||
            path === "/poppy/feedback" ||
            path === "/poppy/browser-session" ||
            path === "/poppy/browser-session/authorize" ||
            path === "/mcp";
        assert.ok(ok, `${ex.method} ${ex.url}`);
    }
});
