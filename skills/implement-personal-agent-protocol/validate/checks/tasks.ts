// Milestone 2: excluded tasks and skills, from the tasks endpoint (section 9, 9.1, 9.4). The
// request carries a signed-out Session header and no access token.

import { sessionRequest } from "../agent.ts";
import type { Exchange } from "../http.ts";
import { formatSchemaErrors } from "../schema.ts";
import { check } from "../schemas.ts";
import { unlistedReferences } from "./feedback.ts";
import { fieldOf, isHttpsUrl, isObject, skipRest, type Context, type Recorder } from "./types.ts";

export const TASKS_IDS = ["tasks.response", "tasks.skill-index", "tasks.alternative-references"];

// The tasks response, fetched once with a signed-out Session header and no access token. Needs the
// test identity.
export async function tasksResponse(ctx: Context): Promise<Exchange | undefined> {
    const endpoint = fieldOf(ctx.discovered.poppy, "tasks", "endpoint");
    if (!isHttpsUrl(endpoint)) return undefined;
    ctx.discovered.tasks ??= await sessionRequest(ctx, {
        url: endpoint,
        note: "a signed-out Session header and no access token",
    });
    return ctx.discovered.tasks;
}

// The feedback endpoint the tasks response lists, if any (9.3).
export async function feedbackEndpoint(ctx: Context): Promise<string | undefined> {
    const ex = await tasksResponse(ctx);
    const feedback = isObject(ex?.json) ? ex.json.feedback : undefined;
    const endpoint = isObject(feedback) ? feedback.endpoint : undefined;
    return isHttpsUrl(endpoint) ? endpoint : undefined;
}

export async function checkTasks(ctx: Context, r: Recorder): Promise<void> {
    const endpoint = fieldOf(ctx.discovered.poppy, "tasks", "endpoint");
    if (!isHttpsUrl(endpoint)) {
        skipRest(r, TASKS_IDS, "poppy.json lists no tasks endpoint.");
        return;
    }
    if (!ctx.identity || !ctx.discovered.audience || ctx.blocked.identity) {
        skipRest(
            r,
            TASKS_IDS,
            ctx.blocked.identity ??
                ctx.identityProblem ??
                "No test Personal Agent or Company identity.",
        );
        return;
    }

    const ex = (await tasksResponse(ctx))!;
    const doc = ex.json as { excluded_tasks?: unknown; skill_index?: unknown } | undefined;
    if (ex.error || ex.status !== 200 || !isObject(doc)) {
        r.fail("tasks.response", {
            exchange: ex,
            expected: "200 with a JSON object",
            cause: ex.error
                ? `The request failed before a response (${ex.error}).`
                : "Answer GET {tasks.endpoint} with a signed-out Session header and no access token, with a JSON object (section 9).",
        });
        skipRest(r, TASKS_IDS, "The tasks response couldn't be loaded.");
        return;
    }

    // Personal Agents ignore a malformed skill index and still use the rest (9.4).
    const errors = check("tasks.schema.json", doc);
    const taskErrors = errors.filter((e) => !e.path.startsWith("/skill_index"));
    if (taskErrors.length)
        r.fail("tasks.response", {
            exchange: ex,
            got: formatSchemaErrors(taskErrors).join("; "),
            expected:
                "The fields in section 9, 9.1, and 9.2 (kit/company/schemas/tasks.schema.json)",
            cause: "Fix each field listed.",
        });
    else {
        const count = Array.isArray(doc.excluded_tasks) ? doc.excluded_tasks.length : 0;
        r.pass("tasks.response", { summary: `${count} excluded task(s).` });
    }

    if (doc.skill_index === undefined)
        r.skip("tasks.skill-index", "The tasks response has no skill_index.");
    else {
        const indexErrors = errors.filter((e) => e.path.startsWith("/skill_index"));
        if (indexErrors.length)
            r.fail("tasks.skill-index", {
                exchange: ex,
                got: formatSchemaErrors(indexErrors).join("; "),
                expected:
                    "An Agent Skills discovery index in the form 9.4 describes (kit/company/schemas/skill-index.schema.json)",
                cause: "Personal Agents ignore a malformed index, so they won't use these skills. Fix each field listed.",
            });
        else r.pass("tasks.skill-index");
    }

    const unlisted = (Array.isArray(doc.excluded_tasks) ? doc.excluded_tasks : []).flatMap(
        (entry, i) =>
            unlistedReferences(
                ctx,
                isObject(entry) ? entry.alternative : undefined,
                `excluded_tasks[${i}].alternative.`,
            ),
    );
    if (unlisted.length)
        r.fail("tasks.alternative-references", {
            exchange: ex,
            got: unlisted.join(", "),
            expected:
                "Each openapi or mcp reference's url is the url of an apis entry of that type",
            cause: "Personal Agents ignore a reference to an API that poppy.json doesn't list. List the API in apis, or fix the url to match its entry exactly.",
        });
    else r.pass("tasks.alternative-references");
}
