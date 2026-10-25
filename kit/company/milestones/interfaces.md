# Milestone: interfaces

Personal Agents use the interfaces the design chose, in signed-out Sessions: APIs, MCP, the Company
Agent through conversations, and the website. Build and check each one signed out first. Account
access comes in the sign-in milestone.

Build only what's in the design's `interfaces`. Add each interface to `poppy.json` when it's live on
staging.

## Read first

- [Section 6, APIs](https://personalagentprotocol.org/docs/spec#apis), for `openapi` and `mcp`
- [Section 7, Conversations](https://personalagentprotocol.org/docs/spec#conversations), 7.1–7.13,
  for `conversations`
- [Section 5, Web browsing](https://personalagentprotocol.org/docs/spec#web-browsing), for `web`
- [4.3](https://personalagentprotocol.org/docs/spec#sending-tokens) again: MCP tokens, narrower
  tokens, rate limits
- Guides: [Guest access](https://personalagentprotocol.org/docs/guides#company-guest),
  [Internal services](https://personalagentprotocol.org/docs/guides#company-internal),
  [Conversations](https://personalagentprotocol.org/docs/guides#company-conversations),
  [Browser sessions](https://personalagentprotocol.org/docs/guides#company-browsing),
  [Error messages](https://personalagentprotocol.org/docs/guides#company-errors)

Patterns: `patterns/openapi.md`, `patterns/mcp.md`, `patterns/conversations.md`,
`patterns/web-browsing.md`, `patterns/dpop.md`.

## OpenAPI

- List the API in `apis` with `type: "openapi"`, the `url` of an OpenAPI 3.0 or 3.1 description,
  and a short `description` ([section 6](https://personalagentprotocol.org/docs/spec#apis)).
- Accept DPoP Session Tokens in the `Authorization` header with a proof, making every check in
  [4.3](https://personalagentprotocol.org/docs/spec#sending-tokens). Reject Bearer Session Tokens.
  Don't require cookies. Don't accept tokens in the URL.
- Return token errors in the `WWW-Authenticate` header: `invalid_token` (401), `sign_in_required`
  (403), `insufficient_scope` (403, with `scope`), and `extension_required` (403) (section 6).
- Signed out, allow what a signed-out website visitor can do
  ([guides](https://personalagentprotocol.org/docs/guides#company-guest)). Endpoints that need an
  account return `sign_in_required`.
- Verify the token at the edge and pass the verified `client_id`, User ID, account, and scopes
  inward. Don't forward the Session Token between services
  ([guides](https://personalagentprotocol.org/docs/guides#company-internal)).

## MCP

- List the server in `apis` with `type: "mcp"` and its Streamable HTTP endpoint as `url`, MCP version
  2025-06-18 or later ([section 6](https://personalagentprotocol.org/docs/spec#apis)).
- A new MCP server should support DPoP: list `dpop_signing_alg_values_supported`, with `ES256`, in
  its protected resource metadata, verify proofs, and reject a DPoP token sent as a Bearer token.
  The token endpoint issues Personal Agents only DPoP Session Tokens for it, for a request with
  `resource` set to the server's `url`, and refuses a token exchange for it with `invalid_target`
  ([4.3](https://personalagentprotocol.org/docs/spec#sending-tokens), "MCP").
  Keep accepting Bearer tokens from MCP clients that don't implement Poppy.
- For an MCP server without DPoP, support the token exchange grant (RFC 8693) and list it in
  `grant_types_supported`. Exchange a DPoP Session Token, bound to the request's proof, for a
  `Bearer` Session Token with `resource` set to the server's `url`. Issue Bearer tokens only this
  way, and only for MCP servers without DPoP; refuse other requests with `invalid_target`.
- The MCP server accepts Session Tokens as its access tokens, only those issued for its `url`, and
  enforces their scopes.
- Publish RFC 9728 protected resource metadata whose `authorization_servers` includes `auth.issuer`.
  Each 401 carries a challenge for each scheme the server accepts, with `resource_metadata`.
- Accept a Bearer Session Token only at the MCP server whose `url` is its `resource`, not at other
  paths on the same host. Everything else requires DPoP (4.3).

## Conversations

- List the endpoint in `agent.protocols` with `type: "poppy"`
  ([7.1](https://personalagentprotocol.org/docs/spec#conversation-protocols)).
- The five requests in [7.2](https://personalagentprotocol.org/docs/spec#conversation-requests),
  each with a DPoP Session Token. A conversation belongs to the `client_id` and User ID that started
  it. Reject any other with `conversation_not_found`.
- IDs follow 7.2. Validate the Personal Agent's message IDs.
- Messages ([7.3](https://personalagentprotocol.org/docs/spec#sending-messages),
  [7.4](https://personalagentprotocol.org/docs/spec#message-fields)): 201 for a new conversation and
  202 for later messages, each with `status` and `responder`. Retries with the same message ID and
  content return the original response; different content returns `message_id_conflict`. Message
  IDs are unique per User, not per conversation, so a retried first message returns the existing
  conversation. Set `role` yourself and ignore any sent. Pass `context` to the Company Agent.
- `wait` and `cursor` on both `POST`s and on reads (7.3,
  [7.5](https://personalagentprotocol.org/docs/spec#reading-events)). Every read includes `cursor`,
  `has_more`, `status`, and `responder`, even when empty. Return `invalid_cursor` and
  `cursor_expired` as 7.13 defines.
- Record every accepted message as an event, and add a `state` event on every change to `status` or
  `responder` ([7.7](https://personalagentprotocol.org/docs/spec#status)). Every Company message has
  `sender`.
- Streaming is optional ([7.6](https://personalagentprotocol.org/docs/spec#streaming)). If you
  stream, `Last-Event-ID` wins over `cursor`, and `text-delta` events have no SSE `id`.
- Handoff ([7.9](https://personalagentprotocol.org/docs/spec#handoff)): 202, `queued` while finding
  someone, `responder: "human"` when a person joins, back to `idle` with a message if no one is
  available. A repeated handoff changes nothing.
- Direct Conversations ([7.10](https://personalagentprotocol.org/docs/spec#direct-conversations)):
  `parent_conversation_id`, the parent rules and errors, `direct_opened` and `direct_closed`
  events, `direct_conversation_open` with `conversation_id` on the parent, and closing the parent
  closes the Direct Conversation. `user_requested` events if the Company Agent can ask for the User.
- Closing ([7.12](https://personalagentprotocol.org/docs/spec#closing)): 200 with `status` and
  `responder`, a `state` event, cancels any pending handoff. Closing again returns the same response
  and adds no event.
- Errors are JSON bodies with the codes in
  [7.13](https://personalagentprotocol.org/docs/spec#conversation-errors). Token errors are the
  `WWW-Authenticate` errors of section 6.

## Web browsing

- List `web.browser_session_endpoint` in `poppy.json`
  ([section 5](https://personalagentprotocol.org/docs/spec#web-browsing)).
- The endpoint takes a form POST with `assertion`, makes every check in section 5 step 3, sets the
  site's own session cookie for the Session, and responds `303 See Other` to `return_to`. On failure,
  no cookie and an HTTP 400 error page.
- The cookie is `Secure`, `HttpOnly`, `SameSite=Lax` or `None`, never outlives the Session, and
  follows the Session's state.
- While the browser carries that cookie, the website handles requests as that Session, whatever
  other cookies it has.

## Decisions for this milestone

- Per API and MCP server: whether it needs its own `resource` (4.3, "Narrower tokens").
- Which endpoints, tools, and Company Agent actions are open to signed-out Sessions.
- Event retention for conversations (the guides suggest at least 30 days), and whether to stream.
- How handoff maps to the live-agent desk, and whether the Company Agent can ask for the User.
- Cookie scope for browser sessions.

## Common mistakes

- An API that accepts Bearer Session Tokens, or an MCP server that accepts tokens issued for another
  `resource` (4.3, section 6).
- Website chat or other channels that can open Poppy conversations without checking DPoP
  ([guides](https://personalagentprotocol.org/docs/guides#company-dpop)).
- Message IDs deduplicated per conversation instead of per User, so a retried first message starts
  a second conversation (7.3).
- `status` and `responder` missing from an empty read or from a `POST` response (7.5, 7.7).
- Changing `responder` to `human` while still `queued` (7.7).
- A different error for "conversation exists but isn't yours" than for "doesn't exist" (7.13).
- A stream that goes silent long enough for a proxy to close it. Send an SSE comment every 15 to 30
  seconds ([guides](https://personalagentprotocol.org/docs/guides#company-conversations)).
- A browser-session cookie with `SameSite=Strict`, so it's missing after the redirect (section 5).
- Logging request bodies at the browser-session endpoint
  ([guides](https://personalagentprotocol.org/docs/guides#company-browsing)).
- A `return_to` check that accepts lookalike hosts, such as `example.com.evil.example`.

## Check it

```sh
node <skill-dir>/validate/index.ts check https://<staging-domain> --milestone interfaces
```

This version of the validator checks the signed-out parts: MCP metadata and `resource` binding,
OpenAPI descriptions loading, and the basics of conversations (messages, retries, events, cursors,
status, and close). Fix every failure.

It doesn't yet check handoff, Direct Conversations, streaming, or browser sessions. For those, go
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
- **Browser sessions:** post a valid assertion and land on `return_to` with the cookie set. Replay
  the same assertion, use an expired one, a wrong `aud`, a Session assertion instead of a browser
  assertion, and a `return_to` on another domain: each gets 400 and no cookie. The page then shows
  the Session's state, not an earlier visitor's.

Log anything unclear in `plan/feedback.md`.
