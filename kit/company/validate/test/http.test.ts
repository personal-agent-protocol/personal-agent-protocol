// The HTTP client's rules: HTTPS only, no private addresses unless asked, Retry-After, and budgets.
// Also the redaction of what it records.

import assert from "node:assert/strict";
import { test } from "node:test";
import { summarizeExchange } from "../checks/types.ts";
import { blockedAddress, createHttp, retryAfterSeconds, type FetchLike } from "../http.ts";
import { redactBody, registerSecret } from "../redact.ts";

const ok: FetchLike = async () => new Response("{}", { status: 200 });
const publicLookup = async () => ["203.0.113.7"];

test("only HTTPS URLs are sent", async () => {
    const http = createHttp({ fetch: ok, lookup: publicLookup });
    const ex = await http.request({ url: "http://shop.test/" });
    assert.equal(ex.status, undefined);
    assert.match(ex.refused ?? "", /isn't an HTTPS URL/);
});

test("loopback, private, and link-local addresses are refused unless allowed", async () => {
    for (const address of [
        "127.0.0.1",
        "10.1.2.3",
        "169.254.169.254",
        "::1",
        "fd00::1",
        "::ffff:192.168.0.1",
    ])
        assert.ok(blockedAddress(address), address);
    assert.equal(blockedAddress("203.0.113.7"), undefined);
    assert.equal(blockedAddress("2606:4700::1"), undefined);

    let http = createHttp({ fetch: ok, lookup: async () => ["10.0.0.5"] });
    let ex = await http.request({ url: "https://internal.test/" });
    assert.match(ex.refused ?? "", /private/);
    assert.match(ex.refused ?? "", /--allow-private-addresses/);
    ex = await http.request({ url: "https://127.0.0.1/" });
    assert.match(ex.refused ?? "", /loopback/);
    ex = await http.request({ url: "https://[::1]/" });
    assert.match(ex.refused ?? "", /loopback/);

    http = createHttp({ fetch: ok, lookup: async () => ["10.0.0.5"], allowPrivateAddresses: true });
    ex = await http.request({ url: "https://internal.test/" });
    assert.equal(ex.status, 200);
});

test("a 429 with a short Retry-After is waited out and sent again with fresh headers", async () => {
    let calls = 0;
    const seen: string[] = [];
    const waits: number[] = [];
    const fetch: FetchLike = async (_url, init) => {
        seen.push((init.headers as Record<string, string>)["X-Try"]);
        return ++calls === 1
            ? new Response(null, { status: 429, headers: { "retry-after": "2" } })
            : new Response("{}", { status: 200 });
    };
    let n = 0;
    const http = createHttp({
        fetch,
        lookup: publicLookup,
        sleep: async (ms) => void waits.push(ms),
    });
    const ex = await http.request({
        url: "https://shop.test/",
        headers: { "X-Try": "0" },
        refreshHeaders: async () => ({ "X-Try": String(++n) }),
    });
    assert.equal(ex.status, 200);
    assert.equal(ex.retries, 1);
    assert.deepEqual(waits, [2000]);
    assert.deepEqual(seen, ["0", "1"]);
});

test("a 429 with a long Retry-After isn't waited out", async () => {
    const fetch: FetchLike = async () =>
        new Response(null, { status: 429, headers: { "retry-after": "3600" } });
    const http = createHttp({
        fetch,
        lookup: publicLookup,
        sleep: async () => assert.fail("waited"),
    });
    const ex = await http.request({ url: "https://shop.test/" });
    assert.deepEqual(ex.rateLimited, { retryAfter: 3600 });
    assert.equal(
        retryAfterSeconds("Wed, 21 Oct 2015 07:28:00 GMT", Date.parse("2015-10-21T07:27:00Z")),
        60,
    );
});

test("a run sends at most maxRequests requests", async () => {
    const http = createHttp({ fetch: ok, lookup: publicLookup, maxRequests: 2 });
    await http.request({ url: "https://shop.test/a" });
    await http.request({ url: "https://shop.test/b" });
    const third = await http.request({ url: "https://shop.test/c" });
    assert.match(third.refused ?? "", /limit of 2 requests/);
});

test("reading stops when `until` is satisfied", async () => {
    const encoder = new TextEncoder();
    const fetch: FetchLike = async () =>
        new Response(
            new ReadableStream({
                start(controller) {
                    controller.enqueue(encoder.encode('data: {"result":{}}\n\n'));
                    // Never closes, like an SSE stream that stays open.
                },
            }),
            { status: 200, headers: { "content-type": "text/event-stream" } },
        );
    const http = createHttp({ fetch, lookup: publicLookup });
    const ex = await http.request({ url: "https://shop.test/", until: (b) => b.includes("\n\n") });
    assert.equal(ex.status, 200);
    assert.match(ex.body ?? "", /result/);
});

test("browser codes and cookies are redacted in HTML, forms, JSON, and Set-Cookie", () => {
    const html = `<form><input type="hidden" value="bc_abcdefgh12345678" name="code"></form>`;
    assert.doesNotMatch(redactBody(html), /bc_abcdefgh/);
    assert.doesNotMatch(redactBody("code=bc_abcdefgh12345678&x=1"), /bc_abcdefgh/);
    assert.doesNotMatch(redactBody('{"code":"bc_abcdefgh12345678"}'), /bc_abcdefgh/);
    registerSecret("sekritjoinvalue1");
    assert.doesNotMatch(redactBody("the cookie was sekritjoinvalue1"), /sekrit/);
    const summary = summarizeExchange({
        method: "GET",
        url: "https://shop.test/",
        requestHeaders: {},
        responseHeaders: {},
        setCookies: [
            "a=one1; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Path=/",
            "__Host-b=two2; Path=/; Secure",
        ],
        status: 200,
        ms: 0,
    });
    assert.equal(
        summary.responseHeaders?.["set-cookie"],
        "a=(redacted); Expires=Wed, 21 Oct 2026 07:28:00 GMT; Path=/\n__Host-b=(redacted); Path=/; Secure",
    );
});
