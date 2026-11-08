import assert from "node:assert/strict";
import { test } from "node:test";
import { check } from "../schemas.ts";

const schema = "https://schemas.agentskills.io/discovery/0.2.0/schema.json";
const skill = {
    name: "manage-bookings",
    description: "Manage the User's bookings with this Company.",
    type: "skill-md",
    url: "https://cdn.example.com/skills/manage-bookings/SKILL.md",
    digest: `sha256:${"a".repeat(64)}`,
};

function document(index: unknown) {
    return { skill_index: index };
}

test("skill indexes accept cross-domain URLs, relative references, and both artifact types", () => {
    for (const [type, url] of [
        ["skill-md", "https://cdn.example.com/skills/manage-bookings/SKILL.md"],
        ["skill-md", "/skills/manage-bookings/SKILL.md"],
        ["skill-md", "skills/manage-bookings/SKILL.md"],
        ["archive", "https://cdn.example.com/skills/manage-bookings.tar.gz"],
        ["archive", "../skills/manage-bookings.zip"],
    ]) {
        assert.deepEqual(
            check(
                "tasks.schema.json",
                document({ $schema: schema, skills: [{ ...skill, type, url }] }),
            ),
            [],
            `${type}: ${url}`,
        );
    }
    assert.deepEqual(check("tasks.schema.json", document({ $schema: schema, skills: [] })), []);
});

test("skill indexes validate required fields and SHA-256 digests", () => {
    for (const field of Object.keys(skill)) {
        const entry: Record<string, unknown> = { ...skill };
        delete entry[field];
        const errors = check("tasks.schema.json", document({ $schema: schema, skills: [entry] }));
        assert.ok(
            errors.some((e) => e.path === `/skill_index/skills/0/${field}`),
            field,
        );
    }
    for (const digest of ["sha256:abc", `sha256:${"A".repeat(64)}`, `sha512:${"a".repeat(64)}`]) {
        const errors = check("skill-index.schema.json", {
            $schema: schema,
            skills: [{ ...skill, digest }],
        });
        assert.ok(
            errors.some((e) => e.path === "/skills/0/digest"),
            digest,
        );
    }
    assert.ok(
        check("skill-index.schema.json", { $schema: schema }).some((e) => e.path === "/skills"),
    );
    assert.ok(check("skill-index.schema.json", { skills: [] }).some((e) => e.path === "/$schema"));
});

test("skill indexes reject non-HTTPS schemes and allow unknown fields, types, and versions", () => {
    for (const url of [
        "http://cdn.example.com/SKILL.md",
        "javascript:alert(1)",
        "skill with spaces.md",
    ]) {
        assert.ok(
            check("skill-index.schema.json", { $schema: schema, skills: [{ ...skill, url }] })
                .length > 0,
            url,
        );
    }
    assert.deepEqual(
        check(
            "tasks.schema.json",
            document({
                $schema: schema,
                future_index_field: true,
                skills: [{ ...skill, type: "future-artifact", future_entry_field: true }],
            }),
        ),
        [],
    );
    // Clients skip an unknown version rather than interpret its fields using 0.2.0 rules.
    assert.deepEqual(
        check(
            "tasks.schema.json",
            document({
                $schema: "https://schemas.agentskills.io/discovery/99.0.0/schema.json",
                future_format: true,
            }),
        ),
        [],
    );
});
