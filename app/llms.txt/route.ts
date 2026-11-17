import { DOCS_PAGES, LATEST, NEWEST, VERSIONS } from "../../content/docs";
import { SITE_NAME, SITE_URL } from "../../lib/site";

export const dynamic = "force-static";

// The site for AI agents (llmstxt.org): the docs as Markdown, and the kit's two skills.
export function GET() {
    const text = `# ${SITE_NAME}

> An open protocol for every company and every personal agent. Personal agents discover
> participating companies, sign users in, and get things done through APIs, web pages, and company
> agents. "Poppy" for short. The docs are ${LATEST.label.toLowerCase()}${LATEST.draft ? ", which is in progress" : ""}.

## Docs

${DOCS_PAGES.map((page) => `- [${page.navTitle}](${SITE_URL}${page.href}.md): ${page.description}`).join("\n")}

${
    NEWEST.draft && NEWEST !== LATEST
        ? `## Draft

- [${NEWEST.label} specification](${SITE_URL}${NEWEST.base}/spec.md): In progress, and not yet ready to build against.

`
        : ""
}## Earlier versions

${VERSIONS.filter((v) => v.published && v !== LATEST)
    .map(
        (v) =>
            `- [${v.label} specification](${SITE_URL}${v.base}/spec.md): Published ${v.published}. Frozen, and replaced by ${LATEST.label.toLowerCase()}.`,
    )
    .join("\n")}

## Skills

- [Company implementation kit](${SITE_URL}/kit/company/SKILL.md): For a company adding Poppy support to its systems. Surveys what exists, designs with the engineer, builds in milestones, and checks each one with a validator. About the kit: ${SITE_URL}/kit/company
`;
    return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
