// Runs the checks in order, sharing what each step discovers.

import { CATALOG, MILESTONES, type Milestone } from "./catalog.ts";
import { loadIdentity, verifyHosted } from "./identity.ts";
import { checkConversations } from "./checks/conversations.ts";
import {
    checkExcludedTasks,
    checkMetadata,
    checkPoppyDocument,
    checkPoppyOnline,
} from "./checks/discovery.ts";
import { checkFeedback } from "./checks/feedback.ts";
import { checkMcp } from "./checks/mcp.ts";
import { checkOpenApi } from "./checks/openapi.ts";
import { checkResources } from "./checks/resource.ts";
import { checkSessions } from "./checks/session.ts";
import { recorder, selected, wantsAny, type CheckResult, type Context } from "./checks/types.ts";

// --milestone values. Milestones build on each other, so each includes the ones before it.
export function parseMilestones(value: string | undefined): Set<Milestone> | undefined {
    if (value === undefined || value === "all") return new Set(MILESTONES.map((m) => m.id));
    const found = MILESTONES.find((m) => m.id === value || String(m.number) === value);
    if (!found) return undefined;
    return new Set(MILESTONES.filter((m) => m.number <= found.number).map((m) => m.id));
}

export const UNAVAILABLE: Partial<Record<Milestone, string>> = {
    "sign-in":
        "Milestone 3 (sign-in and accounts) checks aren't available in this version of the validator. Check sign-in by hand against checklist.md.",
    extensions:
        "Extension checks, such as Operations, aren't available in this version of the validator.",
};

export async function runChecks(
    ctx: Context,
    options: { fileText?: string; cwd?: string } = {},
): Promise<CheckResult[]> {
    const r = recorder(ctx);
    if (options.fileText !== undefined) {
        const offline = "Offline (--file): no network requests.";
        r.skip("discovery.https", offline);
        r.skip("discovery.redirects-https", offline);
        checkPoppyDocument(ctx, r, undefined, [], options.fileText);
    } else {
        await checkPoppyOnline(ctx, r);
        await checkExcludedTasks(ctx, r);
        await checkMetadata(ctx, r);
        const needsIdentity = wantsAny(ctx, [
            "session.",
            "dpop.",
            "mcp.",
            "conversations.",
            "feedback.",
        ]);
        if (needsIdentity && ctx.discovered.metadata?.token_endpoint) {
            const identity = await loadIdentity(options.cwd);
            const short = "Needs the test Personal Agent (see the note at the top).";
            if ("missing" in identity) {
                ctx.notes.push(
                    `${identity.missing} Until then, checks that need a Personal Agent are skipped.`,
                );
                ctx.identityProblem = short;
            } else {
                const problems = await verifyHosted(identity, ctx.http);
                if (problems.length) {
                    ctx.notes.push(
                        `The hosted test identity doesn't match .poppy/, so checks that need a Personal Agent are skipped: ${problems.join(" ")}`,
                    );
                    ctx.identityProblem = short;
                } else ctx.identity = identity;
            }
        }
        if (wantsAny(ctx, ["session.", "dpop.", "mcp.", "conversations.", "feedback."]))
            await checkSessions(ctx, r);
        if (wantsAny(ctx, ["dpop."])) await checkResources(ctx, r);
        if (ctx.options.milestones.has("interfaces")) {
            if (wantsAny(ctx, ["openapi."])) await checkOpenApi(ctx, r);
            if (wantsAny(ctx, ["mcp."])) await checkMcp(ctx, r);
            if (wantsAny(ctx, ["conversations."])) await checkConversations(ctx, r);
            if (wantsAny(ctx, ["feedback."])) await checkFeedback(ctx, r);
        }
    }
    // Anything that didn't run because an earlier step failed.
    for (const info of CATALOG) {
        if (ctx.options.milestones.has(info.milestone) && selected(ctx.options, info.id)) {
            r.skip(
                info.id,
                options.fileText !== undefined
                    ? "Offline (--file): needs the network."
                    : "Not run: an earlier step it depends on didn't succeed.",
            );
        }
    }
    const order = new Map(CATALOG.map((c, i) => [c.id, i]));
    return r.results.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
}
