import type { Code, Nodes, Root } from "mdast";
import { DOCS_PAGES, type DocsPage } from "../../content/docs";
import { pageSource } from "../docs-content";
import { flowContent, headingId, textOf } from "../mdx";

export { headingIds } from "../docs-content";

// What the kit reads from the docs: each page's heading ids, its requirement sentences, and its
// code examples, each with the section it's in.

// A page's short name, as the kit uses it in links and file names: "spec" for /docs/spec, and
// "operations" for /docs/extensions/operations.
export function pageName(page: DocsPage): string {
    return page.href.split("/").pop()!;
}

export function pageByName(name: string): DocsPage | undefined {
    return DOCS_PAGES.find((page) => pageName(page) === name);
}

type Block = { node: Nodes; section: string | undefined };

// The page's blocks, in order, including those inside components, each with the id of the nearest heading before it that
// has one. A block inside a list or table keeps the section of the list or table.
function blocks(tree: Root): Block[] {
    let section: string | undefined;
    return flowContent(tree.children).map((node) => {
        if (node.type === "heading") {
            section = headingId(node) ?? section;
        }
        return { node, section };
    });
}

// Plain text, with each run of whitespace one space, for comparing quotes with the docs.
export function plain(text: string): string {
    return text.replace(/\s+/g, " ").trim();
}

// The page's text without markup, as one string.
export function pageText(page: DocsPage): string {
    return plain(
        pageSource(page)
            .tree.children.map((node) => textOf(node))
            .join(" "),
    );
}

// A sentence ending in ":" that introduces a list, such as the checks in 5.2, has the list's items.
// A node's text as inline Markdown: code keeps its backticks, and links and emphasis become their
// text.
export function inlineText(node: Nodes): string {
    if (node.type === "inlineCode") {
        return `\`${node.value}\``;
    }
    if ("value" in node && typeof node.value === "string") {
        return node.value;
    }
    return "children" in node ? (node.children as Nodes[]).map(inlineText).join("") : "";
}

export type Sentence = { section: string; text: string; items?: string[] };

const SENTENCE_END = /(?<=[.!?])\s+(?=[A-Z`*(])/;

// The page's sentences, from its paragraphs, list items, and table cells, with their sections.
export function sentences(page: DocsPage): Sentence[] {
    const out: Sentence[] = [];
    const collect = (node: Nodes, section: string) => {
        if (node.type === "paragraph" || node.type === "tableCell") {
            for (const text of plain(inlineText(node)).split(SENTENCE_END)) {
                out.push({ section, text });
            }
            return;
        }
        if (node.type === "code" || node.type === "heading") {
            return;
        }
        if ("children" in node) {
            for (const child of node.children as Nodes[]) {
                collect(child, section);
            }
        }
    };
    const all = blocks(pageSource(page).tree);
    all.forEach(({ node, section }, i) => {
        if (!section) {
            return;
        }
        collect(node, section);
        const next = all[i + 1]?.node;
        const last = out[out.length - 1];
        if (node.type === "paragraph" && next?.type === "list" && last?.text.endsWith(":")) {
            last.items = next.children.map((item) => plain(inlineText(item)));
        }
    });
    return out;
}

export type Example = {
    // `<section id>:<n>`: the nth JSON example in that section, counting from 1.
    key: string;
    label: string | undefined;
    json: unknown;
};

// The body of an HTTP example: everything after the first blank line.
function httpBody(code: string): string | undefined {
    const at = code.indexOf("\n\n");
    const body = at < 0 ? "" : code.slice(at + 2).trim();
    return body.startsWith("{") ? body : undefined;
}

// The page's JSON examples: `json` code blocks, and the JSON bodies of `http` code blocks. A block
// with "Excerpt" in its label is part of a larger document, wrapped in braces when it needs them.
export function jsonExamples(page: DocsPage): Example[] {
    const out: Example[] = [];
    const counts = new Map<string, number>();
    for (const { node, section } of blocks(pageSource(page).tree)) {
        if (node.type !== "code" || !section) {
            continue;
        }
        const code = node as Code;
        let text =
            code.lang === "json"
                ? code.value
                : code.lang === "http"
                  ? httpBody(code.value)
                  : undefined;
        if (text === undefined) {
            continue;
        }
        const label = /label="([^"]*)"/.exec(code.meta ?? "")?.[1];
        if (label?.startsWith("Excerpt") && !text.trim().startsWith("{")) {
            text = `{${text}}`;
        }
        const n = (counts.get(section) ?? 0) + 1;
        counts.set(section, n);
        const key = `${section}:${n}`;
        try {
            // A JWT is shown as its header and payload with a "." between them.
            const parts = text.split(/\n\.\n/).map((part) => JSON.parse(part));
            out.push({
                key,
                label,
                json: parts.length === 2 ? { header: parts[0], payload: parts[1] } : parts[0],
            });
        } catch (error) {
            throw new Error(`${page.file}: the JSON example ${key} doesn't parse: ${error}`);
        }
    }
    return out;
}
