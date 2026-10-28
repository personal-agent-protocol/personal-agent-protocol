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
        status: "idle",
        responder: "agent",
    };
    assert.deepEqual(check("events-response.schema.json", body), []);
});
