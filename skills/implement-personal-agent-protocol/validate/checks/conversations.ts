// Milestone 2: signed-out conversations (section 8), with the Session header: messages, retries,
// events, cursors, wait, streaming, status, Direct Conversation errors, and closing. Messages are
// synthetic and carry no context about anyone. Every conversation the run starts is closed.

import { sessionRequest, syntheticMessageId, type SessionOptions } from "../agent.ts";
import { header, jsonError, noResponse, type Exchange } from "../http.ts";
import { randomId } from "../jose.ts";
import { formatSchemaErrors } from "../schema.ts";
import { check } from "../schemas.ts";
import { conversationEndpoint, skipRest, type Context, type Recorder } from "./types.ts";

export const CONVERSATION_IDS = [
    "conversations.not-found",
    "conversations.start",
    "conversations.retry-same-id",
    "conversations.message-id-conflict",
    "conversations.follow-up",
    "conversations.retry-follow-up",
    "conversations.other-user",
    "conversations.empty-message",
    "conversations.invalid-message-id",
    "conversations.message-id-boundaries",
    "conversations.data-only",
    "conversations.context-only",
    "conversations.events-read",
    "conversations.events-schema",
    "conversations.user-message-recorded",
    "conversations.message-preserved",
    "conversations.retry-not-duplicated",
    "conversations.event-order",
    "conversations.state-events",
    "conversations.cursor",
    "conversations.wait",
    "conversations.invalid-wait",
    "conversations.unknown-cursor",
    "conversations.sse",
    "conversations.sse-last-event-id",
    "conversations.cursor-other-conversation",
    "conversations.message-id-other-conversation",
    "conversations.close",
    "conversations.close-event",
    "conversations.close-again",
    "conversations.closed-message",
    "conversations.closed-handoff",
    "conversations.direct-closed-parent",
    "conversations.direct-unknown-parent",
];

export const TEST_TEXT = "Validator test message. Please ignore.";

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
    status?: string;
    responder?: string;
    message?: Message & { role?: string };
};

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

// Why a successful POST's response is wrong (8.3, 8.7), if it is.
function responseProblem(ex: Exchange, status: number): string | undefined {
    if (ex.status !== status) return undefined;
    const errors = ex.json === undefined ? [] : check("conversation-response.schema.json", ex.json);
    if (ex.json === undefined) return `${status} without a JSON body with status and responder`;
    if (errors.length) return `${status}; ${formatSchemaErrors(errors).join("; ")}`;
    return undefined;
}

// A POST that should succeed with this status and a body with status and responder.
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
        expected: `${status} with status and responder`,
        cause: problem
            ? "Every successful response to a POST or a read includes status and responder (8.7)."
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
    const start = await send("POST", endpoint, { message: first }, "starting a conversation");
    const id = (start.json as { conversation_id?: unknown } | undefined)?.conversation_id;
    const startErrors = start.json ? check("conversation-response.schema.json", start.json) : [];
    if (start.status !== 201 || typeof id !== "string" || startErrors.length) {
        r.fail("conversations.start", {
            exchange: start,
            got: startErrors.length
                ? `${start.status}; ${formatSchemaErrors(startErrors).join("; ")}`
                : undefined,
            expected: "201 with conversation_id, status, and responder",
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
            { message: first },
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
                        ? "The retry started a second conversation. Message IDs are unique per User, so a retried first message returns the conversation it started."
                        : ex.status === 201 || again === id
                          ? "A retry of an accepted message returns the original response: the same status and the same body."
                          : "Retries of an accepted message return the original response.",
            });
    }

    if (r.wants("conversations.message-id-conflict")) {
        const ex = await send(
            "POST",
            endpoint,
            { message: { ...first, text: "Validator test message, changed. Please ignore." } },
            "the first message's id with different text",
        );
        expectError(
            r,
            "conversations.message-id-conflict",
            ex,
            409,
            "message_id_conflict",
            "Compare the content of a message whose id was already accepted.",
        );
    }

    // The messages this conversation should record, in order.
    const sent: Message[] = [first];
    const followUp = message({
        text: TEST_TEXT,
        data: { validator_test: true, items: [1, 2] },
        context: { user_available: false },
    });
    const follow = await send(
        "POST",
        `${conv}/messages`,
        { message: followUp },
        "a second message",
    );
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
                { message: followUp },
                "the second message again, same id and content",
            );
            if (ex.status === 202 && same(ex.json, follow.json))
                r.pass("conversations.retry-follow-up");
            else
                r.fail("conversations.retry-follow-up", {
                    exchange: [follow, ex],
                    expected: "202 with the original response",
                    cause: "A retry of an accepted message returns the original response, the same status and body, and isn't added again (8.3).",
                });
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
            { message: message() },
            "a message with no text, data, or context",
        );
        expectError(
            r,
            "conversations.empty-message",
            ex,
            400,
            "invalid_request",
            "Reject messages that have none of text, data, or context.",
        );
    }

    if (r.wants("conversations.invalid-message-id")) {
        const ex = await send(
            "POST",
            `${conv}/messages`,
            { message: { ...message({ text: TEST_TEXT }), id: "msg validator!" } },
            'a message with id "msg validator!"',
        );
        expectError(
            r,
            "conversations.invalid-message-id",
            ex,
            400,
            "invalid_request",
            "IDs are 1 to 256 characters from the URL-safe base64 alphabet.",
        );
    }

    if (r.wants("conversations.message-id-boundaries")) {
        const longest = message({ text: TEST_TEXT });
        longest.id = `msg-_${randomId(12)}`.padEnd(256, "A");
        const tooLong = message({ text: TEST_TEXT });
        tooLong.id = `msg-_${randomId(12)}`.padEnd(257, "A");
        const okEx = await send(
            "POST",
            `${conv}/messages`,
            { message: longest },
            "a message whose id is 256 characters, with - and _",
        );
        const badEx = await send(
            "POST",
            `${conv}/messages`,
            { message: tooLong },
            "a message whose id is 257 characters",
        );
        if (okEx.status === 202) sent.push(longest);
        if (okEx.status === 202 && badEx.status === 400 && jsonError(badEx) === "invalid_request")
            r.pass("conversations.message-id-boundaries");
        else
            r.fail("conversations.message-id-boundaries", {
                exchange: okEx.status === 202 ? badEx : okEx,
                expected:
                    okEx.status === 202
                        ? '400 {"error": "invalid_request"} for a 257-character id'
                        : "202 for a 256-character id with - and _",
                cause: "IDs are 1 to 256 characters from the URL-safe base64 alphabet: letters, digits, - and _ (8.2). Accept all of them, up to 256, and reject longer ones with invalid_request.",
            });
    }

    let dataOnly: Message | undefined;
    if (r.wants("conversations.data-only")) {
        dataOnly = message({ data: { validator_test: "data only" } });
        const ex = await send(
            "POST",
            `${conv}/messages`,
            { message: dataOnly },
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
        ? await send(
              "POST",
              `${conv}/messages`,
              { message: contextOnly },
              "a message with only context",
          )
        : undefined;
    if (contextEx?.status === 202) sent.push(contextOnly);

    // Read everything so far.
    const read = await readAll(send, conv);
    const lastJson = read.last.json as Record<string, unknown> | undefined;
    const missing = [
        "conversation_id",
        "events",
        "cursor",
        "has_more",
        "status",
        "responder",
    ].filter((k) => !lastJson || !(k in lastJson));
    if (read.ok && missing.length === 0) r.pass("conversations.events-read");
    else
        r.fail("conversations.events-read", {
            exchange: read.last,
            got:
                read.last.status === 200 && missing.length
                    ? `missing ${missing.join(", ")}`
                    : undefined,
            expected: "200 with conversation_id, events, cursor, has_more, status, and responder",
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
                "conversations.state-events",
                "conversations.context-only",
                "conversations.cursor",
                "conversations.sse-last-event-id",
            ],
            unreadable,
        );
    } else {
        eventChecks(r, read, start, sent, followUp, followed, contextOnly, contextEx);
    }

    const cursor = read.cursor;
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
            { parent_conversation_id: id, message: message({ text: TEST_TEXT }) },
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
            {
                parent_conversation_id: `cnv_validator${randomId(9)}`,
                message: message({ text: TEST_TEXT }),
            },
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
    start: Exchange,
    sent: Message[],
    followUp: Message,
    followed: boolean,
    contextOnly: Message,
    contextEx: Exchange | undefined,
): void {
    const eventErrors = read.exchanges.flatMap((ex) =>
        ex.status === 200 && ex.json ? check("events-response.schema.json", ex.json) : [],
    );
    // The test Personal Agent lists no extensions, so an operation is never for it (Operations 2).
    const operations = read.events.flatMap((e, i) =>
        e.message && typeof e.message === "object" && "operation" in e.message
            ? [`events[${i}].message.operation`]
            : [],
    );
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
            expected: "Message events without operation",
            cause: "operation is a field of the Operations extension, and the test Personal Agent's client metadata doesn't list it. A Company doesn't return operations to a Personal Agent that doesn't list the extension (Operations 2).",
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
            cause: "Record every accepted message as a message event, with role set by the Company.",
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

    // Every change to status or responder adds a state event (8.7). Start from the first response,
    // follow the state events, and compare with the read's current values.
    const startJson = start.json as { status?: string; responder?: string } | undefined;
    let state = { status: startJson?.status, responder: startJson?.responder };
    for (const e of read.events)
        if (e.type === "state") state = { status: e.status, responder: e.responder };
    const now = read.last.json as { status?: string; responder?: string };
    if (state.status === now.status && state.responder === now.responder)
        r.pass("conversations.state-events");
    else
        r.fail("conversations.state-events", {
            exchange: [start, read.last],
            got: `status ${now.status} and responder ${now.responder}, but the last state event (or the first response) says ${state.status} and ${state.responder}`,
            expected: "A state event for every change to status or responder",
            cause: "Every change to status or responder adds a state event with both, even with no new text (8.7), so a Personal Agent reading only events sees it.",
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
        "conversations.message-id-other-conversation",
    ];
    if (!ids.some((i) => r.wants(i))) return;
    const start = await send(
        "POST",
        endpoint,
        { message: { id: syntheticMessageId(), author: { type: "agent" }, text: TEST_TEXT } },
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
    if (r.wants("conversations.message-id-other-conversation")) {
        if (!followed)
            r.skip(
                "conversations.message-id-other-conversation",
                "The second message wasn't accepted.",
            );
        else {
            const ex = await send(
                "POST",
                `${conv}/messages`,
                {
                    message: {
                        ...followUp,
                        text: "Validator test message, changed. Please ignore.",
                    },
                },
                "a message to the second conversation, reusing an ID from the first with different text",
            );
            expectError(
                r,
                "conversations.message-id-other-conversation",
                ex,
                409,
                "message_id_conflict",
                "Message IDs are unique for the User, not for one conversation (8.3), so an ID the Company accepted in another conversation, with different content, is a conflict.",
            );
        }
    }
    await send("POST", `${conv}/close`, {}, "closing the second conversation");
}

async function closeChecks(
    r: Recorder,
    conv: string,
    id: string,
    cursor: string | null | undefined,
    send: Send,
): Promise<void> {
    const close = await send("POST", `${conv}/close`, {}, "closing the conversation");
    const closeJson = close.json as { status?: string; responder?: string } | undefined;
    const closeProblem = responseProblem(close, 200);
    if (close.status === 200 && closeJson?.status === "closed" && !closeProblem)
        r.pass("conversations.close");
    else
        r.fail("conversations.close", {
            exchange: close,
            got: closeProblem,
            expected: '200 with status "closed" and responder',
        });

    const afterClose = await readAll(send, conv, cursor);
    if (afterClose.events.some((e) => e.type === "state" && e.status === "closed"))
        r.pass("conversations.close-event");
    else
        r.fail("conversations.close-event", {
            exchange: afterClose.last,
            got: afterClose.ok ? "no state event with status closed" : undefined,
            expected: 'A state event with status "closed"',
        });

    if (r.wants("conversations.close-again")) {
        const again = await send("POST", `${conv}/close`, {}, "closing it again");
        const later = await readAll(send, conv, afterClose.cursor);
        if (again.status !== 200 || !same(again.json, close.json)) {
            r.fail("conversations.close-again", {
                exchange: [close, again],
                expected: "200 with the same response as the first close",
                cause: "Closing a closed conversation returns the same response, not an error.",
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
            {
                message: {
                    id: syntheticMessageId(),
                    author: { type: "agent" },
                    text: TEST_TEXT,
                },
            },
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
        const ex = await send("POST", `${conv}/handoff`, {}, "a handoff request after closing");
        expectError(
            r,
            "conversations.closed-handoff",
            ex,
            409,
            "conversation_closed",
            "A closed conversation can't be handed off.",
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
            body: {},
            session: { sid: randomId(16), sub: c.sub },
            note: "closing a test conversation the run started",
        });
        if (ex.status === 200) c.closed = true;
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

// The test Personal Agent doesn't list the Operations extension, so the Company returns it no
// operations (Operations 2). Checks every conversation response the run received.
export function checkOperationsNotReturned(ctx: Context, r: Recorder): void {
    const id = "operations.not-returned";
    if (!r.wants(id)) return;
    const listed = (
        ctx.identity?.agent.extensions as Record<string, { version?: unknown }> | undefined
    )?.operations?.version;
    if (listed === "2") {
        r.skip(id, "The test Personal Agent's client metadata lists the Operations extension.");
        return;
    }
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
            cause: "The test Personal Agent's client metadata doesn't list the Operations extension, so it can't approve operations. Handle approval another way, such as on the website or in a Direct Conversation, or refuse with extension_required.",
        });
}
