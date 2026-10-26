// Milestone 2: signed-out conversations (section 7): messages, retries, events, cursors, wait,
// status, and closing. Messages are synthetic and carry no context about anyone.

import { authedRequest, syntheticMessageId, tokenForResource } from "../agent.ts";
import { errorCode, type Exchange } from "../http.ts";
import { formatSchemaErrors } from "../schema.ts";
import { check } from "../schemas.ts";
import { randomId } from "../jose.ts";
import { skipRest, type Context, type HeldToken, type Recorder } from "./types.ts";

export const CONVERSATION_IDS = [
    "conversations.not-found",
    "conversations.start",
    "conversations.retry-same-id",
    "conversations.message-id-conflict",
    "conversations.follow-up",
    "conversations.empty-message",
    "conversations.invalid-message-id",
    "conversations.events-read",
    "conversations.events-schema",
    "conversations.user-message-recorded",
    "conversations.retry-not-duplicated",
    "conversations.wait",
    "conversations.invalid-wait",
    "conversations.unknown-cursor",
    "conversations.close",
    "conversations.close-event",
    "conversations.close-again",
    "conversations.closed-message",
    "conversations.closed-handoff",
];

export const TEST_TEXT = "Validator test message. Please ignore.";

type Event = {
    id?: string;
    type?: string;
    status?: string;
    message?: { id?: string; role?: string };
};

function expectError(
    r: Recorder,
    id: string,
    ex: Exchange,
    status: number,
    code: string,
    cause: string,
): void {
    if (ex.status === status && errorCode(ex) === code) r.pass(id);
    else if (ex.status !== undefined && ex.status >= 200 && ex.status < 300)
        r.fail(id, { exchange: ex, expected: `${status} ${code}`, cause });
    else if (errorCode(ex) === code)
        r.pass(id, {
            notes: [`Returned ${code} with status ${ex.status}; section 7.13 lists ${status}.`],
        });
    else
        r.fail(id, {
            exchange: ex,
            expected: `${status} ${code}`,
            cause: `The request was refused, but not with ${code}. ${cause}`,
        });
}

export async function checkConversations(ctx: Context, r: Recorder): Promise<void> {
    const entry = ctx.discovered.poppy?.agent?.protocols?.find(
        (p) => p?.type === "poppy" && typeof p.endpoint === "string",
    );
    if (!entry) {
        skipRest(
            r,
            CONVERSATION_IDS,
            "poppy.json lists no conversation endpoint (agent.protocols with type poppy).",
        );
        return;
    }
    if (!ctx.session.token) {
        skipRest(
            r,
            CONVERSATION_IDS,
            ctx.identity
                ? "No Session Token (see session.start)."
                : (ctx.identityProblem ?? "No test Personal Agent."),
        );
        return;
    }
    const token = await tokenForResource(ctx, entry.resource);
    if (!token) {
        skipRest(
            r,
            CONVERSATION_IDS,
            `Couldn't get a Session Token for resource ${entry.resource}.`,
        );
        return;
    }
    const endpoint = entry.endpoint!.replace(/\/+$/, "");
    const send = (method: string, url: string, body?: unknown, note?: string, timeoutMs?: number) =>
        authedRequest(ctx, { method, url, token, body, note, timeoutMs }).then((a) => a.ex);

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

    const first = { id: syntheticMessageId(), author: { type: "agent" }, text: TEST_TEXT };
    const start = await send("POST", endpoint, { message: first }, "starting a conversation");
    const startJson = start.json as { conversation_id?: string } | undefined;
    const startErrors = start.json ? check("conversation-response.schema.json", start.json) : [];
    const id = startJson?.conversation_id;
    if (start.status !== 201 || !id || startErrors.length) {
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
        if (!id) {
            skipRest(r, CONVERSATION_IDS, "No conversation was started (see conversations.start).");
            return;
        }
    } else r.pass("conversations.start", { summary: `Started ${id}.` });

    const conv = `${endpoint}/${id}`;
    try {
        await conversationChecks(ctx, r, token, endpoint, conv, id, first, send);
    } finally {
        // Leave nothing open.
        await send("POST", `${conv}/close`, {}, "closing the test conversation");
    }
}

async function readAll(
    send: (method: string, url: string) => Promise<Exchange>,
    conv: string,
    cursor?: string | null,
): Promise<{ events: Event[]; cursor?: string | null; last?: Exchange; exchanges: Exchange[] }> {
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
        if (ex.status !== 200 || !json) return { events, cursor, last: ex, exchanges };
        if (Array.isArray(json.events)) events.push(...json.events);
        cursor = json.cursor ?? cursor;
        if (!json.has_more) return { events, cursor, last: ex, exchanges };
    }
    return { events, cursor, last: exchanges[exchanges.length - 1], exchanges };
}

async function conversationChecks(
    ctx: Context,
    r: Recorder,
    _token: HeldToken,
    _endpoint: string,
    conv: string,
    id: string,
    first: { id: string; author: { type: string }; text: string },
    send: (
        method: string,
        url: string,
        body?: unknown,
        note?: string,
        timeoutMs?: number,
    ) => Promise<Exchange>,
): Promise<void> {
    const endpoint = _endpoint;
    if (r.wants("conversations.retry-same-id")) {
        const ex = await send(
            "POST",
            endpoint,
            { message: first },
            "the first message again, same id and content",
        );
        const again = (ex.json as { conversation_id?: string } | undefined)?.conversation_id;
        if (ex.status !== undefined && ex.status < 300 && again === id)
            r.pass("conversations.retry-same-id", {
                notes:
                    ex.status !== 201
                        ? [`Returned ${ex.status}; the original response was 201.`]
                        : undefined,
            });
        else
            r.fail("conversations.retry-same-id", {
                exchange: ex,
                expected: `201 with conversation_id "${id}"`,
                cause:
                    again && again !== id
                        ? "The retry started a second conversation. Message IDs are unique per User, so a retried first message returns the conversation it started."
                        : "Retries of an accepted message should return the original response.",
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

    if (r.wants("conversations.follow-up")) {
        const ex = await send(
            "POST",
            `${conv}/messages`,
            { message: { id: syntheticMessageId(), author: { type: "agent" }, text: TEST_TEXT } },
            "a second message",
        );
        const errors = ex.json ? check("conversation-response.schema.json", ex.json) : [];
        if (ex.status === 202 && ex.json && errors.length === 0) r.pass("conversations.follow-up");
        else
            r.fail("conversations.follow-up", {
                exchange: ex,
                got: errors.length ? formatSchemaErrors(errors).join("; ") : undefined,
                expected: "202 with status and responder",
            });
    }

    if (r.wants("conversations.empty-message")) {
        const ex = await send(
            "POST",
            `${conv}/messages`,
            { message: { id: syntheticMessageId(), author: { type: "agent" } } },
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
            { message: { id: "msg validator!", author: { type: "agent" }, text: TEST_TEXT } },
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

    const read = await readAll((m, u) => send(m, u), conv);
    const lastJson = read.last?.json as Record<string, unknown> | undefined;
    const missing = [
        "conversation_id",
        "events",
        "cursor",
        "has_more",
        "status",
        "responder",
    ].filter((k) => !lastJson || !(k in lastJson));
    if (read.last?.status === 200 && missing.length === 0) r.pass("conversations.events-read");
    else
        r.fail("conversations.events-read", {
            exchange: read.last,
            got: missing.length ? `missing ${missing.join(", ")}` : undefined,
            expected: "200 with conversation_id, events, cursor, has_more, status, and responder",
        });

    const eventErrors = read.exchanges.flatMap((ex) =>
        ex.status === 200 && ex.json ? check("events-response.schema.json", ex.json) : [],
    );
    if (read.last?.status !== 200)
        r.skip("conversations.events-schema", "Events couldn't be read.");
    else if (eventErrors.length)
        r.fail("conversations.events-schema", {
            exchange: read.last,
            got: formatSchemaErrors(eventErrors).slice(0, 8).join("; "),
            expected:
                "Events as section 7.5 describes (kit/company/schemas/events-response.schema.json)",
        });
    else r.pass("conversations.events-schema", { summary: `${read.events.length} event(s).` });

    const mine = read.events.filter((e) => e.type === "message" && e.message?.id === first.id);
    if (mine.length && mine[0].message?.role === "user")
        r.pass("conversations.user-message-recorded");
    else
        r.fail("conversations.user-message-recorded", {
            exchange: read.last,
            got: mine.length
                ? `role ${JSON.stringify(mine[0].message?.role)}`
                : `no message event with id ${first.id}`,
            expected: `A message event with message.id "${first.id}" and role "user"`,
            cause: "Record every accepted message as a message event, with role set by the Company.",
        });
    if (mine.length === 1) r.pass("conversations.retry-not-duplicated");
    else if (mine.length > 1)
        r.fail("conversations.retry-not-duplicated", {
            exchange: read.last,
            got: `${mine.length} message events with id ${first.id}`,
            expected: "One",
            cause: "The retried message was added again.",
        });
    else
        r.skip(
            "conversations.retry-not-duplicated",
            "The first message wasn't found in the events.",
        );

    const cursor = read.cursor;
    if (r.wants("conversations.wait")) {
        const ex = await send(
            "GET",
            `${conv}/events?${cursor ? `cursor=${encodeURIComponent(cursor)}&` : ""}wait=1`,
            undefined,
            "wait=1",
            20_000,
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

    // Close, then close again.
    const close = await send("POST", `${conv}/close`, {}, "closing the conversation");
    const closeJson = close.json as { status?: string } | undefined;
    if (close.status === 200 && closeJson?.status === "closed") r.pass("conversations.close");
    else
        r.fail("conversations.close", {
            exchange: close,
            expected: '200 with status "closed" and responder',
        });

    const afterClose = await readAll((m, u) => send(m, u), conv, cursor);
    if (afterClose.events.some((e) => e.type === "state" && e.status === "closed"))
        r.pass("conversations.close-event");
    else
        r.fail("conversations.close-event", {
            exchange: afterClose.last,
            got: "no state event with status closed",
            expected: 'A state event with status "closed"',
        });

    if (r.wants("conversations.close-again")) {
        const again = await send("POST", `${conv}/close`, {}, "closing it again");
        const later = await readAll((m, u) => send(m, u), conv, afterClose.cursor);
        const newState = later.events.filter((e) => e.type === "state");
        if (
            again.status !== 200 ||
            (again.json as { status?: string } | undefined)?.status !== "closed"
        ) {
            r.fail("conversations.close-again", {
                exchange: again,
                expected: '200 with status "closed"',
                cause: "Closing a closed conversation returns the same response, not an error.",
            });
        } else if (newState.length) {
            r.fail("conversations.close-again", {
                exchange: later.last,
                got: `${newState.length} new state event(s)`,
                expected: "No new event",
            });
        } else r.pass("conversations.close-again");
    }

    if (r.wants("conversations.closed-message")) {
        const ex = await send(
            "POST",
            `${conv}/messages`,
            { message: { id: syntheticMessageId(), author: { type: "agent" }, text: TEST_TEXT } },
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
    void ctx;
}
