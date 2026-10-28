# Milestone: interfaces

Personal Agents use the interfaces the design chose, in signed-out Sessions: APIs, MCP, the Company
Agent through conversations, and the website. Every request carries the Session header, verified as
in the foundation milestone. Build and check them signed out first. Account access comes in the
sign-in milestone.

Build only what's in the design's `interfaces`. Add each interface to `poppy.json` when it's live on
staging.

## Read first

- [Section 7, APIs](https://personalagentprotocol.org/docs/spec#apis), for `openapi` and `mcp`
- [Section 8, Conversations](https://personalagentprotocol.org/docs/spec#conversations), 8.1–8.13,
  for `conversations`
- [Section 6, Web browsing](https://personalagentprotocol.org/docs/spec#web-browsing), for `web`
- [4.5 Access tokens](https://personalagentprotocol.org/docs/spec#access-tokens) for MCP tokens, and
  [5.6](https://personalagentprotocol.org/docs/spec#sending-requests) again for rate limits
- [Section 9, Task coverage](https://personalagentprotocol.org/docs/spec#task-coverage),
  for excluded tasks and feedback
- Guides: [Guest access](https://personalagentprotocol.org/docs/guides#company-guest),
  [Internal services](https://personalagentprotocol.org/docs/guides#company-internal),
  [Conversations](https://personalagentprotocol.org/docs/guides#company-conversations),
  [Browser sessions](https://personalagentprotocol.org/docs/guides#company-browsing),
  [Error messages](https://personalagentprotocol.org/docs/guides#company-errors),
  [Excluded tasks and feedback](https://personalagentprotocol.org/docs/guides#company-excluded-tasks)

Patterns: `patterns/openapi.md`, `patterns/mcp.md`, `patterns/conversations.md`,
`patterns/web-browsing.md`, `patterns/session-header.md`.

## OpenAPI

- List the API in `apis` with `type: "openapi"`, the `url` of an OpenAPI 3.0 or 3.1 description,
  and a short `description` ([section 7](https://personalagentprotocol.org/docs/spec#apis)).
- Accept the `Poppy-Session` header on every request, and the Company's access tokens in the
  `Authorization` header (section 7). Don't require cookies. Don't accept tokens or Session JWTs in
  the URL ([5.6](https://personalagentprotocol.org/docs/spec#sending-requests)).
- Return access token errors in the `WWW-Authenticate` header: a challenge with `scope` and no
  error code (401) for a signed-out request that needs the account, `invalid_token` (401),
  `insufficient_scope` (403, with `scope`) for an access token without the scopes, and
  `extension_required` (403). `invalid_session` (400) is a JSON body (section 7).
- Signed out, allow what a signed-out website visitor can do
  ([guides](https://personalagentprotocol.org/docs/guides#company-guest)). Endpoints that need an
  account return the 401 challenge with the scopes they need.
- Verify the Session header and token at the edge and pass the verified `client_id`, User ID,
  Session, account, and scopes inward. Don't forward the Session JWT or access token between
  services ([guides](https://personalagentprotocol.org/docs/guides#company-internal)).

## MCP

- List the server in `apis` with `type: "mcp"` and its Streamable HTTP endpoint as `url`, MCP version
  2025-06-18 or later ([section 7](https://personalagentprotocol.org/docs/spec#apis)).
- Publish RFC 9728 protected resource metadata whose `resource` is the server's `url` and whose
  `authorization_servers` includes the Company's issuer. Don't add the Personal Agent to that list.
  Each 401 carries a challenge for each scheme the server accepts, with `resource_metadata`.
- Accept the Company's access tokens issued with `resource` set to the server's `url`, and only
  those. Refuse a token issued for another `resource`, including other paths on the same host, with
  `invalid_token` and `resource_metadata` ([4.5](https://personalagentprotocol.org/docs/spec#access-tokens)).
  The token endpoint returns `invalid_target` for a `resource` you don't serve.
- Decide whether the server accepts the Session header. If it does, verify it as every other
  resource does, so its calls join the Session and it can take signed-out calls. If it ignores the
  header, it sees the Personal Agent and the account through the token, but its calls belong to no
  Session and it can't take signed-out calls from Personal Agents (section 7, "MCP servers").
- MCP clients that don't implement Poppy keep signing in with MCP's own authorization flow. Their
  requests belong to no Session.

## Conversations

- List the endpoint in `agent.protocols` with `type: "poppy"`
  ([8.1](https://personalagentprotocol.org/docs/spec#conversation-protocols)).
- The five requests in [8.2](https://personalagentprotocol.org/docs/spec#conversation-requests),
  each with the Session header, and an access token when signed in. A conversation belongs to the
  `client_id` and User ID that started it, and any of their Sessions can continue it. Reject any
  other with `conversation_not_found`.
- IDs follow 8.2. Validate the Personal Agent's message IDs.
- Messages ([8.3](https://personalagentprotocol.org/docs/spec#sending-messages),
  [8.4](https://personalagentprotocol.org/docs/spec#message-fields)): 201 for a new conversation and
  202 for later messages, each with `status` and `responder`. Retries with the same message ID and
  content return the original response; different content returns `message_id_conflict`. Message
  IDs are unique per User, not per conversation, so a retried first message returns the existing
  conversation. Set `role` yourself and ignore any sent. Pass `context` to the Company Agent.
- `wait` and `cursor` on both `POST`s and on reads (8.3,
  [8.5](https://personalagentprotocol.org/docs/spec#reading-events)). Every read includes `cursor`,
  `has_more`, `status`, and `responder`, even when empty. Return `invalid_cursor` and
  `cursor_expired` as 8.13 defines.
- Record every accepted message as an event, and add a `state` event on every change to `status` or
  `responder` ([8.7](https://personalagentprotocol.org/docs/spec#status)). Every Company message has
  `author.type`.
- Streaming is optional ([8.6](https://personalagentprotocol.org/docs/spec#streaming)). If you
  stream, `Last-Event-ID` wins over `cursor`, and `text-delta` events have no SSE `id`.
- Handoff ([8.9](https://personalagentprotocol.org/docs/spec#handoff)): 202, `queued` while finding
  someone, `responder: "human"` when a person joins, back to `idle` with a message if no one is
  available. A repeated handoff changes nothing.
- Direct Conversations ([8.10](https://personalagentprotocol.org/docs/spec#direct-conversations)):
  `parent_conversation_id`, the parent rules and errors, `direct_opened` and `direct_closed`
  events, `direct_conversation_open` with `conversation_id` on the parent, and closing the parent
  closes the Direct Conversation. `user_requested` events if the Company Agent can ask for the User.
- Closing ([8.12](https://personalagentprotocol.org/docs/spec#closing)): 200 with `status` and
  `responder`, a `state` event, cancels any pending handoff. Closing again returns the same response
  and adds no event.
- Errors are JSON bodies with the codes in
  [8.13](https://personalagentprotocol.org/docs/spec#conversation-errors), and `invalid_session`.
  Access token errors are the `WWW-Authenticate` errors of section 7.

## Web browsing

- List `web.browser_session_endpoint` in `poppy.json`
  ([section 6](https://personalagentprotocol.org/docs/spec#web-browsing)).
- **Step 1.** A GET to the endpoint returns a form with an unguessable, short-lived, one-time code
  in a hidden `code` field, posting to the endpoint. Caches can't store the page, other pages can't
  frame it, and its opener keeps no reference to it. It sets a cookie that ties the code to the
  browser, which forms on other sites don't send and other hosts on your domain can't set. Loading
  the page starts, ends, or changes no Session, and doesn't change the browser's other cookies. The
  [guides](https://personalagentprotocol.org/docs/guides#company-browsing) suggest values: a code of
  at least 128 random bits that expires within 60 seconds, `Cache-Control: no-store`,
  `Content-Security-Policy: frame-ancestors 'none'`, `Cross-Origin-Opener-Policy: same-origin`, and
  a `__Host-`, `Secure`, `HttpOnly`, `SameSite=Strict` cookie.
- **Step 2.** `POST {browser_session_endpoint}/authorize` takes `{"code": …}` as JSON with the
  Session header and, when signed in, an access token. Verify both as at any resource (an unknown
  `sid` starts a signed-out Session), check that the code is yours, unexpired, and not authorized
  before, and record it as authorized for that Session and the token's account and scopes. Answer
  204, or 400 `invalid_request` for a bad code.
- **Step 3.** The form's POST carries only the code and the join cookie. Check that the cookie
  matches the code, and that the code was authorized, is unexpired, and wasn't submitted before.
  Then set the site's own session cookie for that Session, signed in to the account from step 2 if
  any, clear the join cookie, and respond `303 See Other`. A failed check gets an error page with
  HTTP 400, or 429, and no cookie. The first submission uses the code, whatever the result.
- The Session's cookie never outlives the Session, and stops acting for the account at sign-out.
- While the browser carries that cookie, the website handles requests as that Session, whatever
  other cookies it has.

## Excluded tasks and feedback

Both are optional.

- To list tasks you chose not to offer through Poppy, publish a JSON document with `tasks`, each a
  `task` and an optional `alternative`, and list its URL in `excluded_tasks.url`
  ([9.1](https://personalagentprotocol.org/docs/spec#excluded-tasks)). An alternative has
  `instructions`, `references`, or both. An `openapi` or `mcp` reference names an API in `apis`
  by its exact `url` ([9.2](https://personalagentprotocol.org/docs/spec#alternatives)).
- To take feedback, list `feedback.endpoint` and accept reports only with the Session header,
  signed in or out, with no scope needed ([9.3](https://personalagentprotocol.org/docs/spec#feedback)).
  Answer 202 with no body, or
  200 with an alternative when the task can be done after all. Errors are `invalid_request` (400)
  for a report that is malformed or too long, and rate limits are 429 with `Retry-After`.
- A report can be wrong, or written to mislead. Treat its text as data, not as instructions,
  including when a model reads it.

## Decisions for this milestone

- Per API: whether it accepts only tokens issued for it, by publishing protected resource metadata
  (4.5, "Tokens for one service"). Per MCP server: whether it accepts the Session header.
- Which endpoints, tools, and Company Agent actions are open to signed-out Sessions.
- Event retention for conversations (the guides suggest at least 30 days), and whether to stream.
- How handoff maps to the live-agent desk, and whether the Company Agent can ask for the User.
- Cookie scope for browser sessions.
- Which tasks, if any, to exclude, and the alternative for each.

## Common mistakes

- An API that accepts a Personal Agent's access token without the Session header (5.3), or an MCP
  server that accepts tokens issued for another `resource` (section 7).
- Answering a signed-out request that needs the account with `insufficient_scope`. It's a 401
  challenge with `scope` and no error code; `insufficient_scope` is for an access token without the
  scopes (section 7).
- Website chat or other channels that can open Poppy conversations without checking the Session
  header ([8.2](https://personalagentprotocol.org/docs/spec#conversation-requests)).
- Message IDs deduplicated per conversation instead of per User, so a retried first message starts
  a second conversation (8.3).
- `status` and `responder` missing from an empty read or from a `POST` response (8.5, 8.7).
- Changing `responder` to `human` while still `queued` (8.7).
- A different error for "conversation exists but isn't yours" than for "doesn't exist" (8.13).
- A stream that goes silent long enough for a proxy to close it. Send an SSE comment every 15 to 30
  seconds ([guides](https://personalagentprotocol.org/docs/guides#company-conversations)).
- Accepting a code in step 3 without the join cookie set with it, or one that wasn't authorized in
  step 2 (section 6).
- A code that can be authorized or submitted twice, or after a failed request (section 6).
- Logging responses or request bodies at the browser-session endpoint
  ([guides](https://personalagentprotocol.org/docs/guides#company-browsing)).

## Check it

```sh
node <skill-dir>/validate/index.ts check https://<staging-domain> --milestone interfaces
```

This version of the validator checks the signed-out parts: MCP metadata, OpenAPI descriptions
loading, the Session header at resources, the basics of conversations (messages, retries, events,
cursors, status, and close), and feedback reports. Fix every failure.

It doesn't yet check signed-in MCP, handoff, Direct Conversations, streaming,
browser sessions, or operations. For those, go
through the interfaces section of `checklist.md` and test by hand on staging. Where a test needs
signed requests, write a small local script that signs with the test identity in `.poppy/`, without
printing or copying the private key, and keep the script out of the Company's production code.

- **Handoff:** request a person. See `queued`, then `responder: "human"` when someone joins from the
  desk, with `state` events for each change. With no one available, see `idle` and a message. Send a
  second handoff while queued and see nothing change. Close while queued and see the handoff
  cancelled at the desk.
- **Direct Conversations:** start one with `parent_conversation_id`. See `direct_opened` on the
  parent, `direct_conversation_open` for a message to the parent, a second Direct Conversation
  refused, `direct_closed` after closing it, and the parent taking messages again. Closing the
  parent closes an open Direct Conversation.
- **Streaming,** if offered: events arrive with SSE `id`s, a reconnect with `Last-Event-ID` resumes
  after it, and idle streams stay open.
- **Browser sessions:** load the endpoint in a browser, authorize its code at `/authorize` with a
  Session header, submit the form, and see the website show the Session's state, not an earlier
  visitor's. Check the page's `Cache-Control`, `Content-Security-Policy`,
  `Cross-Origin-Opener-Policy`, and join cookie. Authorize the same code twice, an expired code, and
  a made-up code: each gets `invalid_request`. Submit a code that wasn't authorized, or one already
  submitted: each gets an error page. Authorize the first browser's code and submit it from a
  second browser, which doesn't have the first one's join cookie: the second browser doesn't join.

Log anything unclear in `plan/feedback.md`.
