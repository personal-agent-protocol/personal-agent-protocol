# Pattern: OpenAPI APIs

A listed OpenAPI API accepts DPoP Session Tokens
([section 6](https://personalagentprotocol.org/docs/spec#apis),
[4.3](https://personalagentprotocol.org/docs/spec#sending-tokens)), and its `url` points to an
OpenAPI 3.0 or 3.1 description.

## A. Existing APIs behind a Poppy-aware gateway

The gateway verifies the Session Token and DPoP Proof (`patterns/dpop.md`), then calls the existing
API with the verified identity or an internal credential.

- Fits: existing customer-facing APIs that already sit behind a gateway.
- Trade-offs: no changes to the APIs themselves. The description may need editing to show the DPoP
  scheme and to leave out endpoints Personal Agents shouldn't use.
- Watch for: internal credentials that allow more than the Session Token
  ([guides](https://personalagentprotocol.org/docs/guides#company-internal)).

## B. A dedicated API for Personal Agents

A new API, or a subset of existing endpoints, designed for Personal Agents.

- Fits: when existing APIs are internal, unstable, or built for one first-party app.
- Trade-offs: more to build, but a clear contract and description.

## What to watch for

- Tokens only in the `Authorization` header, never from a URL, and no cookies required (4.3).
- Token errors in `WWW-Authenticate`: `invalid_token`, `insufficient_scope`
  with `scope`, `extension_required` (section 6).
- Bearer Session Tokens refused (4.3).
- A `resource` on the `apis` entry if this API should accept only tokens issued for it (4.3,
  "Narrower tokens").
- Signed-out Sessions can do what a signed-out visitor can
  ([guides](https://personalagentprotocol.org/docs/guides#company-guest)).
- Rate limits return 429 with `Retry-After`. The API keeps its own body (4.3, "Rate limits").
- Accept `Idempotency-Key` on writes
  ([guides](https://personalagentprotocol.org/docs/guides#both-retries)).
