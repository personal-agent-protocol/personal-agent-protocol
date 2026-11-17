import type { Metadata } from "next";
import { ALL_DOCS_PAGES, LATEST, versionOf } from "../../../content/docs";
import { DocPage } from "../../../components/doc-page";
import { checkDocs } from "../../../lib/docs-checks";
import { docsPage } from "../../../lib/docs-content";
import { BASE_OPEN_GRAPH, BASE_TWITTER } from "../../../lib/site";

// Every docs page listed in content/docs.ts, in every version. The build fails here when the docs
// have problems (lib/docs-checks.ts).

type Props = { params: Promise<{ slug: string[] }> };

export const dynamicParams = false;

export function generateStaticParams() {
    checkDocs();
    return ALL_DOCS_PAGES.map((page) => ({
        slug: page.href.replace(/^\/docs\//, "").split("/"),
    }));
}

async function hrefOf({ params }: Props): Promise<string> {
    return `/docs/${(await params).slug.join("/")}`;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
    const href = await hrefOf(props);
    const page = docsPage(href);
    const version = versionOf(href);
    // Only the latest published version and the shared pages are indexed. Other versions stay at their URLs
    // for links and citations.
    const indexed = !version || version === LATEST;
    const title = version ? `${page.title} (${version.label.toLowerCase()})` : page.title;
    const { description } = page;
    return {
        title,
        description,
        robots: indexed ? undefined : { index: false, follow: true },
        alternates: { canonical: href, types: { "text/markdown": `${href}.md` } },
        openGraph: { ...BASE_OPEN_GRAPH, title, description, url: href },
        twitter: { ...BASE_TWITTER, title, description },
    };
}

export default async function Page(props: Props) {
    return <DocPage href={await hrefOf(props)} />;
}
