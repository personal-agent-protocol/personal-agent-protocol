import { evaluate } from "@mdx-js/mdx";
import type { MDXComponents } from "mdx/types";
import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import * as runtime from "react/jsx-runtime";
import remarkGfm from "remark-gfm";
import { counterpart, LATEST, versionOf } from "../content/docs";
import { docsOutline, docsPage, linkResolver, pageSource, tabOutline } from "../lib/docs-content";
import { remarkChanges } from "../lib/changelog";
import { escapeHeadingIds, rehypeDocs, remarkHeadingIds, remarkVersionLinks } from "../lib/mdx";
import { NEW_ISSUE_URL } from "../lib/site";
import { CodeBlock } from "./code-block";
import { CopyMarkdownButton } from "./copy-markdown-button";
import { DocsNav } from "./docs-nav";
import { CommentingButton } from "./feedback-actions";
import { PermalinkButton } from "./permalink-button";
import { PronounceButton } from "./pronounce-button";
import { SpecTable } from "./spec-table";
import { VersionMenu } from "./version-menu";
import { Video, VideoGallery } from "./video-gallery";

// A changelog entry, and one of its tags: "Breaking", a section, or an issue (lib/changelog.ts).
function Change({ children }: { children?: ReactNode }) {
    return <div className="change">{children}</div>;
}

function Tag({ kind, tip, children }: { kind: string; tip?: string; children?: ReactNode }) {
    return (
        <span className={`tag tag-${kind}`} data-tip={tip}>
            {children}
        </span>
    );
}

// A list of partner names, shown in columns.
function PartnerList({ children }: { children?: ReactNode }) {
    return Children.map(children, (child) =>
        isValidElement(child)
            ? cloneElement(child as ReactElement<{ className?: string }>, {
                  className: "partner-list",
              })
            : child,
    );
}

// A link to open a GitHub issue on the protocol's repository. `cta` names the link in analytics.
function IssueLink({ cta, children }: { cta: string; children?: ReactNode }) {
    return (
        <a href={NEW_ISSUE_URL} target="_blank" rel="noopener noreferrer" data-cta={cta}>
            {children}
        </a>
    );
}

// On a page of an earlier version, says so and links to the same page in the latest.
function VersionBanner({ href }: { href: string }) {
    const version = versionOf(href);
    if (!version || version === LATEST) {
        return null;
    }
    return (
        <p className="version-banner" role="note">
            You're reading version {version.id}, published {version.published}. The latest is{" "}
            {LATEST.label.toLowerCase()}
            {LATEST.draft ? ", which is still in progress" : ""}.{" "}
            <a href={counterpart(href, LATEST)} data-cta="version_banner_latest">
                See this page in {LATEST.label.toLowerCase()}
            </a>{" "}
            ·{" "}
            <a href="/docs/changelog" data-cta="version_banner_changelog">
                Changelog
            </a>
        </p>
    );
}

// The components content files can use, and the ones Markdown maps to.
const COMPONENTS: MDXComponents = {
    table: SpecTable,
    Change,
    CodeBlock,
    CommentingButton,
    IssueLink,
    PartnerList,
    PermalinkButton,
    PronounceButton,
    Tag,
    Video,
    VideoGallery,
};

// A docs page: the outline of its tab, and its content, compiled from MDX at build time.
export async function DocPage({ href }: { href: string }) {
    const page = docsPage(href);
    const { default: Content } = await evaluate(escapeHeadingIds(pageSource(page).source), {
        ...runtime,
        remarkPlugins: [
            remarkGfm,
            remarkHeadingIds,
            remarkChanges(page.file),
            remarkVersionLinks(linkResolver(page)),
        ],
        rehypePlugins: [rehypeDocs],
    });
    const components: MDXComponents = {
        ...COMPONENTS,
        h1: ({ children }: { children?: ReactNode }) => (
            <div className="doc-head">
                <h1>{children}</h1>
                <CopyMarkdownButton href={`${href}.md`} />
            </div>
        ),
    };
    return (
        <div className="docs-layout">
            <DocsNav
                current={href}
                pages={tabOutline(href)}
                version={<VersionMenu current={href} outline={docsOutline()} inline />}
            />
            <article className="doc" id="article">
                <VersionBanner href={href} />
                <Content components={components} />
            </article>
        </div>
    );
}
