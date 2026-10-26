# Pattern: DPoP verification

Every request with a DPoP Session Token, and every token request, carries a DPoP Proof. The Company
MUST validate each one as RFC 9449 §4.3 describes, which
[4.3](https://personalagentprotocol.org/docs/0.3/spec#sending-tokens) lists. Use an existing DPoP or
JOSE library rather than writing the checks yourself. The [guides](https://personalagentprotocol.org/docs/0.3/guides#company-dpop) cover how to make
them reliably.

## A. At a gateway

One gateway or edge proxy in front of the token endpoint, the APIs, and the conversation endpoint
verifies every proof, then passes the verified identity inward.

- Fits: Companies with a gateway already in front of these services, or an OAuth server that can't
  issue DPoP-bound tokens.
- Needs: the gateway sees every Poppy request; access to the token's key binding (from the token
  itself, introspection, or the gateway's own record when it issued the token); the replay cache.
- Trade-offs: one implementation to get right. Services behind it must be unreachable except
  through it.
- Watch for: services reachable by another route that skips the gateway, and checking the proof's
  signature without checking its key matches the token's binding.

## B. In each service

Each service verifies proofs itself, with a shared library.

- Fits: few services, or no common gateway.
- Trade-offs: no new infrastructure, but each service must keep the library current. A shared
  replay cache, if you use one outside the token endpoint, is one more dependency for each.
- Watch for: a service that forgets a check. Use one library and test it once.

## The replay cache

The replay rules differ by endpoint
([4.3](https://personalagentprotocol.org/docs/0.3/spec#sending-tokens), "Replayed proofs"):

- **Token endpoint: required.** The Company MUST reject a proof whose `jti` it already accepted
  within the acceptance window. Traffic here is low, so the cache is cheap. Share it across every
  token endpoint server, or a proof accepted by one could be replayed at another.
- **APIs and conversation endpoints: optional.** The Company MAY reject a reused `jti` there,
  ideally across all servers, as in RFC 9449, so a high-traffic API needn't add a shared cache to
  its critical path. Choose one of:
    - A shared cache, the strongest option.
    - A per-server, in-memory cache. It costs almost nothing and stops replays at the same server.
    - No cache. A copied proof then works only with the same token, method, and URL, within the
      window. Make sure requests that change something are idempotent, so a replay doesn't repeat
      them. Conversation messages already are, through their IDs.

    Record the choice in the design. The validator doesn't test replay at APIs.

For any cache:

- Key it by `jti` and keep entries for the acceptance window.
- Use an atomic "insert if absent" operation, so two servers can't both accept the same `jti`.
- The same cache can hold assertion `jti`s (4.2), each kept until its assertion expires.
- Decide what happens if the cache is unavailable. At the token endpoint, refuse token requests
  rather than accept proofs unchecked.

## `htu` behind proxies

`htu` is the URL the Personal Agent used, without query or fragment (4.3). Behind proxies and load
balancers, build the expected URL from your configured public origin, not from the `Host` header
your server receives ([guides](https://personalagentprotocol.org/docs/0.3/guides#company-dpop)). Watch
for path rewrites, such as a gateway that strips a prefix.

## Also

- Accept `ES256` ([3.2](https://personalagentprotocol.org/docs/0.3/spec#oauth-server)). If you accept
  others, you may list them, with `ES256`, in `dpop_signing_alg_values_supported` in the OAuth
  metadata. Leave the field out if your issuer also serves OAuth clients that shouldn't switch to
  DPoP, such as MCP connectors. Require `typ: dpop+jwt` and a `jwk` with only a public key.
- Use an acceptance window of about a minute, plus a small clock skew. It can be judged by `iat`, or
  by when you issued the proof's nonce.
- Nonces are optional for the Company. They don't replace the replay cache at the token endpoint.
- Failed checks return `invalid_dpop_proof`, or `use_dpop_nonce` with a `DPoP-Nonce` header: as HTTP
  400 OAuth errors at the token endpoint, and as HTTP 401 with `WWW-Authenticate: DPoP` at APIs and
  conversation endpoints (4.3).
- The browser-session endpoint verifies a proof from the form's `proof` field, not a `DPoP` header.
  It has no `ath`, and its `nonce` is the form's code
  ([section 5](https://personalagentprotocol.org/docs/0.3/spec#web-browsing)). Share the verification
  code with the token endpoint and APIs.
- Accept a Bearer Session Token only at the MCP server without DPoP whose `url` is its `resource`,
  and require DPoP everywhere else (4.3). Issue Bearer Session Tokens only by Token Exchange. An MCP
  server that supports DPoP gets DPoP Session Tokens from Personal Agents, and rejects one sent with
  the `Bearer` scheme.
