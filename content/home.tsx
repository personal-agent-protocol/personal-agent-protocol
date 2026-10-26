import { ButtonLink } from "../components/button";
import { SectionViews } from "../components/section-views";
import { Video } from "../components/video-gallery";
import { Walkthroughs } from "../components/walkthroughs";

const SPECTRUM = [
    { title: "Blocked", detail: "No agents allowed.", end: true },
    { title: "Search rooms", detail: "Any agent" },
    { title: "See reservations", detail: "After the user signs in" },
    { title: "Book a room", detail: "With the user's approval" },
    { title: "Full access", detail: "The agent acts as the user.", end: true },
];

// Section ids, in page order, reported by `home_section_view`.
const SECTIONS = ["hero", "why", "parties", "features", "examples", "implement"];

export function HomeContent() {
    return (
        <>
            <section className="hero" id="hero">
                <div className="wrap">
                    <div>
                        <h1>An open protocol for every company and every personal agent.</h1>
                        <p className="lede">
                            Personal agents can discover participating companies, sign users in, and
                            get things done through APIs, web pages, and company agents. Companies
                            decide how to empower agents and what they can do.
                        </p>
                        <div className="hero-ctas">
                            <ButtonLink
                                variant="secondary"
                                href="#examples"
                                data-cta="see_examples"
                            >
                                See examples
                            </ButtonLink>
                            <ButtonLink variant="primary" href="/docs/introduction" data-cta="docs">
                                Read the docs
                            </ButtonLink>
                        </div>
                    </div>
                    <Video
                        mediaId="dkxdtin9uz"
                        id="overview"
                        title="What is the Personal Agent Protocol?"
                    />
                </div>
            </section>
            <section className="block" id="why">
                <div className="wrap">
                    <div className="section-head">
                        <h2>Creating choice and control</h2>
                        <p>
                            People already hand everyday tasks to personal agents, and many of those
                            tasks end at a company. Today it is all or nothing: the company blocks
                            the agent, or the agent signs in as the person and can do anything they
                            can. As agents do more, both sides waste more effort on this, with
                            companies trying to detect agents and agents trying to avoid detection.
                            That doesn't serve anyone, and we don't think it can last.
                        </p>
                        <p>
                            We think everyone is better off with more choices between those two
                            extremes. So we built <strong>Personal Agent Protocol</strong>, or
                            &ldquo;Poppy&rdquo; for short: a shared way for companies to decide what
                            agents can do, and for people to decide what their agent can do for
                            them.
                        </p>
                    </div>
                    <ol className="spectrum">
                        {SPECTRUM.map((stop) => (
                            <li key={stop.title} className={stop.end ? "end" : undefined}>
                                <span className="mark">
                                    {stop.end ? (
                                        <span className="end-dot" />
                                    ) : (
                                        <img src="/logo.png" alt="" width={28} height={28} />
                                    )}
                                </span>
                                <span className="stop-text">
                                    <strong>{stop.title}</strong>
                                    <span>{stop.detail}</span>
                                </span>
                            </li>
                        ))}
                    </ol>
                </div>
            </section>
            <section className="block" id="parties">
                <div className="wrap">
                    <div className="section-head">
                        <h2>Built for everyone</h2>
                        <p>
                            Any company can take part, whether it offers a website, APIs, an MCP
                            server, or its own agent. Users bring the personal agent of their
                            choice.
                        </p>
                    </div>
                    <div className="parties">
                        <div className="party user">
                            <h3>Users</h3>
                            <p className="gets">More done with their own agent</p>
                            <ul>
                                <li>
                                    <strong>Get more done with their personal agent</strong> at
                                    every company that supports the protocol.
                                </li>
                                <li>
                                    <strong>Sign in directly and control permissions:</strong> users
                                    sign in on the company's own page and choose what their personal
                                    agent can see and do in their account.
                                </li>
                                <li>
                                    <strong>Get things done faster</strong> when their personal
                                    agent can work with the company directly instead of clicking
                                    through its website.
                                </li>
                            </ul>
                        </div>
                        <div className="party agent">
                            <h3>Personal agents</h3>
                            <p className="gets">Faster, simpler access</p>
                            <ul>
                                <li>
                                    <strong>More efficient access</strong> through the company's
                                    APIs or a conversation with its agent, instead of navigating web
                                    pages.
                                </li>
                                <li>
                                    <strong>One standard protocol</strong> across every
                                    participating company, so each new company works the same way.
                                </li>
                                <li>
                                    <strong>Sign-in support</strong> even when the user can't share
                                    their credentials with the agent: they sign in on the company's
                                    own page.
                                </li>
                            </ul>
                        </div>
                        <div className="party company">
                            <h3>Companies</h3>
                            <p className="gets">Insight and control</p>
                            <ul>
                                <li>
                                    <strong>Start with what they have:</strong> publish a website,
                                    APIs, or agent, and add more over time.
                                </li>
                                <li>
                                    <strong>Understand customer behavior across channels,</strong>{" "}
                                    since each session follows the user through the company's APIs,
                                    website, and agent conversations.
                                </li>
                                <li>
                                    <strong>Control what agents can and can't do:</strong> which
                                    personal agents to allow, how users sign in, and which scopes of
                                    account access agents can request.
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            </section>
            <section className="block" id="features">
                <div className="wrap">
                    <div className="section-head">
                        <h2>The building blocks</h2>
                        <p>
                            Personal Agent Protocol covers the complete interface between a personal
                            agent and a company: how the agent finds the company, who it acts for,
                            what it is allowed to do, and how it gets work done through APIs, web
                            pages, or a conversation with the company's agent. A company publishes
                            once, and any personal agent can work with it. The protocol builds on
                            widely used open standards, so teams can implement it with libraries and
                            tools that already exist.
                        </p>
                    </div>
                    <div className="feature-group">
                        <div className="feature-group-head">
                            <h3>Getting connected</h3>
                            <p>
                                How a personal agent finds a company and gets access for one user.
                            </p>
                        </div>
                        <div className="features cols-3">
                            <div className="feature">
                                <h3>Discovery</h3>
                                <p>
                                    A document at <code>/.well-known/poppy.json</code> identifies
                                    the organization and says how to start sessions and sign in,
                                    along with the APIs and company agent it offers.
                                </p>
                            </div>
                            <div className="feature">
                                <h3>Standard sign-in</h3>
                                <p>
                                    The user signs in on the company's own page through standard
                                    OAuth and chooses what access to grant. If the company allows
                                    it, the personal agent can also sign in for the user with the
                                    credentials the company asks for, such as an email and password.
                                </p>
                            </div>
                            <div className="feature">
                                <h3>One session across interfaces</h3>
                                <p>
                                    One session covers API calls, conversations, and web browsing.
                                    APIs and conversations use a short-lived session token, bound to
                                    a key only the personal agent holds. Signing in gives the
                                    personal agent lasting access, within the scopes the company
                                    allows for that sign-in type, until it expires or the user or
                                    the company revokes it.
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="feature-group">
                        <div className="feature-group-head">
                            <h3>Working together</h3>
                            <p>How the personal agent and the company interact once connected.</p>
                        </div>
                        <div className="features cols-2">
                            <div className="feature">
                                <h3>A spectrum of interfaces</h3>
                                <p>
                                    Companies choose what to offer: OpenAPI, MCP, or web pages,
                                    alongside an optional company agent. Each API keeps its own
                                    schema.
                                </p>
                            </div>
                            <div className="feature">
                                <h3>Web page access</h3>
                                <p>
                                    A personal agent can browse the company's website in the same
                                    session. The agent's browser proves which session it belongs to,
                                    and the company sets its own cookie, so it recognizes the user
                                    and applies their sign-in permissions on each page.
                                </p>
                            </div>
                            <div className="feature">
                                <h3>Conversations</h3>
                                <p>
                                    The personal agent can talk with the company for the user, or
                                    let the user talk with it directly, using text plus structured
                                    data. Both sides say whether a person or an AI is speaking, so
                                    conversations can adapt to who's participating.
                                </p>
                            </div>
                            <div className="feature">
                                <h3>Extensions</h3>
                                <p>
                                    Discovery, identity, APIs, and conversations are all open to
                                    extension. Companies and industries can build on them to add
                                    things like payments, push notifications, or interactive
                                    elements.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
            <section className="block soft" id="examples">
                <div className="wrap">
                    <div className="section-head">
                        <h2>Three everyday tasks</h2>
                        <p>
                            Each company chooses the interface that fits the task. Follow one task
                            through Atlas, the user's personal agent, and see what the company
                            exposes behind it.
                        </p>
                    </div>
                    <Walkthroughs />
                </div>
            </section>
            <section className="block" id="implement">
                <div className="wrap">
                    <div className="section-head">
                        <h2>Bring your company or personal agent onto Personal Agent Protocol</h2>
                        <p>
                            Read the docs to see what an implementation involves. It's a draft, and
                            we're working with design partners to get it to 1.0. The path to 1.0
                            covers how that works and how to give feedback.
                        </p>
                    </div>
                    <div className="hero-ctas">
                        <ButtonLink variant="secondary" href="/docs/path-to-1" data-cta="roadmap">
                            Path to 1.0
                        </ButtonLink>
                        <ButtonLink variant="primary" href="/docs/introduction" data-cta="docs">
                            Read the docs
                        </ButtonLink>
                    </div>
                </div>
            </section>
            <SectionViews sections={SECTIONS} />
        </>
    );
}
