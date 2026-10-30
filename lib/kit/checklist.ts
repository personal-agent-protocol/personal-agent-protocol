import type { Nodes } from "mdast";
import { docsHref, type DocsPage } from "../../content/docs";
import { docsPage, pageSource } from "../docs-content";
import { headingId, textOf } from "../mdx";
import { SITE_URL } from "../site";
import { inlineText, pageByName, pageName, plain, sentences } from "./docs";

// The Company checklist: every requirement on the Company in the spec, with the guides'
// recommendations for companies, grouped by the kit's milestones. Generated, so a new requirement
// can't be left out: the build fails on one it can't place.

export const MILESTONES = [
    { id: "foundation", title: "Foundation" },
    { id: "interfaces", title: "Interfaces" },
    { id: "sign-in", title: "Sign-in and accounts" },
    { id: "extensions", title: "Extensions" },
] as const;

type Milestone = (typeof MILESTONES)[number]["id"];

// The milestone each section belongs to, by page and heading id. Sections without requirements,
// such as the introduction, are left out, and the build fails if one gains a requirement.
const SECTIONS: Record<string, Record<string, Milestone>> = {
    spec: {
        discovery: "foundation",
        fields: "foundation",
        "oauth-server": "foundation",
        extensions: "extensions",
        sessions: "foundation",
        "agent-identity": "foundation",
        "user-ids": "foundation",
        "session-header": "foundation",
        "delegated-keys": "foundation",
        "session-verification": "foundation",
        "operator-signatures": "foundation",
        "ending-sessions": "sign-in",
        oauth: "foundation",
        "access-tokens": "sign-in",
        scopes: "sign-in",
        "oauth-additions": "sign-in",
        "sending-requests": "foundation",
        "sign-in": "sign-in",
        "direct-sign-in": "sign-in",
        "device-sign-in": "sign-in",
        "refresh-tokens": "sign-in",
        revocation: "sign-in",
        "web-browsing": "interfaces",
        apis: "interfaces",
        conversations: "interfaces",
        "conversation-protocols": "interfaces",
        "conversation-requests": "interfaces",
        "sending-messages": "interfaces",
        "message-fields": "interfaces",
        "reading-events": "interfaces",
        streaming: "interfaces",
        status: "interfaces",
        "human-or-ai": "interfaces",
        handoff: "interfaces",
        "direct-conversations": "interfaces",
        "conversation-sign-in": "sign-in",
        closing: "interfaces",
        "conversation-errors": "interfaces",
        "task-coverage": "interfaces",
        "excluded-tasks": "interfaces",
        alternatives: "interfaces",
        feedback: "interfaces",
        "untrusted-content": "foundation",
        secrets: "foundation",
        trust: "foundation",
        "assertion-audience": "foundation",
        credentials: "sign-in",
        "delegated-key-security": "foundation",
    },
    "mediated-sign-in": {
        intro: "sign-in",
        support: "sign-in",
        "signing-in": "sign-in",
        "one-time-codes": "sign-in",
        errors: "sign-in",
        security: "sign-in",
    },
    operations: {
        support: "extensions",
        "operation-object": "extensions",
        "approval-required": "extensions",
        approval: "extensions",
        "sending-approval": "extensions",
        "at-most-once": "extensions",
        "approval-proof": "extensions",
    },
    guides: {
        "both-secrets": "foundation",
        "both-signing": "foundation",
        "both-operator-signatures": "foundation",
        "both-interoperability": "interfaces",
        "company-adoption": "foundation",
        "company-without-oauth": "foundation",
        "both-key-rotation": "foundation",
        "both-fetching": "foundation",
        "both-retries": "interfaces",
        "both-rate-limits": "foundation",
        "both-transport": "foundation",
        "company-agents": "foundation",
        "company-session-header": "foundation",
        "company-sessions": "foundation",
        "company-lifetimes": "sign-in",
        "company-scope-descriptions": "sign-in",
        "company-api-descriptions": "interfaces",
        "company-consent": "sign-in",
        "company-device": "sign-in",
        "company-mediated": "sign-in",
        "company-account-settings": "sign-in",
        "company-browsing": "interfaces",
        "company-scopes": "sign-in",
        "company-internal": "foundation",
        "company-hosting": "foundation",
        "company-agent-issuer": "foundation",
        "company-guest": "interfaces",
        "company-conversations": "interfaces",
        "company-excluded-tasks": "interfaces",
        "company-operations": "extensions",
        "company-errors": "interfaces",
    },
};

function milestoneOf(page: DocsPage, section: string): Milestone | undefined {
    return SECTIONS[pageName(page)]?.[section];
}

const KEYWORD = /\b(MUST NOT|MUST|SHOULD NOT|SHOULD)\b/;

type Party = "company" | "agent" | "both";

// The last party named in some text: the Personal Agent, or the Company and its parts.
function lastParty(text: string): Party | undefined {
    const parties: [Party, RegExp][] = [
        ["agent", /Personal Agents?(?!'s browser)|\bits browser\b/g],
        ["company", /\bCompan(?:y|ies)\b|\bissuer\b|MCP server|listed API|Company Agent/g],
    ];
    let last: { party: Party; at: number } | undefined;
    for (const [party, pattern] of parties) {
        for (const match of text.matchAll(pattern)) {
            if (!last || match.index > last.at) {
                last = { party, at: match.index };
            }
        }
    }
    return last?.party;
}

// Requirements their subject doesn't place, by the start of the sentence. Most sentences name
// their subject before the requirement word, or start with "It" for the party the sentence before
// named last.
const OVERRIDES: [string, Party | "none"][] = [
    ["The key words MUST", "none"],
    ["Every URL this protocol defines or exchanges MUST be an HTTPS URL", "both"],
    ["Their documents MUST have the same auth", "company"],
    ["Its protected_resources (RFC 9728 §4) MUST list", "company"],
    ["The resource in the server's protected resource metadata MUST equal", "company"],
    ["typ MUST be pap-delegation+jwt", "agent"],
    ["exp MUST be at most 24 hours after iat", "agent"],
    ["It MUST also check that protected_resources includes https://{organization.domain}", "agent"],
    ["Required, and it MUST include refresh_token", "company"],
    ["When the website refuses an action because the Session lacks a scope", "company"],
    ["Personal Agents and Companies MUST ignore extensions", "both"],
    ["Personal Agents MUST NOT use a URL from a Company that has another scheme", "both"],
    ["It MUST be in that list", "company"],
    ["It MUST NOT be grant_type, scope, resource", "company"],
    ["Personal Agents MUST NOT send tokens or Session JWTs in a URL", "both"],
    ["domain MUST be the host that serves the document", "company"],
    ["redirect_uri MUST exactly match an entry", "company"],
    ["Anyone else MUST start an extension's name", "both"],
    ["client_id MUST equal the URL", "agent"],
    ["jwks_uri MUST be an HTTPS URL on the same domain", "agent"],
    ["Each entry MUST be an HTTPS URL on the same domain as client_id, or a loopback", "agent"],
    ["It MUST NOT contain or be derived from personal information", "agent"],
    ["The Personal Agent holds the User IDs and Agent IDs of each of its Users", "agent"],
    ["The Agent ID follows the same rules as the User ID", "agent"],
    ["The Personal Agent MUST make them short-lived", "agent"],
    ["Each sign-in request MUST include scope", "agent"],
    ["The client assertion's aud MUST be the Company's issuer", "agent"],
    ["Its resource MUST be exactly https://{organization.domain}", "company"],
    ["typ MUST be poppy-session+jwt", "agent"],
    ["alg MUST be ES256, so every Personal Agent", "agent"],
    // 5.3's steps are the Company's checks on the Session JWT.
    ["Without an access token, ath MUST be absent", "company"],
    ["A known sid continues its Session", "company"],
    ["MUST act for the account and scopes authorized in step 2", "company"],
    ["Companies that offer Device Sign-In and Personal Agents that use it MUST follow", "both"],
    ["Opening the link MUST NOT approve the request", "company"],
    ["MUST be set only in step 3", "company"],
    ["The cookie MUST NOT be sent with a form submitted from another site", "company"],
    ["The page MUST NOT be stored by caches", "company"],
    ["Loading the page MUST NOT start, end, or change any Session", "company"],
    ["MUST NOT outlive the Session", "company"],
    ["Beyond these rules, the side that chooses an ID", "both"],
    ["A message MUST have at least one of text, data", "both"],
    ["Every successful read MUST include conversation_id", "company"],
    ["Every successful response to a POST or a read MUST include status", "company"],
    ["The parent conversation MUST be open", "company"],
    ["Everything that affects the action", "company"],
    ["expires_at SHOULD leave the User long enough", "company"],
    ["It MUST NOT treat text from the Company", "agent"],
    ["The Personal Agent MUST ask the User about each operation", "agent"],
    ["An alternative MUST have at least one of instructions or references", "company"],
    ["An openapi or mcp reference MUST name an API listed", "company"],
];

function override(text: string): Party | "none" | undefined {
    const bare = text.replace(/`/g, "");
    return OVERRIDES.find(([start]) => bare.startsWith(start))?.[1];
}

export type Requirement = {
    page: string;
    section: string;
    milestone: Milestone;
    level: string;
    party: Party;
    text: string;
    items?: string[];
};

// The requirement sentences on a page, with who they apply to. Throws on one it can't place.
export function requirements(page: DocsPage): Requirement[] {
    const out: Requirement[] = [];
    const problems: string[] = [];
    let previous: { section: string; party: Party | undefined } | undefined;
    for (const { section, text, items } of sentences(page)) {
        const keyword = KEYWORD.exec(text);
        const before = keyword ? text.slice(0, keyword.index) : text;
        const fromContext =
            /^(It|They)\b/.test(text) && previous?.section === section ? previous.party : undefined;
        const found = override(text) ?? lastParty(before) ?? fromContext;
        previous = { section, party: lastParty(text) ?? previous?.party };
        if (!keyword || found === "none") {
            continue;
        }
        const party = found;
        const milestone = milestoneOf(page, section);
        if (!party) {
            problems.push(`${page.file} (#${section}): can't tell who this applies to: "${text}"`);
        } else if (!milestone) {
            problems.push(
                `${page.file}: #${section} has a requirement but no milestone: "${text}"`,
            );
        } else {
            out.push({
                page: pageName(page),
                section,
                milestone,
                level: keyword[1],
                party,
                text,
                items,
            });
        }
    }
    if (problems.length) {
        throw new Error(
            `The checklist (lib/kit/checklist.ts) can't place these requirements. Add them to OVERRIDES or SECTIONS:\n${problems.join("\n")}`,
        );
    }
    return out;
}

// Each section's heading text, by id.
function headings(page: DocsPage): Map<string, string> {
    const out = new Map<string, string>();
    for (const node of pageSource(page).tree.children) {
        const id = node.type === "heading" ? headingId(node) : undefined;
        if (id) {
            out.set(id, plain(textOf(node)));
        }
    }
    return out;
}

// Lists in the guides that say what something is, rather than what to do. They're shown without
// checkboxes.
const DEFINITIONS = ["These are secrets:"];

type Recommendation = { section: string; milestone: Milestone; lines: string[] };

// The guides' recommendations for companies, by section: each list item becomes a checkbox, after
// the paragraph that introduces the list.
function recommendations(): Recommendation[] {
    const page = docsPage(docsHref("guides")!);
    const out: Recommendation[] = [];
    let section: string | undefined;
    let intro: string | undefined;
    for (const node of pageSource(page).tree.children) {
        if (node.type === "heading") {
            section = headingId(node) ?? section;
            intro = undefined;
            continue;
        }
        const milestone = section ? SECTIONS.guides[section] : undefined;
        if (section?.startsWith("company-") && !milestone) {
            throw new Error(
                `The checklist (lib/kit/checklist.ts) has no milestone for guides#${section}. Add it to SECTIONS.`,
            );
        }
        if (!section || !milestone) {
            continue;
        }
        let rec = out.find((r) => r.section === section);
        if (!rec) {
            rec = { section, milestone, lines: [] };
            out.push(rec);
        }
        if (node.type === "paragraph") {
            intro = plain(inlineText(node));
        } else if (node.type === "list") {
            const box = intro && DEFINITIONS.includes(intro) ? "- " : "- [ ] ";
            if (intro?.endsWith(":")) {
                rec.lines.push("", intro, "");
            }
            for (const item of node.children) {
                rec.lines.push(box + plain(inlineText(item as Nodes)));
            }
            intro = undefined;
        }
    }
    return out.filter((r) => r.lines.length);
}

function link(page: string, section: string, label: string): string {
    return `[${label}](${SITE_URL}${pageByName(page)!.href}#${section})`;
}

const PAGE_TITLES: Record<string, string> = {
    spec: "Specification",
    operations: "Operations",
    "mediated-sign-in": "Mediated Sign-In",
};

// The checklist as Markdown.
export function checklistMarkdown(version: string): string {
    const pages = ["spec", "extensions/operations", "extensions/mediated-sign-in"].map((slug) =>
        docsPage(docsHref(slug)!),
    );
    const all = pages.flatMap(requirements).filter((r) => r.party !== "agent");
    const recommended = recommendations();
    const titles = new Map([
        ...pages.map((page): [string, Map<string, string>] => [pageName(page), headings(page)]),
        ["guides", headings(docsPage(docsHref("guides")!))],
    ]);

    const lines = [
        "# Company checklist",
        "",
        `Generated from the Personal Agent Protocol docs, ${version}. It lists every`,
        "requirement on the Company in the specification and extensions, and the guides' advice for",
        "companies, grouped by milestone. Go through the sections for the milestones and features in",
        "your design. The validator checks some of these. The rest need a review or a manual test.",
        "",
        "Requirements that apply to both parties are included. Requirements only on Personal Agents",
        "are left out.",
    ];
    for (const milestone of MILESTONES) {
        lines.push("", `## ${milestone.title}`);
        const groups = new Map<string, Requirement[]>();
        for (const r of all.filter((r) => r.milestone === milestone.id)) {
            const key = `${r.page}#${r.section}`;
            groups.set(key, [...(groups.get(key) ?? []), r]);
        }
        for (const [key, items] of groups) {
            const [page, section] = key.split("#");
            const title = titles.get(page)?.get(section) ?? section;
            lines.push("", `### ${PAGE_TITLES[page]}: ${link(page, section, title)}`, "");
            for (const r of items) {
                lines.push(`- [ ] **${r.level}**: ${r.text}`);
                for (const item of r.items ?? []) {
                    lines.push(`    - [ ] ${item}`);
                }
            }
        }
        for (const r of recommended.filter((r) => r.milestone === milestone.id)) {
            const title = titles.get("guides")?.get(r.section) ?? r.section;
            lines.push("", `### Recommended: ${link("guides", r.section, title)}`);
            if (r.lines[0] !== "") {
                lines.push("");
            }
            lines.push(...r.lines);
        }
    }
    return lines.join("\n") + "\n";
}
