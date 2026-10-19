import { createProcessor } from "@mdx-js/mdx";
import type { Element, ElementContent, Root as HastRoot, RootContent, Text } from "hast";
import type { Heading, Nodes, Root, RootContent as MdastContent } from "mdast";
import remarkGfm from "remark-gfm";
import { remarkChanges } from "./changelog";
import type { OutlineSection } from "./docs-outline";

// The docs' Markdown syntax, shared by the pages, their outline, and their .md versions. Content
// files are MDX: Markdown, plus components such as <PronounceButton />. On top of that:
//
// - `## Principles {#principles}` gives a heading an id. Headings without one get none.
// - `## 3. Discovery {#discovery}` numbers a section: the number shows in a `secnum` span.
// - Requirement words such as MUST and SHOULD NOT, in capitals, are marked up as requirements.
// - A table row whose only text is a bold first cell, like `| **Parties** | |`, starts a group of
//   rows, labeled by that cell.
// - A code block's `label="..."` says what it shows, such as which party sends a request.
// - Links to other sites open in a new tab.

const HEADING_ID = /[ \t]*\{#([\w-]+)\}[ \t]*$/;

// MDX reads `{...}` as JavaScript, so escape the brace of a heading id before parsing.
export function escapeHeadingIds(source: string): string {
    let fence: string | null = null;
    return source
        .split("\n")
        .map((line) => {
            const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
            if (marker && (fence === null || marker.startsWith(fence))) {
                fence = fence === null ? marker : null;
                return line;
            }
            if (fence === null && /^#{1,6}[ \t]/.test(line)) {
                return line.replace(/[ \t]*\{(#[\w-]+\}[ \t]*)$/, " \\{$1");
            }
            return line;
        })
        .join("\n");
}

// The text of a node, without markup.
export function textOf(node: Nodes): string {
    if ("value" in node && typeof node.value === "string") {
        return node.value;
    }
    return "children" in node ? (node.children as Nodes[]).map(textOf).join("") : "";
}

function visit(node: Nodes, fn: (node: Nodes) => void) {
    fn(node);
    if ("children" in node) {
        for (const child of node.children as Nodes[]) {
            visit(child, fn);
        }
    }
}

// Moves a heading's `{#id}` into the heading's data, where the HTML takes it from.
export function remarkHeadingIds() {
    return (tree: Root) => {
        visit(tree, (node) => {
            if (node.type !== "heading") {
                return;
            }
            const last = node.children[node.children.length - 1];
            const match = last?.type === "text" ? HEADING_ID.exec(last.value) : null;
            if (!last || last.type !== "text" || !match) {
                return;
            }
            last.value = last.value.slice(0, match.index);
            if (!last.value) {
                node.children.pop();
            }
            node.data = { ...node.data, hProperties: { ...node.data?.hProperties, id: match[1] } };
        });
    };
}

// Gives each <Video> its heading's id and text as `id` and `title`, which name the video on its
// card. Runs after remarkHeadingIds.
export function remarkVideoNames() {
    return (tree: Root) => {
        visit(tree, (node) => {
            const jsx = node as unknown as {
                type: string;
                name?: string;
                attributes: { type: string; name: string; value: string }[];
                children: Nodes[];
            };
            if (jsx.type !== "mdxJsxFlowElement" || jsx.name !== "Video") {
                return;
            }
            const heading = jsx.children.find((c) => c.type === "heading");
            const id = heading?.type === "heading" ? headingId(heading) : undefined;
            if (!heading || !id) {
                throw new Error("A <Video> needs a heading with an id");
            }
            jsx.attributes.push(
                { type: "mdxJsxAttribute", name: "id", value: id },
                { type: "mdxJsxAttribute", name: "title", value: textOf(heading).trim() },
            );
        });
    };
}

// Rewrites each link with `resolve`, such as resolveDocsLink, which points links to the docs at a
// page's version.
export function remarkVersionLinks(resolve: (url: string) => string = (url) => url) {
    return () => (tree: Root) => {
        visit(tree, (node) => {
            if (node.type === "link") {
                node.url = resolve(node.url);
            }
        });
    };
}

// The links on a page, in order.
export function linksOf(tree: Root): string[] {
    const links: string[] = [];
    visit(tree, (node) => {
        if (node.type === "link") {
            links.push(node.url);
        }
    });
    return links;
}

export function headingId(heading: Heading): string | undefined {
    const id = heading.data?.hProperties?.id;
    return typeof id === "string" ? id : undefined;
}

const parser = createProcessor({ remarkPlugins: [remarkGfm] });

// Parses MDX into a Markdown syntax tree, with heading ids applied and links rewritten with
// `resolve`.
export function parseMdx(source: string, resolve?: (url: string) => string): Root {
    const tree = parser.parse(escapeHeadingIds(source)) as Root;
    remarkHeadingIds()(tree);
    remarkChanges()()(tree);
    remarkVersionLinks(resolve)()(tree);
    return tree;
}

// Blocks in order, including the blocks inside components, such as a <Video>'s heading.
export function flowContent(nodes: MdastContent[]): MdastContent[] {
    return nodes.flatMap((node) =>
        (node.type as string) === "mdxJsxFlowElement" && "children" in node
            ? flowContent(node.children as MdastContent[])
            : [node],
    );
}

// The outline of a page: its headings with ids, down to `depth`, with ### headings nested under
// the ## heading before them. A label is the heading's text unless `labels` gives another.
export function outlineOf(
    tree: Root,
    depth: 2 | 3,
    labels: Record<string, string> = {},
    file = "content",
): OutlineSection[] {
    const sections: OutlineSection[] = [];
    const ids = new Set<string>();
    for (const node of flowContent(tree.children)) {
        if (node.type !== "heading") {
            continue;
        }
        const id = headingId(node);
        if (!id) {
            continue;
        }
        if (ids.has(id)) {
            throw new Error(`${file}: heading id "${id}" is used twice`);
        }
        ids.add(id);
        if (node.depth < 2 || node.depth > depth) {
            continue;
        }
        const section = { id, label: labels[id] ?? textOf(node).trim() };
        const parent = sections[sections.length - 1];
        if (node.depth === 3 && parent) {
            (parent.subsections ??= []).push(section);
        } else {
            sections.push(section);
        }
    }
    for (const id of Object.keys(labels)) {
        if (!ids.has(id)) {
            throw new Error(`${file}: outline label for unknown heading id "${id}"`);
        }
    }
    checkNumbering(sections, file);
    return sections;
}

// Numbered sections, such as `3. Discovery` and `3.1 Fields`, must count up from 1 under their
// parent, so a section added or removed in the middle can't leave the numbers wrong.
function checkNumbering(sections: OutlineSection[], file: string, parent = "") {
    const numbered = sections.filter((s) => /^\d+(\.\d+)*\.? /.test(s.label));
    if (numbered.length === 0) {
        return;
    }
    sections.forEach((section, i) => {
        const expected = parent ? `${parent}.${i + 1}` : `${i + 1}`;
        const number = /^(\d+(?:\.\d+)*)\.? /.exec(section.label)?.[1];
        if (number !== expected) {
            throw new Error(`${file}: section "${section.label}" should be numbered ${expected}`);
        }
        checkNumbering(section.subsections ?? [], file, expected);
    });
}

// Rendering.

const REQUIREMENT =
    /\b(MUST NOT|MUST|REQUIRED|SHALL NOT|SHALL|SHOULD NOT|SHOULD|NOT RECOMMENDED|RECOMMENDED|MAY|OPTIONAL)\b/g;

const BLOCK = new Set([
    "p",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "ul",
    "ol",
    "li",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "pre",
    "blockquote",
    "hr",
    "div",
]);

type HastParent = HastRoot | Element;
type HastChild = RootContent;

function isBlock(node: HastChild): boolean {
    return (
        (node.type === "element" && BLOCK.has(node.tagName)) ||
        (node.type as string) === "mdxJsxFlowElement"
    );
}

function element(tagName: string, properties: Element["properties"], children: ElementContent[]) {
    return { type: "element", tagName, properties, children } satisfies Element;
}

// Line breaks in the source are only where the text wraps. Make them spaces, and drop the ones
// between blocks, as in the TSX the content came from.
function collapseWhitespace(parent: HastParent) {
    if (parent.type === "element" && parent.tagName === "pre") {
        return;
    }
    const hasBlock = parent.type === "root" || parent.children.some(isBlock);
    parent.children = parent.children.filter((child) => {
        if (child.type !== "text") {
            return true;
        }
        if (/^\s*$/.test(child.value) && child.value.includes("\n") && hasBlock) {
            return false;
        }
        child.value = child.value.replace(/[ \t]*\n[ \t]*/g, " ");
        return true;
    });
    for (const child of parent.children) {
        if ("children" in child) {
            collapseWhitespace(child as HastParent);
        }
    }
}

function markRequirements(parent: HastParent) {
    parent.children = parent.children.flatMap((child): HastChild[] => {
        if (child.type === "element") {
            if (child.tagName !== "code" && child.tagName !== "pre") {
                markRequirements(child);
            }
            return [child];
        }
        if (child.type !== "text") {
            if ("children" in child) {
                markRequirements(child as unknown as HastParent);
            }
            return [child];
        }
        const parts = child.value.split(REQUIREMENT);
        if (parts.length === 1) {
            return [child];
        }
        return parts
            .map((part, i): HastChild | null =>
                i % 2 === 1
                    ? element("span", { className: ["req"] }, [{ type: "text", value: part }])
                    : part
                      ? ({ type: "text", value: part } satisfies Text)
                      : null,
            )
            .filter((part) => part !== null);
    });
}

function numberSection(heading: Element) {
    const first = heading.children[0];
    const match = first?.type === "text" ? /^(\d+)\. /.exec(first.value) : null;
    if (!first || first.type !== "text" || !match) {
        return;
    }
    first.value = first.value.slice(match[0].length);
    heading.children.unshift(
        element("span", { className: ["secnum"] }, [{ type: "text", value: match[1] }]),
    );
}

// A row whose only content is a bold first cell starts a group: it becomes a row header for the
// rows below it, in a tbody of their own.
function groupRows(table: Element) {
    const width =
        table.children
            .filter((c): c is Element => c.type === "element" && c.tagName === "thead")
            .flatMap((head) => head.children)
            .find((c): c is Element => c.type === "element" && c.tagName === "tr")
            ?.children.filter((c) => c.type === "element").length ?? 1;
    table.children = table.children.flatMap((section): ElementContent[] => {
        if (section.type !== "element" || section.tagName !== "tbody") {
            return [section];
        }
        const bodies: Element[] = [];
        let rows: ElementContent[] = [];
        for (const row of section.children) {
            if (row.type !== "element") {
                continue;
            }
            const cells = row.children.filter((c): c is Element => c.type === "element");
            const content = cells[0]?.children.filter(
                (c) => c.type !== "text" || c.value.trim() !== "",
            );
            const group =
                content?.length === 1 &&
                content[0].type === "element" &&
                content[0].tagName === "strong" &&
                cells.slice(1).every((c) => textOfHast(c).trim() === "");
            if (group) {
                if (rows.length) {
                    bodies.push(element("tbody", {}, rows));
                }
                rows = [
                    element("tr", { className: ["group-row"] }, [
                        element(
                            "th",
                            { colSpan: width, scope: "rowgroup" },
                            (content[0] as Element).children,
                        ),
                    ]),
                ];
            } else {
                rows.push(row);
            }
        }
        if (rows.length) {
            bodies.push(element("tbody", {}, rows));
        }
        return bodies;
    });
}

function textOfHast(node: ElementContent): string {
    if (node.type === "text") {
        return node.value;
    }
    return "children" in node ? node.children.map(textOfHast).join("") : "";
}

// Turns <pre><code> into a CodeBlock with the code's text and label.
function codeBlock(pre: Element): Element {
    const code = pre.children.find(
        (c): c is Element => c.type === "element" && c.tagName === "code",
    );
    const text = code ? textOfHast(code).replace(/\n$/, "") : "";
    const meta = (code?.data as { meta?: string } | undefined)?.meta ?? "";
    const label = /label="([^"]*)"/.exec(meta)?.[1];
    return element("CodeBlock", label === undefined ? { text } : { text, label }, []);
}

function transform(node: HastParent) {
    for (const [i, child] of node.children.entries()) {
        if (child.type !== "element") {
            if ("children" in child) {
                transform(child as unknown as HastParent);
            }
            continue;
        }
        if (child.tagName === "pre") {
            node.children[i] = codeBlock(child);
            continue;
        }
        if (child.tagName === "h2") {
            numberSection(child);
        }
        if (child.tagName === "table") {
            groupRows(child);
        }
        if (child.tagName === "a" && /^https?:/.test(String(child.properties.href))) {
            child.properties.target = "_blank";
            child.properties.rel = ["noopener", "noreferrer"];
        }
        transform(child);
    }
}

export function rehypeDocs() {
    return (tree: HastRoot) => {
        collapseWhitespace(tree);
        transform(tree);
        markRequirements(tree);
    };
}
