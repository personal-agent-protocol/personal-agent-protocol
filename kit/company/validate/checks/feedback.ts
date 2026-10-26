// Milestone 2: the feedback endpoint (section 8.3): reports need a Session Token, a signed-out one
// is enough, and unknown kinds are accepted. Reports are synthetic and describe no one.

import { authedRequest } from "../agent.ts";
import type { Exchange } from "../http.ts";
import { formatSchemaErrors } from "../schema.ts";
import { check } from "../schemas.ts";
import { skipRest, type Context, type Recorder } from "./types.ts";

export const FEEDBACK_IDS = ["feedback.no-token", "feedback.accepted", "feedback.unknown-kind"];

export const TEST_REPORT = {
    kind: "missing",
    task: "Validator test report",
    description: "Validator test report. Please ignore.",
};

// A kind no version of the spec defines, which Companies must accept.
export const UNKNOWN_KIND = "poppy-validator-unknown-kind";

// What an accepted report's response got wrong, if anything: 202 with no body, or 200 with an
// alternative (8.2).
function acceptedProblem(ex: Exchange): string | undefined {
    if (ex.status === 202) return undefined;
    if (ex.status !== 200) return "not accepted";
    const errors = check("alternative.schema.json", ex.json);
    if (errors.length)
        return `200, but the body isn't an alternative: ${formatSchemaErrors(errors).join("; ")}`;
    return undefined;
}

export async function checkFeedback(ctx: Context, r: Recorder): Promise<void> {
    const endpoint = ctx.discovered.poppy?.feedback?.endpoint;
    if (typeof endpoint !== "string") {
        skipRest(r, FEEDBACK_IDS, "poppy.json lists no feedback endpoint.");
        return;
    }

    if (r.wants("feedback.no-token")) {
        const ex = (
            await authedRequest(ctx, {
                method: "POST",
                url: endpoint,
                body: TEST_REPORT,
                proof: "none",
                note: "a report with no token",
            })
        ).ex;
        if (ex.status === 401) r.pass("feedback.no-token");
        else
            r.fail("feedback.no-token", {
                exchange: ex,
                expected: "401",
                cause:
                    ex.status === 202 || ex.status === 200
                        ? "The endpoint accepted a report without a Session Token, so anyone could send reports that look like they came from a Personal Agent."
                        : "Token errors at the feedback endpoint are the ones in section 6: HTTP 401 with WWW-Authenticate.",
            });
    }

    const token = ctx.session.token;
    if (!token) {
        const reason = ctx.identity
            ? "No Session Token (see session.start)."
            : (ctx.identityProblem ?? "No test Personal Agent.");
        skipRest(r, FEEDBACK_IDS, reason);
        return;
    }

    for (const [id, body, note] of [
        ["feedback.accepted", TEST_REPORT, "a report with the signed-out Session Token"],
        [
            "feedback.unknown-kind",
            { ...TEST_REPORT, kind: UNKNOWN_KIND },
            `a report with kind "${UNKNOWN_KIND}"`,
        ],
    ] as const) {
        if (!r.wants(id)) continue;
        const ex = (await authedRequest(ctx, { method: "POST", url: endpoint, token, body, note }))
            .ex;
        const problem = acceptedProblem(ex);
        if (!problem) r.pass(id);
        else
            r.fail(id, {
                exchange: ex,
                got: problem === "not accepted" ? undefined : problem,
                expected: "202 with no body, or 200 with an alternative (8.2)",
                cause:
                    id === "feedback.accepted"
                        ? "The endpoint should accept a report with any Session Token, signed in or signed out, without a scope."
                        : "Accept kinds you don't recognize, so later versions can add kinds without breaking Companies.",
            });
    }
}
