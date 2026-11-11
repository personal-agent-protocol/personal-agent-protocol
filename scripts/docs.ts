import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { docsProblems } from "../lib/docs-checks";
import { extraPlumbing, plumbingFiles } from "../lib/docs-plumbing";
import type { VersionEntry } from "../content/docs";

// The docs versions (content/AGENTS.md):
//
// `pnpm docs:sync` writes the files that follow from the docs pages and versions: each page's .md
// route and the docs redirects and headers in vercel.json. Then it runs the build's docs checks.
//
// `pnpm docs:publish [YYYY-MM-DD]` publishes the draft: records the date, today by default, and
// each page's SHA-256, which freezes it. The site then shows it as the latest version.
//
// `pnpm docs:draft <version>`, such as 0.3, starts a draft from the latest published version.

const root = process.cwd();
const VERSIONS_FILE = join(root, "content/versions/versions.json");
const CHANGELOG = join(root, "content/shared/changelog.mdx");
const CATALOG = join(root, "kit/company/validate/catalog.ts");

function fail(message: string): never {
    console.error(message);
    process.exit(1);
}

function readEntries(): VersionEntry[] {
    return JSON.parse(readFileSync(VERSIONS_FILE, "utf8"));
}

function writeEntries(entries: VersionEntry[]) {
    writeFileSync(VERSIONS_FILE, JSON.stringify(entries, null, 4) + "\n");
}

function edit(path: string, change: (text: string) => string, what: string) {
    const before = readFileSync(path, "utf8");
    const after = change(before);
    if (after === before) {
        fail(`Couldn't ${what} in ${path}. Make the change by hand, then run pnpm docs:sync.`);
    }
    writeFileSync(path, after);
}

// Runs a script in a new process, which reads the versions just written.
function run(script: string, ...args: string[]) {
    execFileSync("pnpm", ["--silent", script, ...args], { stdio: "inherit" });
}

function format(...paths: string[]) {
    execFileSync("pnpm", ["exec", "prettier", "--log-level", "warn", "--write", ...paths], {
        stdio: "inherit",
    });
}

// The date in Pacific time, as YYYY-MM-DD.
function today(): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
}

function anchor(id: string): string {
    return `v${id.replace(/\./g, "-")}`;
}

function sync() {
    for (const file of plumbingFiles()) {
        const path = join(root, file.path);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, file.content);
    }
    for (const path of extraPlumbing()) {
        rmSync(dirname(join(root, path)), { recursive: true });
    }
    const problems = docsProblems();
    if (problems.length) {
        fail(problems.join("\n"));
    }
    console.log("The docs checks pass.");
}

function publish(date = today()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        fail(`Give the date as YYYY-MM-DD, not ${date}.`);
    }
    const entries = readEntries();
    const [draft] = entries;
    if (draft.published || !Array.isArray(draft.pages)) {
        fail(`${draft.id} is already published. Start a draft with pnpm docs:draft <version>.`);
    }
    // A published spec doesn't call itself a draft.
    const spec = join(root, `content/versions/${draft.id}/spec.mdx`);
    edit(
        spec,
        (text) =>
            text
                .replace(`This is draft version ${draft.id}.`, `This is version ${draft.id}.`)
                .replace(`This draft is \`${draft.id}\``, `This version is \`${draft.id}\``),
        'drop "draft" from the version number',
    );
    const hash = (slug: string) =>
        createHash("sha256")
            .update(readFileSync(join(root, `content/versions/${draft.id}/${slug}.mdx`)))
            .digest("hex");
    entries[0] = {
        id: draft.id,
        published: date,
        pages: Object.fromEntries(draft.pages.map((slug) => [slug, hash(slug)])),
    };
    writeEntries(entries);
    edit(
        CHANGELOG,
        (text) =>
            text.replace(
                `## Draft ${draft.id} {#${anchor(draft.id)}}`,
                `## Version ${draft.id} {#${anchor(draft.id)}}`,
            ),
        `rename the "Draft ${draft.id}" section`,
    );
    format(VERSIONS_FILE, CHANGELOG);
    run("docs:sync");
    run("kit");
    console.log(
        `Published ${draft.id}. In content/shared/changelog.mdx, say when it was published in the ${draft.id} section's first paragraph.`,
    );
}

function startDraft(id: string | undefined) {
    const entries = readEntries();
    const [latest] = entries;
    if (!id || !/^\d+\.\d+$/.test(id)) {
        fail("Give the new draft's version, such as pnpm docs:draft 0.3.");
    }
    if (!latest.published) {
        fail(`${latest.id} is still a draft. Publish it first with pnpm docs:publish.`);
    }
    const [major, minor] = id.split(".").map(Number);
    const [lastMajor, lastMinor] = latest.id.split(".").map(Number);
    if (major < lastMajor || (major === lastMajor && minor <= lastMinor)) {
        fail(`${id} must be later than ${latest.id}.`);
    }
    const pages = Object.keys(latest.pages);
    cpSync(join(root, `content/versions/${latest.id}`), join(root, `content/versions/${id}`), {
        recursive: true,
    });
    writeEntries([{ id, pages }, ...entries]);
    // The version number in the spec. The build checks that these say the new version.
    const old = latest.id.replace(".", "\\.");
    edit(
        join(root, `content/versions/${id}/spec.mdx`),
        (text) =>
            text
                .replace(
                    new RegExp(`This is (?:draft )?version ${old}\\.`),
                    `This is draft version ${id}.`,
                )
                .replace(new RegExp(`("protocol_version": ")${old}"`, "g"), `$1${id}"`)
                .replace(new RegExp(`^(Poppy-Version: )${old}$`, "gm"), `$1${id}`)
                .replace(
                    new RegExp(`This (?:draft|version) is \`${old}\``),
                    `This draft is \`${id}\``,
                ),
        "change the version number",
    );
    // The version in examples on every page: poppy.json documents and the Poppy-Version header.
    // Pages without examples don't change.
    for (const page of pages.filter((page) => page !== "spec")) {
        const path = join(root, `content/versions/${id}/${page}.mdx`);
        writeFileSync(
            path,
            readFileSync(path, "utf8")
                .replace(new RegExp(`("protocol_version": ")${old}"`, "g"), `$1${id}"`)
                .replace(new RegExp(`^(Poppy-Version: )${old}$`, "gm"), `$1${id}`),
        );
    }
    edit(
        CATALOG,
        (text) =>
            text.replace(
                /(export const PROTOCOL_VERSION = ")[^"]*"/,
                (_, start: string) => `${start}${id}"`,
            ),
        "change PROTOCOL_VERSION",
    );
    edit(
        CHANGELOG,
        (text) =>
            text.replace(
                /^## /m,
                `## Draft ${id} {#${anchor(id)}}\n\nIn progress, at [/docs/spec](/docs/spec). This list grows until ${id} is published.\n\n## `,
            ),
        "add a section for the draft",
    );
    format(VERSIONS_FILE, CHANGELOG, CATALOG);
    run("docs:sync");
    run("kit");
    console.log(`Started draft ${id}, in content/versions/${id}/.`);
}

const [command, arg] = process.argv.slice(2);
if (command === "sync") {
    sync();
} else if (command === "publish") {
    publish(arg);
} else if (command === "draft") {
    startDraft(arg);
} else {
    fail("Usage: pnpm docs:sync | pnpm docs:publish [YYYY-MM-DD] | pnpm docs:draft <version>");
}
