import assert from "node:assert/strict";
import { test } from "node:test";
import { CATALOG } from "../catalog.ts";
import { newContext, recorder } from "../checks/types.ts";
import { createHttp } from "../http.ts";
import { formatHuman, formatResult, colors } from "../output.ts";
import { redactBody, redactHeader, redactText, redactUrl, redactValue } from "../redact.ts";
import { baseDomain, draftReport, scrub } from "../report.ts";
import { parseMilestones } from "../run.ts";
import { parseDesign, progress } from "../design.ts";

const JWT = "eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJ1In0.c2lnbmF0dXJlc2lnbmF0dXJl";

test("redaction keeps a recognizable prefix and nothing else", () => {
    assert.equal(redactValue(JWT), "eyJhbGci…(redacted)");
    assert.equal(redactHeader("Authorization", `DPoP ${JWT}`), "DPoP eyJhbGci…(redacted)");
    assert.equal(redactHeader("DPoP", JWT), "eyJhbGci…(redacted)");
    assert.equal(redactHeader("Poppy-Session", JWT), "eyJhbGci…(redacted)");
    assert.equal(redactHeader("Authorization", "Bearer abcdefghij"), "Bearer (redacted)");
    assert.equal(redactText(`token ${JWT} here`), "token eyJhbGci…(redacted) here");
    const json = JSON.parse(
        redactBody(
            JSON.stringify({
                access_token: "opaque-secret",
                scope: "orders:read",
                nested: { refresh_token: "r" },
            }),
        ),
    );
    assert.equal(json.access_token, "(redacted)");
    assert.equal(json.scope, "orders:read");
    assert.equal(json.nested.refresh_token, "(redacted)");
    const form = redactBody(
        `grant_type=x&assertion=${JWT}&subject_token=${JWT}&client_assertion=${JWT}&resource=r1`,
    );
    assert.doesNotMatch(form, /c2lnbmF0dXJl/);
    assert.match(form, /resource=r1/);
    assert.equal(
        redactUrl("https://a.example/x?access_token=secret123&y=1"),
        "https://a.example/x?access_token=(redacted)&y=1",
    );
});

function failingResult() {
    const ctx = newContext(createHttp(), { milestones: parseMilestones("all")! });
    const r = recorder(ctx);
    r.fail("session.unknown-key", {
        exchange: {
            method: "POST",
            url: "https://auth.example/token",
            requestHeaders: {
                "Poppy-Session": JWT,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            requestBody: `grant_type=x&assertion=${JWT}`,
            responseHeaders: { "content-type": "application/json" },
            setCookies: [],
            status: 200,
            statusText: "OK",
            body: JSON.stringify({ access_token: "opaque-access-token", token_type: "DPoP" }),
            json: { access_token: "opaque-access-token", token_type: "DPoP" },
            ms: 5,
        },
        got: "200 OK, the request was handled",
        expected: '400 {"error": "invalid_session"}',
        cause: "The Session JWT's signature isn't checked.",
    });
    return r.results[0];
}

test("a failing check has every feedback field, and no secrets", () => {
    const result = failingResult();
    assert.equal(result.status, "fail");
    for (const field of [
        "quote",
        "sent",
        "got",
        "expected",
        "cause",
        "specUrl",
        "disagreeUrl",
    ] as const)
        assert.ok(result[field], field);
    const text = formatResult(result, colors(false));
    for (const label of [
        "Requirement:",
        "Sent:",
        "Got:",
        "Expected:",
        "Likely cause:",
        "Spec:",
        "Disagree?",
    ])
        assert.ok(text.includes(label), label);
    assert.ok(!text.includes("\x1b["), "no color when disabled");
    const all = text + JSON.stringify(result);
    assert.doesNotMatch(all, /c2lnbmF0dXJl|opaque-access-token|eyJzdWIi/);
    const disagree = new URL(result.disagreeUrl);
    assert.equal(disagree.searchParams.get("template"), "1-feedback.yml");
    assert.equal(disagree.searchParams.get("page"), "Company kit");
    assert.match(result.specUrl, /^https:\/\/personalagentprotocol\.org\/docs\/\d+\.\d+\/spec#/);
});

test("color only when enabled", () => {
    assert.ok(formatHuman([failingResult()], { color: true }).includes("\x1b[31m"));
    assert.ok(!formatHuman([failingResult()], { color: false }).includes("\x1b["));
});

test("a failed SHOULD check is a warning", () => {
    const ctx = newContext(createHttp(), { milestones: parseMilestones("all")! });
    const r = recorder(ctx);
    const info = { ...CATALOG[0], id: "test.should", level: "SHOULD" as const };
    CATALOG.push(info);
    try {
        r.fail(info.id, { got: "Recommendation not met" });
        assert.equal(r.results[0].status, "warn");
    } finally {
        CATALOG.pop();
    }
});

test("the catalog has unique ids and page#id sections", () => {
    const ids = new Set(CATALOG.map((c) => c.id));
    assert.equal(ids.size, CATALOG.length);
    for (const c of CATALOG) assert.match(c.section, /^[a-z-]+#[a-z0-9-]+$/, c.id);
});

test("milestones are cumulative", () => {
    assert.deepEqual([...parseMilestones("2")!], ["foundation", "interfaces"]);
    assert.deepEqual([...parseMilestones("foundation")!], ["foundation"]);
    assert.equal(parseMilestones("bogus"), undefined);
});

test("design progress", () => {
    const design = parseDesign(
        '# Design\n\n```json poppy-design\n{"domain":"shop.example","interfaces":["openapi","conversations"]}\n```\n',
    );
    assert.equal(design.domain, "shop.example");
    const items = progress(
        design,
        { apis: [{ type: "openapi", url: "https://shop.example/o.json" }] } as never,
        [],
    );
    const byName = Object.fromEntries(items.map((i) => [i.name, i.state]));
    assert.equal(byName.conversations, "not live yet");
    assert.ok(byName.openapi.startsWith("live"));
    assert.throws(() => parseDesign("no block"), /poppy-design/);
});

test("the report replaces the Company's domains and tokens", () => {
    assert.equal(baseDomain("api.staging.shop.co.uk"), "shop.co.uk");
    assert.equal(
        scrub(`see https://api.shop.co.uk/x and ${JWT}`, ["auth.shop.co.uk"]),
        "see https://api.example.com/x and eyJhbGci…(redacted)",
    );
    const report = draftReport({
        feedback:
            "# Feedback\n\n## Token endpoint\n\nauth.shop.test was confusing.\n\n## The validator\n\nSlow on shop.test.\n",
        last: { hosts: ["shop.test"], results: [failingResult()] },
    });
    assert.doesNotMatch(report.markdown + report.url, /shop\.test/);
    assert.match(report.fields.kit, /Slow on example\.com/);
    assert.match(report.fields.problems, /auth\.example\.com/);
    const url = new URL(report.url);
    assert.equal(url.searchParams.get("template"), "2-implementation-report.yml");
    assert.match(url.searchParams.get("milestones")!, /Failing: session\.unknown-key/);
    const long = draftReport({ feedback: "## Notes\n\n" + "x".repeat(9000) });
    assert.equal(
        long.url,
        "https://github.com/personal-agent-protocol/personal-agent-protocol/issues/new?template=2-implementation-report.yml",
    );
});
