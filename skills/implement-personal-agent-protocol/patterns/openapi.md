# Pattern: OpenAPI APIs

A listed OpenAPI API accepts the Session header and the Company's access tokens, and enforces their
scopes ([section 7](https://personalagentprotocol.org/docs/0.4/spec#apis)). Its `url` points to an
OpenAPI 3.0 or 3.1 description.

## A. Existing APIs behind a Poppy-aware gateway

The gateway verifies the Session header (`patterns/session-header.md`) and the access token, then
calls the existing API with the verified identity or an internal credential.

- Fits: existing customer-facing APIs that already sit behind a gateway.
- Trade-offs: no changes to the APIs themselves. The description may need editing to show the OAuth
  scheme and its scopes, and to leave out endpoints Personal Agents shouldn't use.
- Watch for: internal credentials that allow more than the access token
  ([guides](https://personalagentprotocol.org/docs/0.4/guides#company-internal)).

## B. A dedicated API for Personal Agents

A new API, or a subset of existing endpoints, designed for Personal Agents.

- Fits: when existing APIs are internal, unstable, or built for one first-party app.
- Trade-offs: more to build, but a clear contract and description.

## What to watch for

- The Session JWT in `Poppy-Session` and the access token in `Authorization`, never from a URL, and
  no cookies required ([5.6](https://personalagentprotocol.org/docs/0.4/spec#sending-requests)).
- A request that depends on Session claims without a verified Session header refused
  ([5.3](https://personalagentprotocol.org/docs/0.4/spec#session-verification)).
- Access token errors in `WWW-Authenticate`: a 401 challenge with `scope` and no error code for a
  signed-out request that needs the account, `invalid_token`, and `insufficient_scope` with
  `scope`. `invalid_session` and `version_unsupported` (400) and `extension_required` (403) are JSON bodies
  (section 7).
- A gateway in front of the API passes `Poppy-Version` and `Poppy-Extensions` through, or checks
  them itself where it verifies the Session header
  ([3.4](https://personalagentprotocol.org/docs/0.4/spec#versions)).
- Protected resource metadata if this API should accept only tokens issued for it
  ([4.5](https://personalagentprotocol.org/docs/0.4/spec#access-tokens), "Tokens for one service").
- Signed-out Sessions can do what a signed-out visitor can
  ([guides](https://personalagentprotocol.org/docs/0.4/guides#company-guest)).
- Rate limits return 429 with `Retry-After`. The API keeps its own body (5.6, "Rate limits").
- Accept `Idempotency-Key` on writes
  ([guides](https://personalagentprotocol.org/docs/0.4/guides#both-retries)).
