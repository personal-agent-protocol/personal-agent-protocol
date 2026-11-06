# Pattern: conversations

Poppy conversations ([section 8](https://personalagentprotocol.org/docs/0.4/spec#conversations)) let a
Personal Agent talk with the Company Agent, and bring in a person on either side. Most Companies
already have a chat or support platform, an AI agent, and a live-agent desk. The usual pattern is an
adapter in front of them.

## A. An adapter in front of the existing support stack

A conversation service implements the six Poppy requests
([8.2](https://personalagentprotocol.org/docs/0.4/spec#conversation-requests)) and translates them to
and from the existing platform.

- Fits: Companies with an existing chat or support platform and agent.
- Needs: an API on the platform to create a conversation, post a message, and receive replies and
  state changes (by webhook, stream, or polling); a way to pass the verified Session (`client_id`,
  User ID, account, scopes) to the agent's tools; and a way to hand off to the live-agent desk.
- Trade-offs: reuses the agent and the desk. The adapter owns what the platform doesn't have: the
  event log, cursors, request ID deduplication, and the state fields.

**The event log.** Keep Poppy's own ordered event list per conversation
([8.5](https://personalagentprotocol.org/docs/0.4/spec#reading-events)), rather than reading the
platform's history on each request. Each event needs a stable, unique ID that works as a cursor.
Record every accepted message, with `role` set by the Company, and a `state` event on every change
to `handoff`, `responder`, or `closed` ([8.7](https://personalagentprotocol.org/docs/0.4/spec#state)).

**Mapping messages.** Personal Agent messages carry `author`, `text`, `data`, and `context`
([8.4](https://personalagentprotocol.org/docs/0.4/spec#message-fields)). Pass `context` and `data` to
the agent, and tell it whether a person is on the other side (`author.type` `human`,
[8.8](https://personalagentprotocol.org/docs/0.4/spec#human-or-ai)). Company messages need
`author.type`: `agent` for the AI, `human` for a live agent. If the platform has several personas
or live agents, you can name each with the `author`'s `id`, `name`, and `image`.
Extension content goes in the message's `extensions`, keyed by extension name, and only in response
to a request whose `Poppy-Extensions` declares that extension with the same version (8.4). If the
platform has its own fields for links or notices, map them to the
[Links](https://personalagentprotocol.org/docs/0.4/extensions/links) and
[Disclosures](https://personalagentprotocol.org/docs/0.4/extensions/disclosures) extensions.

**Versions.** Store the `Poppy-Version` and `Poppy-Extensions` a conversation started with. A later
Session can use other versions. Continue the conversation when the platform can, or reject requests
on it, all of them or only some, with `version_mismatch` (HTTP 409) and the conversation's
`protocol_version` ([8.2](https://personalagentprotocol.org/docs/0.4/spec#conversation-requests)).

**State.** Map the platform's state to four independent fields (8.7). `working` is the platform's
busy flag, plus any request you accepted but haven't passed on yet. It isn't an event, so you don't
need to find where a turn ends. Waiting for a live agent is `handoff: "pending"`, `responder` is
`human` only once a person has joined, and `closed` is the platform's closed state.

**Requests.** Every `POST` is accepted, then acted on: answer 201 or 202 with `conversation_id` as
soon as the request is safely stored, and act on a conversation's messages, handoff requests, and
cancels in that order ([8.3](https://personalagentprotocol.org/docs/0.4/spec#sending-messages)). Store
each accepted request ID per User, with its path (without the query) and a hash of its body, for as
long as you keep the conversation. A retried first message returns the conversation it already
started. When a Company Agent turn starts, note the latest request ID it sees, and put it in
`as_of_request` on that turn's messages
([8.4](https://personalagentprotocol.org/docs/0.4/spec#message-fields)). Show the agent which of its
messages each Personal Agent message's `as_of_cursor` covers. Leave `as_of_request` off messages
from live agents.

**Handoff** ([8.9](https://personalagentprotocol.org/docs/0.4/spec#handoff)). Route a handoff request
to the live-agent desk's queue. Set `handoff: "pending"`, then `handoff: "none"` and
`responder: "human"` when the desk reports a person joined. If no one is available, return
`handoff` to `none` and have the Company Agent say why. On a cancel, withdraw the desk request if
the desk lets you; if it doesn't, accept the cancel and leave `handoff` as it is. Closing cancels
the desk request. Live agents' tools need the same scope checks as the Company Agent's.

**Direct Conversations** ([8.10](https://personalagentprotocol.org/docs/0.4/spec#direct-conversations)).
Create a new platform conversation linked to the parent, with the parent's history available to the
agent but not returned to the Personal Agent. Track one open Direct Conversation per parent, and add
`direct_opened` and `direct_closed` events to the parent. Tell the agent it's now talking to the
customer directly. The Personal Agent may observe every message, so the Company must not send
information there that it cannot share with the Personal Agent (8.10).

When accepting a `user_requested` event, the Personal Agent sends its ID in
`user_requested_event_id` alongside `parent_conversation_id`, and can omit `message`. Validate that
the event is a `user_requested` event in that parent. Prepare the Company's opening message in the
new Direct Conversation, with `working` true, and `handoff` `pending` if waiting for a person. Deliver it as a normal `message`
event, including through `wait` on the opening request. After checking ownership, deduplicate
acceptances by parent ID and event ID for as long as you keep the Direct Conversation, even after
it closes.

**Waiting and streaming.** Long polls (`wait`) and streams
([8.6](https://personalagentprotocol.org/docs/0.4/spec#streaming)) need the adapter to notice new events
quickly, for example with a notification channel per conversation. If the platform streams the
agent's reply, it can be forwarded as `text-delta` events.

## B. Build the Company Agent behind a native Poppy endpoint

The Company Agent reads and writes Poppy events directly.

- Fits: Companies building a new agent, or whose agent has no reusable platform around it.
- Trade-offs: no translation layer, but handoff and the live-agent desk still need integrating.

## A conversation endpoint at another provider

Use the same Company issuer when another provider hosts the conversation endpoint. Give the
conversation service its own resource identifier, using its endpoint URL with any tenant path, and
publish its RFC 9728 protected resource metadata. Configure the issuer to issue tokens for that resource and arrange
access-token validation with the conversation provider. Session JWTs still name the Company, not
the provider's endpoint. The
[guide](https://personalagentprotocol.org/docs/0.4/guides#company-conversation-provider) shows the
metadata URL and validation options.

## What to watch for

- Only the conversation endpoint serves Personal Agent conversations. If website chat or other
  channels can open them, they may not check the Session header
  ([8.2](https://personalagentprotocol.org/docs/0.4/spec#conversation-requests)).
- Ownership: a conversation belongs to the `client_id` and User ID, then to the account once it uses
  it, whichever Session the request comes from. Anyone else gets `conversation_not_found` (8.2,
  [8.13](https://personalagentprotocol.org/docs/0.4/spec#conversation-errors)).
- Event retention: keep events at least 30 days, so reconnects rarely hit `cursor_expired`
  ([guides](https://personalagentprotocol.org/docs/0.4/guides#company-conversations)). Check the
  platform's own retention too.
- Scopes: the agent's tools check scopes on every call, whoever is handling the conversation
  ([8.11](https://personalagentprotocol.org/docs/0.4/spec#conversation-sign-in)).
- Inactivity: say so in a message before closing an inactive conversation
  ([guides](https://personalagentprotocol.org/docs/0.4/guides#company-conversations)).
