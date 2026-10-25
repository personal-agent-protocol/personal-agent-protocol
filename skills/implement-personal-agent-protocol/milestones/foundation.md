# Milestone: foundation

Personal Agents can find the Company, prove who they are, and start signed-out Sessions with
DPoP-bound Session Tokens. Every later milestone builds on this one.

## Read first

- [Section 3, Discovery](https://personalagentprotocol.org/docs/0.3/spec#discovery), with
  [3.1](https://personalagentprotocol.org/docs/0.3/spec#fields) and
  [3.2](https://personalagentprotocol.org/docs/0.3/spec#oauth-server)
- [4.1 Agent identity](https://personalagentprotocol.org/docs/0.3/spec#agent-identity)
- [4.2 Starting a Session](https://personalagentprotocol.org/docs/0.3/spec#starting-sessions)
- [4.3 Using Session Tokens](https://personalagentprotocol.org/docs/0.3/spec#sending-tokens)
- Guides: [Verifying personal agents](https://personalagentprotocol.org/docs/0.3/guides#company-agents),
  [Verifying DPoP](https://personalagentprotocol.org/docs/0.3/guides#company-dpop),
  [Signing and verifying JWTs](https://personalagentprotocol.org/docs/0.3/guides#both-signing),
  [Fetching metadata safely](https://personalagentprotocol.org/docs/0.3/guides#both-fetching),
  [Handling secrets](https://personalagentprotocol.org/docs/0.3/guides#both-secrets)

Local copies: `reference/spec.md`, `reference/guides.md`. Patterns: `patterns/poppy-json.md`,
`patterns/token-endpoint.md`, `patterns/dpop.md`, `patterns/session-records.md`.

## Website only

If the design offers only the website, without a `browser_session_endpoint`, publish `poppy.json`
with `protocol_version`, `organization`, and `web`, and no `auth`
([3.1](https://personalagentprotocol.org/docs/0.3/spec#fields)). Check it with `check --file` and
`check --milestone foundation`, and stop here.

## What to build

**1. `poppy.json`** at `https://{domain}/.well-known/poppy.json` (section 3).

- `organization.domain` is the host that serves the document after any redirects. If `example.com`
  redirects to `www.example.com`, the domain is `www.example.com`.
- `auth.issuer` is the OAuth issuer, exactly as it appears in the issuer's metadata.
- List only the interfaces and sign-in types that are live. During this milestone that's usually
  `auth` with no sign-in types. Add `agent`, `apis`, `web`, and sign-in types as later milestones
  ship them.
- Serve it on the Company's own domain. A redirect to a provider's domain doesn't work, because the
  document speaks for the host that serves it. See `patterns/poppy-json.md`.
- Check the file offline before deploying, with `check --file ./poppy.json` (below).

**2. OAuth server metadata** at the issuer's RFC 8414 well-known URL
([3.2](https://personalagentprotocol.org/docs/0.3/spec#oauth-server)), with `issuer` exactly equal to
`auth.issuer`, `token_endpoint`, `revocation_endpoint`, `grant_types_supported` with
`urn:ietf:params:oauth:grant-type:jwt-bearer` and `refresh_token`, and `protected_resources` listing
`https://{domain}` for every domain whose `poppy.json` names this issuer, exactly in that form, with
no path or trailing slash. `scopes_supported`, the
sign-in grant types, `authorization_endpoint`, and `device_authorization_endpoint` come in the
sign-in milestone.

**3. Verifying Personal Agents** ([4.1](https://personalagentprotocol.org/docs/0.3/spec#agent-identity)).

- Fetch the `client_id` URL without following redirects, and check that its `client_id` equals the
  URL ([guides](https://personalagentprotocol.org/docs/0.3/guides#company-agents)).
- Check that `jwks_uri` and every `redirect_uris` entry are HTTPS URLs on the `client_id`'s domain.
- Cache metadata and key sets within bounds, refetch on an unknown `kid` with a rate limit, and
  apply the fetch limits in [Fetching metadata safely](https://personalagentprotocol.org/docs/0.3/guides#both-fetching).
- Apply the design's policy: registration (`invalid_client`, HTTP 401, for unregistered agents),
  allowlist or blocklist, and rate limits by `client_id`.

**4. The token endpoint: starting and renewing Sessions**
([4.2](https://personalagentprotocol.org/docs/0.3/spec#starting-sessions)).

- Accept the JWT bearer grant with a `private_key_jwt` client assertion and a DPoP Proof.
- Verify both assertions against the Personal Agent's `jwks_uri`. Check the Session assertion's
  `iss` is the authenticated `client_id`, `aud` is your `auth.issuer` as a single string (not the token endpoint URL), `iat`
  and `exp` are short-lived, and `jti` hasn't been seen.
- Treat `sub` as the User ID: opaque, never shown, stored with the Session.
- Find the Session by the thumbprint of the proof's key, the Session Key
  ([4.3](https://personalagentprotocol.org/docs/0.3/spec#sending-tokens)). A new key starts a new Session.
- Return `access_token`, `token_type: "DPoP"`, `expires_in` (greater than 0; hours, not days), and
  `scope: ""`, with `Cache-Control: no-store`.
- Renewal: the same request with a proof from the same key. Check the Session belongs to the same
  `client_id` and User ID. Return `invalid_grant` if it doesn't match, or if it has ended and you
  still remember its key. Remembering ended keys is a SHOULD: decide with the engineer how long.
- Accept `scope` and `resource` on token requests
  ([4.3](https://personalagentprotocol.org/docs/0.3/spec#sending-tokens)). If any `poppy.json` entry has
  a `resource`, issue tokens for it that work only there.
- If Session Tokens carry the Company's own session credentials, encrypt them (4.2, "Token format").
- Errors use the OAuth JSON error response with the codes and statuses in the table in 4.2.

**5. DPoP** ([4.3](https://personalagentprotocol.org/docs/0.3/spec#sending-tokens)). Bind each Session
Token to the key in the token request's proof. On every request, at the token endpoint and every
resource, validate the proof as RFC 9449 §4.3 describes. At the token endpoint, reject a reused
proof `jti` with a replay cache shared by every token endpoint server. At APIs and conversation
endpoints, rejecting a reused `jti` is optional: decide with the engineer whether to use a shared
cache, a per-server one, or none, and record why. Build `htu` from the configured public origin. Nonces are optional for the
Company. See `patterns/dpop.md`.

**6. Errors and rate limits.** Failed DPoP checks return `invalid_dpop_proof`, or `use_dpop_nonce`
with a `DPoP-Nonce` header: HTTP 400 OAuth errors at the token endpoint, and HTTP 401 with
`WWW-Authenticate: DPoP` at APIs and conversation endpoints (4.3). Rate-limited requests return HTTP 429 with
`Retry-After`, and at the token endpoint the body `{"error": "rate_limited"}` (4.3, "Rate limits").
Keep error text free of account details
([guides](https://personalagentprotocol.org/docs/0.3/guides#company-errors)).

**7. Records.** Create the Session record now, found by its Session Key's thumbprint: `client_id`,
User ID, and later the account ("How sign-in
is remembered" in [4.4](https://personalagentprotocol.org/docs/0.3/spec#sign-in)). See
`patterns/session-records.md`.

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

- Token endpoint pattern, and whether Session Tokens carry encrypted Company credentials.
- Where DPoP is verified, and where the replay cache lives.
- Session Token lifetime and Session lifetime.
- Registration, allowlist, and rate limits for Personal Agents.
- Whether to require DPoP nonces.

## Common mistakes

- `organization.domain` names the apex domain while the document is served from `www.` after a
  redirect, or the other way round.
- `issuer` in the metadata differs from `auth.issuer` by a trailing slash.
- `protected_resources` is missing `https://{domain}` for a domain whose `poppy.json` names the
  issuer, or lists it with a path or trailing slash.
- Following redirects when fetching the `client_id` URL, or trusting `jku`, `x5u`, or keys embedded
  in an assertion ([guides](https://personalagentprotocol.org/docs/0.3/guides#both-signing)).
- A token endpoint replay cache per server or per process, so a proof accepted by one is accepted
  again by another ([guides](https://personalagentprotocol.org/docs/0.3/guides#company-dpop)).
- `htu` compared with the internal URL behind a proxy, so every proof fails, or with the `Host`
  header, so the check can be bypassed.
- Checking only the proof's signature, not that its key matches the token's binding.
- Accepting a token from a query parameter or requiring a cookie
  ([4.3](https://personalagentprotocol.org/docs/0.3/spec#sending-tokens)).
- Logging `Authorization`, `DPoP`, assertions, or request bodies at the token endpoint.

## Check it

```sh
node <skill-dir>/validate/index.ts check --file ./poppy.json
node <skill-dir>/validate/index.ts check https://<staging-domain> --milestone foundation
```

Fix every failure. Then go through the foundation section of `checklist.md`, and by hand:

- Logs and traces for a token request contain no tokens, assertions, or proofs.
- Two token endpoint servers behind the load balancer share the replay cache: the same proof sent
  to each is accepted at most once. If the design shares a cache at the APIs too, test it there.
- A test `client_id` that should be refused (blocklisted, or unregistered if registration is
  required) gets `invalid_client`.

Log anything unclear in `plan/feedback.md`.
