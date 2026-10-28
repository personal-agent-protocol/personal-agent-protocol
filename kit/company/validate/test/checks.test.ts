// Runs the checks end to end against an in-memory Company (fake-company.ts), as it should behave and
// with specific flaws, and checks the results.

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { PROTOCOL_VERSION } from "../catalog.ts";
import { TEST_REPORT } from "../checks/feedback.ts";
import { newContext, type CheckResult } from "../checks/types.ts";
import { keygen, UsageError } from "../identity.ts";
import { parseMilestones, runChecks } from "../run.ts";
import { check } from "../schemas.ts";
import { fakeHttp, ORIGIN, type Flaws } from "./fake-company.ts";

const cwd = mkdtempSync(join(tmpdir(), "poppy-validator-test-"));
await keygen("https://agent.test", { cwd });

async function run(flaws: Flaws = {}, milestone = "interfaces", only?: string[]) {
    const http = fakeHttp(join(cwd, ".poppy"), flaws);
    const ctx = newContext(http, { milestones: parseMilestones(milestone)!, only }, ORIGIN);
    const results = await runChecks(ctx, { cwd });
    const byId = (id: string): CheckResult => {
        const result = results.find((x) => x.id === id);
        assert.ok(result, `no result for ${id}`);
        return result;
    };
    return { results, byId, http, ctx };
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

test("a resource that checks delegations only with EC keys fails session.delegation-ps384", async () => {
    const { byId } = await run({ rejectPs384Delegation: true }, "foundation", ["session."]);
    assert.equal(byId("session.delegation-ps384").status, "fail");
    assert.equal(byId("session.start").status, "pass");
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

test("a feedback endpoint that takes reports without the Session header fails feedback.no-session", async () => {
    const { byId } = await run({ feedbackWithoutSession: true }, "interfaces", ["feedback."]);
    assert.equal(byId("feedback.no-session").status, "fail");
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

test("a scope in scopes_supported with no description fails metadata.scopes-described", async () => {
    const { byId } = await run({ undescribedScope: true }, "foundation", ["metadata."]);
    const r = byId("metadata.scopes-described");
    assert.equal(r.status, "fail");
    assert.match(r.got ?? "", /addresses/);
    assert.doesNotMatch(r.got ?? "", /orders:read/);
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
