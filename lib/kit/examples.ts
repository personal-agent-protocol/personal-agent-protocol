import { validateSchema } from "../../kit/company/validate/schema.ts";
import { docsHref, SPEC_HREF } from "../../content/docs";
import { docsPage } from "../docs-content";
import { jsonExamples } from "./docs";

// Checks every JSON example in the spec and extensions against the kit's schemas,
// so the two can't drift apart.
// Each example is keyed by its section and its place in it, such as "sending-messages:2" for the
// second example in 8.3. A new example has to be added here before the build passes.

type Target = string | object | null;

// An excerpt holding one property of a larger document, checked against that property's schema.
function excerpt(property: string, ref: string): object {
    return { type: "object", required: [property], properties: { [property]: { $ref: ref } } };
}

// The schema for each example, or null, with a reason, for an example no schema covers.
const EXAMPLES: Record<string, Target> = {
    "discovery:1": "poppy.schema.json",
    "oauth-server:1": "protected-resource-metadata.schema.json",
    "oauth-server:2": "authorization-server-metadata.schema.json",
    "extensions:1": excerpt("extensions", "poppy.schema.json#/properties/extensions"),
    "extensions:2": "error.schema.json",
    "agent-identity:1": "client-metadata.schema.json",
    "device-sign-in:1": "device-authorization-response.schema.json",
    "scopes:1": "token-response.schema.json",
    "session-header:1": "session-jwt.schema.json",
    "delegated-keys:1": "delegation.schema.json#/$defs/header",
    "delegated-keys:2": "delegation.schema.json#/$defs/payload",
    "delegated-keys:3": "session-jwt.schema.json#/$defs/header",
    "web-browsing:1": "browser-session-authorize.schema.json",
    // A request to the Company's own API, whose schema is the Company's.
    "apis:1": null,
    "sending-messages:1": "conversation-request.schema.json",
    "sending-messages:2": "conversation-response.schema.json",
    "sending-messages:3": "conversation-request.schema.json",
    "sending-messages:4": "conversation-request.schema.json",
    "message-fields:1": "message.schema.json",
    "message-fields:2": "message.schema.json",
    "reading-events:1": "events-response.schema.json",
    "status:1": "events-response.schema.json",
    "human-or-ai:1": "conversation-request.schema.json",
    // The handoff request is an empty object.
    "handoff:1": null,
    "direct-conversations:1": "conversation-request.schema.json",
    "direct-conversations:2": "event.schema.json",
    "conversation-sign-in:1": "event.schema.json",
    "excluded-tasks:1": "excluded-tasks.schema.json",
    "alternatives:1": "alternative.schema.json",
    "feedback:1": "feedback-report.schema.json",
};

// The token requests are form bodies, which aren't JSON examples. Their parameters are in
// mediated-sign-in-request.schema.json and mediated-code-request.schema.json.
const MEDIATED_SIGN_IN_EXAMPLES: Record<string, Target> = {
    "support:1": excerpt("extensions", "poppy.schema.json#/properties/extensions"),
    "one-time-codes:1": "mediated-sign-in-response.schema.json",
};

const OPERATIONS_EXAMPLES: Record<string, Target> = {
    "support:1": excerpt("extensions", "poppy.schema.json#/properties/extensions"),
    "support:2": excerpt("extensions", "client-metadata.schema.json#/properties/extensions"),
    "operation-object:1": "operation.schema.json",
    "approval-required:1": {
        type: "object",
        required: ["error", "operation"],
        properties: {
            error: { const: "approval_required" },
            operation: { $ref: "operation.schema.json" },
        },
    },
    "approval-required:2": {
        type: "object",
        required: ["isError", "structuredContent"],
        properties: {
            isError: { const: true },
            structuredContent: excerpt("operation", "operation.schema.json"),
        },
    },
    "approval-required:3": "event.schema.json",
    // A request to the Company's own API, sent again with the approval in a header.
    "sending-approval:1": null,
    // An MCP tool call, whose schema is MCP's. Only the approval in _meta is the protocol's.
    "sending-approval:2": {
        type: "object",
        required: ["params"],
        properties: {
            params: {
                type: "object",
                required: ["_meta"],
                properties: {
                    _meta: excerpt("personalagentprotocol.org/approval", "approval.schema.json"),
                },
            },
        },
    },
    "sending-approval:3": "message.schema.json",
};

function checkExamples(
    href: string,
    examples: Record<string, Target>,
    schemas: Record<string, object>,
): string[] {
    const page = docsPage(href);
    const problems: string[] = [];
    const seen = new Set<string>();
    for (const example of jsonExamples(page)) {
        seen.add(example.key);
        if (!(example.key in examples)) {
            problems.push(
                `${page.file}: the JSON example ${example.key} (${example.label ?? "no label"}) has no schema. Add it to lib/kit/examples.ts.`,
            );
            continue;
        }
        const target = examples[example.key];
        if (target === null) {
            continue;
        }
        const schema = typeof target === "string" ? { $ref: target } : target;
        for (const error of validateSchema(schema, example.json, schemas)) {
            problems.push(
                `${page.file}: the JSON example ${example.key} doesn't match ${typeof target === "string" ? target : "its schema"}: ${error.path || "/"} ${error.message}`,
            );
        }
    }
    for (const key of Object.keys(examples)) {
        if (!seen.has(key)) {
            problems.push(
                `lib/kit/examples.ts: there's no JSON example ${key} in ${page.file} anymore.`,
            );
        }
    }
    return problems;
}

export function checkSpecExamples(schemas: Record<string, object>): string[] {
    return [
        ...checkExamples(SPEC_HREF, EXAMPLES, schemas),
        ...checkExamples(docsHref("extensions/operations")!, OPERATIONS_EXAMPLES, schemas),
        ...checkExamples(
            docsHref("extensions/mediated-sign-in")!,
            MEDIATED_SIGN_IN_EXAMPLES,
            schemas,
        ),
    ];
}
