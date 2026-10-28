// Runs the checks in order, sharing what each step discovers.

import { CATALOG, MILESTONES, type Milestone } from "./catalog.ts";
import { loadIdentity, verifyHosted } from "./identity.ts";
import { checkAssertions, checkMediatedSignIn } from "./checks/assertion.ts";
import {
    checkConversations,
    checkOperationsNotReturned,
    closeCreated,
} from "./checks/conversations.ts";
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
import { checkWeb } from "./checks/web.ts";
import {
    recorder,
    selected,
    wantsAny,
    type CheckResult,
    type Context,
    type Recorder,
} from "./checks/types.ts";

// --milestone values. Milestones build on each other, so each includes the ones before it.
export function parseMilestones(value: string | undefined): Set<Milestone> | undefined {
    if (value === undefined || value === "all") return new Set(MILESTONES.map((m) => m.id));
    const found = MILESTONES.find((m) => m.id === value || String(m.number) === value);
    if (!found) return undefined;
    return new Set(MILESTONES.filter((m) => m.number <= found.number).map((m) => m.id));
}

export const UNAVAILABLE: Partial<Record<Milestone, string>> = {
    "sign-in":
        "Most Milestone 3 (sign-in and accounts) checks need a real sign-in, which the validator never does. It checks only what it can without one, such as Mediated Sign-In's grant type and an unknown sign_in_id. Check the rest by hand against checklist.md.",
    extensions:
        "Extension checks are limited to what a signed-out run can see, such as no operations returned to a Personal Agent that doesn't list the Operations extension. Check the rest by hand against checklist.md.",
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
        if (!ctx.blocked.poppy) {
            await checkExcludedTasks(ctx, r);
            await checkMetadata(ctx, r);
            await runDependent(ctx, r, options.cwd);
        }
    }
    // Anything that didn't run because an earlier step failed.
    for (const info of CATALOG) {
        if (ctx.options.milestones.has(info.milestone) && selected(ctx.options, info.id)) {
            r.skip(
                info.id,
                options.fileText !== undefined
                    ? "Offline (--file): needs the network."
                    : (ctx.blocked.poppy ??
                          ctx.blocked.issuer ??
                          ctx.blocked.identity ??
                          "Not run: an earlier step it depends on didn't succeed."),
            );
        }
    }
    const order = new Map(CATALOG.map((c, i) => [c.id, i]));
    return r.results.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
}

// The checks that use poppy.json's interfaces, most of them as the test Personal Agent.
async function runDependent(ctx: Context, r: Recorder, cwd?: string): Promise<void> {
    const issuerReady = Boolean(ctx.discovered.issuer && !ctx.blocked.issuer);
    const needsIdentity = wantsAny(ctx, [
        "session.",
        "token.",
        "assertion.",
        "mediated.",
        "conversations.",
        "operations.",
        "feedback.",
        "web.",
    ]);
    if (needsIdentity && issuerReady) {
        const identity = await loadIdentity(cwd);
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
    try {
        if (issuerReady) {
            // A started Session is what the later checks build on.
            if (
                wantsAny(ctx, [
                    "session.",
                    "token.",
                    "conversations.",
                    "operations.",
                    "web.",
                    "feedback.",
                ])
            )
                await checkSessions(ctx, r);
            if (wantsAny(ctx, ["session.", "token."])) await checkResources(ctx, r);
            if (wantsAny(ctx, ["assertion."])) await checkAssertions(ctx, r);
            if (wantsAny(ctx, ["mediated."])) await checkMediatedSignIn(ctx, r);
        }
        if (ctx.options.milestones.has("interfaces")) {
            if (wantsAny(ctx, ["openapi."])) await checkOpenApi(ctx, r);
            if (wantsAny(ctx, ["mcp."])) await checkMcp(ctx, r);
            if (issuerReady) {
                if (wantsAny(ctx, ["conversations.", "operations."]))
                    await checkConversations(ctx, r);
                checkOperationsNotReturned(ctx, r);
                if (wantsAny(ctx, ["feedback."])) await checkFeedback(ctx, r);
                if (wantsAny(ctx, ["web."])) await checkWeb(ctx, r);
            }
        }
    } finally {
        await closeCreated(ctx);
    }
}
