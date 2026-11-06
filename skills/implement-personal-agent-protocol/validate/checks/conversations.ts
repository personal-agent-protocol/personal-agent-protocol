// Milestone 2: signed-out conversations (section 8), with the Session header: messages, request
// IDs, events, cursors, wait, streaming, state, Direct Conversation errors, and closing. Messages
// are synthetic and carry no context about anyone. The run never requests a person, since someone
// at the Company could be assigned. Every conversation the run starts is closed.

import {
    sessionRequest,
    syntheticMessageId,
    syntheticRequestId,
    type SessionOptions,
} from "../agent.ts";
import { header, jsonError, noResponse, type Exchange } from "../http.ts";
import { randomId } from "../jose.ts";
import { formatSchemaErrors } from "../schema.ts";
import { check } from "../schemas.ts";
import { conversationEndpoint, skipRest, type Context, type Recorder } from "./types.ts";

export const CONVERSATION_IDS = [
    "conversations.not-found",
    "conversations.start",
    "conversations.retry-same-id",
    "conversations.request-id-conflict",
    "conversations.follow-up",
    "conversations.retry-follow-up",
    "conversations.request-id-other-url",
    "conversations.other-user",
    "conversations.empty-message",
    "conversations.invalid-request-id",
    "conversations.request-id-boundaries",
    "conversations.missing-request-id",
    "conversations.data-only",
    "conversations.context-only",
    "conversations.cancel-without-handoff",
    "conversations.events-read",
    "conversations.events-schema",
    "conversations.user-message-recorded",
    "conversations.message-preserved",
    "conversations.retry-not-duplicated",
    "conversations.event-order",
    "conversations.working-settles",
    "conversations.cursor",
    "conversations.wait",
    "conversations.invalid-wait",
    "conversations.unknown-cursor",
    "conversations.sse",
    "conversations.sse-last-event-id",
    "conversations.cursor-other-conversation",
    "conversations.request-id-other-conversation",
    "conversations.close",
    "conversations.close-event",
    "conversations.closed-not-working",
    "conversations.state-events",
    "conversations.close-again",
    "conversations.closed-message",
    "conversations.closed-handoff",
    "conversations.closed-handoff-cancel",
    "conversations.direct-closed-parent",
    "conversations.direct-unknown-parent",
];

export const TEST_TEXT = "Validator test message. Please ignore.";

// A message, with the ID of the request that sends it (8.3).
type Message = {
    id: string;
    author: { type: string };
    text?: string;
    data?: Record<string, unknown>;
    context?: Record<string, unknown>;
};

type Event = {
    id?: string;
    type?: string;
    handoff?: string;
    responder?: string;
    closed?: boolean;
    message?: Message & { role?: string };
};

type State = { working?: unknown; handoff?: unknown; responder?: unknown; closed?: unknown };

// The body of a request that sends a message: the request ID, and the message without it (8.3).
function post(m: Message, extra: Record<string, unknown> = {}): Record<string, unknown> {
    const { id, ...message } = m;
    return { id, ...extra, message };
}

type Send = (
    method: string,
    url: string,
    body?: unknown,
    note?: string,
    extra?: {
        timeoutMs?: number;
        session?: SessionOptions;
        headers?: Record<string, string>;
        until?: (body: string) => boolean;
    },
) => Promise<Exchange>;

const ok = (ex: Exchange) => ex.status !== undefined && ex.status >= 200 && ex.status < 300;

function expectError(
    r: Recorder,
    id: string,
    ex: Exchange,
    status: number,
    code: string,
    cause: string,
): void {
    const got = jsonError(ex);
    if (ex.status === status && got === code) r.pass(id);
    else if (ok(ex)) r.fail(id, { exchange: ex, expected: `${status} ${code}`, cause });
    else if (got === code)
        r.fail(id, {
            exchange: ex,
            expected: `${status} ${code}`,
            cause: `${code} has status ${status} (8.13). ${cause}`,
        });
    else
        r.fail(id, {
            exchange: ex,
            expected: `${status} ${code}`,
            cause: `The request was refused, but not with ${code} in a JSON body. ${cause}`,
        });
}

// Why a successful POST's response is wrong (8.3), if it is.
function responseProblem(ex: Exchange, status: number): string | undefined {
    if (ex.status !== status) return undefined;
    const errors = ex.json === undefined ? [] : check("conversation-response.schema.json", ex.json);
    if (ex.json === undefined) return `${status} without a JSON body with conversation_id`;
    if (errors.length) return `${status}; ${formatSchemaErrors(errors).join("; ")}`;
    return undefined;
}

// A POST that should succeed with this status and a body with conversation_id.
function expectAccepted(
    r: Recorder,
    id: string,
    ex: Exchange,
    status: number,
    cause: string,
    extra?: string,
): boolean {
    const problem = ex.status === status ? responseProblem(ex, status) : undefined;
    if (ex.status === status && !problem && !extra) {
        r.pass(id);
        return true;
    }
    r.fail(id, {
        exchange: ex,
        got: problem ?? extra,
        expected: `${status} with conversation_id`,
        cause: problem
            ? "A successful POST without wait returns conversation_id: it means the Company accepted the request (8.3)."
            : cause,
    });
    return false;
}

// Whether two JSON values are equal.
function same(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const ka = Object.keys(a as object);
    const kb = Object.keys(b as object);
    return (
        ka.length === kb.length &&
        ka.every((k) => same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
    );
}

export async function checkConversations(ctx: Context, r: Recorder): Promise<void> {
    const endpoint = conversationEndpoint(ctx.discovered.poppy);
    if (!endpoint) {
        skipRest(
            r,
            CONVERSATION_IDS,
            "poppy.json lists no conversation endpoint (agent.protocols with type poppy).",
        );
        return;
    }
    if (!ctx.session.started) {
        skipRest(
            r,
            CONVERSATION_IDS,
            ctx.blocked.identity ??
                (ctx.identity
                    ? "No Session was started (see session.start)."
                    : (ctx.identityProblem ?? "No test Personal Agent.")),
        );
        return;
    }
    const send: Send = (method, url, body, note, extra = {}) =>
        sessionRequest(ctx, {
            method,
            url,
            body,
            note,
            timeoutMs: extra.timeoutMs,
            session: extra.session,
            headers: extra.headers,
            until: extra.until,
        });

    if (r.wants("conversations.not-found")) {
        const ex = await send(
            "GET",
            `${endpoint}/cnv_validator${randomId(9)}/events`,
            undefined,
            "for a conversation that doesn't exist",
        );
        expectError(
            r,
            "conversations.not-found",
            ex,
            404,
            "conversation_not_found",
            "Unknown conversations, and ones that belong to someone else, get the same 404 error.",
        );
    }

    const first: Message = { id: syntheticMessageId(), author: { type: "agent" }, text: TEST_TEXT };
    const start = await send("POST", endpoint, post(first), "starting a conversation");
    const id = (start.json as { conversation_id?: unknown } | undefined)?.conversation_id;
    const startErrors = start.json ? check("conversation-response.schema.json", start.json) : [];
    if (start.status !== 201 || typeof id !== "string" || startErrors.length) {
        r.fail("conversations.start", {
            exchange: start,
            got: startErrors.length
                ? `${start.status}; ${formatSchemaErrors(startErrors).join("; ")}`
                : undefined,
            expected: "201 with conversation_id",
            cause:
                start.status === 200
                    ? "Starting a conversation returns 201 Created."
                    : "The endpoint didn't start a conversation with the first message.",
        });
        if (typeof id !== "string") {
            skipRest(
                r,
                CONVERSATION_IDS,
                noResponse(start)
                    ? "The conversation endpoint didn't answer (see conversations.start)."
                    : "No conversation was started (see conversations.start).",
            );
            return;
        }
    } else r.pass("conversations.start", { summary: `Started ${id}.` });

    await conversationChecks(ctx, r, endpoint, id, start, first, send);
}

// Reads every page of a conversation's events from a cursor.
async function readAll(
    send: Send,
    conv: string,
    cursor?: string | null,
): Promise<{
    events: Event[];
    cursor?: string | null;
    last: Exchange;
    exchanges: Exchange[];
    ok: boolean;
}> {
    const events: Event[] = [];
    const exchanges: Exchange[] = [];
    for (let page = 0; page < 10; page++) {
        const ex = await send(
            "GET",
            `${conv}/events${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
        );
        exchanges.push(ex);
        const json = ex.json as
            | { events?: Event[]; cursor?: string | null; has_more?: boolean }
            | undefined;
        if (ex.status !== 200 || !json || !Array.isArray(json.events))
            return { events, cursor, last: ex, exchanges, ok: false };
        events.push(...json.events.filter((e) => e && typeof e === "object"));
        cursor = json.cursor ?? cursor;
        if (!json.has_more) return { events, cursor, last: ex, exchanges, ok: true };
    }
    return { events, cursor, last: exchanges[exchanges.length - 1], exchanges, ok: true };
}

// Reads from a cursor with wait until done says the read's state is reached, for up to about 30
// seconds. Returns the events read on the way and the last read.
async function waitFor(
    send: Send,
    conv: string,
    cursor: string | null | undefined,
    done: (state: State) => boolean,
): Promise<{ events: Event[]; cursor?: string | null; last?: Exchange; reached: boolean }> {
    const events: Event[] = [];
    const until = Date.now() + 30_000;
    let last: Exchange | undefined;
    for (let i = 0; i < 6 && Date.now() < until; i++) {
        last = await send(
            "GET",
            `${conv}/events?${cursor ? `cursor=${encodeURIComponent(cursor)}&` : ""}wait=10`,
            undefined,
            "reading with wait=10",
            { timeoutMs: 20_000 },
        );
        const json = last.json as
            | (State & { events?: Event[]; cursor?: string | null })
            | undefined;
        if (last.status !== 200 || !json || !Array.isArray(json.events))
            return { events, cursor, last, reached: false };
        events.push(...json.events.filter((e) => e && typeof e === "object"));
        cursor = json.cursor ?? cursor;
        if (done(json)) return { events, cursor, last, reached: true };
    }
    return { events, cursor, last, reached: false };
}

// The first complete server-sent event in a body, if any.
export function firstSseEvent(
    body: string,
): { id?: string; event?: string; data?: string } | undefined {
    for (const block of body.replace(/\r\n?/g, "\n").split("\n\n").slice(0, -1)) {
        const fields: { id?: string; event?: string; data?: string } = {};
        for (const line of block.split("\n")) {
            if (line.startsWith(":")) continue;
            const colon = line.indexOf(":");
            const name = colon === -1 ? line : line.slice(0, colon);
            const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
            if (name === "data")
                fields.data = fields.data === undefined ? value : `${fields.data}\n${value}`;
            else if (name === "id") fields.id = value;
            else if (name === "event") fields.event = value;
        }
        if (fields.data !== undefined && (fields.event ?? "message") === "message") return fields;
    }
    return undefined;
}

const SSE_DONE = (body: string) => firstSseEvent(body) !== undefined;

async function conversationChecks(
    ctx: Context,
    r: Recorder,
    endpoint: string,
    id: string,
    start: Exchange,
    first: Message,
    send: Send,
): Promise<void> {
    const conv = `${endpoint}/${id}`;
    const message = (fields: Partial<Message> = {}): Message => ({
        id: syntheticMessageId(),
        author: { type: "agent" },
        ...fields,
    });

    if (r.wants("conversations.retry-same-id")) {
        const ex = await send(
            "POST",
            endpoint,
            post(first),
            "the first message again, same id and content",
        );
        const again = (ex.json as { conversation_id?: unknown } | undefined)?.conversation_id;
        if (ex.status === 201 && same(ex.json, start.json)) r.pass("conversations.retry-same-id");
        else
            r.fail("conversations.retry-same-id", {
                exchange: [start, ex],
                expected: `201 with the original response, conversation_id "${id}"`,
                cause:
                    typeof again === "string" && again !== id
                        ? "The retry started a second conversation. Request IDs are unique per User, so a retried first message returns the conversation it started."
                        : ex.status === 201 || again === id
                          ? "A retry of an accepted request returns the original response: the same status and the same body."
                          : "Retries of an accepted request return the original response.",
            });
    }

    if (r.wants("conversations.request-id-conflict")) {
        const ex = await send(
            "POST",
            endpoint,
            post({ ...first, text: "Validator test message, changed. Please ignore." }),
            "the first message's request id with different text",
        );
        expectError(
            r,
            "conversations.request-id-conflict",
            ex,
            409,
            "request_id_conflict",
            "Compare the body of a request whose id was already accepted.",
        );
    }

    // The messages this conversation should record, in order.
    const sent: Message[] = [first];
    const followUp = message({
        text: TEST_TEXT,
        data: { validator_test: true, items: [1, 2] },
        context: { user_available: false },
    });
    const follow = await send("POST", `${conv}/messages`, post(followUp), "a second message");
    const followed = expectAccepted(
        r,
        "conversations.follow-up",
        follow,
        202,
        "A later message goes to the conversation's messages URL and returns 202 (8.3).",
    );
    if (followed) sent.push(followUp);

    if (r.wants("conversations.retry-follow-up")) {
        if (!followed)
            r.skip("conversations.retry-follow-up", "The second message wasn't accepted.");
        else {
            const ex = await send(
                "POST",
                `${conv}/messages`,
                post(followUp),
                "the second message again, same id and content",
            );
            if (ex.status === 202 && same(ex.json, follow.json))
                r.pass("conversations.retry-follow-up");
            else
                r.fail("conversations.retry-follow-up", {
                    exchange: [follow, ex],
                    expected: "202 with the original response",
                    cause: "A retry of an accepted request returns the original response, the same status and body, and isn't acted on again (8.3).",
                });
        }
    }

    // A cancel with the second message's ID: a different URL and body, so a conflict. If the
    // Company accepts it anyway, there's no handoff to cancel, so nothing changes.
    if (r.wants("conversations.request-id-other-url")) {
        if (!followed)
            r.skip("conversations.request-id-other-url", "The second message wasn't accepted.");
        else {
            const ex = await send(
                "POST",
                `${conv}/handoff/cancel`,
                { id: followUp.id },
                "a handoff cancel reusing the second message's request id",
            );
            expectError(
                r,
                "conversations.request-id-other-url",
                ex,
                409,
                "request_id_conflict",
                "A request ID is unique for the User across all requests, so reusing an accepted ID at another URL is a conflict (8.3).",
            );
        }
    }

    if (r.wants("conversations.other-user")) {
        const ex = await send(
            "GET",
            `${conv}/events`,
            undefined,
            "reading the conversation's events in another Session, for a different User ID",
            {
                session: { sid: randomId(16), sub: `usr_validator${randomId(12)}` },
            },
        );
        expectError(
            r,
            "conversations.other-user",
            ex,
            404,
            "conversation_not_found",
            "A conversation belongs to the client_id and User ID that started it. Requests for another User get the same 404 as an unknown conversation.",
        );
    }

    if (r.wants("conversations.empty-message")) {
        const ex = await send(
            "POST",
            `${conv}/messages`,
            post(message()),
            "a message with no text, data, context, or extensions",
        );
        expectError(
            r,
            "conversations.empty-message",
            ex,
            400,
            "invalid_request",
            "Reject messages that have none of text, data, context, or extensions.",
        );
    }

    if (r.wants("conversations.invalid-request-id")) {
        const ex = await send(
            "POST",
            `${conv}/messages`,
            post({ ...message({ text: TEST_TEXT }), id: "msg validator!" }),
            'a message with request id "msg validator!"',
        );
        expectError(
            r,
            "conversations.invalid-request-id",
            ex,
            400,
            "invalid_request",
            "IDs are 1 to 256 characters from the URL-safe base64 alphabet.",
        );
    }

    if (r.wants("conversations.request-id-boundaries")) {
        const longest = message({ text: TEST_TEXT });
        longest.id = `msg-_${randomId(12)}`.padEnd(256, "A");
        const tooLong = message({ text: TEST_TEXT });
        tooLong.id = `msg-_${randomId(12)}`.padEnd(257, "A");
        const okEx = await send(
            "POST",
            `${conv}/messages`,
            post(longest),
            "a message whose request id is 256 characters, with - and _",
        );
        const badEx = await send(
            "POST",
            `${conv}/messages`,
            post(tooLong),
            "a message whose request id is 257 characters",
        );
        if (okEx.status === 202) sent.push(longest);
        if (okEx.status === 202 && badEx.status === 400 && jsonError(badEx) === "invalid_request")
            r.pass("conversations.request-id-boundaries");
        else
            r.fail("conversations.request-id-boundaries", {
                exchange: okEx.status === 202 ? badEx : okEx,
                expected:
                    okEx.status === 202
                        ? '400 {"error": "invalid_request"} for a 257-character id'
                        : "202 for a 256-character id with - and _",
                cause: "IDs are 1 to 256 characters from the URL-safe base64 alphabet: letters, digits, - and _ (8.2). Accept all of them, up to 256, and reject longer ones with invalid_request.",
            });
    }

    if (r.wants("conversations.missing-request-id")) {
        const ex = await send(
            "POST",
            `${conv}/messages`,
            { message: { author: { type: "agent" }, text: TEST_TEXT } },
            "a message with no request id",
        );
        expectError(
            r,
            "conversations.missing-request-id",
            ex,
            400,
            "invalid_request",
            "Every POST body has an id, so the Company can recognize a retry (8.3).",
        );
    }

    let dataOnly: Message | undefined;
    if (r.wants("conversations.data-only")) {
        dataOnly = message({ data: { validator_test: "data only" } });
        const ex = await send(
            "POST",
            `${conv}/messages`,
            post(dataOnly),
            "a message with only data",
        );
        if (
            expectAccepted(
                r,
                "conversations.data-only",
                ex,
                202,
                "A message needs at least one of text, data, or context (8.4), so a message with only data is accepted.",
            )
        )
            sent.push(dataOnly);
    }

    const contextOnly = message({ context: { user_available: false } });
    const contextEx = r.wants("conversations.context-only")
        ? await send("POST", `${conv}/messages`, post(contextOnly), "a message with only context")
        : undefined;
    if (contextEx?.status === 202) sent.push(contextOnly);

    // No handoff is pending, so the cancel changes nothing, and no one at the Company is involved.
    if (r.wants("conversations.cancel-without-handoff")) {
        const ex = await send(
            "POST",
            `${conv}/handoff/cancel`,
            { id: syntheticRequestId() },
            "a handoff cancel with no handoff pending",
        );
        const after = ok(ex)
            ? await send("GET", `${conv}/events`, undefined, "reading after the cancel")
            : undefined;
        const handoff = (after?.json as State | undefined)?.handoff;
        if (ex.status !== 202 || responseProblem(ex, 202))
            expectAccepted(
                r,
                "conversations.cancel-without-handoff",
                ex,
                202,
                "The Personal Agent withdraws a request for a person at the conversation's handoff/cancel URL, and the Company returns 202 (8.9).",
            );
        else if (handoff === "none") r.pass("conversations.cancel-without-handoff");
        else
            r.fail("conversations.cancel-without-handoff", {
                exchange: [ex, after!],
                got: `handoff ${JSON.stringify(handoff)}`,
                expected: 'handoff "none"',
                cause: "With no handoff pending, a cancel changes nothing (8.9).",
            });
    }

    // Read everything so far.
    const read = await readAll(send, conv);
    const lastJson = read.last.json as Record<string, unknown> | undefined;
    const missing = [
        "conversation_id",
        "events",
        "cursor",
        "has_more",
        "working",
        "handoff",
        "responder",
        "closed",
    ].filter((k) => !lastJson || !(k in lastJson));
    if (read.ok && missing.length === 0) r.pass("conversations.events-read");
    else
        r.fail("conversations.events-read", {
            exchange: read.last,
            got:
                read.last.status === 200 && missing.length
                    ? `missing ${missing.join(", ")}`
                    : undefined,
            expected:
                "200 with conversation_id, events, cursor, has_more, working, handoff, responder, and closed",
        });

    const unreadable = noResponse(read.last)
        ? "The events couldn't be read (see conversations.events-read)."
        : read.ok
          ? undefined
          : "The events couldn't be read (see conversations.events-read).";
    if (unreadable) {
        skipRest(
            r,
            [
                "conversations.events-schema",
                "conversations.user-message-recorded",
                "conversations.message-preserved",
                "conversations.retry-not-duplicated",
                "conversations.event-order",
                "conversations.working-settles",
                "conversations.context-only",
                "conversations.cursor",
                "conversations.sse-last-event-id",
            ],
            unreadable,
        );
    } else {
        eventChecks(r, read, sent, followUp, followed, contextOnly, contextEx);
    }

    let cursor = read.cursor;
    if (!unreadable && r.wants("conversations.working-settles")) {
        const working = (read.last.json as State).working;
        if (working === false)
            r.pass("conversations.working-settles", { summary: "working was false." });
        else {
            const settled = await waitFor(send, conv, cursor, (st) => st.working === false);
            cursor = settled.cursor;
            if (settled.reached)
                r.pass("conversations.working-settles", {
                    summary: "working became false while reading with wait.",
                });
            else
                r.warn("conversations.working-settles", {
                    exchange: settled.last ?? read.last,
                    got: `working ${JSON.stringify((settled.last?.json as State | undefined)?.working)} after about 30 seconds`,
                    expected:
                        "working false once the Company has acted on every request and replied",
                    cause: "A Personal Agent reads until working is false (8.7). If the Company really was still working, run again. If not, it reports working after it has finished, and a Personal Agent never stops reading.",
                });
        }
    }

    if (r.wants("conversations.cursor") && !unreadable && typeof cursor === "string") {
        const seen = new Set(read.events.map((e) => e.id));
        const ex = await send(
            "GET",
            `${conv}/events?cursor=${encodeURIComponent(cursor)}`,
            undefined,
            "reading from the last cursor",
        );
        const json = ex.json as { events?: Event[]; cursor?: unknown } | undefined;
        const events = Array.isArray(json?.events) ? json.events : undefined;
        const repeated = (events ?? []).filter((e) => seen.has(e?.id));
        const expectedCursor = events?.length ? events[events.length - 1]?.id : cursor;
        if (ex.status === 200 && events && repeated.length === 0 && json?.cursor === expectedCursor)
            r.pass("conversations.cursor");
        else
            r.fail("conversations.cursor", {
                exchange: ex,
                got:
                    ex.status !== 200 || !events
                        ? undefined
                        : repeated.length
                          ? `events already read before the cursor: ${repeated.map((e) => e.id).join(", ")}`
                          : `cursor ${JSON.stringify(json?.cursor)}`,
                expected: `200 with only events after ${cursor}, and cursor ${JSON.stringify(expectedCursor)}`,
                cause: "A read returns the events after the cursor, and its cursor is the last event returned, or the request's cursor if there were none (8.5).",
            });
    } else if (r.wants("conversations.cursor") && !unreadable)
        r.skip("conversations.cursor", "The read returned no cursor to continue from.");

    if (r.wants("conversations.wait")) {
        const ex = await send(
            "GET",
            `${conv}/events?${cursor ? `cursor=${encodeURIComponent(cursor)}&` : ""}wait=1`,
            undefined,
            "wait=1",
            { timeoutMs: 20_000 },
        );
        if (ex.status === 200 && ex.ms <= 6000)
            r.pass("conversations.wait", { summary: `Returned in ${ex.ms} ms.` });
        else if (ex.status === 200)
            r.warn("conversations.wait", {
                exchange: ex,
                got: `200 after ${ex.ms} ms`,
                expected: "A response within about 1 second",
                cause: "The read was held longer than wait asked for.",
            });
        else
            r.fail("conversations.wait", {
                exchange: ex,
                expected: "200",
                cause: "wait is a query parameter with a whole number of seconds.",
            });
    }

    if (r.wants("conversations.invalid-wait")) {
        const ex = await send("GET", `${conv}/events?wait=soon`, undefined, "wait=soon");
        expectError(
            r,
            "conversations.invalid-wait",
            ex,
            400,
            "invalid_request",
            "Reject a wait that isn't a whole number of seconds.",
        );
    }

    if (r.wants("conversations.unknown-cursor")) {
        const ex = await send(
            "GET",
            `${conv}/events?cursor=evt_validator${randomId(9)}`,
            undefined,
            "a cursor that doesn't exist",
        );
        expectError(
            r,
            "conversations.unknown-cursor",
            ex,
            400,
            "invalid_cursor",
            "Unknown cursors get invalid_cursor rather than an empty read.",
        );
    }

    const streams = await sseChecks(r, conv, read, send);
    if (!streams && r.wants("conversations.sse-last-event-id"))
        r.skip("conversations.sse-last-event-id", "The Company doesn't stream events.");

    await secondConversation(r, endpoint, read.events, followUp, followed, send);

    await closeChecks(r, conv, id, cursor, send);

    // Direct Conversations that the Company must refuse (8.10). Each is refused before anything
    // starts, so no one at the Company sees them.
    if (r.wants("conversations.direct-closed-parent")) {
        const ex = await send(
            "POST",
            endpoint,
            post(message({ text: TEST_TEXT }), { parent_conversation_id: id }),
            "a Direct Conversation whose parent is closed",
        );
        expectError(
            r,
            "conversations.direct-closed-parent",
            ex,
            409,
            "conversation_closed",
            "A Direct Conversation's parent must be open (8.10).",
        );
    }
    if (r.wants("conversations.direct-unknown-parent")) {
        const ex = await send(
            "POST",
            endpoint,
            post(message({ text: TEST_TEXT }), {
                parent_conversation_id: `cnv_validator${randomId(9)}`,
            }),
            "a Direct Conversation whose parent doesn't exist",
        );
        expectError(
            r,
            "conversations.direct-unknown-parent",
            ex,
            404,
            "conversation_not_found",
            "A Direct Conversation's parent must be an open conversation that belongs to the same owner (8.10).",
        );
    }
    void ctx;
}

// The checks on the events read so far.
function eventChecks(
    r: Recorder,
    read: Awaited<ReturnType<typeof readAll>>,
    sent: Message[],
    followUp: Message,
    followed: boolean,
    contextOnly: Message,
    contextEx: Exchange | undefined,
): void {
    const eventErrors = read.exchanges.flatMap((ex) =>
        ex.status === 200 && ex.json ? check("events-response.schema.json", ex.json) : [],
    );
    // The test Personal Agent declares no extensions, so no extension content is for it (8.4).
    const operations = read.events.flatMap((e, i) => {
        const extensions =
            e.message && typeof e.message === "object"
                ? (e.message as { extensions?: unknown }).extensions
                : undefined;
        return extensions && typeof extensions === "object"
            ? Object.keys(extensions).map((k) => `events[${i}].message.extensions.${k}`)
            : [];
    });
    if (eventErrors.length)
        r.fail("conversations.events-schema", {
            exchange: read.last,
            got: formatSchemaErrors(eventErrors).slice(0, 8).join("; "),
            expected:
                "Events as section 8.5 describes (kit/company/schemas/events-response.schema.json)",
        });
    else if (operations.length)
        r.fail("conversations.events-schema", {
            exchange: read.last,
            got: operations.join(", "),
            expected: "Message events without extension content",
            cause: "operation is a field of the Operations extension, and the test Personal Agent's requests don't declare it. A Company doesn't return operations in response to a request that doesn't declare the extension (Operations 2).",
        });
    else r.pass("conversations.events-schema", { summary: `${read.events.length} event(s).` });

    const messagesWith = (messageId: string) =>
        read.events.filter((e) => e.type === "message" && e.message?.id === messageId);
    const mine = messagesWith(sent[0].id);
    if (mine.length && mine[0].message?.role === "user")
        r.pass("conversations.user-message-recorded");
    else
        r.fail("conversations.user-message-recorded", {
            exchange: read.last,
            got: mine.length
                ? `role ${JSON.stringify(mine[0].message?.role)}`
                : `no message event with id ${sent[0].id}`,
            expected: `A message event with message.id "${sent[0].id}" and role "user"`,
            cause: "Record every accepted message as a message event, with role set by the Company and the request's ID as the message's ID (8.3).",
        });

    const recorded = messagesWith(followUp.id)[0]?.message;
    if (!followed) r.skip("conversations.message-preserved", "The second message wasn't accepted.");
    else if (
        recorded &&
        recorded.role === "user" &&
        same(recorded.author, followUp.author) &&
        recorded.text === followUp.text &&
        same(recorded.data, followUp.data) &&
        same(recorded.context, followUp.context)
    )
        r.pass("conversations.message-preserved");
    else
        r.fail("conversations.message-preserved", {
            exchange: read.last,
            got: recorded
                ? `message ${JSON.stringify(recorded)}`
                : `no message event with id ${followUp.id}`,
            expected: `message ${JSON.stringify({ ...followUp, role: "user" })}`,
            cause: "A message event holds the message as it was sent, with its author, text, data, and context, plus role (8.5).",
        });

    const counts = sent.map((m) => [m.id, messagesWith(m.id).length] as const);
    const repeated = counts.filter(([, n]) => n > 1);
    if (mine.length === 0)
        r.skip(
            "conversations.retry-not-duplicated",
            "The first message wasn't found in the events.",
        );
    else if (repeated.length)
        r.fail("conversations.retry-not-duplicated", {
            exchange: read.last,
            got: repeated.map(([m, n]) => `${n} message events with id ${m}`).join(", "),
            expected: "One message event for each message ID",
            cause: "A retried message was added again.",
        });
    else r.pass("conversations.retry-not-duplicated");

    if (contextEx) {
        if (contextEx.status === 202 && messagesWith(contextOnly.id).length === 1)
            r.pass("conversations.context-only");
        else if (contextEx.status === 202)
            r.fail("conversations.context-only", {
                exchange: read.last,
                got: `no message event with id ${contextOnly.id}`,
                expected: "The message with only context recorded as a message event",
                cause: "Every message the Company accepts is recorded, including one with only context (8.5).",
            });
        else
            expectAccepted(
                r,
                "conversations.context-only",
                contextEx,
                202,
                "A message with only context updates it without saying anything else (8.4), so it's accepted.",
            );
    }

    // Order and identity: IDs unique, and the messages in the order they were sent.
    const ids = read.events.map((e) => e.id);
    const duplicates = ids.filter((e, i) => ids.indexOf(e) !== i);
    const positions = sent
        .map((m) => read.events.findIndex((e) => e.type === "message" && e.message?.id === m.id))
        .filter((i) => i !== -1);
    const outOfOrder = positions.some((p, i) => i > 0 && p < positions[i - 1]);
    if (duplicates.length === 0 && !outOfOrder) r.pass("conversations.event-order");
    else
        r.fail("conversations.event-order", {
            exchange: read.last,
            got: duplicates.length
                ? `event ids repeated: ${[...new Set(duplicates)].join(", ")}`
                : "the messages aren't in the order they were sent",
            expected:
                "Each event once, with a unique id, and messages in the order they were accepted",
            cause: "The Company records each conversation as an ordered list of events, each with its own ID (8.5).",
        });
}

// Streaming (8.6): a read with Accept: text/event-stream gets an SSE stream or JSON as usual.
// Returns whether the Company streams.
async function sseChecks(
    r: Recorder,
    conv: string,
    read: Awaited<ReturnType<typeof readAll>>,
    send: Send,
): Promise<boolean> {
    if (!r.wants("conversations.sse") && !r.wants("conversations.sse-last-event-id")) return false;
    const stream = await sessionRequestSse(
        send,
        `${conv}/events`,
        "reading with Accept: text/event-stream",
    );
    const type = header(stream, "content-type") ?? "";
    let streams = false;
    if (/^text\/event-stream/i.test(type)) {
        streams = true;
        const event = firstSseEvent(stream.body ?? "");
        let data: { id?: unknown; type?: unknown } | undefined;
        try {
            data = event?.data ? JSON.parse(event.data) : undefined;
        } catch {
            data = undefined;
        }
        if (
            stream.status === 200 &&
            event &&
            data &&
            data.id === event.id &&
            typeof data.type === "string"
        )
            r.pass("conversations.sse", { summary: "Streams events." });
        else
            r.fail("conversations.sse", {
                exchange: stream,
                got: event
                    ? `an event with id ${JSON.stringify(event.id)} and data ${JSON.stringify(event.data?.slice(0, 120))}`
                    : "no complete event within the timeout",
                expected: "Each event with its event ID as the SSE id and the event JSON as data",
                cause: "In a stream, each event has its event ID as the SSE id and the same event JSON as data (8.6).",
            });
    } else if (stream.status === 200 && stream.json) {
        const errors = check("events-response.schema.json", stream.json);
        if (errors.length)
            r.fail("conversations.sse", {
                exchange: stream,
                got: formatSchemaErrors(errors).slice(0, 4).join("; "),
                expected: "JSON as usual, since the Company doesn't stream",
            });
        else r.pass("conversations.sse", { summary: "Doesn't stream; returns JSON as usual." });
    } else
        r.fail("conversations.sse", {
            exchange: stream,
            expected: "200 with text/event-stream, or JSON as usual",
            cause: "A Company that doesn't stream returns JSON as usual when a read asks for text/event-stream (8.6).",
        });

    if (streams && r.wants("conversations.sse-last-event-id")) {
        const ids = read.events.map((e) => e.id).filter((e): e is string => typeof e === "string");
        if (ids.length < 3)
            r.skip("conversations.sse-last-event-id", "Fewer than three events to read from.");
        else {
            const lastEventId = ids[ids.length - 2];
            const ex = await sessionRequestSse(
                send,
                `${conv}/events?cursor=${encodeURIComponent(ids[0])}`,
                `reading with cursor ${ids[0]} and Last-Event-ID ${lastEventId}`,
                { "Last-Event-ID": lastEventId },
            );
            const event = firstSseEvent(ex.body ?? "");
            const early = ids.slice(1, ids.length - 1);
            if (ex.status === 200 && event && !early.includes(event.id ?? ""))
                r.pass("conversations.sse-last-event-id");
            else
                r.fail("conversations.sse-last-event-id", {
                    exchange: ex,
                    got: event ? `the stream started at ${event.id}` : "no event",
                    expected: `The stream starting after ${lastEventId}`,
                    cause: "If a request has both, Last-Event-ID wins, because SSE clients add it to the URL the stream was first opened with (8.6).",
                });
        }
    }
    return streams;
}

function sessionRequestSse(
    send: Send,
    url: string,
    note: string,
    headers: Record<string, string> = {},
): Promise<Exchange> {
    // A stream stays open, so reading stops at the first complete event.
    return send("GET", url, undefined, note, {
        timeoutMs: 5000,
        headers: { Accept: "text/event-stream", ...headers },
        until: SSE_DONE,
    });
}

// A second conversation, for what crosses conversations: cursors and message IDs.
async function secondConversation(
    r: Recorder,
    endpoint: string,
    events: Event[],
    followUp: Message,
    followed: boolean,
    send: Send,
): Promise<void> {
    const ids = [
        "conversations.cursor-other-conversation",
        "conversations.request-id-other-conversation",
    ];
    if (!ids.some((i) => r.wants(i))) return;
    const start = await send(
        "POST",
        endpoint,
        post({ id: syntheticMessageId(), author: { type: "agent" }, text: TEST_TEXT }),
        "starting a second conversation",
    );
    const second = (start.json as { conversation_id?: unknown } | undefined)?.conversation_id;
    if (start.status !== 201 || typeof second !== "string") {
        skipRest(r, ids, "A second conversation couldn't be started.");
        return;
    }
    const conv = `${endpoint}/${second}`;
    const foreign = events.find((e) => typeof e.id === "string")?.id;
    if (r.wants("conversations.cursor-other-conversation")) {
        if (!foreign)
            r.skip("conversations.cursor-other-conversation", "No event to use as a cursor.");
        else {
            const ex = await send(
                "GET",
                `${conv}/events?cursor=${encodeURIComponent(foreign)}`,
                undefined,
                "reading the second conversation with a cursor from the first",
            );
            expectError(
                r,
                "conversations.cursor-other-conversation",
                ex,
                400,
                "invalid_cursor",
                "A cursor that doesn't belong to this conversation gets invalid_cursor (8.13).",
            );
        }
    }
    if (r.wants("conversations.request-id-other-conversation")) {
        if (!followed)
            r.skip(
                "conversations.request-id-other-conversation",
                "The second message wasn't accepted.",
            );
        else {
            const ex = await send(
                "POST",
                `${conv}/messages`,
                post({ ...followUp, text: "Validator test message, changed. Please ignore." }),
                "a message to the second conversation, reusing a request ID from the first with different text",
            );
            expectError(
                r,
                "conversations.request-id-other-conversation",
                ex,
                409,
                "request_id_conflict",
                "Request IDs are unique for the User, not for one conversation (8.3), so an ID the Company accepted in another conversation, with a different body, is a conflict.",
            );
        }
    }
    await send(
        "POST",
        `${conv}/close`,
        { id: syntheticRequestId() },
        "closing the second conversation",
    );
}

async function closeChecks(
    r: Recorder,
    conv: string,
    id: string,
    cursor: string | null | undefined,
    send: Send,
): Promise<void> {
    const close = await send(
        "POST",
        `${conv}/close`,
        { id: syntheticRequestId() },
        "closing the conversation",
    );
    expectAccepted(
        r,
        "conversations.close",
        close,
        202,
        "The Company may act on a close after responding, so it returns 202 (8.12).",
    );

    // The close takes effect when the Company acts on it, which can be after the response.
    const closing = await waitFor(send, conv, cursor, (st) => st.closed === true);
    const now = closing.last?.json as State | undefined;
    if (closing.events.some((e) => e.type === "state" && e.closed === true))
        r.pass("conversations.close-event");
    else
        r.fail("conversations.close-event", {
            exchange: closing.last ?? close,
            got: closing.reached
                ? "closed is true, but there's no state event with closed true"
                : `closed ${JSON.stringify(now?.closed)} after about 30 seconds`,
            expected: "A state event with closed true",
            cause: "When the Company acts on a close, it sets closed to true and adds a state event (8.12).",
        });

    if (r.wants("conversations.closed-not-working")) {
        if (!closing.reached)
            r.fail("conversations.closed-not-working", {
                exchange: closing.last ?? close,
                got: `closed ${JSON.stringify(now?.closed)} after about 30 seconds`,
                expected: "closed true and working false",
                cause: "The close was accepted but never took effect (8.12).",
            });
        else if (now?.working === false) r.pass("conversations.closed-not-working");
        else
            r.fail("conversations.closed-not-working", {
                exchange: closing.last!,
                got: `working ${JSON.stringify(now?.working)}`,
                expected: "working false",
                cause: "In a closed conversation, working is false (8.7), so a Personal Agent reading until it's false stops.",
            });
    }

    // Every change to handoff, responder, or closed adds a state event (8.7). Follow the state
    // events from the start, which this run never changed, and compare with the current values.
    if (r.wants("conversations.state-events")) {
        const all = await readAll(send, conv);
        const current = all.last.json as State | undefined;
        let state: State = { handoff: "none", responder: "agent", closed: false };
        for (const e of all.events)
            if (e.type === "state")
                state = { handoff: e.handoff, responder: e.responder, closed: e.closed };
        const fields = ["handoff", "responder", "closed"] as const;
        if (!all.ok) r.fail("conversations.state-events", { exchange: all.last, expected: "200" });
        else if (fields.every((f) => state[f] === current?.[f]))
            r.pass("conversations.state-events");
        else
            r.fail("conversations.state-events", {
                exchange: all.last,
                got: `${fields.map((f) => `${f} ${JSON.stringify(current?.[f])}`).join(", ")}, but the last state event (or the start) says ${fields.map((f) => `${f} ${JSON.stringify(state[f])}`).join(", ")}`,
                expected: "A state event for every change to handoff, responder, or closed",
                cause: "Every change to handoff, responder, or closed adds a state event with all three, even with no new text (8.7), so a Personal Agent reading only events sees it.",
            });
    }

    if (r.wants("conversations.close-again")) {
        const again = await send(
            "POST",
            `${conv}/close`,
            { id: syntheticRequestId() },
            "closing it again, with a new request id",
        );
        const later = await readAll(send, conv, closing.cursor);
        if (again.status !== 202 || !same(again.json, close.json)) {
            r.fail("conversations.close-again", {
                exchange: [close, again],
                expected: "202 with the same body as the first close",
                cause: "A close sent to a closed conversation returns 202 and changes nothing, not an error (8.12).",
            });
        } else if (!later.ok) {
            r.fail("conversations.close-again", {
                exchange: later.last,
                expected: "200 with no new events",
            });
        } else if (later.events.length) {
            r.fail("conversations.close-again", {
                exchange: later.last,
                got: `${later.events.length} new event(s): ${later.events.map((e) => e.type).join(", ")}`,
                expected: "No new event",
            });
        } else r.pass("conversations.close-again");
    }

    if (r.wants("conversations.closed-message")) {
        const ex = await send(
            "POST",
            `${conv}/messages`,
            post({ id: syntheticMessageId(), author: { type: "agent" }, text: TEST_TEXT }),
            "a message after closing",
        );
        expectError(
            r,
            "conversations.closed-message",
            ex,
            409,
            "conversation_closed",
            "A closed conversation takes no more messages.",
        );
    }
    if (r.wants("conversations.closed-handoff")) {
        const ex = await send(
            "POST",
            `${conv}/handoff`,
            { id: syntheticRequestId() },
            "a handoff request after closing",
        );
        expectError(
            r,
            "conversations.closed-handoff",
            ex,
            409,
            "conversation_closed",
            "A closed conversation can't be handed off.",
        );
    }
    if (r.wants("conversations.closed-handoff-cancel")) {
        const ex = await send(
            "POST",
            `${conv}/handoff/cancel`,
            { id: syntheticRequestId() },
            "a handoff cancel after closing",
        );
        expectError(
            r,
            "conversations.closed-handoff-cancel",
            ex,
            409,
            "conversation_closed",
            "A closed conversation takes no more handoff cancels (8.12).",
        );
    }
    void id;
}

// Closes every conversation the run started that isn't closed yet, including ones a retry or a
// faulty check started, and notes what happened (spec 8.12).
export async function closeCreated(ctx: Context): Promise<void> {
    if (!ctx.identity) return;
    const open = ctx.created.filter((c) => !c.closed);
    const failed: string[] = [];
    for (const c of open) {
        const ex = await sessionRequest(ctx, {
            method: "POST",
            url: `${c.endpoint}/${c.id}/close`,
            body: { id: syntheticRequestId() },
            session: { sid: randomId(16), sub: c.sub },
            note: "closing a test conversation the run started",
        });
        if (ex.status === 202) c.closed = true;
        else failed.push(`${c.id} (${ex.error ? `no response: ${ex.error}` : ex.status})`);
    }
    if (ctx.created.length === 0) return;
    const closed = ctx.created.filter((c) => c.closed).length;
    ctx.notes.push(
        failed.length
            ? `The run started ${ctx.created.length} test conversation(s) and couldn't close ${failed.length}: ${failed.join(", ")}. Close them by hand, or let them expire.`
            : `The run started ${ctx.created.length} test conversation(s) and closed all ${closed}.`,
    );
}

// Where a JSON value holds an operation (Operations 3), as paths such as events[2].message.operation.
function operationPaths(value: unknown, path = ""): string[] {
    if (Array.isArray(value)) return value.flatMap((v, i) => operationPaths(v, `${path}[${i}]`));
    if (!value || typeof value !== "object") return [];
    return Object.entries(value).flatMap(([k, v]) =>
        (k === "operation" || k === "operations") && v !== null && v !== undefined
            ? [`${path ? `${path}.` : ""}${k}`]
            : operationPaths(v, `${path ? `${path}.` : ""}${k}`),
    );
}

// The test Personal Agent doesn't declare the Operations extension, so the Company returns it no
// operations (Operations 2). Checks every conversation response the run received.
export function checkOperationsNotReturned(ctx: Context, r: Recorder): void {
    const id = "operations.not-returned";
    if (!r.wants(id)) return;
    const endpoint = conversationEndpoint(ctx.discovered.poppy);
    const responses = endpoint
        ? ctx.http.log.filter(
              (ex) => ex.url.startsWith(endpoint) && ex.status !== undefined && ex.status < 300,
          )
        : [];
    if (responses.length === 0) {
        r.skip(id, "No conversation responses to check (see the conversations checks).");
        return;
    }
    const found = responses.flatMap((ex) => {
        const bodies: unknown[] = ex.json !== undefined ? [ex.json] : [];
        if (ex.json === undefined && ex.body)
            for (const m of ex.body.matchAll(/^data:(.*)$/gm)) {
                try {
                    bodies.push(JSON.parse(m[1]));
                } catch {
                    // Not JSON.
                }
            }
        const paths = bodies.flatMap((b) => operationPaths(b));
        return paths.length ? [{ ex, paths }] : [];
    });
    if (found.length === 0)
        r.pass(id, { summary: `${responses.length} conversation response(s) without operations.` });
    else
        r.fail(id, {
            exchange: found.map((f) => f.ex),
            got: found.map((f) => `${f.ex.method} ${f.ex.url}: ${f.paths.join(", ")}`).join("; "),
            expected: "No operation in any response",
            cause: "The test Personal Agent's requests don't declare the Operations extension, so it can't approve operations. Handle approval another way, such as on the website or in a Direct Conversation, or refuse with extension_required.",
        });
}
