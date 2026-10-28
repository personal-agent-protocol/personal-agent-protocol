# Pattern: conversations

Poppy conversations ([section 8](https://personalagentprotocol.org/docs/0.3/spec#conversations)) let a
Personal Agent talk with the Company Agent, and bring in a person on either side. Most Companies
already have a chat or support platform, an AI agent, and a live-agent desk. The usual pattern is an
adapter in front of them.

## A. An adapter in front of the existing support stack

A conversation service implements the five Poppy requests
([8.2](https://personalagentprotocol.org/docs/0.3/spec#conversation-requests)) and translates them to
and from the existing platform.

- Fits: Companies with an existing chat or support platform and agent.
- Needs: an API on the platform to create a conversation, post a message, and receive replies and
  state changes (by webhook, stream, or polling); a way to pass the verified Session (`client_id`,
  User ID, account, scopes) to the agent's tools; and a way to hand off to the live-agent desk.
- Trade-offs: reuses the agent and the desk. The adapter owns what the platform doesn't have: the
  event log, cursors, message ID deduplication, and `status` and `responder`.

**The event log.** Keep Poppy's own ordered event list per conversation
([8.5](https://personalagentprotocol.org/docs/0.3/spec#reading-events)), rather than reading the
platform's history on each request. Each event needs a stable, unique ID that works as a cursor.
Record every accepted message, with `role` set by the Company, and a `state` event on every change
to `status` or `responder` ([8.7](https://personalagentprotocol.org/docs/0.3/spec#status)).

**Mapping messages.** Personal Agent messages carry `author`, `text`, `data`, and `context`
([8.4](https://personalagentprotocol.org/docs/0.3/spec#message-fields)). Pass `context` and `data` to
the agent, and tell it whether a person is on the other side (`author.type` `human`,
[8.8](https://personalagentprotocol.org/docs/0.3/spec#human-or-ai)). Company messages need
`author.type`: `agent` for the AI, `human` for a live agent. If the platform has several personas
or live agents, you can name each with the `author`'s `id`, `name`, and `image`.

**Status and responder.** Map the platform's states: the agent working is `working`, waiting for
the Personal Agent is `idle`, waiting for a live agent is `queued`, and closed is `closed`.
`responder` is `human` only once a person has joined (8.7).

**Message IDs.** Store each accepted message ID per User, with a hash of its content, for as long as
you keep the conversation ([8.3](https://personalagentprotocol.org/docs/0.3/spec#sending-messages)). A
retried first message returns the conversation it already started.

**Handoff** ([8.9](https://personalagentprotocol.org/docs/0.3/spec#handoff)). Route a handoff request
to the live-agent desk's queue. Set `queued`, then `responder: "human"` when the desk reports a
person joined. If no one is available, return to `idle` and have the Company Agent say why. Closing
cancels the desk request. Live agents' tools need the same scope checks as the Company Agent's.

**Direct Conversations** ([8.10](https://personalagentprotocol.org/docs/0.3/spec#direct-conversations)).
Create a new platform conversation linked to the parent, with the parent's history available to the
agent but not returned to the Personal Agent. Track one open Direct Conversation per parent, and add
`direct_opened` and `direct_closed` events to the parent. Tell the agent it's now talking to the
customer directly.

**Waiting and streaming.** Long polls (`wait`) and streams
([8.6](https://personalagentprotocol.org/docs/0.3/spec#streaming)) need the adapter to notice new events
quickly, for example with a notification channel per conversation. If the platform streams the
agent's reply, it can be forwarded as `text-delta` events.

## B. Build the Company Agent behind a native Poppy endpoint

The Company Agent reads and writes Poppy events directly.

- Fits: Companies building a new agent, or whose agent has no reusable platform around it.
- Trade-offs: no translation layer, but handoff and the live-agent desk still need integrating.

## What to watch for

- Only the conversation endpoint serves Personal Agent conversations. If website chat or other
  channels can open them, they may not check the Session header
  ([8.2](https://personalagentprotocol.org/docs/0.3/spec#conversation-requests)).
- Ownership: a conversation belongs to the `client_id` and User ID, then to the account once it uses
  it, whichever Session the request comes from. Anyone else gets `conversation_not_found` (8.2,
  [8.13](https://personalagentprotocol.org/docs/0.3/spec#conversation-errors)).
- Event retention: keep events at least 30 days, so reconnects rarely hit `cursor_expired`
  ([guides](https://personalagentprotocol.org/docs/0.3/guides#company-conversations)). Check the
  platform's own retention too.
- Scopes: the agent's tools check scopes on every call, whoever is handling the conversation
  ([8.11](https://personalagentprotocol.org/docs/0.3/spec#conversation-sign-in)).
- Inactivity: say so in a message before closing an inactive conversation
  ([guides](https://personalagentprotocol.org/docs/0.3/guides#company-conversations)).
