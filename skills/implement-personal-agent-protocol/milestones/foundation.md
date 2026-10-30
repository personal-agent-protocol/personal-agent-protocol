# Milestone: foundation

Personal Agents can find the Company and its issuer, if it has one, prove who they are, and start signed-out
Sessions with the `Poppy-Session` header. Every later milestone builds on this one.

## Read first

- [Section 3, Discovery](https://personalagentprotocol.org/docs/0.3/spec#discovery), with
  [3.1](https://personalagentprotocol.org/docs/0.3/spec#fields) and
  [3.2](https://personalagentprotocol.org/docs/0.3/spec#oauth-server)
- [4.1 Agent identity](https://personalagentprotocol.org/docs/0.3/spec#agent-identity)
- [5.2 The Session header](https://personalagentprotocol.org/docs/0.3/spec#session-header), with
  [Delegated keys](https://personalagentprotocol.org/docs/0.3/spec#delegated-keys)
- [5.3 Verifying the Session header](https://personalagentprotocol.org/docs/0.3/spec#session-verification)
- [5.6 Sending requests](https://personalagentprotocol.org/docs/0.3/spec#sending-requests)
- Guides: [Verifying personal agents](https://personalagentprotocol.org/docs/0.3/guides#company-agents),
  [Signing and verifying JWTs](https://personalagentprotocol.org/docs/0.3/guides#both-signing),
  [Fetching metadata safely](https://personalagentprotocol.org/docs/0.3/guides#both-fetching),
  [Handling secrets](https://personalagentprotocol.org/docs/0.3/guides#both-secrets)

Local copies: `reference/spec.md`, `reference/guides.md`. Patterns: `patterns/poppy-json.md`,
`patterns/token-endpoint.md`, `patterns/session-header.md`, `patterns/session-records.md`.

## Website only

If the design offers only the website, without a `browser_session_endpoint`, publish `poppy.json`
with `protocol_version`, `organization`, and `web`, and no `auth`
([3.1](https://personalagentprotocol.org/docs/0.3/spec#fields)). Such a Company needs no issuer
([3.2](https://personalagentprotocol.org/docs/0.3/spec#oauth-server)). Check it with `check --file` and
`check --milestone foundation`, and stop here.

## Without OAuth

A Company that offers only signed-out interactions needs no authorization server. Return 404 for
the domain's protected resource metadata, or publish it with no authorization servers. Omit
`auth.issuer`, Mediated Sign-In, and `access: signed_in` hints. Use `https://{organization.domain}`
with a lowercase host and no trailing slash as the Session audience. Skip steps 2 and 3 below and
token-endpoint checks. Build the same client and Session verification as any other Company.

When an issuer is added, it becomes the Company's identifier; if that changes the identifier,
Users need new IDs and Sessions. Earlier state does not transfer automatically.

## What to build

**1. `poppy.json`** at `https://{domain}/.well-known/poppy.json` (section 3).

- `organization.domain` is the host that serves the document after any redirects. If `example.com`
  redirects to `www.example.com`, the domain is `www.example.com`.
- `auth.issuer` is required when the domain's protected resource metadata lists more than one
  authorization server, and names the one Personal Agents use, exactly as it appears in that list.
  With one authorization server it's optional, and if present it must name that server (3.1).
- List only the interfaces that are live. During this milestone that's usually nothing beyond
  `organization`. Add `agent`, `apis`, `web`, `feedback`, and `extensions` as later milestones ship
  them.
- Direct and Device Sign-In aren't listed in `poppy.json`. Personal Agents treat them as offered
  when the issuer's `grant_types_supported` includes `authorization_code` or the device code grant
  (3.2). If an existing issuer already lists them for other clients, they're offered from this
  milestone on, so plan for that with the engineer.
- Serve it on the Company's own domain. A redirect to a provider's domain doesn't work, because the
  document speaks for the host that serves it. See `patterns/poppy-json.md`.
- Check the file offline before deploying, with `check --file ./poppy.json` (below).

**2. Protected resource metadata for the domain** at
`https://{domain}/.well-known/oauth-protected-resource`
([3.2](https://personalagentprotocol.org/docs/0.3/spec#oauth-server)), with `resource` exactly
`https://{domain}` and the issuer in `authorization_servers`. This is how Personal Agents find the
issuer.

**3. OAuth server metadata** at the issuer's RFC 8414 well-known URL (3.2), with `issuer` exactly
the issuer named above, `token_endpoint`, `revocation_endpoint`, `grant_types_supported` with
`refresh_token`, and `protected_resources` listing `https://{domain}` for every domain whose issuer
it is, with no path, port, or trailing slash. `scopes_supported`, the sign-in grant
types, `authorization_endpoint`, and `device_authorization_endpoint` come in the sign-in milestone.

**4. Verifying Personal Agents** ([4.1](https://personalagentprotocol.org/docs/0.3/spec#agent-identity)).

- Fetch the `client_id` URL without following redirects, and check that its `client_id` equals the
  URL ([guides](https://personalagentprotocol.org/docs/0.3/guides#company-agents)).
- Check that `jwks_uri` and every `redirect_uris` entry are HTTPS URLs on the `client_id`'s domain,
  except that a `redirect_uris` entry may also be a loopback redirect URI, such as
  `http://127.0.0.1:8400/callback` or `http://[::1]/callback` (RFC 8252 §7.3).
- Cache metadata and key sets within bounds, refetch on an unknown `kid` with a rate limit, and
  apply the fetch limits in [Fetching metadata safely](https://personalagentprotocol.org/docs/0.3/guides#both-fetching).
- Apply the design's policy: allowlist or blocklist, registration, and rate limits by `client_id`.
  A refused Personal Agent gets `invalid_client` at the authorization server and `invalid_session`
  at a resource.
- At the token endpoint, accept client assertions signed with `ES256` (required) and `PS384`
  (recommended), with `aud` exactly the issuer. Advertise accepted assertion algorithms in
  `token_endpoint_auth_signing_alg_values_supported` (RFC 8414 §2). This does not advertise
  delegation support. Rejecting a reused `jti` from the same `client_id` until it expires is
  optional (4.1), and the guides suggest it.

**5. The Session header at every resource**
([5.2](https://personalagentprotocol.org/docs/0.3/spec#session-header),
[5.3](https://personalagentprotocol.org/docs/0.3/spec#session-verification)). Every API, conversation,
feedback, browser-session `/authorize`, and extension endpoint receives `Poppy-Session`. Verification
is recommended generally and required before using any Session claim for identity, ownership,
continuity, or state. Stateless APIs and OAuth-only account endpoints can ignore the header if they
use no Session claims or state. Conversations, Session carts, browser join, and approval ownership require
verification. When verifying:

- Fetch the client metadata named by `iss` and its `jwks_uri`, and apply the design's policy.
- Verify the delegation in `pap_dlg` with the key from `jwks_uri` that its `kid` names (`ES256`
  required, `PS384` recommended), its `typ`, `iss`, expiry, and a lifetime of at most 24 hours. Then verify the Session
  JWT with the delegation's `cnf.jwk`, check that `kid` is that key's thumbprint, and that `iat` is
  no later than the delegation's `exp`. Reject a Session JWT without a delegation, including one
  signed directly with a key from `jwks_uri`.
- Check `typ` `poppy-session+jwt`, `alg` `ES256`, `aud` equal to the issuer, or the HTTPS domain when there is none, `htm` and `htu`
  against the request, and `iat` within your acceptance window.
- Without an access token, `ath` must be absent. With one, `ath` must match it, and the token must
  have been issued to the same `client_id` as `iss`. The access token side comes in the sign-in
  milestone, but build the check now.
- Look up the Session by `client_id` and `sid`. An unknown `sid` starts a signed-out Session with
  the User ID and optional Agent ID. A known `sid` must have the same User ID and Agent ID, and must
  not have ended.
- Any failure returns HTTP 400 with `{"error": "invalid_session"}`.
- The Session JWT never grants account access, whatever it contains.
- Don't key anything on the delegated key: it can change on any request
  ([Delegated keys](https://personalagentprotocol.org/docs/0.3/spec#delegated-keys)). If you cache
  verified delegations, key the cache by the whole delegation, not its `jti`.

See `patterns/session-header.md`.

**6. Replays.** Rejecting a reused Session JWT `jti` is optional (5.3, "Replayed JWTs"). Decide with
the engineer whether to use a shared cache, a per-server one, or none, and record why. Without one,
make requests that change something idempotent.

**7. Errors and rate limits.** `invalid_session` (400) as a JSON body. Rate-limited requests return
HTTP 429 with `Retry-After` ([5.6](https://personalagentprotocol.org/docs/0.3/spec#sending-requests)).
Keep error text free of account details
([guides](https://personalagentprotocol.org/docs/0.3/guides#company-errors)).

**8. Records.** If the implementation uses Session identity or state, create the Session record,
keyed by `client_id` and `sid`: User ID, optional
Agent ID, whether it has ended, and later the account it used
([5.4](https://personalagentprotocol.org/docs/0.3/spec#sign-in)). See `patterns/session-records.md`.

## Set up the test identity

1. Agree with the engineer on an HTTPS location the Company controls, such as a staging static
   bucket.
2. Run `node <skill-dir>/validate/index.ts keygen --base-url https://<that location>`. It writes
   `.poppy/` with the private key, `agent.json`, and `jwks.json`, and adds `.poppy/` to `.gitignore`.
3. The engineer uploads `agent.json` and `jwks.json` to that location. The private key stays in
   `.poppy/`.
4. If the design requires registration or an allowlist, the engineer adds the test `client_id` in
   the test environment. Don't add it to a production allowlist, since its key is on a developer's
   machine.

## Decisions for this milestone

- Which endpoints use Session identity or state and must verify the header, where verification
  runs (a gateway or each service), and how those resources share Session records. Endpoints that
  use no Session claims can skip the record and verification.
- The Session JWT acceptance window, the longest delegation lifetime you accept, and Session
  lifetime.
- Whether and where to keep a replay cache for Session JWTs.
- Registration, allowlist, and rate limits for Personal Agents and new Sessions.

## Common mistakes

- `organization.domain` names the apex domain while the document is served from `www.` after a
  redirect, or the other way round.
- When offering sign-in, no protected resource metadata at `https://{domain}/.well-known/oauth-protected-resource`, or a
  `resource` with a path or trailing slash.
- `issuer` in the metadata differs from the one in `authorization_servers` or `auth.issuer` by a
  trailing slash.
- `protected_resources` is missing `https://{domain}` for a domain whose issuer it is, or lists it
  with a path or trailing slash.
- Accepting a Session JWT signed directly with a key from `jwks_uri`, or keying rate limits or fraud
  checks on the delegated key, which changes as often as the Personal Agent likes.
- Following redirects when fetching the `client_id` URL, or trusting `jku`, `x5u`, or keys embedded
  in a JWT ([guides](https://personalagentprotocol.org/docs/0.3/guides#both-signing)).
- `htu` compared with the internal URL behind a proxy, so every request fails, or with the `Host`
  header, so the check can be bypassed.
- Returning 401 or `invalid_token` for a bad Session header. It's 400 `invalid_session`; 401 is for
  access tokens.
- Accepting a request whose `sid` is known but whose `sub` or `agent_id` differs.
- Requiring a cookie, or accepting a token or Session JWT from a query parameter
  ([5.6](https://personalagentprotocol.org/docs/0.3/spec#sending-requests)).
- Logging `Authorization`, `Poppy-Session`, `DPoP`, assertions, or request bodies at the token
  endpoint.

## Check it

```sh
node <skill-dir>/validate/index.ts check --file ./poppy.json
node <skill-dir>/validate/index.ts check https://<staging-domain> --milestone foundation
```

Fix every failure. Then go through the foundation section of `checklist.md`, and by hand:

- Logs and traces for a token request and an API request contain no tokens, assertions, or Session
  JWTs.
- A test `client_id` that should be refused (blocklisted, or unregistered if registration is
  required) gets `invalid_session` at a resource, and `invalid_client` at the authorization server.
- A Session JWT replayed to a different URL or method, or outside the acceptance window, gets
  `invalid_session`. If the design keeps a replay cache, the same JWT sent twice is refused the
  second time, on any server that shares the cache.

Log anything unclear in `plan/feedback.md`.
