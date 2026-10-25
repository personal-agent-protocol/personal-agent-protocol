// Runs the checks end to end against an in-memory Company (fake-company.ts), as it should behave and
// with specific flaws, and checks the results.

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { PROTOCOL_VERSION } from "../catalog.ts";
import { newContext, type CheckResult } from "../checks/types.ts";
import { createHttp } from "../http.ts";
import { keygen, UsageError } from "../identity.ts";
import { parseMilestones, runChecks } from "../run.ts";
import { fakeCompany, ORIGIN, type Flaws } from "./fake-company.ts";

const cwd = mkdtempSync(join(tmpdir(), "poppy-validator-test-"));
await keygen("https://agent.test", { cwd });

async function run(flaws: Flaws = {}, milestone = "interfaces", only?: string[]) {
    const http = createHttp({ fetch: fakeCompany(join(cwd, ".poppy"), flaws) });
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
    assert.ok(results.filter((r) => r.status === "pass").length > 60);
});

test("a token endpoint that accepts a replayed DPoP proof fails dpop.token-replay with full feedback", async () => {
    const { byId } = await run({ acceptReplayedTokenProof: true }, "foundation", [
        "dpop.token-replay",
    ]);
    const r = byId("dpop.token-replay");
    assert.equal(r.status, "fail");
    assert.equal(r.level, "MUST");
    assert.equal(r.got, "200, a new Session Token");
    assert.equal(r.expected, "400 invalid_dpop_proof");
    assert.match(
        r.sent!,
        /^POST https:\/\/shop\.test\/oauth\/token, with the DPoP proof from the previous request again/,
    );
    assert.match(r.cause!, /replay cache/);
    assert.equal(
        r.quote,
        "At the token endpoint, the Company MUST reject a proof whose jti it has already accepted within the acceptance window",
    );
    assert.equal(
        r.specUrl,
        `https://personalagentprotocol.org/docs/${PROTOCOL_VERSION}/spec#sending-tokens`,
    );
    assert.match(r.disagreeUrl, /template=1-feedback\.yml/);
    const ex = r.exchanges!.at(-1)!;
    assert.match(
        ex.requestHeaders!.DPoP ?? ex.requestHeaders!.dpop,
        /^eyJ[A-Za-z0-9_-]{5}…\(redacted\)$/,
    );
    assert.doesNotMatch(JSON.stringify(r), /"access_token":"(?!\(redacted\))/);
    assert.doesNotMatch(JSON.stringify(r), /eyJ[A-Za-z0-9_-]{10,}\./, "no whole JWT anywhere");
});

test("an API without a jti cache passes, since the check is optional there", async () => {
    const { results } = await run({ acceptReplayedResourceProof: true }, "foundation", ["dpop."]);
    assert.deepEqual(
        results.filter((r) => r.status !== "pass" && r.status !== "skip").map((r) => r.id),
        [],
    );
});

test("DPoP errors at an API with 400 instead of 401 fail dpop.missing-proof only", async () => {
    const { byId } = await run({ resourceDpopErrors400: true }, "foundation", ["dpop."]);
    assert.equal(byId("dpop.missing-proof").status, "fail");
    const wrongKey = byId("dpop.wrong-key");
    assert.equal(wrongKey.status, "pass");
    assert.match(wrongKey.notes![0], /HTTP 400/);
});

test("metadata without dpop_signing_alg_values_supported passes metadata.dpop-algs", async () => {
    const { byId } = await run({ noDpopAlgs: true }, "foundation", ["metadata."]);
    assert.equal(byId("metadata.dpop-algs").status, "pass");
});

test("dpop_signing_alg_values_supported without ES256 fails metadata.dpop-algs", async () => {
    const { byId } = await run({ dpopAlgsWithoutEs256: true }, "foundation", ["metadata."]);
    assert.equal(byId("metadata.dpop-algs").status, "fail");
});

test("an empty scope on a new Session fails session.signed-out", async () => {
    const { byId } = await run({ emptyScope: true }, "foundation", ["session."]);
    assert.equal(byId("session.signed-out").status, "fail");
});

test("a client assertion addressed to the token endpoint that's accepted fails", async () => {
    const { byId } = await run({ acceptTokenEndpointAud: true }, "foundation", ["session."]);
    assert.equal(byId("session.client-assertion-aud").status, "fail");
    assert.equal(byId("session.start").status, "pass");
});

test("a replayed Session assertion that's accepted fails", async () => {
    const { byId } = await run({ acceptReplayedAssertion: true }, "foundation", ["session."]);
    assert.equal(byId("session.assertion-replay").status, "fail");
    assert.equal(byId("session.start").status, "pass");
});

test("a missing Cache-Control: no-store is a warning, not a failure", async () => {
    const { byId } = await run({ noStore: true }, "foundation", ["session.no-store"]);
    assert.equal(byId("session.no-store").status, "warn");
});

test("DPoP nonces: the validator retries with the nonce and reports it", async () => {
    const { byId } = await run({ requireNonce: true }, "foundation", ["session.start", "dpop."]);
    assert.equal(byId("session.start").status, "pass");
    assert.equal(byId("dpop.nonce").status, "pass");
    assert.equal(byId("dpop.accepted").status, "pass");
});

test("resource servers that take tokens from the URL fail", async () => {
    const { byId } = await run({ acceptQueryToken: true }, "foundation", ["dpop."]);
    assert.equal(byId("dpop.token-in-url").status, "fail");
    assert.equal(byId("dpop.wrong-ath").status, "pass");
});

test("a Session Key accepted for another User ID fails", async () => {
    const { byId } = await run({ ignoreKeyUser: true }, "foundation", ["session."]);
    assert.equal(byId("session.renew").status, "pass");
    assert.equal(byId("session.key-other-user").status, "fail");
});

test("a Bearer MCP token accepted elsewhere fails", async () => {
    const { byId } = await run({ acceptBearerEverywhere: true }, "interfaces", ["mcp."]);
    assert.equal(byId("mcp.bearer-accepted").status, "pass");
    assert.equal(byId("mcp.bearer-elsewhere-rejected").status, "fail");
});

test("an MCP server without DPoP that gets a DPoP token by exchange fails", async () => {
    const { byId } = await run({ dpopAtBearerMcp: true }, "interfaces", ["mcp."]);
    assert.equal(byId("mcp.bearer-token").status, "fail");
    assert.equal(byId("mcp.dpop-server-token").status, "skip");
});

test("an MCP server with DPoP uses DPoP Session Tokens", async () => {
    const { byId } = await run({ mcpDpop: true }, "interfaces", ["mcp."]);
    assert.equal(byId("mcp.dpop-server-token").status, "pass");
    assert.equal(byId("mcp.dpop-server-no-bearer").status, "pass");
    assert.equal(byId("mcp.dpop-server-accepted").status, "pass");
    assert.equal(byId("mcp.dpop-token-rejected").status, "pass");
    assert.equal(byId("mcp.bearer-token").status, "skip");
});

test("a Bearer token for an MCP server with DPoP fails", async () => {
    const { byId } = await run({ mcpDpop: true, bearerAtDpopMcp: true }, "interfaces", ["mcp."]);
    assert.equal(byId("mcp.dpop-server-token").status, "pass");
    assert.equal(byId("mcp.dpop-server-no-bearer").status, "fail");
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

test("organization.domain that doesn't match the host fails discovery and metadata", async () => {
    const { byId } = await run({ domain: "other.test" }, "foundation", ["discovery.", "metadata."]);
    assert.equal(byId("discovery.domain-matches-host").status, "fail");
    assert.equal(byId("metadata.protected-resources").status, "fail");
});

test("a redirect to plain HTTP fails", async () => {
    const http = createHttp({ fetch: fakeCompany(join(cwd, ".poppy"), { httpRedirect: true }) });
    const ctx = newContext(
        http,
        { milestones: parseMilestones("foundation")!, only: ["discovery."] },
        "https://www.shop.test",
    );
    const results = await runChecks(ctx, { cwd });
    assert.equal(results.find((r) => r.id === "discovery.redirects-https")?.status, "fail");
});

test("a redirect that ends outside the well-known path fails", async () => {
    const http = createHttp({
        fetch: fakeCompany(join(cwd, ".poppy"), { redirectToUpload: true }),
    });
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
    const http = createHttp({ fetch: fakeCompany(join(cwd, ".poppy")) });
    const ctx = newContext(http, { milestones: parseMilestones("foundation")! }, ORIGIN);
    const results = await runChecks(ctx, { cwd: empty });
    assert.equal(results.find((r) => r.id === "session.start")?.status, "skip");
    assert.equal(results.find((r) => r.id === "discovery.schema")?.status, "pass");
    assert.equal(ctx.notes.length, 1);
    assert.match(ctx.notes[0], /keygen/);
});

test("only safe requests: GETs, token requests, and conversation requests", async () => {
    const { http } = await run();
    for (const ex of http.log) {
        const path = new URL(ex.url).pathname;
        const ok =
            ex.method === "GET" ||
            path === "/oauth/token" ||
            path.startsWith("/poppy/conversations") ||
            path === "/mcp";
        assert.ok(ok, `${ex.method} ${ex.url}`);
    }
});
