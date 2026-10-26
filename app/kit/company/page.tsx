import type { Metadata } from "next";
import type { ReactNode } from "react";
import { CodeBlock } from "../../../components/code-block";
import { DocsNav } from "../../../components/docs-nav";
import { KitArchitecture } from "../../../components/kit-architecture";
import { KitInstall } from "../../../components/kit-install";
import { SpecTable } from "../../../components/spec-table";
import { docsHref, LATEST, SPEC_HREF } from "../../../content/docs";
import type { OutlineSection } from "../../../lib/docs-outline";
import {
    BASE_OPEN_GRAPH,
    BASE_TWITTER,
    NEW_ISSUE_URL,
    REPO_URL,
    SITE_URL,
} from "../../../lib/site";

// The Company implementation kit's page, laid out like a docs page. Not in the docs tabs or the
// sitemap: the Path to 1.0 page and llms.txt link to it.

const title = "Personal Agent Protocol: Company implementation kit";
const description =
    "A skill for coding agents, with a validator, that helps a company add Personal Agent Protocol support to its existing systems.";

export const metadata: Metadata = {
    title,
    description,
    alternates: { canonical: "/kit/company" },
    openGraph: { ...BASE_OPEN_GRAPH, title, description, url: "/kit/company" },
    twitter: { ...BASE_TWITTER, title, description },
};

const REPO = REPO_URL.replace("https://github.com/", "");
const ZIP = "/kit/implement-personal-agent-protocol.zip";

const INSTALL = [
    {
        id: "claude-code",
        label: "Claude Code",
        content: (
            <>
                <p>Add the marketplace and install the plugin:</p>
                <CodeBlock
                    text={`/plugin marketplace add ${REPO}\n/plugin install personal-agent-protocol@personal-agent-protocol`}
                />
                <p>Then ask Claude to add Personal Agent Protocol support.</p>
            </>
        ),
    },
    {
        id: "codex",
        label: "Codex",
        content: (
            <>
                <p>Ask Codex to install the skill with its skill installer:</p>
                <CodeBlock
                    text={`$skill-installer install ${REPO_URL}/tree/main/skills/implement-personal-agent-protocol`}
                />
                <p>Restart Codex, then ask it to add Personal Agent Protocol support.</p>
            </>
        ),
    },
    {
        id: "other",
        label: "Other agents",
        content: (
            <>
                <p>
                    For Cursor, Gemini CLI, GitHub Copilot, and other agents that read skills, the{" "}
                    <code>skills</code> installer finds the skill in the repository and asks which
                    agents to install it for:
                </p>
                <CodeBlock
                    text={`npx skills add ${REPO} --skill implement-personal-agent-protocol`}
                />
            </>
        ),
    },
    {
        id: "claude-apps",
        label: "Claude apps",
        content: (
            <>
                <p>
                    Download <a href={ZIP}>implement-personal-agent-protocol.zip</a> and upload it
                    under Settings, in Capabilities, Skills.
                </p>
                <p>
                    The agent can survey and design there, but the validator has to run somewhere
                    that can reach your servers, such as your own machine.
                </p>
            </>
        ),
    },
    {
        id: "url",
        label: "Any agent",
        content: (
            <>
                <p>Any coding agent that can fetch a URL and run Node can use the kit from here:</p>
                <CodeBlock
                    text={`Follow ${SITE_URL}/kit/company/SKILL.md to add Personal Agent Protocol support to our systems.`}
                />
                <p>
                    It downloads <a href={ZIP}>implement-personal-agent-protocol.zip</a>, which has
                    the rest of the kit and the validator.
                </p>
            </>
        ),
    },
];

const SECTIONS: OutlineSection[] = [
    { id: "requirements", label: "Requirements" },
    { id: "install", label: "Install" },
    { id: "usage", label: "Usage" },
    { id: "architecture", label: "Architecture" },
    { id: "validator", label: "Validator" },
    { id: "feedback", label: "Feedback" },
];

// A table in the docs style, which stacks on phones.
function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
    return (
        <SpecTable>
            <thead>
                <tr>
                    {head.map((label) => (
                        <th key={label}>{label}</th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {rows.map((row, i) => (
                    <tr key={i}>
                        {row.map((cell, j) => (
                            <td key={j}>{cell}</td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </SpecTable>
    );
}

export default function Page() {
    return (
        <div className="docs-layout">
            <DocsNav
                current="/kit/company"
                pages={[{ title: "Company kit", href: "/kit/company", sections: SECTIONS }]}
            />
            <article className="doc" id="article">
                <h1>Company implementation kit</h1>
                <p>
                    The Company implementation kit helps a Company implement its side of Personal
                    Agent Protocol on the systems it already has. It has two parts:
                </p>
                <ul>
                    <li>
                        <code>implement-personal-agent-protocol</code>, a skill for coding agents.
                        The agent follows it to survey the Company&rsquo;s systems, write a design,
                        and build the implementation in milestones.
                    </li>
                    <li>
                        A validator: a command-line tool that acts as a test Personal Agent against
                        a deployment and reports which requirements it meets.
                    </li>
                </ul>
                <p>
                    The kit follows {LATEST.label.toLowerCase()} of the <a href={SPEC_HREF}>spec</a>
                    . It covers the Company side only. It doesn&rsquo;t cover building a Personal
                    Agent.
                </p>

                <h2 id="requirements">Requirements</h2>
                <ul>
                    <li>
                        A coding agent with access to the repositories you&rsquo;ll change. Any
                        agent that supports skills, or can fetch a URL, works.
                    </li>
                    <li>Node 22.18 or later, for the validator. It has no dependencies.</li>
                    <li>
                        A deployment the validator can reach over HTTPS, in any environment. A test
                        environment is best, since the validator starts real Sessions and sends test
                        messages to your company agent.
                    </li>
                    <li>
                        An HTTPS URL you control, to host the public files of the validator&rsquo;s
                        test Personal Agent.
                    </li>
                </ul>

                <h2 id="install">Install</h2>
                <p>
                    The skill is <code>implement-personal-agent-protocol</code>. Every method
                    installs the same files, from{" "}
                    <a href={`${REPO_URL}/tree/main/skills/implement-personal-agent-protocol`}>
                        <code>skills/implement-personal-agent-protocol</code>
                    </a>{" "}
                    in the repository.
                </p>
                <KitInstall tabs={INSTALL} />

                <h2 id="usage">Usage</h2>
                <p>
                    Ask the agent to add Personal Agent Protocol support. The skill works in five
                    steps and keeps its working files in <code>plan/</code> in your repository.
                </p>
                <ol>
                    <li>
                        <strong>Survey.</strong> The agent reads your code and configuration and
                        runs <code>survey</code>, which sends only GET requests to your domain. It
                        records your identity provider, API gateway, MCP servers, support platform,
                        and anything else relevant in <code>plan/survey.md</code>, and asks you
                        about what it can&rsquo;t find.
                    </li>
                    <li>
                        <strong>Design.</strong> The agent maps each part of the protocol onto those
                        systems, using the patterns in the kit, and writes{" "}
                        <code>plan/design.md</code>. You choose the scope: which interfaces, sign-in
                        types, and scopes, and which Personal Agents to allow. Building starts only
                        after you approve the design.
                    </li>
                    <li>
                        <strong>Build.</strong> The agent builds one milestone at a time and runs{" "}
                        <code>check --milestone</code> after each, fixing failures before moving on.
                    </li>
                    <li>
                        <strong>Verify.</strong> The agent runs <code>check</code> against your
                        deployment with <code>--design plan/design.md</code>, then works through{" "}
                        <code>checklist.md</code> for the requirements the validator can&rsquo;t
                        test, such as logging and consent wording.
                    </li>
                    <li>
                        <strong>Report.</strong> <code>report</code> drafts an implementation report
                        from <code>plan/feedback.md</code> and the latest results. You review it and
                        file it (<a href="#feedback">Feedback</a>).
                    </li>
                </ol>
                <p>The milestones:</p>
                <Table
                    head={["Milestone", "Builds", "Spec"]}
                    rows={[
                        [
                            "Foundation",
                            "poppy.json, OAuth server metadata, verifying Personal Agents, signed-out Sessions, DPoP, errors",
                            "3, 4.1–4.3",
                        ],
                        [
                            "Interfaces",
                            "The interfaces in the design: OpenAPI, MCP, conversations, web browsing. Signed out first.",
                            "5, 6, 7",
                        ],
                        [
                            "Sign-in",
                            "The chosen sign-in types, Account Tokens, sign-out, scope enforcement, account settings",
                            "4.4–4.9, 7.11",
                        ],
                        [
                            "Extensions",
                            "Optional. Extensions in the design, such as Operations.",
                            "3.3, extension pages",
                        ],
                    ]}
                />
                <p>
                    A Company that offers only its website stops after publishing{" "}
                    <code>poppy.json</code> without <code>auth</code>.
                </p>

                <h2 id="architecture">Architecture</h2>
                <p>
                    An example of what a Company adds and changes. It starts from a typical
                    application: a website on a CDN, a mobile app, an identity provider, an API
                    gateway in front of backend services, and a support platform. Your own
                    components will differ, and the design step maps the protocol onto what you
                    actually run.
                </p>
                <h3 id="before">Before</h3>
                <KitArchitecture mode="before" />
                <h3 id="after">After</h3>
                <KitArchitecture mode="after" />
                <ul>
                    <li>
                        <strong>Discovery.</strong> The CDN also serves <code>poppy.json</code> and
                        the OAuth server metadata.
                    </li>
                    <li>
                        <strong>Tokens.</strong> A new token endpoint verifies each Personal
                        Agent&rsquo;s signed identity and issues Session Tokens bound to its DPoP
                        key. When a Personal Agent signs a User in, the existing identity provider
                        authenticates the User and records consent. The token endpoint also
                        remembers the IDs of recent DPoP proofs, for the acceptance window, to
                        reject a reused one. Any store it already uses will do.
                    </li>
                    <li>
                        <strong>Session records.</strong> New tables hold each Session, keyed by its
                        Session Key&rsquo;s thumbprint, and each Account Token, so every component
                        can look up who a request is for and what it may do.
                    </li>
                    <li>
                        <strong>APIs and MCP.</strong> The API gateway accepts Session Tokens,
                        checks DPoP proofs and scopes, and passes the User to backend services that
                        don&rsquo;t change. If you have an MCP server that can&rsquo;t verify DPoP
                        yet, it stays as it is: the gateway accepts the Bearer Session Tokens that
                        Personal Agents get for it by Token Exchange. The protocol doesn't require
                        an MCP server.
                    </li>
                    <li>
                        <strong>Web.</strong> A browser session endpoint in the web app serves a
                        one-time code, checks the Personal Agent&rsquo;s DPoP proof over it, and
                        sets the site&rsquo;s usual cookie, linked to the Session. The cookie check
                        applies the Session&rsquo;s scopes.
                    </li>
                    <li>
                        <strong>Conversations.</strong> A conversation endpoint carries messages
                        between the Personal Agent and your support platform&rsquo;s company agent,
                        including handoff to a person.
                    </li>
                </ul>

                <h2 id="validator">Validator</h2>
                <p>
                    The validator is in the skill, at <code>validate/index.ts</code>. It acts as a
                    test Personal Agent against your deployment, and each check quotes the
                    requirement it tests. The agent runs it after each milestone. To run it
                    yourself:
                </p>
                <CodeBlock text={`node <skill-dir>/validate/index.ts help`} />
                <p>
                    The kit&rsquo;s <code>validate/README.md</code> covers its commands, the test
                    identity, and what it checks.
                </p>

                <h2 id="feedback">Feedback</h2>
                <p>
                    The spec is a draft. While it works, the agent logs anything in the spec that is
                    unclear, missing, or contradictory, and any problem with the kit, in{" "}
                    <code>plan/feedback.md</code>. <code>report</code> turns that log into an{" "}
                    <a href={`${NEW_ISSUE_URL}?template=2-implementation-report.yml`}>
                        implementation report
                    </a>{" "}
                    with your domains replaced by example.com. Nothing is sent until you file it.
                </p>
                <p>
                    If a check looks wrong, use the &ldquo;Disagree?&rdquo; link in its output. It
                    opens an issue with the check and its requirement filled in. See also{" "}
                    <a href="/docs/path-to-1#feedback">how to give feedback</a> and the{" "}
                    <a href={docsHref("guides")}>implementation guides</a>.
                </p>
            </article>
        </div>
    );
}
