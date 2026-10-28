import VERSION_LIST from "./versions/versions.json" with { type: "json" };

// The docs: the tabs below the site header, and the pages in each tab, in site order. The page, its
// metadata, the sitemap, the header tabs, the outline in the left navigation, and the page's .md
// version all come from this list and content/versions/versions.json. content/AGENTS.md explains
// how the docs are organized and published.
//
// The pages of versioned tabs (the specification, extensions, and guides) have a copy in each
// version's folder, content/versions/<version>/<slug>.mdx, served at /docs/<version>/<slug>. The
// other pages have one copy, content/shared/<slug>.mdx, served at /docs/<slug>.

export type DocsPage = {
    // The page's path after /docs/ in its version, such as "spec" or "extensions/operations".
    slug: string;
    // The page's URL, such as /docs/0.2/spec or /docs/introduction. Its Markdown version is served
    // at the same URL plus .md.
    href: string;
    // The content file, in content/.
    file: string;
    // The page's name in the outline, when its tab has several pages, and in comments.
    navTitle: string;
    // The <title> and link preview title. A versioned page's title adds its version.
    title: string;
    description: string;
    // The deepest heading level in the outline: 2 lists ## headings, 3 adds ### headings. Only
    // headings with an id, such as `## Principles {#principles}`, are listed.
    outlineDepth: 2 | 3;
    // Outline labels that differ from their heading's text, by heading id.
    outlineLabels?: Record<string, string>;
    // In a published version, the content file's SHA-256. The build fails if the file changes.
    sha256?: string;
    // false for a page the kit leaves out of its reference/ folder, such as the videos.
    kit?: false;
};

export type DocsTab = {
    title: string;
    // Its first page.
    href: string;
    pages: DocsPage[];
    // Its pages are part of the protocol, so each version has its own copy: the specification,
    // extensions, and guides. Other tabs, such as the introduction, have one copy, which describes
    // the latest version.
    versioned?: boolean;
};

type PageInfo = Omit<DocsPage, "href" | "file" | "sha256">;
type TabInfo = { title: string; versioned?: boolean; pages: PageInfo[] };

// Every tab and page, in site order. A versioned page is in each version whose entry in
// versions.json lists it.
const TABS: TabInfo[] = [
    {
        title: "Introduction",
        pages: [
            {
                slug: "introduction",
                navTitle: "Introduction",
                title: "Personal Agent Protocol: Introduction",
                description:
                    "What Personal Agent Protocol is, why it exists, who it is for, and what it covers.",
                outlineDepth: 2,
                outlineLabels: { what: "What is it?" },
            },
        ],
    },
    {
        title: "Path to 1.0",
        pages: [
            {
                slug: "path-to-1",
                navTitle: "Path to 1.0",
                title: "Personal Agent Protocol: Path to 1.0",
                description:
                    "How Personal Agent Protocol gets to 1.0, the feedback we want, areas the draft doesn't cover yet, and the design partners implementing it.",
                outlineDepth: 2,
            },
            {
                slug: "changelog",
                navTitle: "Changelog",
                title: "Personal Agent Protocol: Changelog",
                description:
                    "What changed in each draft of the Personal Agent Protocol specification, extensions, and guides, and which changes affect existing implementations.",
                outlineDepth: 3,
            },
        ],
    },
    {
        title: "Specification",
        versioned: true,
        pages: [
            {
                slug: "spec",
                navTitle: "Specification",
                title: "Personal Agent Protocol specification",
                description:
                    "How personal agents discover companies, start sessions, sign users in, and work through APIs, web pages, and conversations with company agents.",
                outlineDepth: 3,
            },
        ],
    },
    {
        title: "Extensions",
        versioned: true,
        pages: [
            {
                slug: "extensions",
                navTitle: "About extensions",
                title: "Personal Agent Protocol: Extensions",
                description:
                    "Optional features that build on Personal Agent Protocol, how companies and personal agents advertise them, and the extensions available today.",
                outlineDepth: 2,
            },
            {
                slug: "extensions/operations",
                navTitle: "Operations",
                title: "Personal Agent Protocol: Operations extension",
                description:
                    "How a company asks a personal agent to confirm an action before performing it, with approval tied to exact terms and no duplicate execution.",
                outlineDepth: 3,
            },
            {
                slug: "extensions/mediated-sign-in",
                navTitle: "Mediated Sign-In",
                title: "Personal Agent Protocol: Mediated Sign-In extension",
                description:
                    "A transitional way for a personal agent to sign in with credentials the user gave it, at companies that don't offer OAuth sign-in yet.",
                outlineDepth: 2,
            },
        ],
    },
    {
        title: "Guides",
        versioned: true,
        pages: [
            {
                slug: "guides",
                navTitle: "Guides",
                title: "Personal Agent Protocol: Guides",
                description:
                    "Recommended practices for companies and personal agents implementing Personal Agent Protocol.",
                outlineDepth: 2,
            },
        ],
    },
    {
        title: "Videos",
        pages: [
            {
                slug: "videos",
                navTitle: "Videos",
                title: "Personal Agent Protocol: Video tutorials",
                description:
                    "Short videos on what Personal Agent Protocol is, how a personal agent connects to a company, how users sign in, how agents talk to company agents and MCP servers, and how they browse websites.",
                outlineDepth: 2,
                kit: false,
            },
        ],
    },
    {
        title: "Demos",
        pages: [
            {
                slug: "demos",
                navTitle: "Demos",
                title: "Personal Agent Protocol: Community demos",
                description:
                    "Demos of Personal Agent Protocol built by the community: companies, personal agents, and stores you can try, with links to their source.",
                outlineDepth: 2,
                kit: false,
            },
        ],
    },
];

export type DocsVersion = {
    // The version number, such as "0.2".
    id: string;
    // "Draft 0.2" while it's in progress, and "Version 0.1" once published.
    label: string;
    // The URL its pages start with, such as /docs/0.2.
    base: string;
    draft: boolean;
    // When it was published, such as "October 9, 2026". A draft has none.
    published?: string;
    // Its versioned tabs, with only the pages it has.
    tabs: DocsTab[];
};

// An entry in versions.json. A draft lists its pages. A published version gives each page's
// SHA-256, and the date it was published, as YYYY-MM-DD.
export type VersionEntry = {
    id: string;
    published?: string;
    pages: string[] | Record<string, string>;
};

const MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];

// 2026-10-09 as October 9, 2026.
export function longDate(date: string): string {
    const [year, month, day] = date.split("-").map(Number);
    return `${MONTHS[month - 1]} ${day}, ${year}`;
}

function sharedTab(tab: TabInfo): DocsTab {
    const pages = tab.pages.map((page) => ({
        ...page,
        href: `/docs/${page.slug}`,
        file: `shared/${page.slug}.mdx`,
    }));
    return { title: tab.title, href: pages[0].href, pages };
}

function docsVersion(entry: VersionEntry): DocsVersion {
    const { id, published } = entry;
    const hashes = Array.isArray(entry.pages) ? {} : entry.pages;
    const slugs = Array.isArray(entry.pages) ? entry.pages : Object.keys(entry.pages);
    const tabs = TABS.filter((tab) => tab.versioned).flatMap((tab) => {
        const pages = tab.pages
            .filter((page) => slugs.includes(page.slug))
            .map((page) => ({
                ...page,
                href: `/docs/${id}/${page.slug}`,
                file: `versions/${id}/${page.slug}.mdx`,
                sha256: hashes[page.slug],
            }));
        return pages.length
            ? [{ title: tab.title, href: pages[0].href, pages, versioned: true }]
            : [];
    });
    return {
        id,
        label: `${published ? "Version" : "Draft"} ${id}`,
        base: `/docs/${id}`,
        draft: !published,
        published: published && longDate(published),
        tabs,
    };
}

export const VERSION_ENTRIES: VersionEntry[] = VERSION_LIST;

// Every version of the docs, latest first.
export const VERSIONS: DocsVersion[] = VERSION_ENTRIES.map(docsVersion);

export const LATEST = VERSIONS[0];

// The tabs that aren't versioned.
export const SHARED_TABS: DocsTab[] = TABS.filter((tab) => !tab.versioned).map(sharedTab);

// The slugs of every versioned page.
export const VERSIONED_SLUGS = TABS.filter((tab) => tab.versioned).flatMap((tab) =>
    tab.pages.map((page) => page.slug),
);

// The tab row on a docs page: the shared tabs, and the versioned ones from `version`, the version
// the page shows, in site order. A tab `version` doesn't have comes from the latest version.
export function docsTabsFor(version: DocsVersion): DocsTab[] {
    return TABS.flatMap((info) => {
        const tab = info.versioned
            ? (version.tabs.find((t) => t.title === info.title) ??
              LATEST.tabs.find((t) => t.title === info.title))
            : SHARED_TABS.find((t) => t.title === info.title);
        return tab ? [tab] : [];
    });
}

// The docs pages of the latest version and the shared pages, in site order.
export const DOCS_PAGES = docsTabsFor(LATEST).flatMap((tab) => tab.pages);

// Every docs page: the latest ones, then those of earlier versions.
export const ALL_DOCS_PAGES = [
    ...DOCS_PAGES,
    ...VERSIONS.slice(1).flatMap((v) => v.tabs.flatMap((tab) => tab.pages)),
];

function clean(href: string): string {
    return href.replace(/[#?].*$/, "").replace(/\/$/, "") || "/";
}

// The version a docs page belongs to. Shared pages have none.
export function versionOf(href: string): DocsVersion | undefined {
    const path = clean(href);
    return VERSIONS.find((v) => v.tabs.some((tab) => tab.pages.some((p) => p.href === path)));
}

// The tab a docs page belongs to, if any.
export function tabFor(href: string): DocsTab | undefined {
    const path = clean(href);
    const tabs = versionOf(path)?.tabs ?? SHARED_TABS;
    return tabs.find((tab) => tab.pages.some((p) => p.href === path));
}

// Whether a page has one copy, which every version links to, rather than a copy per version.
export function isShared(href: string): boolean {
    const path = clean(href);
    return SHARED_TABS.some((tab) => tab.pages.some((p) => p.href === path));
}

// The same page in another version, or that version's first page when it has no such page or
// `href` isn't versioned.
export function counterpart(href: string, to: DocsVersion): string {
    const from = versionOf(href);
    const target = from ? to.base + clean(href).slice(from.base.length) : "";
    const pages = to.tabs.flatMap((tab) => tab.pages);
    return pages.some((p) => p.href === target) ? target : pages[0].href;
}

// The URL of a page by slug: a shared page's one URL, or a versioned page in `version`, or in the
// latest version that has it when `version` doesn't. Undefined for a page that doesn't exist.
export function docsHref(slug: string, version: DocsVersion = LATEST): string | undefined {
    if (SHARED_TABS.some((tab) => tab.pages.some((p) => p.slug === slug))) {
        return `/docs/${slug}`;
    }
    for (const v of [version, ...VERSIONS]) {
        const page = v.tabs.flatMap((tab) => tab.pages).find((p) => p.slug === slug);
        if (page) {
            return page.href;
        }
    }
    return undefined;
}

// A link to the docs as written in a content file, pointed at a page's version: /docs/spec#x on a
// page of 0.1 becomes /docs/0.1/spec#x, and on a shared page, the latest version's. A link that
// names its version, such as /docs/0.1/spec, or that isn't to a docs page, stays as written.
export function resolveDocsLink(url: string, version: DocsVersion = LATEST): string {
    const match = /^\/docs\/([^#?]+?)\/?([#?].*)?$/.exec(url);
    if (!match || /^\d+\.\d+(\/|$)/.test(match[1])) {
        return url;
    }
    const href = docsHref(match[1], version);
    return href ? href + (match[2] ?? "") : url;
}

// The spec in the latest version.
export const SPEC_HREF = docsHref("spec")!;
