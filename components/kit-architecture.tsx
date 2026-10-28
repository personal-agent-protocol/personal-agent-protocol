// An example deployment for the kit page, before and after a Company adds Personal Agent Protocol.
// Each row is one kind of traffic, and lines run at right angles. Inline SVG, since the content
// security policy allows only the site's own files.

type Status = "existing" | "changed" | "added";

type Node = {
    id: string;
    col: number;
    row: number;
    title: string;
    detail: string;
    status?: Status;
};

// An edge from one node to another. A line from a client turns at its own x, so each client's
// lines share one vertical trunk.
type Edge = [from: string, to: string];

const COL_X = [20, 230, 440, 710];
const COL_WIDTH = [170, 190, 240, 200];
const COLUMNS = ["Clients", "Entry", "Services", "Data"];
const TRUNK_X: Record<string, number> = { people: 203, agent: 216 };
const TOP = 52;
const ROW_STEP = 66;
const BOX_HEIGHT = 50;
const WIDTH = 930;

const PEOPLE: Node = {
    id: "people",
    col: 0,
    row: 0,
    title: "People",
    detail: "Browsers and mobile apps",
};

// An MCP server the Company already runs, if it has one. The protocol doesn't require one.
function MCP(row: number): Node {
    return { id: "mcp", col: 2, row, title: "MCP server", detail: "Tools over the same services" };
}

const BEFORE: Node[] = [
    PEOPLE,
    { id: "cdn", col: 1, row: 0, title: "CDN", detail: "Pages and static files" },
    { id: "web", col: 2, row: 0, title: "Web app", detail: "Creates and checks cookies" },
    { id: "cookies", col: 3, row: 0, title: "Web session store", detail: "Cookie sessions" },
    { id: "idp", col: 2, row: 1, title: "Identity provider", detail: "Sign-in, OAuth tokens" },
    { id: "users", col: 3, row: 1, title: "User database", detail: "Accounts, credentials" },
    { id: "gateway", col: 1, row: 2, title: "API gateway", detail: "Checks access tokens" },
    { id: "backend", col: 2, row: 2, title: "Backend services", detail: "Orders, bookings, …" },
    { id: "db", col: 3, row: 2, title: "Application database", detail: "Business data" },
    MCP(3),
    {
        id: "support",
        col: 2,
        row: 4,
        title: "Support platform",
        detail: "Chat, company agent, live agents",
    },
];

const BEFORE_EDGES: Edge[] = [
    ["people", "cdn"],
    ["people", "idp"],
    ["people", "gateway"],
    ["people", "support"],
    ["cdn", "web"],
    ["web", "cookies"],
    ["idp", "users"],
    ["gateway", "backend"],
    ["backend", "db"],
    ["gateway", "mcp"],
    ["mcp", "backend"],
];

const AFTER: Node[] = [
    PEOPLE,
    {
        id: "agent",
        col: 0,
        row: 5,
        title: "Personal Agent",
        detail: "Acting for a User",
        status: "added",
    },
    { id: "cdn", col: 1, row: 0, title: "CDN", detail: "+ poppy.json", status: "changed" },
    {
        id: "web",
        col: 2,
        row: 0,
        title: "Web app",
        detail: "+ Browser session endpoint",
        status: "changed",
    },
    { id: "cookies", col: 3, row: 0, title: "Web session store", detail: "Cookie sessions" },
    {
        id: "idp",
        col: 2,
        row: 1,
        title: "Identity provider",
        detail: "+ Sign-in for Personal Agents",
        status: "changed",
    },
    { id: "users", col: 3, row: 1, title: "User database", detail: "Accounts, credentials" },
    {
        id: "token",
        col: 2,
        row: 2,
        title: "Token endpoint",
        detail: "Verifies agents, plain OAuth",
        status: "added",
    },
    {
        id: "sessions",
        col: 3,
        row: 2,
        title: "Session records",
        detail: "Sessions, refresh tokens",
        status: "added",
    },
    {
        id: "gateway",
        col: 1,
        row: 3,
        title: "API gateway",
        detail: "+ Session header",
        status: "changed",
    },
    { id: "backend", col: 2, row: 3, title: "Backend services", detail: "Orders, bookings, …" },
    { id: "db", col: 3, row: 3, title: "Application database", detail: "Business data" },
    MCP(4),
    {
        id: "conversation",
        col: 1,
        row: 5,
        title: "Conversation endpoint",
        detail: "Messages, events, handoff",
        status: "added",
    },
    {
        id: "support",
        col: 2,
        row: 6,
        title: "Support platform",
        detail: "Chat, company agent, live agents",
    },
];

const AFTER_EDGES: Edge[] = [
    ...BEFORE_EDGES,
    ["agent", "cdn"],
    ["agent", "token"],
    ["agent", "gateway"],
    ["agent", "conversation"],
    ["token", "idp"],
    ["token", "sessions"],
    ["web", "sessions"],
    ["conversation", "support"],
];

function box(node: Node) {
    return { x: COL_X[node.col], y: TOP + node.row * ROW_STEP, width: COL_WIDTH[node.col] };
}

// A line at right angles: across from the first box, down or up to the second box's row, and
// across into it. Boxes in the same column are joined by a vertical line.
function edgePath(from: Node, to: Node): string {
    const a = box(from);
    const b = box(to);
    if (from.col === to.col) {
        const x = Math.min(a.x, b.x) + 40;
        const [upper, lower] = from.row < to.row ? [a, b] : [b, a];
        return `M${x} ${upper.y + BOX_HEIGHT} V${lower.y}`;
    }
    const y1 = a.y + BOX_HEIGHT / 2;
    const y2 = b.y + BOX_HEIGHT / 2;
    const turn = TRUNK_X[from.id] ?? (a.x + a.width + b.x) / 2;
    return `M${a.x + a.width} ${y1} H${turn} V${y2} H${b.x}`;
}

const LEGEND: [Status, string][] = [
    ["added", "Added"],
    ["changed", "Changed"],
    ["existing", "Unchanged"],
];

export function KitArchitecture({ mode }: { mode: "before" | "after" }) {
    const nodes = mode === "before" ? BEFORE : AFTER;
    const edges = mode === "before" ? BEFORE_EDGES : AFTER_EDGES;
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const isNew = (id: string) => byId.get(id)?.status === "added";
    const rows = Math.max(...nodes.map((node) => node.row)) + 1;
    const legendY = TOP + rows * ROW_STEP + 4;
    const height = legendY + (mode === "after" ? 24 : 0);
    const titleId = `arch-${mode}-title`;
    return (
        <div className="arch">
            <svg
                viewBox={`0 0 ${WIDTH} ${height}`}
                role="img"
                aria-labelledby={titleId}
                className="arch-svg"
            >
                <title id={titleId}>
                    {mode === "before"
                        ? "Example architecture before Personal Agent Protocol"
                        : "Example architecture after adding Personal Agent Protocol"}
                </title>
                {COLUMNS.map((label, i) => (
                    <text key={label} x={COL_X[i]} y={30} className="arch-column">
                        {label}
                    </text>
                ))}
                {edges.map(([from, to]) => (
                    <path
                        key={`${from}-${to}`}
                        d={edgePath(byId.get(from)!, byId.get(to)!)}
                        className={
                            mode === "after" && (isNew(from) || isNew(to))
                                ? "arch-line arch-line-new"
                                : "arch-line"
                        }
                    />
                ))}
                {nodes.map((node) => {
                    const { x, y, width } = box(node);
                    return (
                        <g key={node.id} className={`arch-box arch-${node.status ?? "existing"}`}>
                            <rect x={x} y={y} width={width} height={BOX_HEIGHT} rx={6} />
                            <text x={x + 12} y={y + 21} className="arch-title">
                                {node.title}
                            </text>
                            <text x={x + 12} y={y + 39} className="arch-detail">
                                {node.detail}
                            </text>
                        </g>
                    );
                })}
                {mode === "after" &&
                    LEGEND.map(([status, label], i) => (
                        <g key={status} className={`arch-box arch-${status}`}>
                            <rect x={20 + i * 120} y={legendY} width={14} height={14} rx={3} />
                            <text x={40 + i * 120} y={legendY + 12} className="arch-detail">
                                {label}
                            </text>
                        </g>
                    ))}
            </svg>
        </div>
    );
}
