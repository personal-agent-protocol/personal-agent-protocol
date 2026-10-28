// Formats check results for people (color only on a TTY) and as JSON for agents.

import { MILESTONES, SECTION_NUMBERS, type Milestone } from "./catalog.ts";
import type { CheckResult, Status } from "./checks/types.ts";
import type { ProgressItem } from "./design.ts";

export type Summary = Record<Milestone, Record<Status, number>> & { total: Record<Status, number> };

export function summarize(results: CheckResult[]): Summary {
    const empty = (): Record<Status, number> => ({ pass: 0, fail: 0, warn: 0, skip: 0 });
    const summary = { total: empty() } as Summary;
    for (const m of MILESTONES) summary[m.id] = empty();
    for (const r of results) {
        summary[r.milestone][r.status]++;
        summary.total[r.status]++;
    }
    return summary;
}

export type Colors = {
    red(s: string): string;
    green(s: string): string;
    yellow(s: string): string;
    dim(s: string): string;
    bold(s: string): string;
};

export function colors(enabled: boolean): Colors {
    const wrap = (code: string) => (s: string) => (enabled ? `\x1b[${code}m${s}\x1b[0m` : s);
    return {
        red: wrap("31"),
        green: wrap("32"),
        yellow: wrap("33"),
        dim: wrap("2"),
        bold: wrap("1"),
    };
}

const ICONS: Record<Status, string> = { pass: "✓", fail: "✗", warn: "!", skip: "-" };

const PAGE_LABELS: Record<string, string> = {
    spec: "spec",
    operations: "Operations",
    "mediated-sign-in": "Mediated Sign-In",
};

export function sectionLabel(section: string): string {
    const number = SECTION_NUMBERS[section];
    const page = section.split("#")[0];
    if (!number) return page;
    return `${PAGE_LABELS[page] ?? page} ${number}`;
}

function line(label: string, value: string): string {
    return `  ${(label.endsWith("?") ? label : label + ":").padEnd(13)} ${value}`;
}

export function formatResult(r: CheckResult, c: Colors, previous?: CheckResult): string {
    const color =
        r.status === "pass"
            ? c.green
            : r.status === "fail"
              ? c.red
              : r.status === "warn"
                ? c.yellow
                : c.dim;
    const head = `${color(ICONS[r.status])} ${r.id}  ${r.title}${r.inconclusive ? " (inconclusive)" : ""}`;
    const out = [`${head.padEnd(90)} ${c.dim(sectionLabel(r.section))}`];
    if (r.status === "skip") {
        if (!(previous?.status === "skip" && previous.reason === r.reason))
            out.push(c.dim(`  ${r.reason ?? "Skipped."}`));
        return out.join("\n");
    }
    if (r.status === "pass") {
        if (r.summary) out.push(c.dim(`  ${r.summary}`));
        for (const note of r.notes ?? []) out.push(c.dim(`  Note: ${note}`));
        return out.join("\n");
    }
    out.push(line("Requirement", `"${r.quote}"`));
    if (r.sent) out.push(line("Sent", r.sent));
    for (const ex of r.exchanges ?? []) {
        out.push(c.dim(`                ${ex.request}`));
        for (const [k, v] of Object.entries(ex.requestHeaders ?? {}))
            out.push(c.dim(`                  ${k}: ${v}`));
        if (ex.requestBody) out.push(c.dim(`                  ${ex.requestBody}`));
        out.push(c.dim(`                → ${ex.response}`));
        for (const [k, v] of Object.entries(ex.responseHeaders ?? {}))
            out.push(c.dim(`                  ${k}: ${v}`));
        if (ex.responseBody) out.push(c.dim(`                  ${ex.responseBody}`));
    }
    if (r.got) out.push(line("Got", r.got));
    if (r.expected) out.push(line("Expected", r.expected));
    if (r.cause) out.push(line("Likely cause", r.cause));
    for (const note of r.notes ?? []) out.push(line("Note", note));
    out.push(line("Spec", r.specUrl));
    out.push(line("Disagree?", r.disagreeUrl));
    return out.join("\n");
}

export function formatSummary(results: CheckResult[], c: Colors): string {
    const s = summarize(results);
    const lines = ["Summary"];
    for (const m of MILESTONES) {
        const n = s[m.id];
        if (n.pass + n.fail + n.warn + n.skip === 0) continue;
        const inconclusive = results.filter((r) => r.milestone === m.id && r.inconclusive).length;
        const warnings = `${n.warn} warnings${inconclusive ? ` (${inconclusive} inconclusive)` : ""}`;
        const parts = [
            c.green(`${n.pass} passed`),
            n.fail ? c.red(`${n.fail} failed`) : `${n.fail} failed`,
            n.warn ? c.yellow(warnings) : warnings,
            `${n.skip} skipped`,
        ];
        lines.push(`  ${m.number}. ${m.title.padEnd(22)} ${parts.join(", ")}`);
    }
    return lines.join("\n");
}

export function formatProgress(items: ProgressItem[]): string {
    if (items.length === 0) return "";
    const lines = ["Progress against the design"];
    for (const item of items) {
        lines.push(
            `  ${`${item.kind} ${item.name}`.padEnd(28)} ${item.state}${item.failing.length ? ` (${item.failing.join(", ")})` : ""}`,
        );
    }
    return lines.join("\n");
}

export function formatHuman(
    results: CheckResult[],
    options: { color: boolean; notes?: string[]; progress?: ProgressItem[] },
): string {
    const c = colors(options.color);
    const parts: string[] = [];
    for (const note of options.notes ?? []) parts.push(c.yellow(`Note: ${note}`));
    results.forEach((r, i) => parts.push(formatResult(r, c, results[i - 1])));
    parts.push("", formatSummary(results, c));
    if (options.progress?.length) parts.push("", formatProgress(options.progress));
    return parts.join("\n");
}
