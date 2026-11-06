import assert from "node:assert/strict";
import { test } from "node:test";
import { formatSchemaErrors, validateSchema } from "../schema.ts";
import { PROTOCOL_VERSION } from "../catalog.ts";
import { check, loadSchemas } from "../schemas.ts";

const poppy = {
    protocol_version: PROTOCOL_VERSION,
    organization: { name: "Alpine Retail", domain: "alpine-retail.example" },
    auth: {
        issuer: "https://auth.alpine-retail.example",
        scopes: { "orders:read": "See your orders and returns" },
    },
    agent: {
        protocols: [
            { type: "poppy", endpoint: "https://api.alpine-retail.example/poppy/conversations" },
        ],
    },
};

test("every schema file parses and declares 2020-12", () => {
    const schemas = loadSchemas();
    assert.ok(Object.keys(schemas).length >= 19);
    for (const [name, schema] of Object.entries(schemas)) {
        assert.equal(
            (schema as { $schema?: string }).$schema,
            "https://json-schema.org/draft/2020-12/schema",
            name,
        );
    }
});

test("a valid poppy.json passes", () => {
    assert.deepEqual(check("poppy.schema.json", poppy), []);
});

test("type, required, and pattern errors have paths and plain messages", () => {
    const errors = check("poppy.schema.json", {
        ...poppy,
        protocol_version: 1,
        organization: { name: "A", domain: "https://a.example/" },
    });
    const paths = errors.map((e) => e.path);
    assert.ok(paths.includes("/protocol_version"));
    assert.ok(paths.includes("/organization/domain"));
    assert.match(errors.find((e) => e.path === "/organization/domain")!.message, /domain name/);
    assert.ok(
        formatSchemaErrors(errors).every((line) => typeof line === "string" && line.length > 0),
    );
});

test("anyOf of required-only branches says which fields are needed", () => {
    const { agent: _agent, ...withoutInterfaces } = poppy;
    const errors = check("poppy.schema.json", withoutInterfaces);
    assert.ok(
        errors.some((e) => /at least one of/.test(e.message)),
        JSON.stringify(errors),
    );
});

test("fragment references resolve, such as the Session JWT payload", () => {
    const payload = {
        iss: "https://agent.example/agent.json",
        aud: "https://auth.example",
        sid: "abcdefghijklmnopqrstuv",
        sub: "usr_1",
        jti: "abcdefghijklmnopqrstuv",
        htm: "POST",
        htu: "https://a.example/poppy/feedback",
        iat: 1,
    };
    assert.deepEqual(check("session-jwt.schema.json#/$defs/payload", payload), []);
    const bad = check("session-jwt.schema.json#/$defs/payload", {
        ...payload,
        htu: "https://a.example/poppy/feedback?x=1",
    });
    assert.equal(bad.length, 1);
    assert.match(bad[0].message, /without a query or fragment/);
});

test("core keywords", () => {
    const schema = {
        type: "object",
        properties: {
            n: { type: "integer", minimum: 1, maximum: 3 },
            s: { type: "string", minLength: 2, enum: ["ab", "cd"] },
            a: { type: "array", items: { const: 1 }, minItems: 1 },
            x: false,
        },
        required: ["n"],
        additionalProperties: false,
    };
    assert.deepEqual(validateSchema(schema, { n: 2, s: "ab", a: [1] }), []);
    const errors = validateSchema(schema, { n: 5, s: "zz", a: [2], x: 1, extra: true });
    const paths = errors.map((e) => e.path).sort();
    assert.deepEqual(paths, ["/a/0", "/extra", "/n", "/s", "/x"]);
    assert.match(errors.find((e) => e.path === "/x")!.message, /must not be present/);
    assert.deepEqual(validateSchema(schema, {}), [{ path: "/n", message: "is required" }]);
});

test("$ref to another schema by file name", () => {
    const refs = { "id.schema.json": { type: "string", pattern: "^[a-z]+$" } };
    assert.deepEqual(validateSchema({ $ref: "id.schema.json" }, "abc", refs), []);
    assert.equal(validateSchema({ $ref: "id.schema.json" }, "ABC", refs).length, 1);
});

test("events responses accept a null cursor", () => {
    const body = {
        conversation_id: "cnv_1",
        events: [],
        cursor: null,
        has_more: false,
        working: false,
        handoff: "none",
        responder: "agent",
        closed: false,
    };
    assert.deepEqual(check("events-response.schema.json", body), []);
});

test("a Direct Conversation can accept a user_requested event without a message", () => {
    const acceptance = {
        id: "req_1",
        parent_conversation_id: "cnv_1",
        user_requested_event_id: "evt_1",
    };
    const message = { author: { type: "human" }, text: "Hello" };
    for (const request of [acceptance, { ...acceptance, message }, { id: "msg_1", message }]) {
        assert.deepEqual(check("conversation-request.schema.json", request), []);
    }
    assert.deepEqual(
        check("conversation-message-request.schema.json", { id: "msg_1", message }),
        [],
    );
    assert.ok(
        check("conversation-message-request.schema.json", acceptance).some(
            (e) => e.path === "/message",
        ),
    );
    for (const request of [
        {},
        { message },
        { id: "req_1", parent_conversation_id: "cnv_1" },
        { id: "req_1", user_requested_event_id: "evt_1" },
        { id: "req_1", user_requested_event_id: "evt_1", message },
        { ...acceptance, id: "not/an/id" },
        { ...acceptance, user_requested_event_id: "not/an/id" },
        { ...acceptance, parent_conversation_id: "" },
        { ...acceptance, message: { author: { type: "human" } } },
    ]) {
        assert.ok(
            check("conversation-request.schema.json", request).length > 0,
            JSON.stringify(request),
        );
    }
});

test("only AI-written messages say what they took into account", () => {
    const company = { role: "company", as_of_request: "msg_Hc72PwZn4eKs1QxB", text: "Yes." };
    assert.deepEqual(check("message.schema.json", { ...company, author: { type: "agent" } }), []);
    assert.notDeepEqual(
        check("message.schema.json", { ...company, author: { type: "human" } }),
        [],
    );
    const user = { role: "user", as_of_cursor: "evt_c2", text: "Done." };
    assert.deepEqual(check("message.schema.json", { ...user, author: { type: "agent" } }), []);
    assert.notDeepEqual(check("message.schema.json", { ...user, author: { type: "human" } }), []);
    assert.notDeepEqual(
        check("message.schema.json", {
            ...user,
            as_of_request: "msg_x",
            author: { type: "agent" },
        }),
        [],
    );
});
