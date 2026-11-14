import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Root } from "mdast";
import {
    ALL_DOCS_PAGES,
    isShared,
    LATEST,
    resolveDocsLink,
    tabFor,
    versionOf,
    type DocsPage,
} from "../content/docs";
import type { OutlinePage } from "./docs-outline";
import { flowContent, headingId, linksOf, outlineOf, parseMdx } from "./mdx";
import { mdxToMarkdown } from "./mdx-markdown";

// Reads the docs content at build time: each page's MDX, its outline, and its Markdown version.
// Server only, since it reads files. Covers every version of the docs.

const CONTENT_DIR = join(process.cwd(), "content");

export function docsPage(href: string): DocsPage {
    const page = ALL_DOCS_PAGES.find((p) => p.href === href);
    if (!page) {
        throw new Error(`No docs page ${href}`);
    }
    return page;
}

const parsed = new Map<string, { source: string; tree: Root }>();

// Points a link on a page at the page's version, or for a shared page, the latest version.
export function linkResolver(page: DocsPage): (url: string) => string {
    const version = versionOf(page.href) ?? LATEST;
    return (url) => resolveDocsLink(url, version);
}

// A page's MDX source and syntax tree. Parsed again only when the file changes.
export function pageSource(page: DocsPage): { source: string; tree: Root } {
    const source = readFileSync(join(CONTENT_DIR, page.file), "utf8");
    const cached = parsed.get(page.file);
    if (cached?.source === source) {
        return cached;
    }
    if (page.sha256 && createHash("sha256").update(source).digest("hex") !== page.sha256) {
        throw new Error(
            `content/${page.file} belongs to a published version, which is frozen. Undo the change, and make it in the draft instead (content/AGENTS.md).`,
        );
    }
    const entry = { source, tree: parseMdx(source, linkResolver(page)) };
    parsed.set(page.file, entry);
    return entry;
}

function pageOutline(page: DocsPage): OutlinePage {
    const sections = outlineOf(
        pageSource(page).tree,
        page.outlineDepth,
        page.outlineLabels,
        page.file,
    );
    return { title: page.navTitle, href: page.href, sections };
}

// The outline of every docs page, in site order, latest version first.
export function docsOutline(): OutlinePage[] {
    return ALL_DOCS_PAGES.map(pageOutline);
}

// Problems with links between docs pages: a link to a page that doesn't exist, to a heading id
// that page doesn't have, or from a published version to a draft. Links are checked as
// resolveDocsLink points them. A published version can link to its own pages, the shared pages, such
// as the introduction, and other published versions, which are frozen too. The latest version and
// shared pages can link to any version.
export function linkProblems(): string[] {
    const problems: string[] = [];
    for (const page of ALL_DOCS_PAGES) {
        const version = versionOf(page.href);
        for (const url of linksOf(pageSource(page).tree)) {
            const match = /^(\/docs[^#?]*)(?:#(.*))?$/.exec(url);
            if (!match) {
                continue;
            }
            const [, href, id] = match;
            const target = ALL_DOCS_PAGES.find((p) => p.href === href);
            const allowed =
                target &&
                (!version ||
                    version === LATEST ||
                    versionOf(target.href) === version ||
                    isShared(target.href) ||
                    // Only published pages have a hash.
                    Boolean(target.sha256));
            if (!allowed) {
                problems.push(`content/${page.file}: no docs page ${href} in this version`);
            } else if (id && !headingIds(target).has(id)) {
                problems.push(`content/${page.file}: ${href} has no heading id "${id}"`);
            }
        }
    }
    return problems;
}

// Every heading id on a page, at any depth.
export function headingIds(page: DocsPage): Set<string> {
    const ids = new Set<string>();
    for (const node of flowContent(pageSource(page).tree.children)) {
        const id = node.type === "heading" ? headingId(node) : undefined;
        if (id) {
            ids.add(id);
        }
    }
    return ids;
}

// The outline of the pages in a page's tab, for the left navigation.
export function tabOutline(href: string): OutlinePage[] {
    return (tabFor(href)?.pages ?? []).map(pageOutline);
}

// A page's Markdown version.
export function pageMarkdown(href: string): string {
    return mdxToMarkdown(pageSource(docsPage(href)).tree);
}

// The response for a page's .md route.
export function markdownResponse(href: string): Response {
    return new Response(pageMarkdown(href), {
        headers: { "Content-Type": "text/markdown; charset=utf-8" },
    });
}
