# Pattern: verifying the Session header

Every request to the Company's APIs, conversations, feedback, browser-session `/authorize`, and
extension endpoints carries a `Poppy-Session` header: a JWT the Personal Agent signs for that one
request with a delegated key, carrying the delegation in its `pap_dlg` header
([5.2](https://personalagentprotocol.org/docs/spec#session-header)). The Company SHOULD verify it
generally and MUST complete the checks in
[5.3](https://personalagentprotocol.org/docs/spec#session-verification) before trusting Session claims
for identity, ownership, continuity, or state. An endpoint that uses none of those claims can ignore
the header. OAuth validation, scope enforcement, and required DPoP checks still apply. Use an
existing JOSE library for the signatures rather than writing them
yourself. The [guides](https://personalagentprotocol.org/docs/guides#both-signing) cover JWT
verification in general.

The header is separate from OAuth. The authorization server never sees it, and it never grants
account access. A signed-in request carries an access token too, which resources validate as they
already do.

## A. At a gateway

One gateway or edge proxy in front of the APIs, the conversation endpoint, and the other Poppy
endpoints verifies the Session header and the access token, then passes the verified `client_id`,
User ID, Agent ID, Session, account, and scopes inward.

- Fits: Companies with a gateway already in front of these services.
- Needs: the gateway sees every Poppy request; a fetch-and-cache of client metadata and key sets; a
  way to tell which `client_id` an access token was issued to (from the token, introspection, or
  the token store); access to the Session records.
- Trade-offs: one implementation to get right. Services behind it must be unreachable except
  through it.
- Watch for: services reachable by another route that skips the gateway.

## B. In each service

Each service verifies the header itself, with a shared library.

- Fits: few services, or no common gateway.
- Trade-offs: no new infrastructure, but each service must keep the library current, and all of
  them need the same Session store.
- Watch for: a service that forgets a check. Use one library and test it once.

## The checks, in order

1. Fetch the client metadata at `iss` and its `jwks_uri` (4.1), and apply the allowlist,
   blocklist, or registration policy.
2. Verify the delegation in `pap_dlg` with the key in `jwks_uri` named by its `kid`, `ES256` or
   `PS384` (ES256 required, PS384 recommended). Check its `typ` is `pap-delegation+jwt`, its `iss` is the Session JWT's `iss`, it
   hasn't expired, and its `exp` is at most 24 hours after its `iat`
   ([Delegated keys](https://personalagentprotocol.org/docs/spec#delegated-keys)).
3. Verify the Session JWT's `ES256` signature with the delegation's `cnf.jwk`, check that its `kid`
   is that key's JWK thumbprint, and that its `iat` is no later than the delegation's `exp`.
4. Check `typ` `poppy-session+jwt`, `aud` equal to the Company's identifier character for character
   (its issuer, or `https://{organization.domain}` with a lowercase host and no trailing slash when
   it has none), `htm` and
   `htu` against the request as RFC 9449 §4.3 describes for DPoP proofs, and `iat` within the
   acceptance window.
5. With an access token, check `ath` is its SHA-256 hash and the token was issued to the same
   `client_id` as `iss`. Without one, `ath` must be absent.
6. Look up the Session by `client_id` and `sid`. Create a signed-out Session for an unknown `sid`.
   For a known one, check the same `sub` and `agent_id`, and that it hasn't ended.

Any failure returns HTTP 400 with `{"error": "invalid_session"}`. A request with a Personal Agent's
access token but no Session header is refused too (5.3).

## Caching delegations

A resource sees many Session JWTs with the same delegation. You MAY cache a verified delegation
until it expires. Key the cache by the whole delegation, such as its SHA-256 hash, never by its
`jti`, which a forged delegation could copy. Don't key anything else on the delegated key: the
Personal Agent can change it on any request, and a new one is never a reason to reject a request.

## The replay cache

Rejecting a reused `jti` is optional (5.3, "Replayed JWTs"). Choose one of:

- A shared cache, the strongest option.
- A per-server, in-memory cache. It costs almost nothing and stops replays at the same server.
- No cache. A copied Session JWT then works only for the same method, URL, and access token, within
  the window. Make sure requests that change something are idempotent, so a replay doesn't repeat
  them. Conversation messages already are, through their IDs.

Record the choice in the design. For any cache, key it by `jti`, keep entries for the acceptance
window, and use an atomic "insert if absent" operation. If the token endpoint rejects reused
client assertion `jti`s (4.1 allows it, and the guides suggest it), it keeps its own cache until each
assertion expires.

## `htu` behind proxies

`htu` is the URL the Personal Agent used, without query or fragment. Behind proxies and load
balancers, build the expected URL from your configured public origin, not from the `Host` header
your server receives. Watch for path rewrites, such as a gateway that strips a prefix.

## Also

- Use an acceptance window of about a minute, plus a small clock skew.
- Sessions are keyed by `client_id` and `sid`, never by a key. Refresh tokens are tied to the
  `client_id` (4.4).
- DPoP for access tokens is a separate, optional choice
  ([4.5](https://personalagentprotocol.org/docs/spec#access-tokens)). If your access tokens are
  DPoP-bound, a signed-in request carries both a Session JWT and a DPoP proof, each signed with its
  own key. Verify both.
- Any API can ignore Session claims when it uses no Session identity or state
  ([section 7](https://personalagentprotocol.org/docs/spec#apis)). Agents still send the header.
- Serve Personal Agent conversations only from the conversation endpoint
  ([8.2](https://personalagentprotocol.org/docs/spec#conversation-requests)). Website chat or other
  channels that open the same conversations may not check the header.
- Don't log the header. Session JWTs are secrets
  ([10.2](https://personalagentprotocol.org/docs/spec#secrets)).
