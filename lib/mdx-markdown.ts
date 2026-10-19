import type { Nodes, PhrasingContent, Root, RootContent } from "mdast";
import remarkGfm from "remark-gfm";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import { headingId } from "./mdx";
import { NEW_ISSUE_URL, SITE_URL } from "./site";

// Writes a docs page's MDX as plain Markdown, such as /docs/spec.md: components become Markdown
// or are dropped, heading ids are dropped, and each paragraph is one line.

// Components with no Markdown form.
const DROP = new Set(["PronounceButton", "CommentingButton", "PermalinkButton"]);

type Jsx = {
    type: "mdxJsxFlowElement" | "mdxJsxTextElement";
    name: string | null;
    attributes: { type: string; name?: string; value?: unknown }[];
    children: RootContent[];
};

function attribute(node: Jsx, name: string): string | undefined {
    const value = node.attributes.find((a) => a.name === name)?.value;
    return typeof value === "string" ? value : undefined;
}

function lower(node: RootContent): RootContent[] {
    const type = node.type as string;
    if (type === "mdxJsxFlowElement" || type === "mdxJsxTextElement") {
        const jsx = node as unknown as Jsx;
        if (jsx.name && DROP.has(jsx.name)) {
            return [];
        }
        if (jsx.name === "IssueLink") {
            return [
                {
                    type: "link",
                    url: NEW_ISSUE_URL,
                    children: phrasing(jsx.children.flatMap(lower)) as PhrasingContent[],
                },
            ];
        }
        if (jsx.name === "Video") {
            // The video's heading and description, then a link to watch it on the site.
            const children = jsx.children.flatMap(lower);
            const heading = children.find((c) => c.type === "heading");
            const id = heading?.type === "heading" ? headingId(heading) : undefined;
            if (!id) {
                throw new Error("A <Video> needs a heading with an id");
            }
            const url = `${SITE_URL}/docs/videos#${id}`;
            const link: RootContent = {
                type: "paragraph",
                children: [
                    { type: "link", url, children: [{ type: "text", value: "Watch the video" }] },
                ],
            };
            return [...children, link];
        }
        return jsx.children.flatMap(lower);
    }
    if (type === "mdxFlowExpression" || type === "mdxTextExpression" || type === "mdxjsEsm") {
        return [];
    }
    if (node.type === "code") {
        const label = /label="([^"]*)"/.exec(node.meta ?? "")?.[1];
        const code = { type: "code" as const, value: node.value };
        // The label is written as is: as text, a URL in it would be escaped.
        return label === undefined ? [code] : [{ type: "html", value: `*${label}*` }, code];
    }
    if (node.type === "paragraph" && (node.data as { changeTags?: boolean })?.changeTags) {
        // A changelog entry's tags (lib/changelog.ts), as "Breaking · 4.3 · Issue #6".
        const children = node.children.flatMap((tag, i) => [
            ...(i ? [{ type: "text" as const, value: " · " }] : []),
            ...lower(tag),
        ]);
        return [{ type: "paragraph", children: children as PhrasingContent[] }];
    }
    if ("children" in node) {
        const children = (node.children as RootContent[]).flatMap(lower);
        return [{ ...node, children: phrasing(children) } as RootContent];
    }
    return [node];
}

// Joins adjacent text, makes each run of whitespace one space, and trims the ends, so a paragraph
// is one line. A space left before ")" by a dropped component goes too.
function phrasing(children: RootContent[]): RootContent[] {
    if (!children.some((c) => c.type === "text")) {
        return children;
    }
    const out: RootContent[] = [];
    for (const child of children) {
        const prev = out[out.length - 1];
        if (child.type === "text" && prev?.type === "text") {
            prev.value += child.value;
        } else {
            out.push(child.type === "text" ? { ...child } : child);
        }
    }
    for (const child of out) {
        if (child.type === "text") {
            child.value = child.value.replace(/\s+/g, " ").replace(/ \)/g, ")");
        }
    }
    const first = out[0];
    const last = out[out.length - 1];
    if (first?.type === "text") {
        first.value = first.value.trimStart();
    }
    if (last?.type === "text") {
        last.value = last.value.trimEnd();
    }
    return out.filter((c) => c.type !== "text" || c.value !== "") as PhrasingContent[];
}

const stringifier = unified().use(remarkGfm, { tablePipeAlign: false }).use(remarkStringify, {
    bullet: "-",
    emphasis: "*",
    strong: "*",
    fence: "`",
    fences: true,
    listItemIndent: "one",
    rule: "-",
    resourceLink: true,
});

// Table delimiter rows as `| --- |`, and empty cells as `|  |`, as the Markdown has always had them.
function tableRows(markdown: string): string {
    return markdown
        .replace(/^\| -( \| -)* \|$/gm, (row) => row.replace(/ - /g, " --- "))
        .replace(/^\|.*\|$/gm, (row) => row.replace(/\| (?=\|)/g, "|  "));
}

// Ends every Markdown page, so copies of the page keep the license.
const LICENSE_NOTICE = `---\n\nLicensed under the [Apache License 2.0](${SITE_URL}/license).`;

export function mdxToMarkdown(tree: Root): string {
    const lowered: Root = { type: "root", children: tree.children.flatMap(lower) };
    const body = tableRows(stringifier.stringify(lowered as Nodes as Root)).trimEnd();
    return `${body}\n\n${LICENSE_NOTICE}\n`;
}
