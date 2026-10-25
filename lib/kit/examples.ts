import { validateSchema } from "../../kit/company/validate/schema.ts";
import { SPEC_HREF } from "../../content/docs";
import { docsPage } from "../docs-content";
import { jsonExamples } from "./docs";

// Checks every JSON example in the spec against the kit's schemas, so the two can't drift apart.
// Each example is keyed by its section and its place in it, such as "sending-messages:2" for the
// second example in 7.3. A new example has to be added here before the build passes.

type Target = string | object | null;

// An excerpt holding one property of a larger document, checked against that property's schema.
function excerpt(property: string, ref: string): object {
    return { type: "object", required: [property], properties: { [property]: { $ref: ref } } };
}

// The schema for each example, or null, with a reason, for an example no schema covers.
const EXAMPLES: Record<string, Target> = {
    "discovery:1": "poppy.schema.json",
    "oauth-server:1": "authorization-server-metadata.schema.json",
    "extensions:1": excerpt("extensions", "poppy.schema.json#/properties/extensions"),
    "extensions:2": "error.schema.json",
    "agent-identity:1": "client-metadata.schema.json",
    "starting-sessions:1": "session-assertion.schema.json",
    "starting-sessions:2": "token-response.schema.json",
    "sending-tokens:1": "dpop-proof.schema.json",
    "sending-tokens:2": "token-response.schema.json",
    "sign-in:1": "token-response.schema.json",
    "device-sign-in:1": "device-authorization-response.schema.json",
    "mediated-sign-in:1": excerpt(
        "fields",
        "poppy.schema.json#/properties/auth/properties/mediated/properties/fields",
    ),
    "mediated-sign-in:2": "mediated-sign-in-request.schema.json",
    "mediated-sign-in:3": "mediated-sign-in-response.schema.json",
    "mediated-sign-in:4": "mediated-sign-in-response.schema.json",
    "mediated-sign-in:5": "mediated-code-request.schema.json",
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

export function checkSpecExamples(schemas: Record<string, object>): string[] {
    const problems: string[] = [];
    const seen = new Set<string>();
    for (const example of jsonExamples(docsPage(SPEC_HREF))) {
        seen.add(example.key);
        if (!(example.key in EXAMPLES)) {
            problems.push(
                `spec.mdx: the JSON example ${example.key} (${example.label ?? "no label"}) has no schema. Add it to lib/kit/examples.ts.`,
            );
            continue;
        }
        const target = EXAMPLES[example.key];
        if (target === null) {
            continue;
        }
        const schema = typeof target === "string" ? { $ref: target } : target;
        for (const error of validateSchema(schema, example.json, schemas)) {
            problems.push(
                `spec.mdx: the JSON example ${example.key} doesn't match ${typeof target === "string" ? target : "its schema"}: ${error.path || "/"} ${error.message}`,
            );
        }
    }
    for (const key of Object.keys(EXAMPLES)) {
        if (!seen.has(key)) {
            problems.push(
                `lib/kit/examples.ts: there's no JSON example ${key} in spec.mdx anymore.`,
            );
        }
    }
    return problems;
}
