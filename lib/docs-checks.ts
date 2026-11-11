import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
    SHARED_TABS,
    VERSION_ENTRIES,
    VERSIONED_SLUGS,
    VERSIONS,
    type DocsVersion,
} from "../content/docs";
import { linkProblems, pageMarkdown } from "./docs-content";
import { stalePlumbing } from "./docs-plumbing";

// The build's checks on the docs. Each returns problems as messages, and the build fails on any.

const CONTENT = join(process.cwd(), "content");

function mdxFiles(dir: string): string[] {
    return readdirSync(dir)
        .sort()
        .flatMap((name) => {
            const path = join(dir, name);
            return statSync(path).isDirectory()
                ? mdxFiles(path)
                : name.endsWith(".mdx")
                  ? [relative(CONTENT, path)]
                  : [];
        });
}

// versions.json lists versions newest first, only the latest can be a draft, each published one
// has a hash for each page, and each version's folder has exactly the pages its entry lists.
function versionProblems(): string[] {
    const problems: string[] = [];
    const ids = VERSION_ENTRIES.map((entry) => entry.id);
    const order = (id: string) => id.split(".").map(Number);
    ids.forEach((id, i) => {
        const [major, minor] = order(id);
        const next = ids[i + 1];
        if (!/^\d+\.\d+$/.test(id)) {
            problems.push(`versions.json: ${id} isn't a version such as 0.2.`);
        } else if (
            next &&
            (major < order(next)[0] || (major === order(next)[0] && minor <= order(next)[1]))
        ) {
            problems.push(`versions.json: list versions newest first, so ${id} after ${next}.`);
        }
    });
    VERSION_ENTRIES.forEach((entry, i) => {
        const slugs = Array.isArray(entry.pages) ? entry.pages : Object.keys(entry.pages);
        if (!entry.published && i > 0) {
            problems.push(`versions.json: ${entry.id} is a draft, but only the latest can be.`);
        }
        if (
            entry.published &&
            (Array.isArray(entry.pages) || !/^\d{4}-\d{2}-\d{2}$/.test(entry.published))
        ) {
            problems.push(
                `versions.json: ${entry.id} is published, so it needs a date as YYYY-MM-DD and a SHA-256 for each page.`,
            );
        }
        for (const slug of slugs) {
            if (!VERSIONED_SLUGS.includes(slug)) {
                problems.push(
                    `versions.json: ${entry.id} lists ${slug}, which content/docs.ts doesn't.`,
                );
            }
        }
    });
    const versionDirs = readdirSync(join(CONTENT, "versions")).filter((name) =>
        statSync(join(CONTENT, "versions", name)).isDirectory(),
    );
    for (const dir of versionDirs) {
        const entry = VERSION_ENTRIES.find((e) => e.id === dir);
        if (!entry) {
            problems.push(`content/versions/${dir} isn't in versions.json.`);
            continue;
        }
        const slugs = Array.isArray(entry.pages) ? entry.pages : Object.keys(entry.pages);
        const expected = new Set(slugs.map((slug) => `versions/${dir}/${slug}.mdx`));
        const actual = new Set(mdxFiles(join(CONTENT, "versions", dir)));
        for (const file of actual) {
            if (!expected.has(file)) {
                problems.push(`content/${file} isn't a page of ${dir} in versions.json.`);
            }
        }
        for (const file of expected) {
            if (!actual.has(file)) {
                problems.push(`content/${file} is missing.`);
            }
        }
    }
    const shared = new Set(SHARED_TABS.flatMap((tab) => tab.pages.map((p) => p.file)));
    for (const file of mdxFiles(join(CONTENT, "shared"))) {
        if (!shared.has(file)) {
            problems.push(`content/${file} isn't a page in content/docs.ts.`);
        }
    }
    return problems;
}

// The version number a spec states, wherever it states it.
const VERSION_MENTIONS = [
    /This is (?:draft )?version (\d+\.\d+)\./g,
    /This (?:draft|version) is `(\d+\.\d+)`/g,
    /"protocol_version": "(\d+\.\d+)"/g,
    /^Poppy-Version: (\d+\.\d+)$/gm,
];

// Each version's spec states that version's number.
function specVersionProblems(version: DocsVersion): string[] {
    const spec = version.tabs.flatMap((tab) => tab.pages).find((p) => p.slug === "spec");
    if (!spec) {
        return [];
    }
    const markdown = pageMarkdown(spec.href);
    const found = VERSION_MENTIONS.flatMap((pattern) =>
        [...markdown.matchAll(pattern)].map((m) => m[1]),
    );
    if (!found.length) {
        return [
            `content/${spec.file}: it needs "This is ${version.draft ? "draft " : ""}version ${version.id}."`,
        ];
    }
    return found
        .filter((id) => id !== version.id)
        .map((id) => `content/${spec.file}: it says version ${id}, but it's in ${version.id}.`);
}

export function docsProblems(): string[] {
    const problems = versionProblems();
    if (problems.length) {
        return problems;
    }
    const stale = stalePlumbing();
    return [
        ...VERSIONS.flatMap(specVersionProblems),
        ...linkProblems(),
        ...(stale.length
            ? [
                  `The docs routes or vercel.json are out of date. Run \`pnpm docs:sync\`. Changed: ${stale.slice(0, 10).join(", ")}`,
              ]
            : []),
    ];
}

let checked = false;

// Throws if the docs have problems. Runs once per build.
export function checkDocs() {
    if (checked) {
        return;
    }
    const problems = docsProblems();
    if (problems.length) {
        throw new Error(`The docs have problems:\n${problems.join("\n")}`);
    }
    checked = true;
}
