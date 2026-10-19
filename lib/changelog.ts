import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Paragraph, PhrasingContent, Root, RootContent } from "mdast";
import { docsHref, VERSIONS, type DocsVersion } from "../content/docs";
import { REPO_URL } from "./site";

// The changelog's entries. Each is a <Change> in a version's section:
//
//   <Change title="DPoP at MCP servers" breaking sections="4.3, 6" issue="6">
//
//   An MCP server supports DPoP by listing…
//
//   </Change>
//
// `remarkChanges` turns it into a heading, which gives the entry an id such as
// `v0-2-dpop-at-mcp-servers`, with a button that copies its URL, then a row of tags, then the
// text. A title can put code in backticks,
// such as "Which domain `poppy.json` speaks for". The tags are "Breaking", a link to each section in
// `sections`, and a link to the public issue. A section is a spec section number, such as "4.3", an
// extension's name and section, such as "Operations 3.2", "Guides", or a guide heading by its id,
// such as "guides#both-key-rotation". Each must exist in the entry's version.

type Target = { href: string; label: string };

const CONTENT = join(process.cwd(), "content");

// Headings with an id, from a page's MDX source.
function headings(file: string): { text: string; id: string }[] {
    const out: { text: string; id: string }[] = [];
    let fence = false;
    for (const line of readFileSync(join(CONTENT, file), "utf8").split("\n")) {
        if (/^\s*(`{3,}|~{3,})/.test(line)) {
            fence = !fence;
        }
        const match = fence ? null : /^#{2,4} (.+?)\s*\{#([\w-]+)\}\s*$/.exec(line);
        if (match) {
            out.push({ text: match[1], id: match[2] });
        }
    }
    return out;
}

const targets = new Map<string, Map<string, Target>>();

// The sections an entry in `version` can name, by how it names them.
function versionTargets(version: DocsVersion): Map<string, Target> {
    const cached = targets.get(version.id);
    if (cached) {
        return cached;
    }
    const map = new Map<string, Target>();
    for (const page of version.tabs.flatMap((tab) => tab.pages)) {
        const href = docsHref(page.slug, version)!;
        const extension = /^extensions\/(.+)$/.exec(page.slug)?.[1];
        const name = page.slug === "guides" ? "Guides" : extension ? page.navTitle : undefined;
        if (name) {
            map.set(name, { href, label: name });
        }
        for (const { text, id } of headings(page.file)) {
            const number = /^(\d+(?:\.\d+)*)\.? /.exec(text)?.[1];
            const key =
                page.slug === "spec" && number
                    ? number
                    : extension && number
                      ? `${name} ${number}`
                      : page.slug === "guides"
                        ? `guides#${id}`
                        : undefined;
            if (key) {
                const label =
                    page.slug === "guides"
                        ? `Guides: ${text}`
                        : page.slug === "spec"
                          ? `Spec ${key}`
                          : key;
                map.set(key, { href: `${href}#${id}`, label });
            }
        }
    }
    targets.set(version.id, map);
    return map;
}

function attribute(node: RootContent, name: string): string | true | undefined {
    const attr = (
        node as unknown as { attributes: { name?: string; value?: unknown }[] }
    ).attributes.find((a) => a.name === name);
    if (!attr) {
        return undefined;
    }
    return typeof attr.value === "string" ? attr.value : true;
}

function slug(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}

// `tip` is a tooltip.
function tag(kind: string, children: PhrasingContent[], tip?: string): PhrasingContent {
    return {
        type: "mdxJsxTextElement",
        name: "Tag",
        attributes: [
            { type: "mdxJsxAttribute", name: "kind", value: kind },
            ...(tip ? [{ type: "mdxJsxAttribute", name: "tip", value: tip }] : []),
        ],
        children,
    } as unknown as PhrasingContent;
}

function link(url: string, text: string): PhrasingContent {
    return { type: "link", url, children: [{ type: "text", value: text }] };
}

export function remarkChanges(file = "content/shared/changelog.mdx") {
    return () => (tree: Root) => {
        let version: DocsVersion | undefined;
        const ids = new Set<string>();
        for (const node of tree.children) {
            if (node.type === "heading" && node.depth === 2) {
                const id = node.data?.hProperties?.id;
                version = VERSIONS.find((v) => id === `v${v.id.replace(".", "-")}`);
                continue;
            }
            if ((node.type as string) !== "mdxJsxFlowElement") {
                continue;
            }
            const jsx = node as unknown as { name: string; children: RootContent[] };
            if (jsx.name !== "Change") {
                continue;
            }
            const title = attribute(node, "title");
            if (typeof title !== "string" || !version) {
                throw new Error(`${file}: a <Change> needs a title and a version's section`);
            }
            const id = `v${version.id.replace(".", "-")}-${slug(title)}`;
            if (ids.has(id)) {
                throw new Error(`${file}: two changes are titled "${title}" in ${version.label}`);
            }
            ids.add(id);
            const tags: PhrasingContent[] = [];
            if (attribute(node, "breaking")) {
                // VERSIONS is newest first, so the version before this one is the next.
                const previous = VERSIONS[VERSIONS.indexOf(version) + 1];
                const tip = previous
                    ? `A breaking change for implementations of version ${previous.id}`
                    : "A breaking change for implementations of the previous version";
                tags.push(tag("breaking", [{ type: "text", value: "Breaking" }], tip));
            }
            const sections = attribute(node, "sections");
            const known = versionTargets(version);
            for (const name of typeof sections === "string" ? sections.split(",") : []) {
                const target = known.get(name.trim());
                if (!target) {
                    throw new Error(
                        `${file}: "${title}" names section "${name.trim()}", which ${version.label} doesn't have`,
                    );
                }
                tags.push(tag("section", [link(target.href, target.label)]));
            }
            const issue = attribute(node, "issue");
            if (typeof issue === "string") {
                tags.push(tag("issue", [link(`${REPO_URL}/issues/${issue}`, `Issue #${issue}`)]));
            }
            // `changeTags` tells the Markdown version to separate the tags.
            const row = {
                type: "paragraph",
                children: tags,
                data: { changeTags: true, hProperties: { className: ["change-tags"] } },
            } as Paragraph;
            jsx.children = [
                {
                    type: "heading",
                    depth: 4,
                    children: [
                        {
                            type: "mdxJsxTextElement",
                            name: "PermalinkButton",
                            attributes: [{ type: "mdxJsxAttribute", name: "id", value: id }],
                            children: [],
                        } as unknown as PhrasingContent,
                        ...title
                            .split("`")
                            .map(
                                (value, i): PhrasingContent =>
                                    i % 2 ? { type: "inlineCode", value } : { type: "text", value },
                            ),
                    ],
                    data: { hProperties: { id } },
                },
                ...(tags.length ? [row] : []),
                ...jsx.children,
            ];
        }
    };
}
