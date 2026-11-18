import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { DOCS_PAGES, LATEST, NEWEST, resolveDocsLink } from "../../content/docs";
import { pageMarkdown } from "../docs-content";
import { REPO_URL, SITE_NAME, SITE_URL } from "../site";
import { checklistMarkdown } from "./checklist";
import { pageName } from "./docs";

// The kit's skill, as files: implement-personal-agent-protocol, for a Company implementing the
// protocol. It's a folder with a SKILL.md. `pnpm kit` writes them to
// skills/, where agents install them from the repository, and the site serves the same files.

export type KitFile = { path: string; content: string };

export const SKILLS = {
    company: { name: "implement-personal-agent-protocol", source: "kit/company" },
} as const;

export type SkillId = keyof typeof SKILLS;

const ROOT = process.cwd();

// Kit sources that stay in the repository: the validator's tests.
const NOT_SHIPPED = ["validate/test/"];

function filesUnder(dir: string): string[] {
    return readdirSync(dir)
        .sort()
        .flatMap((name) => {
            const path = join(dir, name);
            return statSync(path).isDirectory() ? filesUnder(path) : [path];
        });
}

// The kit follows the latest published version, so it leaves out the draft's changelog section,
// which describes changes that the version it follows doesn't have.
function withoutDraft(markdown: string): string {
    if (!NEWEST.draft) return markdown;
    const heading = `## Draft ${NEWEST.id}\n`;
    const start = markdown.indexOf(heading);
    if (start === -1) return markdown;
    const end = markdown.indexOf("\n## ", start + heading.length);
    return markdown.slice(0, start) + (end === -1 ? "" : markdown.slice(end + 1));
}

// The docs as Markdown, with links to the site made absolute, since the files are read offline.
function referenceFiles(): KitFile[] {
    return DOCS_PAGES.filter((page) => page.kit !== false).map((page) => ({
        path: `reference/${pageName(page)}.md`,
        content: withoutDraft(pageMarkdown(page.href)).replace(/\]\(\//g, `](${SITE_URL}/`),
    }));
}

// Links to the docs in the kit's sources, such as /docs/spec#fields, point at the version the kit
// follows, the latest published one, as links on shared pages do.
function pinDocsLinks(text: string): string {
    const site = SITE_URL.replace(/[.]/g, "\\.");
    return text.replace(
        new RegExp(`${site}(/docs/[a-z0-9/.-]*[a-z0-9])`, "g"),
        (_, path: string) => SITE_URL + resolveDocsLink(path),
    );
}

function companySkill(): KitFile[] {
    const source = join(ROOT, SKILLS.company.source);
    const files = filesUnder(source)
        .map((path) => ({
            path: relative(source, path),
            content: pinDocsLinks(readFileSync(path, "utf8")),
        }))
        .filter((file) => !NOT_SHIPPED.some((prefix) => file.path.startsWith(prefix)));
    return [
        ...files,
        { path: "checklist.md", content: checklistMarkdown(LATEST.label.toLowerCase()) },
        ...referenceFiles(),
    ];
}

// A skill's files, with paths inside its folder.
export function skillFiles(id: SkillId): KitFile[] {
    return companySkill().sort((a, b) => a.path.localeCompare(b.path));
}

// The Claude Code plugin marketplace: one plugin holding the skill.
function marketplace(): string {
    const skills = Object.values(SKILLS).map((skill) => `./skills/${skill.name}`);
    return (
        JSON.stringify(
            {
                name: "personal-agent-protocol",
                owner: { name: SITE_NAME },
                metadata: {
                    description: `Skills for implementing ${SITE_NAME} (Poppy).`,
                    version: LATEST.id,
                },
                plugins: [
                    {
                        name: "personal-agent-protocol",
                        description: `Implement ${SITE_NAME} (Poppy) for a Company, with a validator.`,
                        source: "./",
                        strict: false,
                        homepage: `${SITE_URL}/kit/company`,
                        repository: REPO_URL,
                        skills,
                    },
                ],
            },
            null,
            4,
        ) + "\n"
    );
}

// Every generated file, with its path in the repository.
export function generatedFiles(): KitFile[] {
    return [
        { path: ".claude-plugin/marketplace.json", content: marketplace() },
        ...(Object.keys(SKILLS) as SkillId[]).flatMap((id) =>
            skillFiles(id).map((file) => ({
                path: `skills/${SKILLS[id].name}/${file.path}`,
                content: file.content,
            })),
        ),
    ];
}

// The generated folders, which `pnpm kit` replaces.
export const GENERATED_DIRS = Object.values(SKILLS).map((skill) => `skills/${skill.name}`);

// Generated files that are missing, changed, or no longer generated. The build fails on any.
export function staleFiles(): string[] {
    const expected = new Map(generatedFiles().map((file) => [file.path, file.content]));
    const stale: string[] = [];
    for (const [path, content] of expected) {
        let current: string | undefined;
        try {
            current = readFileSync(join(ROOT, path), "utf8");
        } catch {
            current = undefined;
        }
        if (current !== content) {
            stale.push(path);
        }
    }
    for (const dir of GENERATED_DIRS) {
        let existing: string[] = [];
        try {
            existing = filesUnder(join(ROOT, dir)).map((path) => relative(ROOT, path));
        } catch {
            existing = [];
        }
        stale.push(...existing.filter((path) => !expected.has(path)));
    }
    return stale;
}
