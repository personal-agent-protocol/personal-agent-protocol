// Milestone 2: feedback (9.3). Verification is recommended, and required for attribution.
// A signed-out Session is enough. Reports are synthetic and describe no one.

import { sessionRequest } from "../agent.ts";
import { isInvalidSession, jsonError, type Exchange } from "../http.ts";
import { formatSchemaErrors } from "../schema.ts";
import { check } from "../schemas.ts";
import { invalidSessionShape } from "./resource.ts";
import {
    apisOf,
    fieldOf,
    isHttpsUrl,
    isObject,
    skipRest,
    type Context,
    type Recorder,
} from "./types.ts";

export const FEEDBACK_IDS = [
    "feedback.no-session",
    "feedback.accepted",
    "feedback.alternative-references",
    "feedback.invalid",
];

export const TEST_REPORT = {
    task: "Validator test report",
    description: "Validator test report. Please ignore.",
};

// What an accepted report's response got wrong, if anything: 202 with no body, or 200 with an
// alternative (9.2).
function acceptedProblem(ex: Exchange): string | undefined {
    if (ex.status === 202) {
        const body = (ex.body ?? "").trim();
        return body ? `202 with a body (${body.slice(0, 80)}), where 202 has no body` : undefined;
    }
    if (ex.status !== 200) return "not accepted";
    const errors = check("alternative.schema.json", ex.json);
    if (errors.length)
        return `200, but the body isn't an alternative: ${formatSchemaErrors(errors).join("; ")}`;
    return undefined;
}

// The references in an alternative that name an openapi or mcp API poppy.json doesn't list.
export function unlistedReferences(ctx: Context, alternative: unknown, where: string): string[] {
    const listed = new Set(apisOf(ctx.discovered.poppy).map((api) => `${api.type} ${api.url}`));
    const references =
        isObject(alternative) && Array.isArray(alternative.references)
            ? alternative.references
            : [];
    const unlisted: string[] = [];
    for (const [j, ref] of references.entries()) {
        if (!isObject(ref)) continue;
        if ((ref.type === "openapi" || ref.type === "mcp") && !listed.has(`${ref.type} ${ref.url}`))
            unlisted.push(`${where}references[${j}] (${ref.type} ${ref.url})`);
    }
    return unlisted;
}

export async function checkFeedback(ctx: Context, r: Recorder): Promise<void> {
    const endpoint = fieldOf(ctx.discovered.poppy, "feedback", "endpoint");
    if (!isHttpsUrl(endpoint)) {
        skipRest(r, FEEDBACK_IDS, "poppy.json lists no feedback endpoint.");
        return;
    }

    if (r.wants("feedback.no-session")) {
        const ex = await sessionRequest(ctx, {
            method: "POST",
            url: endpoint,
            body: TEST_REPORT,
            session: "none",
            note: "a report with no Session header",
        });
        if (isInvalidSession(ex)) r.pass("feedback.no-session");
        else
            r.fail("feedback.no-session", {
                exchange: ex,
                expected: '400 {"error": "invalid_session"}',
                cause:
                    ex.status === 202 || ex.status === 200
                        ? "Session verification is recommended for reports and required before attribution. Accepting an unattributed report is allowed. Manually check that reports without a verified header aren't attributed to a Personal Agent, User, or Session (9.3)."
                        : (invalidSessionShape(ex) ??
                          "A request without the Session header gets HTTP 400 with invalid_session in a JSON body (section 7)."),
            });
    }

    if (!ctx.identity || !ctx.discovered.audience || ctx.blocked.identity) {
        skipRest(
            r,
            FEEDBACK_IDS,
            ctx.blocked.identity ??
                ctx.identityProblem ??
                "No test Personal Agent or Company identity.",
        );
        return;
    }

    const ex = await sessionRequest(ctx, {
        method: "POST",
        url: endpoint,
        body: TEST_REPORT,
        note: "a report with a signed-out Session header",
    });
    const problem = acceptedProblem(ex);
    if (!problem)
        r.pass("feedback.accepted", {
            summary: ex.status === 200 ? "200 with an alternative." : undefined,
        });
    else
        r.fail("feedback.accepted", {
            exchange: ex,
            got: problem === "not accepted" ? undefined : problem,
            expected: "202 with no body, or 200 with an alternative (9.2)",
            cause:
                ex.status === 202
                    ? "The Company responds to a report with HTTP 202 and no body (9.3)."
                    : "The endpoint should accept a report with the Session header, signed in or signed out, without a scope.",
        });

    if (ex.status === 200 && !problem) {
        const unlisted = unlistedReferences(ctx, ex.json, "");
        if (unlisted.length)
            r.fail("feedback.alternative-references", {
                exchange: ex,
                got: unlisted.join(", "),
                expected:
                    "Each openapi or mcp reference's url is the url of an apis entry of that type",
                cause: "Personal Agents ignore a reference to an API that poppy.json doesn't list. List the API in apis, or fix the url to match its entry exactly.",
            });
        else r.pass("feedback.alternative-references");
    } else r.skip("feedback.alternative-references", "The report got no alternative to check.");

    if (r.wants("feedback.invalid")) {
        const bad: Exchange[] = [];
        for (const [body, note] of [
            [{ task: 42 }, "a malformed report: task is a number, and there's no description"],
            [
                {
                    task: "Validator test report ".padEnd(201, "x"),
                    description: TEST_REPORT.description,
                },
                "a report whose task is 201 characters",
            ],
        ] as const) {
            const res = await sessionRequest(ctx, { method: "POST", url: endpoint, body, note });
            if (!(res.status === 400 && jsonError(res) === "invalid_request")) bad.push(res);
        }
        if (bad.length === 0) r.pass("feedback.invalid");
        else
            r.fail("feedback.invalid", {
                exchange: bad,
                expected: '400 {"error": "invalid_request"}',
                cause:
                    bad[0].status !== undefined && bad[0].status < 300
                        ? "The endpoint accepted a report that is malformed or too long. task is at most 200 characters and description at most 2,000, and both are required strings (9.3)."
                        : "A malformed or overlong report gets invalid_request (400) in a JSON body (9.3).",
            });
    }
}
