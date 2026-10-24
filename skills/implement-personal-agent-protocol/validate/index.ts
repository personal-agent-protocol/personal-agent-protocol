// Poppy Company validator. Acts as a test Personal Agent against a Company's deployment.
// Run from the skill folder: node validate/index.ts <command> [options]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { PROTOCOL_VERSION } from "./catalog.ts";
import { newContext, type CheckResult } from "./checks/types.ts";
import { targetOrigin } from "./checks/discovery.ts";
import { parseDesign, progress, type Design } from "./design.ts";
import { createHttp } from "./http.ts";
import { keygen, poppyDir, UsageError } from "./identity.ts";
import { formatHuman, summarize } from "./output.ts";
import { draftReport, type LastResults } from "./report.ts";
import { parseMilestones, runChecks, UNAVAILABLE } from "./run.ts";
import { formatSurvey, survey } from "./survey.ts";

const USAGE = `Poppy Company validator: checks a Company's live Personal Agent Protocol deployment.
Prefer a test environment: it starts real Sessions and sends test messages.

Usage: node validate/index.ts <command> [options]

Commands:
  survey <url>            Read-only: report the well-known documents the domain publishes.
  check [url]             Check the deployment. Writes .poppy/last-results.json.
  keygen --base-url <url> Create the test Personal Agent identity in .poppy/.
  report                  Draft an implementation report from plan/ and the latest results.
  help                    Show this help.

check options:
  --milestone <m>         foundation (1), interfaces (2), sign-in (3), or all (default).
                          Each milestone includes the ones before it.
  --design <path>         Report progress against the poppy-design block in plan/design.md.
                          Its domain is the default url.
  --file <poppy.json>     Offline: check a local poppy.json (schema and field rules only).
  --only <id or prefix>   Only these checks, such as session.start or conversations. Repeatable.
  --probe <url>           A GET operation in your API that needs a Session Token, used for
                          the DPoP checks when there's no conversation endpoint.
  --json                  Print results as JSON.

keygen options:
  --base-url <url>        The HTTPS URL where you'll host agent.json and jwks.json.
  --force                 Replace an existing key.

Exit codes: 0 no MUST failures, 1 a MUST check failed, 2 usage error.`;

function fail(message: string): never {
    throw new UsageError(message);
}

async function main(argv: string[]): Promise<number> {
    const [command, ...rest] = argv;
    if (!command || command === "help" || command === "--help" || command === "-h") {
        console.log(USAGE);
        return 0;
    }
    const { values, positionals } = parseArgs({
        args: rest,
        allowPositionals: true,
        options: {
            milestone: { type: "string" },
            design: { type: "string" },
            file: { type: "string" },
            only: { type: "string", multiple: true },
            probe: { type: "string" },
            json: { type: "boolean" },
            "base-url": { type: "string" },
            force: { type: "boolean" },
        },
    });
    const http = createHttp();

    if (command === "survey") {
        if (!positionals[0])
            fail("survey needs a URL or domain, such as: survey https://example.com");
        const report = await survey(http, positionals[0]);
        console.log(values.json ? JSON.stringify(report, null, 2) : formatSurvey(report));
        return 0;
    }

    if (command === "keygen") {
        if (!values["base-url"])
            fail(
                "keygen needs --base-url, the HTTPS URL where you'll host agent.json and jwks.json.",
            );
        const result = await keygen(values["base-url"], { force: values.force });
        console.log(
            [
                `Created a test Personal Agent in ${result.dir}.`,
                "",
                "Host these two files, unchanged, at exactly these HTTPS URLs (no redirects):",
                ...result.files.map((f) => `  ${f.local}\n    → ${f.url}`),
                "",
                `client_id: ${result.clientId}`,
                "The private key stays in .poppy/private-key.jwk. Never host or commit it.",
                result.gitignore ? `Added .poppy/ to ${result.gitignore}.` : "",
                "",
                "This identity is for testing only. Don't add it to a production allowlist.",
            ]
                .filter((l, i, a) => l !== "" || a[i - 1] !== "")
                .join("\n"),
        );
        return 0;
    }

    if (command === "check") {
        const milestones = parseMilestones(values.milestone);
        if (!milestones)
            fail(
                `--milestone must be foundation, interfaces, sign-in, all, or 1-3 (got "${values.milestone}").`,
            );
        let design: Design | undefined;
        if (values.design) {
            if (!existsSync(values.design)) fail(`No design file at ${values.design}.`);
            design = parseDesign(readFileSync(values.design, "utf8"));
        }
        const target = positionals[0] ?? (design?.domain ? `https://${design.domain}` : undefined);
        if (!target && !values.file)
            fail("check needs a URL, a --design file with a domain, or --file.");
        let fileText: string | undefined;
        if (values.file) {
            if (!existsSync(values.file)) fail(`No file at ${values.file}.`);
            fileText = readFileSync(values.file, "utf8");
        }
        if (values.probe && !values.probe.startsWith("https://"))
            fail("--probe must be an HTTPS URL.");
        const origin = target ? targetOrigin(target) : undefined;
        const ctx = newContext(
            http,
            {
                milestones,
                only: values.only ?? (fileText !== undefined ? ["discovery."] : undefined),
                probe: values.probe,
                offline: fileText !== undefined,
            },
            origin,
        );
        const results = await runChecks(ctx, { fileText });
        const notices = [...ctx.notes];
        for (const m of milestones) if (UNAVAILABLE[m] && !fileText) notices.push(UNAVAILABLE[m]!);
        const items = design
            ? progress(design, ctx.discovered.poppy, results, ctx.discovered.metadata)
            : undefined;
        const summary = summarize(results);
        saveResults(
            origin,
            http.log.map((e) => new URL(e.url).host),
            milestones,
            results,
        );
        if (values.json) {
            console.log(
                JSON.stringify(
                    {
                        target: origin ?? values.file,
                        notes: notices,
                        results,
                        summary,
                        progress: items,
                    },
                    null,
                    2,
                ),
            );
        } else {
            console.log(
                formatHuman(results, {
                    color: Boolean(process.stdout.isTTY) && !process.env.NO_COLOR,
                    notes: notices,
                    progress: items,
                }),
            );
            console.log(`\nResults written to ${join(poppyDir(), "last-results.json")}.`);
        }
        return summary.total.fail > 0 ? 1 : 0;
    }

    if (command === "report") {
        const read = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : undefined);
        const feedback = read(join("plan", "feedback.md"));
        const designText = read(join("plan", "design.md"));
        let design: Design | undefined;
        try {
            design = designText ? parseDesign(designText) : undefined;
        } catch {
            design = undefined;
        }
        const lastText = read(join(poppyDir(), "last-results.json"));
        const last = lastText ? (JSON.parse(lastText) as LastResults) : undefined;
        const report = draftReport({ feedback, design, last });
        console.log(report.markdown);
        console.log("Prefilled issue (review the draft above first; nothing has been sent):");
        console.log(report.url);
        if (!report.url.includes("&"))
            console.log(
                "The report is too long for a URL. Open the link and paste the Markdown above into the form.",
            );
        console.log("\nThe engineer should review this draft and file it themselves.");
        return 0;
    }

    fail(`Unknown command "${command}". Run "node validate/index.ts help".`);
}

function saveResults(
    target: string | undefined,
    hosts: string[],
    milestones: Set<string>,
    results: CheckResult[],
): void {
    const dir = poppyDir();
    mkdirSync(dir, { recursive: true });
    const data = {
        tool: "poppy-validator",
        protocol_version: PROTOCOL_VERSION,
        generated_at: new Date().toISOString(),
        target,
        hosts: [...new Set(hosts)],
        milestones: [...milestones],
        results,
    };
    writeFileSync(join(dir, "last-results.json"), JSON.stringify(data, null, 2) + "\n");
}

main(process.argv.slice(2)).then(
    (code) => {
        process.exitCode = code;
    },
    (error) => {
        if (
            error instanceof UsageError ||
            (error instanceof Error &&
                error.name === "TypeError" &&
                /option|argument/i.test(error.message))
        ) {
            console.error(
                `Error: ${error.message}\n\nRun "node validate/index.ts help" for usage.`,
            );
            process.exitCode = 2;
        } else {
            console.error(error instanceof Error ? error.stack : error);
            process.exitCode = 2;
        }
    },
);
