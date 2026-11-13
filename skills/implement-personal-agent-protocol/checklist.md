# Company checklist

Generated from the Personal Agent Protocol docs, draft 1.0. It lists every
requirement on the Company in the specification and extensions, and the guides' advice for
companies, grouped by milestone. Go through the sections for the milestones and features in
your design. The validator checks some of these. The rest need a review or a manual test.

Requirements that apply to both parties are included. Requirements only on Personal Agents
are left out.

## Foundation

### Specification: [3. Discovery](https://personalagentprotocol.org/docs/1.0/spec#discovery)

- [ ] **MUST**: A Company MUST publish its `poppy.json` document at `https://{domain}/.well-known/poppy.json` over HTTPS, where `{domain}` is the Company's domain or a subdomain it controls.
- [ ] **MUST**: Every URL this protocol defines or exchanges MUST be an HTTPS URL: in `poppy.json`, in authorization server and protected resource metadata, in client metadata documents (4.1), in extensions, and in assertions, Session JWTs, and responses.
- [ ] **MUST NOT**: Personal Agents MUST NOT use a URL from a Company that has another scheme, and Companies MUST reject one from a Personal Agent.
- [ ] **MUST NOT**: Personal Agents and Companies MUST NOT connect to a loopback, private, or link-local address for a URL the other party gave them, unless they were configured to on purpose.

### Specification: [3.1 Fields](https://personalagentprotocol.org/docs/1.0/spec#fields)

- [ ] **MUST**: `domain` MUST be the host that serves the document, after any redirects.
- [ ] **MUST**: It MUST be in that list.
- [ ] **MUST**: With one authorization server, the Company MAY leave it out, and if it includes it, it MUST name that server.

### Specification: [3.2 OAuth server](https://personalagentprotocol.org/docs/1.0/spec#oauth-server)

- [ ] **MUST**: A Company that offers sign-in MUST have an OAuth issuer.
- [ ] **MUST**: If the Company publishes this metadata, its `resource` MUST be exactly `https://{organization.domain}`, and its `authorization_servers`, when nonempty, names the issuer:
    - [ ] HTTP 404, or valid metadata with `authorization_servers` absent or empty, means the Company has no issuer. This is valid only when `auth.issuer` is absent and the Company offers no sign-in.
    - [ ] A Personal Agent MUST NOT use the domain fallback after a timeout, another error status, invalid metadata, or a failure to verify an issuer. It MUST NOT fall back for a Company whose issuer it already knows unless a successful discovery explicitly establishes that the issuer was removed.
    - [ ] If it lists one authorization server, that is the Company's issuer. `auth.issuer` is optional, and if present MUST name that server (3.1).
    - [ ] If it lists more than one, such as one for the Company's employees, `auth.issuer` in `poppy.json` names the one Personal Agents use (3.1). RFC 9728 leaves the choice among them to the client, but User IDs and refresh tokens belong to one issuer (5.1), so every Personal Agent has to choose the same one.
- [ ] **MUST NOT**: It MUST NOT fall back for a Company whose issuer it already knows unless a successful discovery explicitly establishes that the issuer was removed.
- [ ] **MUST**: `auth.issuer` is optional, and if present MUST name that server (3.1).
- [ ] **MUST NOT**: A Company that sets `auth.disabled` MUST NOT list the Mediated Sign-In extension or `signed_in` access (below).
- [ ] **MUST**: The Company MUST select that same issuer on each domain (above).
- [ ] **MUST**: The Company MUST give each scope the same authorization meaning across these domains.
- [ ] **SHOULD**: The Company SHOULD publish the same scope descriptions and hints across these domains, but MAY expose different scopes or capabilities.
- [ ] **MUST**: An issuer MUST represent exactly one Company.
- [ ] **MUST**: A provider that hosts several Companies MUST give each its own issuer, such as `https://auth.provider.example/shop-a`, even when they share servers.
- [ ] **MUST**: The issuer MUST publish OAuth Authorization Server Metadata (RFC 8414), at the URL RFC 8414 §3.1 defines.
- [ ] **MUST**: Its `protected_resources` (RFC 9728 §4) MUST list `https://{domain}` for every domain whose issuer it is, with no path, port, or trailing slash.
- [ ] **MUST**: Required, and it MUST include `refresh_token` (4.4).
- [ ] **SHOULD**: A Company that offers sign-in SHOULD list every scope a Personal Agent can request here, in `scopes_supported` of its protected resource metadata (above), or in both (4.7).
- [ ] **MUST**: A Company that lists `signed_in` MUST have an issuer, and MUST NOT set `auth.disabled`.

### Specification: [3.4 Versions](https://personalagentprotocol.org/docs/1.0/spec#versions)

- [ ] **MUST**: Each URL in `supported_versions` MUST be an HTTPS URL on the host that served `poppy.json`, after any redirects.
- [ ] **MUST**: Every document a Company serves at the same time MUST have the same `organization.domain` and select the same issuer (3.2), so that a new version doesn't change the Company's identifier, and with it User IDs and refresh tokens.
- [ ] **MUST**: An endpoint that verifies the Session header (5.3) MUST also check `Poppy-Version`.
- [ ] **MUST NOT**: It rejects a request without it, or with a version that isn't compatible with one the Company serves, with `version_unsupported` (HTTP 400, JSON body), and MUST NOT handle the request under another version.

### Specification: [4. OAuth](https://personalagentprotocol.org/docs/1.0/spec#oauth)

- [ ] **SHOULD**: A Company that offers sign-in SHOULD offer Direct Sign-In.

### Specification: [4.1 Agent identity](https://personalagentprotocol.org/docs/1.0/spec#agent-identity)

- [ ] **MUST**: Companies MUST reject a client assertion with any other `aud`, compared character for character, including their token endpoint URL.
- [ ] **MUST**: Companies MUST accept client assertions signed with `ES256`, and SHOULD accept ones signed with `PS384`.

### Specification: [5.2 The Session header](https://personalagentprotocol.org/docs/1.0/spec#session-header)

- [ ] **SHOULD**: A Personal Agent that fetches a page of the Company's website with its own HTTP client, rather than a browser, SHOULD send the Session header with it, so the Company can tell which Personal Agent and Session the request is from.

### Specification: [Delegated keys](https://personalagentprotocol.org/docs/1.0/spec#delegated-keys)

- [ ] **MUST**: Companies MUST accept delegations signed with `ES256`, and SHOULD accept delegations signed with `PS384`.
- [ ] **MUST**: When verifying a Session header (5.3), the Company MUST reject, with `invalid_session`, a Session JWT without a delegation, including one signed directly with a key from `jwks_uri`, and a Session JWT whose delegation fails any of these checks.
- [ ] **MUST NOT**: So a Company MUST NOT expect a User's delegated key to stay the same between requests or Sessions, or treat a new one as a reason to reject a request.

### Specification: [5.3 Verifying the Session header](https://personalagentprotocol.org/docs/1.0/spec#session-verification)

- [ ] **SHOULD**: Companies SHOULD verify the Session header on every request that carries it.
- [ ] **MUST**: The Company MUST complete the following checks before relying on Session claims for client or User identity, ownership, continuity, or access to state, including creating or continuing a Session:
    - [ ] Fetches the client metadata from `iss` without following redirects, as the CIMD draft (§5) requires, and the public keys from its `jwks_uri` (4.1), following the address checks in section 3.
    - [ ] Verifies the JWT's delegation and signature, as Delegated keys (5.2) describes, then `typ` and the claims above: `aud` is its Company's identifier, compared character for character; `htm` and `htu` match the request as RFC 9449 §4.3 describes for DPoP proofs; and `iat` is within an acceptance window it chooses, such as one minute. The JWT never grants account access, whatever else it contains.
    - [ ] If the request carries an access token, checks that `ath` matches it, and that the token was issued to the same `client_id` as `iss`. Without an access token, `ath` MUST be absent.
    - [ ] Looks up the Session by `client_id`, `sid`, and User ID. An unknown combination starts a signed-out Session with the verified `client_id`, User ID, and optional Agent ID, and a known one continues its Session. It checks ended Sessions at this point too (5.5).
- [ ] **MUST**: Without an access token, `ath` MUST be absent.
- [ ] **MUST NOT**: The Company MUST NOT use unverified Session claims to attribute a request to a Personal Agent, User, or Session, or to look up their state.
- [ ] **MUST**: The Company MUST reject a request without the Session header when handling it depends on Session claims.

### Specification: [Operator signatures](https://personalagentprotocol.org/docs/1.0/spec#operator-signatures)

- [ ] **MUST**: Before trusting any Session claim, the Company MUST verify the Session JWT independently (5.3).

### Specification: [5.6 Sending requests](https://personalagentprotocol.org/docs/1.0/spec#sending-requests)

- [ ] **MUST**: Companies MUST accept the Session header and access token at their APIs, conversations, and other protocol and extension endpoints without requiring cookies.
- [ ] **MUST NOT**: Personal Agents MUST NOT send tokens or Session JWTs in a URL, and Companies MUST NOT accept them from one.

### Recommended: [Handling secrets](https://personalagentprotocol.org/docs/1.0/guides#both-secrets)

These are secrets:

- Access tokens and refresh tokens.
- Private keys, client assertions, Session JWTs, and DPoP proofs.
- Authorization codes, PKCE code verifiers, device codes, one-time sign-in codes, browser-session codes, and credentials sent in mediated sign-in.

To handle them:

- [ ] Keep them out of logs, telemetry, error reports, model context, conversation messages, and URLs. Tokens and Session JWTs MUST NOT be sent in a URL (5.6), and tokens, Session JWTs, private keys, authorization codes, PKCE code verifiers, and device codes MUST NOT go in model context (10.2).
- [ ] Redact the `Authorization`, `Poppy-Session`, `DPoP`, and `Cookie` headers and credential fields before a request reaches a logger or tracer.
- [ ] Send `Cache-Control: no-store` on every response that carries a token or code.

### Recommended: [Signing and verifying JWTs](https://personalagentprotocol.org/docs/1.0/guides#both-signing)

Client assertions, delegations, Session JWTs, and DPoP proofs are JWTs. To sign and verify them consistently:

- [ ] Personal agents: sign Session JWTs with ES256 (MUST, 5.2). Sign client assertions and delegations with ES256, or with PS384 if you sign them blindly (10.7). Companies: accept ES256 (MUST) and PS384 (SHOULD) in client assertions and delegations (4.1, 5.2). Use RSA keys of at least 2048 bits.
- [ ] Personal agents: use `token_endpoint_auth_signing_alg_values_supported` in the Company's OAuth metadata to choose a supported client-assertion algorithm. This list does not establish support for delegation signatures. The protocol has no delegation-algorithm discovery field, and `invalid_session` does not distinguish an unsupported algorithm from other failures. An agent that requires blind signing may be unable to work with a Company that doesn't support PS384. Falling back to ES256 needs a suitable published key and gives up this blind-signing mechanism; don't switch automatically when blind signing is required by the User's privacy settings.
- [ ] Reject `alg: none` and symmetric algorithms such as HS256.
- [ ] Verify client assertions and delegations only with keys from the personal agent's verified `jwks_uri` (4.1), and Session JWTs only with the key their verified delegation names in `cnf.jwk` (5.2). Ignore `jku`, `x5u`, and any other key embedded in a JWT. DPoP proofs for DPoP-bound access tokens are the one other exception: the public key in their `jwk` header is how they work.
- [ ] Check `aud` and `iat`, and `exp` on client assertions and delegations. Session JWTs have no `exp`: accept them only within your `iat` window (5.3). A client assertion has the company's issuer as its `aud`; a Session JWT has the Company's identifier (its issuer, or its HTTPS domain without one), never an endpoint URL (4.1, 5.2). Allow a small clock skew, such as 30 seconds, and reject assertions that claim a long lifetime.
- [ ] Make the `jti` of each client assertion, delegation, Session JWT, and DPoP proof at least 128 random bits, and each Session ID too.
- [ ] Personal agents: set a client assertion's `exp` at most five minutes after its `iat`.
- [ ] Companies: reject a reused client assertion `jti` from the same `client_id` until it expires, as RFC 7523 §3 allows.

### Recommended: [Operator signatures and bot defenses](https://personalagentprotocol.org/docs/1.0/guides#both-operator-signatures)

- [ ] Build the request body, any DPoP proof, and Session JWT first, then the operator signature. Cover `poppy-session` and `authorization` when present, as the spec requires. Include method, authority, path, query, and a verified content digest when the verifier relies on those components.
- [ ] Keep operator keys separate from delegated Session keys. Publishing every User's delegated key in an operator directory is not equivalent to verifying a delegation, and exposes a new key mapping.
- [ ] For a centralized agent, signing can happen where requests already pass. For on-device agents, sending requests to an authenticated operator signing service can reveal which Company each User visits. This signature profile does not provide blind signing. Do not send devices a shared operator private key to avoid that service.
- [ ] A verified operator signature establishes control of its key source. It does not establish every client metadata URL on the same origin. Verify the Session JWT's exact `iss` before accepting it as that client, then apply Company policy and account authorization.
- [ ] Test the actual edge and origin together: registration, directory caching, key rotation, accepted signature components, body handling, and forwarded authentication results. Protect the origin from forged forwarding headers. A bot-verification result is not a replay check or account grant.
- [ ] Remove the extra signature where an edge verifies delegated Session JWTs directly. Keep Company acceptance and all remaining Session and OAuth checks. The JWT covers method, URL without query, and access token, not the request body; do not assume removing an operator signature preserves any additional query or body protection it supplied.

### Recommended: [Rotating keys](https://personalagentprotocol.org/docs/1.0/guides#both-key-rotation)

- [ ] Give every key in `jwks_uri` a `kid`.
- [ ] Publish a new key in `jwks_uri` before signing with it, early enough for companies' caches to pick it up.
- [ ] Keep an old public key published until every client assertion and delegation signed with it has expired.
- [ ] Personal agents: rotate delegated keys as often as you like. Each Session JWT carries its own delegation, so companies don't depend on a delegated key lasting (5.2).
- [ ] Personal agents: don't rotate DPoP keys. Use each one for one user ID only (4.5), and refresh with the key you got the refresh token with (MUST, 4.4). To move to a new key, have the user sign in again, or use the replacement procedure of an extension the company requires.
- [ ] Companies refetch `jwks_uri` when they see an unknown `kid`. The refetch happens before any signature is checked, so anyone can trigger it by naming a real personal agent and a made-up `kid`. Refetch each `jwks_uri` at most once per interval, such as 30 seconds, and count failed fetches too. Otherwise a stream of bad assertions can flood the personal agent's server.
- [ ] Rotating the keys in `jwks_uri` doesn't affect refresh tokens. They are tied to the `client_id`, and to a DPoP key only if the company binds them to one (4.4).

### Recommended: [Fetching metadata safely](https://personalagentprotocol.org/docs/1.0/guides#both-fetching)

Personal agents fetch `poppy.json` files, OAuth and protected resource metadata, and API descriptions. Companies fetch client metadata documents and key sets. Each fetch goes to a URL the other party controls, so:

- [ ] Set limits: a few redirects at most, a response size such as 100 KB, and a timeout of a few seconds.
- [ ] Validate HTTPS certificates. Personal agents MUST follow discovery redirects only to HTTPS URLs (section 3).
- [ ] Never send cookies, tokens, or other credentials on these fetches.
- [ ] Reject loopback, private, and link-local addresses unless you've configured them on purpose. Check the address you actually connect to, not only the one DNS returned first.
- [ ] Cache according to HTTP caching headers, within bounds you set, such as at least a minute and at most a day. The upper bound means a removed key stops being trusted.

### Recommended: [Rate limits](https://personalagentprotocol.org/docs/1.0/guides#both-rate-limits)

- [ ] Companies: limit by `client_id`, by user, and by session, so one busy personal agent or user doesn't crowd out others. Count a request against a `client_id` only after its Session JWT or client assertion's signature checks pass. Otherwise anyone can name a personal agent and use up its limit, so its real users are refused. Limit unverified requests by network instead.
- [ ] Companies: also send the `RateLimit` and `RateLimit-Policy` headers (IETF draft), so personal agents can slow down before they hit a limit.
- [ ] Personal agents: keep track of limits for each company and share them across your tasks and users, rather than letting each task find the limit on its own.
- [ ] Personal agents: prefer long polling or streaming over repeated short polls, and check for changes no more often than the task needs. Checking once a day for a price drop is usually enough.
- [ ] Personal agents: run work that isn't time-sensitive, such as checking order status in the background, outside the company's busy hours, and spread it out instead of starting it all at the same moment.

### Recommended: [Transport and JSON](https://personalagentprotocol.org/docs/1.0/guides#both-transport)

- [ ] Use TLS 1.2 or later. Prefer TLS 1.3.
- [ ] Encode JSON as UTF-8 and reject objects with duplicate member names.
- [ ] Write timestamps in RFC 3339 with a time zone offset, such as `2026-10-02T17:15:00-07:00`.
- [ ] Ignore fields you don't recognize, so later versions can add them.

### Recommended: [Choosing capabilities](https://personalagentprotocol.org/docs/1.0/guides#company-adoption)

Start with the tasks you want personal agents to accomplish and the interfaces you already have. Publish `poppy.json` with at least one of `apis`, `web`, or `agent` (MUST, 3.1). Then choose the capabilities those tasks need:

- [ ] Signed-out APIs. You can expose a catalog or other stateless API without an OAuth server. Accept the Session header personal agents send. If the endpoint uses no Session claims, it can serve requests without verifying the header (5.3).
- [ ] Session continuity. Verify Session JWTs when you want to recognize a pseudonymous user, maintain a Session cart, or connect activity across channels. Verification is required before relying on Session identity, ownership, continuity, or state (5.3). This works without OAuth.
- [ ] Account access. Add OAuth when tasks need access to a user's account. Your endpoints can rely on OAuth alone if they use no Session claims. They still validate tokens and enforce scopes and any required DPoP checks. Check your existing authorization server against what Poppy adds to OAuth and client metadata support. Check `protected_resources` in its metadata first (3.2): it's the required field an existing issuer is most likely to be missing, and adding it may need a release from its vendor.
- [ ] Channels and other capabilities. Offer APIs, web browsing, conversations, or a combination. Add browser join to connect website activity to a Session. Advertise excluded tasks, feedback, and extensions where they help users complete the tasks you support.

### Recommended: [Serving several versions](https://personalagentprotocol.org/docs/1.0/guides#company-versions)

To add a protocol version (3.4):

- [ ] Publish the new version's document at a path of your own, such as `/poppy/0.4.json`, on the host that serves `poppy.json`. Static files work: each version is one file. Keep the URL the same for as long as you list the version.
- [ ] Accept both versions at your endpoints, telling them apart by `Poppy-Version`. Where a version needs its own endpoint, such as a browser-session page that changed, give that version's document its own URL.
- [ ] Make it your preferred version: in one deploy, serve it at `/.well-known/poppy.json` and add the older document's URL to `supported_versions`.
- [ ] To retire a version, send `Deprecation` and `Sunset` on its responses for a while, then remove it from `supported_versions`, then stop accepting it. A personal agent with a cached document gets `version_unsupported`, fetches `poppy.json` again, and moves.

### Recommended: [Verifying personal agents](https://personalagentprotocol.org/docs/1.0/guides#company-agents)

- [ ] Fetch the `client_id` URL without following redirects. Its `client_id` MUST equal the URL you fetched (4.1).
- [ ] Cache client metadata and key sets, as described in Fetching metadata safely.
- [ ] Keep allowlists or blocklists of `client_id` values, and rate-limit session creation and new `client_id` values (4.1).
- [ ] Check whether your authorization server supports client ID metadata documents. Some do, some support them only for clients an administrator registers by URL, and some don't yet. If yours needs registration, register the personal agents you accept by their `client_id` URL and reject others with `invalid_client`, which 4.1 allows. Your OAuth integration can fetch and check the metadata document. Your resources also fetch it when verifying Session JWTs (5.3).
- [ ] If your authorization server accepts client ID metadata documents, publish `client_id_metadata_document_supported: true` in its metadata, as the CIMD draft §8 defines, so other clients, such as MCP clients, can tell. Personal agents don't need it: a company that offers sign-in already reads their metadata documents (4.1).

### Recommended: [Verifying the Session header](https://personalagentprotocol.org/docs/1.0/guides#company-session-header)

Verify Session headers generally (SHOULD, 5.3). Complete all checks before trusting Session claims for identity, ownership, continuity, or state (MUST). Conversations, Session carts, browser join, and approval ownership need that verification. A stateless catalog endpoint can ignore the header. An account endpoint can use OAuth alone if it uses no Session claims or state. It still validates the token, its scopes and audience, and any required DPoP proof. To verify reliably:

- [ ] Verify the Session header in one place, such as a gateway in front of your APIs, conversation endpoint, and browser-session `/authorize` endpoint, and pass the verified `client_id`, `sid`, user ID, and agent ID to the services behind it.
- [ ] Cache verified delegations until they expire (5.2). Key the cache by a hash of the whole delegation, such as its SHA-256, not by its `jti`, which a forged delegation could copy. Most requests then need one signature check.
- [ ] Behind proxies and load balancers, compare `htu` with the public URL the personal agent used. Build it from your configured public origin, not from the `Host` header your server receives.
- [ ] Use an acceptance window of about one minute for `iat`, plus a small clock skew.
- [ ] Rejecting a reused `jti` is optional, as it is for DPoP proofs, because servers behind one endpoint don't always share state. Without it, a copied Session JWT still works only for the same method and URL, with the same access token, and within the acceptance window. A request that changes something then relies on being idempotent, so a replay doesn't repeat it. Conversation requests already are, through their IDs (8.3).
- [ ] If you keep a replay cache keyed by `jti`, hold entries for the acceptance window and share it across every server. Otherwise a JWT accepted by one server can be replayed at another (5.3).
- [ ] Check `ath` against the access token, and that the token was issued to the JWT's `iss`. Reject an absent header when the request depends on Session claims (MUST, 5.3). Don't use an unverified `iss`, `sub`, or `sid` for attribution, rate limits by identity, cache keys, or state lookup.
- [ ] Return `invalid_session` for a failed check, and keep access token errors in `WWW-Authenticate`, as OAuth does (section 7).
- [ ] Binding access tokens with DPoP is your choice (4.5), and you can choose for each service. If you do, verify the proof as RFC 9449 describes, separately from the Session JWT. For a service that doesn't verify proofs, such as an MCP server built for ordinary MCP clients, have your authorization server issue Bearer tokens for its `resource`. If your authorization server can't issue DPoP-bound tokens, verifying the Session JWT and its `ath` binds the token to the personal agent's key. Endpoints that skip Session verification lose that extra protection. Binding refresh tokens to the same key is your choice too (4.4, Token lifetimes).
- [ ] At an MCP server, accept a token issued for its `resource` only at that server (MUST, section 7). Accept the Session header there too, if you want its calls tied to sessions. Signed-out calls that use no Session state can work without verification.
- [ ] Pages on the host that serves your `poppy.json` can get the Session header too, from personal agents that fetch them without a browser, and never with an access token (5.2). Verify it before using it, for example to recognize the personal agent or to keep the request in its session. Treat the request as signed out, even when the session's browser is signed in. When the check fails, return `invalid_session` as at any endpoint (5.3), so the personal agent can find the mistake.
- [ ] Serve personal agent conversations only from your conversation endpoint (8.2). If your website chat or other channels can open the same conversations, they may not check the Session header, and anyone with a copied token could read them there.

### Recommended: [Sessions](https://personalagentprotocol.org/docs/1.0/guides#company-sessions)

When keeping session state:

- [ ] Behind a load balancer, share session state across the servers that handle it, as with server-side cookie sessions, so requests reach the same state whichever server handles them.
- [ ] Record the user ID and agent ID a session starts with, and reject later Session JWTs for it with different ones (5.3).
- [ ] Session verification needs no state until the session lookup, so a gateway in front of your endpoints can verify the header once and pass the verified claims on. Endpoints that use no Session claims don't need to change (5.3).
- [ ] Your authorization server doesn't see the Session header. Sign-in and refresh are plain OAuth, and a session is signed in on each request that carries an access token (5.4).
- [ ] Remember the `sid`s of sessions you end, and answer them with `session_ended` (5.5). Choose a retention period that fits your session lifetimes.
- [ ] Use separate sessions for separate accounts. If your policy refuses a second account in a session, answer with `session_ended` (5.4).
- [ ] Don't expect a user's delegated key to stay the same (MUST NOT, 5.2). You can reject a delegated key that signs for a second user ID while a delegation for it lasts, which limits a leaked key to one user (10.7).

### Recommended: [Internal services](https://personalagentprotocol.org/docs/1.0/guides#company-internal)

- [ ] Don't forward an access token or Session JWT from one of your services to another.
- [ ] Verify them at the edge, then pass the verified `client_id`, session, user ID, account, and scopes to internal services through a gateway or service credentials.
- [ ] Internal credentials used for a request shouldn't allow more than the access token does.

### Recommended: [Hosting several companies](https://personalagentprotocol.org/docs/1.0/guides#company-hosting)

- [ ] Publish metadata for each issuer at its own URL, such as `https://auth.platform.example/.well-known/oauth-authorization-server/outfitters` (3.2). Its `issuer` is the full issuer, and its `protected_resources` lists only that company's storefronts and resources, such as `https://outfitters.example`.
- [ ] Publish protected resource metadata on each storefront's domain, with its company's issuer in `authorization_servers` (3.2).
- [ ] Serve each storefront's `poppy.json` on the storefront's own domain. A document redirected to the platform's domain speaks for the platform, not the storefront (3.1).
- [ ] Companies can share a token endpoint, servers, and signing keys. Only the issuer decides which company a token belongs to.
- [ ] Record the issuer with every session and token, and check it on every request. An access token, refresh token, or Session JWT for Outfitters must not work at Books, even when both are served by the same code.
- [ ] Don't use one company's records for another. A user's sessions, user IDs, and accounts at one company are unknown to every other company the platform hosts.

### Recommended: [Offering personal agents less](https://personalagentprotocol.org/docs/1.0/guides#company-agent-issuer)

A company can offer personal agents less than its other OAuth clients get without a second issuer:

- [ ] Limit the scopes it grants by client, as OAuth allows (4.7). It can also leave scopes it doesn't offer personal agents out of `scopes_supported`, as RFC 8414 allows (3.2). When the issuer's metadata can't be tailored, such as a hosted issuer or one shared with other resources, list the scopes personal agents can request in `scopes_supported` of your protected resource metadata instead (4.7). These lists are discovery, not enforcement: agents can request scopes documented by an API or sign-in extension too.
- [ ] Refuse sign-in, or one sign-in type, to a personal agent with `unauthorized_client` from the grant's endpoint, and keep accepting it for signed-out sessions (4.1). `grant_types_supported` lists the grants every client can see, so a refusal by `client_id` is how you keep direct or device sign-in from some personal agents.
- [ ] Turn off sign-in for every personal agent with `auth.disabled`, for example while your issuer serves only other clients, or to keep one identifier across hostname changes before you offer sign-in (3.2). Personal agents don't try to sign in, and still use signed-out sessions. Remove it when you're ready.

## Interfaces

### Specification: [6. Web browsing](https://personalagentprotocol.org/docs/1.0/spec#web-browsing)

- [ ] **MUST NOT**: A Company that sets `web.disabled` MUST NOT list `browser_session_endpoint`, and MUST list `agent` or `apis`.
- [ ] **MUST**: The Company MUST make the code unguessable and short-lived, and each code works once.
- [ ] **MUST**: The Company MUST tie the code to the browser that loaded the page with a cookie set in the same response, so that only that browser can submit it.
- [ ] **MUST NOT**: The cookie MUST NOT be sent with a form submitted from another site, and other hosts on the Company's domain MUST NOT be able to set it.
- [ ] **MUST NOT**: The page MUST NOT be stored by caches, framed by other pages, or kept as a window reference by the page that opened it.
- [ ] **MUST NOT**: Loading the page MUST NOT start, end, or change any Session, or change the browser's other cookies.
- [ ] **MUST**: The Company MUST reject an access token in step 2 that doesn't have the `poppy:browser-sign-in` scope, with `insufficient_scope` as at an API (section 7).
- [ ] **MUST**: A Company that lists `browser_session_endpoint` and offers sign-in MUST support `poppy:browser-sign-in` (4.7), though it MAY grant it to fewer clients or Users, as for any scope.
- [ ] **MUST**: The Company MUST check that:
    - [ ] The request has the cookie from step 1, and it matches `code`.
    - [ ] The code was authorized in step 2, hasn't expired, and hasn't been submitted before. A code is used by the first request that submits it, whatever the result.
- [ ] **SHOULD NOT**: In a join without an access token, the Company SHOULD NOT end or change that login, because the Personal Agent's browser may have a login it can't easily recreate.
- [ ] **MUST**: MUST be set only in step 3.
- [ ] **MUST**: MUST act for the account and scopes authorized in step 2, if any, and MUST stop acting for the account when the User signs out or disconnects the Personal Agent (5.5).
- [ ] **MUST NOT**: MUST NOT outlive the Session.
- [ ] **MUST**: After a signed-in join, the Company's website MUST either apply the cookie's scopes, as the Company's APIs apply an access token's, or treat `poppy:browser-sign-in` as access to everything the account can do on the website.
- [ ] **MUST**: When `poppy:browser-sign-in` gives the account's full access on the website, the Company MUST describe it that way (4.7), such as "Browse the website, and see and do anything your account can do there," and in Direct and Device Sign-In MUST ask the User to approve it like any other scope.
- [ ] **MUST**: A Company whose website treats `poppy:browser-sign-in` as the account's full access MUST set `web.unscoped` to `true` in `poppy.json`, so the Personal Agent knows what the scope allows before requesting it.
- [ ] **MUST**: A Company that sets `web.unscoped` MUST list `browser_session_endpoint`.
- [ ] **SHOULD**: When the website refuses an action because the Session lacks a scope, it SHOULD show a visible error message that names the missing scopes, so the Personal Agent can request them (5.4).

### Specification: [7. APIs](https://personalagentprotocol.org/docs/1.0/spec#apis)

- [ ] **MUST**: Every listed API MUST accept the Session header (5.2) and, when the Company offers account access, its access tokens (4.5), and enforce their scopes.
- [ ] **MUST**: The `resource` in the server's protected resource metadata MUST equal that `url`.
- [ ] **MUST**: The Company MUST reject it elsewhere.
- [ ] **MUST**: It names the Company's issuer, not the Personal Agent: an MCP server that offers account access MUST include the Company's issuer in its `authorization_servers`.

### Specification: [8.1 Conversation protocols](https://personalagentprotocol.org/docs/1.0/spec#conversation-protocols)

- [ ] **MUST**: The Company MUST include a `description` in every entry, and MAY say the agent can help with anything.

### Specification: [8.2 Requests](https://personalagentprotocol.org/docs/1.0/spec#conversation-requests)

- [ ] **MUST**: The Company MUST reject any other request, as the table shows:
- [ ] **MUST NOT**: Beyond these rules, the side that chooses an ID decides its format, and the other side MUST NOT depend on it.

### Specification: [8.4 Message fields](https://personalagentprotocol.org/docs/1.0/spec#message-fields)

- [ ] **MUST**: A message MUST have at least one of `text`, `data`, `context`, or `extensions`.
- [ ] **MUST NOT**: A message from a person at the Company, or written by the User, with `author.type` `human`, MUST NOT include either field.
- [ ] **MUST NOT**: The Company and the Personal Agent MUST NOT depend on either field being present, and treat each only as a hint for interpreting the message.
- [ ] **MUST NOT**: A side MUST NOT send an extension's content unless the other side uses that extension with the same version: the Company checks the request's `Poppy-Extensions` (3.4), and the Personal Agent checks the Company's document for the version it chose (3.1).

### Specification: [8.5 Reading events](https://personalagentprotocol.org/docs/1.0/spec#reading-events)

- [ ] **MUST**: Every successful read MUST include `conversation_id`, `events`, `cursor`, `has_more`, and the state fields `working`, `handoff`, `responder`, and `closed` (8.7), with `events` empty when there are none.

### Specification: [8.7 State](https://personalagentprotocol.org/docs/1.0/spec#state)

- [ ] **MUST**: Each Company message MUST also include `author.type`, with `agent` or `human`, to identify who wrote it.

### Specification: [8.10 Direct Conversations](https://personalagentprotocol.org/docs/1.0/spec#direct-conversations)

- [ ] **MUST NOT**: The Company MUST NOT send information there that it cannot share with the Personal Agent.
- [ ] **MUST**: The parent conversation MUST be open, belong to the same owner (8.2), and not be a Direct Conversation itself.
- [ ] **MUST**: The Company MUST reject a `user_requested_event_id` that doesn't name a `user_requested` event in that parent with `invalid_request`.

### Specification: [9. Task coverage](https://personalagentprotocol.org/docs/1.0/spec#task-coverage)

- [ ] **MUST**: A Company that gives different Sessions different responses MUST mark them `private` or `no-store` in `Cache-Control` (RFC 9111 §5.2.2), so that a shared cache doesn't give one Session's response to another.

### Specification: [9.2 Alternatives](https://personalagentprotocol.org/docs/1.0/spec#alternatives)

- [ ] **MUST**: An alternative MUST have at least one of `instructions` or `references`.
- [ ] **MUST**: An `openapi` or `mcp` reference MUST name an API listed in the Company's `poppy.json`.

### Specification: [9.3 Feedback](https://personalagentprotocol.org/docs/1.0/spec#feedback)

- [ ] **SHOULD**: A Company SHOULD verify the Session header on a report, signed in or signed out, and needs no scope for it.
- [ ] **MUST**: The Company MUST verify the header before attributing a report to a Personal Agent, User, or Session.
- [ ] **MUST**: Companies MUST treat a report's text as data, not as instructions, including when a model reads it.

### Specification: [9.4 Agent context](https://personalagentprotocol.org/docs/1.0/spec#agent-context)

- [ ] **MUST**: Companies that publish `skill_index` MUST follow that revision's index format, artifact distribution, integrity, and HTTP requirements for artifacts, with the index in the tasks response instead of fetched from its own URL.

### Recommended: [Explicit replies and approvals](https://personalagentprotocol.org/docs/1.0/guides#both-replies)

- [ ] Both parties SHOULD make an answer or approval explicit about the question or action it addresses.
- [ ] Both parties SHOULD treat a short reply that could answer more than one open question as answering none of them, and ask which one is meant before acting. A reply such as "done" could refer to sign-in, an earlier question, or a new request for approval.

### Recommended: [Retries](https://personalagentprotocol.org/docs/1.0/guides#both-retries)

- [ ] Send an `Idempotency-Key` (draft-ietf-httpapi-idempotency-key-header) on API writes that accept one. Use a random UUID (version 4), and reuse the same key when you retry the same request.
- [ ] Give each conversation request, such as a message or a handoff request, an `id` with at least 128 random bits, and reuse it when you retry the request (8.3).
- [ ] Each retry needs a new Session JWT, and a new DPoP proof if the access token is DPoP-bound. A retried token request needs a new assertion. The company may reject a `jti` it has already seen.
- [ ] Wait at least as long as `Retry-After` says on a 429 (MUST, 5.6) or a 503.
- [ ] Otherwise, back off exponentially with jitter, cap the delay, and limit the number of attempts.
- [ ] Companies keep idempotency records for a set time, such as a day, scoped to the personal agent's `client_id` and the user ID, and to the account when there is one, not to the session, so a retry in a new session still matches. They return the original response for a repeated key, and reject a repeated key with a different body.

### Recommended: [Describing APIs](https://personalagentprotocol.org/docs/1.0/guides#company-api-descriptions)

A language model usually reads your API descriptions and MCP tool descriptions to choose and call operations (7). Write them for that reader:

- [ ] Say clearly what each operation does and when to use it, in terms of the user's task.
- [ ] Keep them small. The whole description takes room in the model's context, so leave out what personal agents don't need, such as long examples or operations only your own apps call.

### Recommended: [Browser sessions](https://personalagentprotocol.org/docs/1.0/guides#company-browsing)

Personal agents work faster and more reliably through a company agent or APIs than through a website, so start there for the tasks users ask for most. Then choose how much of your website personal agents can use, from least to most:

- [ ] No browsing. Set `web.disabled`, and cover the tasks in your company agent or APIs. Personal agents that follow the protocol won't browse in a browser, but nothing stops one that doesn't (section 6). They can still fetch pages without a browser, with the Session header (5.2).
- [ ] Signed-out browsing. List `web` without a `browser_session_endpoint`. Personal agents browse as ordinary signed-out visitors, and use your company agent and APIs for anything that needs the account.
- [ ] Signed-in browsing with the account's full access. List `browser_session_endpoint`, set `web.unscoped`, and let `poppy:browser-sign-in` allow everything the account can do on the website. This suits a website whose permissions don't match your OAuth scopes. Describe `poppy:browser-sign-in` that way in `auth.scopes`, give it hints that match the website's most consequential action, usually `irreversible` with `personal_data`, and show it on your consent page as its own choice (section 6).
- [ ] Signed-in browsing with your scopes. Your website applies the same scopes as your APIs, so `poppy:browser-sign-in` adds nothing, and you can grant it without asking the user.
- [ ] Put the endpoint on the host personal agents browse when you can. It can be on another host, such as `accounts.example.com`, as long as the session's cookie it sets reaches the pages personal agents browse (section 6).
- [ ] Make each code at least 128 random bits, and expire it within 60 seconds.
- [ ] Set the cookie that ties the code to the browser as `__Host-poppy_join=…; Path=/; Max-Age=60; Secure; HttpOnly; SameSite=Strict`, with `Max-Age` no longer than the code's lifetime. The `__Host-` prefix keeps other hosts on your domain from setting it, and `SameSite=Strict` keeps a form on another site from sending it (RFC 6265bis).
- [ ] Send the page with `Cache-Control: no-store`, `Content-Security-Policy: frame-ancestors 'none'`, and `Cross-Origin-Opener-Policy: same-origin`, so caches don't keep it, other pages can't frame it, and the page that opened it can't keep a reference to its window (section 6).
- [ ] Answer a successful form with `303 See Other`, and a failed one with 400, or 429 when the browser sends too many requests.
- [ ] Don't log the endpoint's responses or request bodies. They contain browser-session codes.
- [ ] Keep a short-lived record for each code: whether it was authorized, for which session and account, and whether it was submitted. A store with a time to live of the code's lifetime works.
- [ ] Use a cookie for the session that's separate from your login cookie, and check it first. After a signed-out join, keep the browser's login cookie. After a signed-in join, clear it, so the browser is signed out when the session's sign-in ends. Section 6 has a table of each case.
- [ ] Make the session's cookie `Secure` and `HttpOnly`, and use the `__Host-` prefix when the endpoint is on the host personal agents browse. When it's on another host, such as `accounts.example.com` for `www.example.com`, the cookie can't use `__Host-` and needs a `Domain` attribute. Set `Domain` to the narrowest domain that covers the hosts personal agents need, because `Domain=example.com` is sent to every subdomain, including one an attacker might take over. The join cookie is only read on the endpoint's host, so it keeps `__Host-` either way.
- [ ] Look up the session on each request, so sign-out and scope changes take effect on the website right away.

### Recommended: [A conversation endpoint at another provider](https://personalagentprotocol.org/docs/1.0/guides#company-conversation-provider)

- [ ] List the conversation endpoint in `agent.protocols` in the company's `poppy.json`, with a `description` of what the provider's agent can help with for that company.
- [ ] Use that endpoint URL as the service's resource identifier, including the tenant path so tokens for different companies have different audiences (RFC 8707 §3). Publish its protected resource metadata at the URL RFC 9728 §3.1 defines:
- [ ] Configure the company's issuer to issue access tokens for that resource, with the scopes the conversation service uses. Publishing metadata alone doesn't configure the issuer or establish trust between the providers (RFC 8707 §2.2).
- [ ] The personal agent discovers the resource and requests its access token from the company's issuer with `resource` set to the endpoint URL, at sign-in or refresh (4.5). The issuer can also list the resource in its `protected_resources` (3.2).
- [ ] Arrange for the conversation provider to validate access tokens from that issuer. For JWT access tokens following RFC 9068, use the issuer's metadata and signing keys and check the issuer, audience, expiry, and other validation rules. Another option is authenticated token introspection (RFC 7662). Enforce scopes and verify the Session header separately, including that the token was issued to the same client (5.3).

### Recommended: [Conversations](https://personalagentprotocol.org/docs/1.0/guides#company-conversations)

- [ ] Let your company agent do everything customers can do by phone, as fully as you can, so personal agents have no reason to call.
- [ ] Put structured details in `data`, not JSON or other markup in `text` (8.4).
- [ ] To a personal agent that declares the Links extension, send the pages a reply refers to as links, rather than URLs in `text`.
- [ ] To a personal agent that declares the Disclosures extension, send notices users need to see, such as allergen or regulatory warnings, as disclosures, and keep them to those. Personal agents decide which to show, and skip ones that read like promotion. Without the extension, put the notice in `text`.
- [ ] Keep what a message says in `text` and `data`, and use extension content to add to it, so a personal agent that ignores an extension still gets the message (8.4).
- [ ] Write for whoever is on the other side (8.8). With a personal agent, skip greetings and small talk and keep text short. With the user, use plain sentences, a pace they can follow, and details in `text` rather than only in `data`. In a direct conversation, reply as you would to the customer on your own channels.
- [ ] Report `working` as `true` from the moment you accept a request until you've acted on it and finished replying, so a personal agent that reads until `working` is `false` gets the whole reply (8.7).
- [ ] Set `as_of_request` on each company agent message to the latest request the agent saw when it started the turn, and give the agent the `as_of_cursor` of each personal agent message, so it knows which of its messages a reply answers (8.4). Leave `as_of_request` off messages from people.
- [ ] If your help desk can withdraw a request for a person, do so on a handoff cancel, so no one is assigned to a conversation that no longer needs them (8.9).
- [ ] Keep a conversation's events for at least 30 days, so a personal agent that reconnects rarely hits `cursor_expired` (8.5).
- [ ] On a stream with nothing to send, send an SSE comment every 15 to 30 seconds, so proxies don't close it (8.6).
- [ ] When a session signs out, answer requests without an access token on its conversations that used the account with a 401 challenge, including reads of their events, so their account details can't be read signed out (5.5, 8.11). Leave them open, so the user can sign in again and continue, or close them if your policy is to clear everything at sign-out.
- [ ] Before closing an inactive conversation, say so in a message (8.12).
- [ ] When you send an `authorization` event, also ask in a message, so a user in a direct conversation sees the request (8.11).
- [ ] When sign-in can verify the user, send an `authorization` event (8.11) rather than asking for identifying details in messages, such as a date of birth, part of an account number, or a code sent by text. Sign-in proves who the user is, and it keeps codes and personal details out of messages and model context (Handling secrets).
- [ ] Give the people a conversation is handed to (8.9) the same way to ask for sign-in, so they don't fall back to verification questions.

### Recommended: [Excluded tasks and feedback](https://personalagentprotocol.org/docs/1.0/guides#company-excluded-tasks)

- [ ] List the tasks you've chosen not to offer to personal agents, such as ones you allow only in your app for security or regulatory reasons (9.1). Personal agents then stop looking for a way to do them, and don't send feedback about them.
- [ ] Write each task the way a customer would ask for it, such as "Send a wire transfer".
- [ ] Give an alternative whenever there is one. Link to the page, or the screen in your app, where the user can do the task (9.2).
- [ ] Serve excluded tasks, skills, and your feedback endpoint from `tasks.endpoint` (section 9). If every Session gets the same response, you can cache it at your edge without verifying the Session header.
- [ ] To try different skills, alternatives, or feedback endpoints with some users, choose each Session's variant after verifying its Session header, and mark the response `private`. Choose by User ID to keep a user in the same variant across Sessions, or by Session ID to vary it from one Session to the next.
- [ ] If different Sessions can get different versions of a skill, give each version its own URL. A personal agent rejects a file whose digest doesn't match the index it got.
- [ ] When a feedback report asks for a task you do offer, answer with an alternative that says how, so the personal agent can finish the task (9.3).
- [ ] Take feedback from personal agents at the `feedback.endpoint` in your tasks response (9.3). If your APIs also serve clients that don't read `poppy.json` and you keep a feedback operation for them, say in its description that personal agents use `feedback.endpoint`. Ideally both feed the same place.

### Recommended: [Error messages](https://personalagentprotocol.org/docs/1.0/guides#company-errors)

- [ ] Keep `error_description` and other error text free of account details and other users' data.
- [ ] Return the same error for "doesn't exist" and "belongs to someone else", as `conversation_not_found` does (8.13).

## Sign-in and accounts

### Specification: [4.2 Direct Sign-In](https://personalagentprotocol.org/docs/1.0/spec#direct-sign-in)

- [ ] **MUST**: `redirect_uri` MUST exactly match an entry in the Personal Agent's `redirect_uris` (4.1), except for the port of a loopback redirect URI, as RFC 8252 §7.3 describes.

### Specification: [4.3 Device Sign-In](https://personalagentprotocol.org/docs/1.0/spec#device-sign-in)

- [ ] **MUST**: Companies that offer Device Sign-In and Personal Agents that use it MUST follow the best practices in RFC 10027 (BCP 247) §2.
- [ ] **MUST NOT**: Opening the link MUST NOT approve the request by itself.

### Specification: [4.7 Scopes and token responses](https://personalagentprotocol.org/docs/1.0/spec#scopes)

- [ ] **SHOULD**: The Company SHOULD describe each scope it offers Personal Agents, so the Personal Agent can choose the ones a task needs: in the scopes of an OAuth 2.0 security scheme in an OpenAPI description it lists (section 7), or otherwise in `auth.scopes`.
- [ ] **MUST**: A Company MUST include both fields in each entry.
- [ ] **MUST NOT**: The Company MUST NOT grant scopes beyond those requested.

### Mediated Sign-In: [1. Introduction](https://personalagentprotocol.org/docs/1.0/extensions/mediated-sign-in#intro)

- [ ] **SHOULD**: A Company SHOULD offer Mediated Sign-In only until it can add Direct or Device Sign-In, and SHOULD stop offering it once those cover the scopes it grants.

### Mediated Sign-In: [2. Advertising support](https://personalagentprotocol.org/docs/1.0/extensions/mediated-sign-in#support)

- [ ] **MUST NOT**: It MUST NOT be `grant_type`, `scope`, `resource`, a client authentication parameter such as `client_id` or `client_assertion`, or a parameter this extension defines, such as `sign_in_id`.
- [ ] **SHOULD**: The Company SHOULD also include them in `scopes_supported`, in its OAuth server metadata or protected resource metadata (spec 3.2).
- [ ] **MUST NOT**: The Company MUST NOT grant scopes beyond those requested and listed here.

### Recommended: [Token lifetimes and sign-out](https://personalagentprotocol.org/docs/1.0/guides#company-lifetimes)

- [ ] Give access tokens a lifetime of hours, not days.
- [ ] At sign-out, invalidate the access tokens issued under the revoked refresh token, as RFC 7009 §2.1 describes, or check on each request whether the authorization is still active, so sign-out takes effect right away. If you can do neither, keep access tokens to a few minutes (5.5).
- [ ] Don't stop accepted work because the access token that started it expired. A job can outlast the token.
- [ ] Where work in progress can take consequential actions on the user's account, such as payments or changes that are hard to undo, tie it to the refresh token, so revoking access stops it right away.
- [ ] Give refresh tokens a lifetime that fits the account, such as 90 days, and expire ones that go unused sooner. Keep it long enough that users don't have to sign in again often.
- [ ] Revoke a user's refresh tokens when they reset their password or you suspect the account is compromised.
- [ ] Consider issuing a new refresh token on each refresh and revoking the grant when an old one is used again, as RFC 9700 §4.14.2 describes. If a refresh token is copied, the grant ends as soon as both copies have been used.
- [ ] Where account access has meaningful consequences, bind refresh tokens to the DPoP key they were issued with (4.4), so a copied refresh token is useless without the key.
- [ ] If a personal agent's signing key may have leaked, revoke every refresh token issued to its `client_id` that isn't bound to a DPoP key (4.4).

### Recommended: [Describing scopes](https://personalagentprotocol.org/docs/1.0/guides#company-scope-descriptions)

Describe the scopes you offer personal agents, in the OAuth security scheme of an OpenAPI description you list or in `auth.scopes` (SHOULD, 4.7). Personal agents read them to choose scopes, and a language model often does the choosing:

- [ ] Say what the scope lets the personal agent see or do, in words a user understands.
- [ ] Be specific enough for a model to match a task to the scopes it needs. "See your orders and returns" works better than "Read access".
- [ ] Say whether the scope only reads, and whether a write scope also allows reading.
- [ ] Say in words which actions can't be undone and what personal data the scope shows.
- [ ] Give each scope its hints in `auth.scope_hints` (4.7). Judge each scope by the most consequential operation that requires it: one operation that can't be undone makes the whole scope `irreversible`. When you're unsure about a scope, leave it out of `auth.scope_hints` rather than guess.
- [ ] Splitting a scope can earn it a better hint. A personal agent may request `orders:read` freely but ask the user first before requesting a scope that can cancel orders.

### Recommended: [Consent pages](https://personalagentprotocol.org/docs/1.0/guides#company-consent)

The page where the user approves access, in direct and device sign-in (4.2, 4.3):

- [ ] Start with a heading that names the personal agent and says it wants to connect to the user's account, such as "Muse wants to connect to your Example account". Show it on your sign-in page too, before the user signs in, since that's where they decide whether to go on. Word it as connecting, not as "Sign in with Muse", which reads as signing in with a Muse account.
- [ ] Let the user sign in with a passkey or another phishing-resistant method, as on your website. Direct and device sign-in happen on your own pages, so passkeys work there. They can't work with mediated sign-in, where the personal agent collects the credentials. A passkey protects against fake sign-in pages, but not against a user approving a sign-in someone else started, so the advice on this page and for device sign-in still applies.
- [ ] Show the personal agent's name and logo, and the domain of its `client_id`. The personal agent chooses its own name, so the domain is what the user can trust.
- [ ] Tell the user to continue only if they just asked that personal agent to connect, such as "Only continue if you asked Muse to do this just now." Anyone can start a sign-in and send the user the link, and nothing in the request says who started it. A user who doesn't use that personal agent, or didn't ask, can then decline.
- [ ] Show the account being connected, the requested scopes in plain language, and how long access lasts. Group related scopes rather than listing their names.
- [ ] Point out scopes that allow changes that can't be undone or that show personal data, the scopes your `auth.scope_hints` mark `irreversible` or with `personal_data`.
- [ ] When `poppy:browser-sign-in` allows everything the account can do on your website, say so in plain language, such as "Use the website as you, with full access to your account", and let the user leave it out while approving the rest (section 6).
- [ ] When your issuer serves several domains, `poppy:browser-sign-in` signs the browser in on each of them that lists a `browser_session_endpoint`. Name those websites when you ask the user to approve it, such as "Use example.com and example.co.uk as you" (3.2). If any of those websites is unscoped, describe the scope as full access and set `web.unscoped` on every domain (section 6).
- [ ] When the user already granted some of the scopes, show which ones are new, so the user doesn't review the whole list again. A personal agent that needs more access requests every scope it needs again (4.7).
- [ ] Protect the page against cross-site request forgery, and against framing by other sites with `Content-Security-Policy: frame-ancestors`.
- [ ] `redirect_uri` MUST exactly match an entry in the personal agent's `redirect_uris` (4.2).
- [ ] Accept PKCE with `S256` only, and reject `plain`.
- [ ] Return `iss` in every redirect, success or error (4.2). Personal agents reject a redirect without it.
- [ ] For extra protection, support Pushed Authorization Requests (RFC 9126), and require them where sign-in grants access with meaningful consequences, such as payments. Personal agents then have to use them (4.2). Give each `request_uri` a lifetime of a minute or two.

### Recommended: [Device sign-in](https://personalagentprotocol.org/docs/1.0/guides#company-device)

- [ ] Offer direct sign-in too (SHOULD, 4). Device sign-in is easier to use for phishing.
- [ ] RFC 10027 §6.2.1.5 advises against the device authorization grant for sensitive, high-value, or business-critical resources. A company whose accounts hold them, such as a bank, may offer only direct sign-in.
- [ ] Follow the best practices for cross-device flows in RFC 10027 §2 (MUST, 4.3): assess the risk before offering device sign-in, and choose mitigations from its §6.1, such as short-lived single-use codes, rate limits, limited scopes, and a consent page that says which personal agent is asking and tells the user to decline a code they didn't ask for.
- [ ] Put the verification page on your issuer's host or your domain, or a subdomain of either. Personal agents don't show a link anywhere else (4.3). If one issuer serves several domains, a page on the issuer's host works for all of them.
- [ ] Opening the link MUST NOT approve the request by itself (4.3). The same goes for scanning the QR code. The user signs in and approves on the page.
- [ ] Ask the user to confirm that the code on the page matches the one the personal agent shows.
- [ ] Return `slow_down` to personal agents that poll faster than `interval`, and limit wrong `user_code` entries.
- [ ] Keep `expires_in` short, such as 10 minutes.

### Recommended: [Mediated sign-in](https://personalagentprotocol.org/docs/1.0/guides#company-mediated)

If you offer mediated sign-in, protect the credentials you accept (Mediated Sign-In 6):

- [ ] Rate-limit attempts by account, by `client_id`, and by network address, and cap wrong one-time codes.
- [ ] Require a one-time code when a sign-in looks unusual, including a personal agent's first mediated sign-in after the user disconnected it.
- [ ] Return the same `invalid_grant` error for an unknown account and a wrong password, so responses don't reveal whether an account exists.
- [ ] Never store raw credentials or codes, including in logs, traces, and idempotency records.
- [ ] Tell the user, for example by email, when a personal agent signs in.

### Recommended: [Account settings](https://personalagentprotocol.org/docs/1.0/guides#company-account-settings)

- [ ] In account settings, list each connected personal agent with its name, domain, scopes, and when it was last used.
- [ ] Offer a control to disconnect each one. Disconnecting revokes its refresh tokens, and its sessions continue signed out (5.5). Also invalidate the access tokens issued under them, as RFC 7009 §2.1 allows.

### Recommended: [Enforcing scopes everywhere](https://personalagentprotocol.org/docs/1.0/guides#company-scopes)

- [ ] Apply the same scope rules on your website, APIs, company agent, and live agents. One shared check that every channel calls is easiest to keep consistent. Until your website can, let `poppy:browser-sign-in` stand for the account's full access there (Browser sessions).
- [ ] Have the company agent's tools check the token's scopes on every call. Don't rely on the model to decide.
- [ ] Give live agents' tools the same checks, so a person can't make a change the token doesn't allow (8.11).
- [ ] Check read and write scopes separately. If a write scope also allows reading, say so in its description.
- [ ] When your website refuses an action for a missing scope, show an error that names the scopes (SHOULD, section 6).

## Extensions

### Specification: [3.3 Extensions](https://personalagentprotocol.org/docs/1.0/spec#extensions)

- [ ] **MUST**: Anyone else MUST start an extension's name with a domain they control, such as `example.com/gift-wrap`.
- [ ] **MUST**: Personal Agents and Companies MUST ignore extensions and versions they don't support and fields they don't recognize, so either side can work with the other under this specification alone.

### Operations: [2. Advertising support](https://personalagentprotocol.org/docs/1.0/extensions/operations#support)

- [ ] **MUST NOT**: A Company MUST NOT return operations in response to a request that doesn't declare it.

### Operations: [3. The operation](https://personalagentprotocol.org/docs/1.0/extensions/operations#operation-object)

- [ ] **MUST NOT**: It stays the same when the terms change (see "New terms"), and the Company MUST NOT use it for another action.
- [ ] **MUST**: Everything that affects the action, such as what it changes, any amount, date, or recipient, or a condition for cancelling, MUST be in the revision's `terms`, and in `summary` if present.
- [ ] **MUST**: The Company MUST perform only what the approved revision describes, and MUST NOT start the action before it receives an approval for it.
- [ ] **MUST NOT**: It MUST NOT give two different sets of terms the same `revision`, so an approval of one revision never applies to other terms.
- [ ] **MUST**: Whichever revision is approved, the Company MUST perform each operation at most once (7).
- [ ] **SHOULD**: `expires_at` SHOULD leave the User long enough to read the terms and decide, unless the Company can't hold the terms that long, such as a price or a seat that can sell out.

### Operations: [4. Asking for approval](https://personalagentprotocol.org/docs/1.0/extensions/operations#approval-required)

- [ ] **SHOULD**: The Company's website SHOULD offer a way to make the original request again, such as a Continue button on the page that's waiting, so the Personal Agent can repeat the action once it's approved (6).
- [ ] **SHOULD**: The Company's website SHOULD answer a page load or form submission with a page that says the action is waiting for approval in the User's personal agent.
- [ ] **SHOULD**: The Company's website SHOULD answer a request from its own scripts that accepts JSON, such as a `fetch`, with a JSON object with `error` set to `approval_required`, like an API's but without the operation.

### Operations: [6. Sending the approval](https://personalagentprotocol.org/docs/1.0/extensions/operations#sending-approval)

- [ ] **MUST NOT**: A Company MAY record `approver`, `approved_at`, `input_type`, and `reference`, and MUST NOT reject or decline an approval because an optional member is missing or because it doesn't recognize the `input_type`.
- [ ] **MUST**: Companies MUST ignore members of `Poppy-Approval` they don't recognize, so later versions can add members.
- [ ] **MUST NOT**: The Company MUST NOT accept an approval of a website's operation at an API, MCP server, or conversation, or an approval of another interface's operation at `endpoint`.
- [ ] **MUST**: The Company MUST keep a recorded approval that isn't used up until the approved revision's `expires_at`, and MUST NOT apply it to requests from a Session that can't approve the operation.
- [ ] **MUST**: After the Session header checks in spec 5.3 and the token checks in spec 7, the Company MUST make the following checks before performing the action, and respond as the first one that fails says, whatever order it makes them in internally:
    - [ ] The Session can approve the operation (3). If it can't, the Company handles the request as if it had no approval.
    - [ ] The operation hasn't been performed already. If it has, or is being performed, the Company responds as section 7 describes.
    - [ ] The `revision` is one the Company returned for this operation, it hasn't expired, and the request asks for exactly what it describes. The API request or tool call asks for the same action as the one that returned the operation, in a conversation, the operation is the conversation's, and at `endpoint`, the reference is the operation's. The Company compares what the requests mean, not their bytes, and MAY ignore differences it considers inconsequential, such as the order of JSON members. It MAY treat a revision it has replaced with a later one as failing this check.
- [ ] **MUST NOT**: A Company MUST NOT answer an approval with the revision it names, so a Personal Agent never retries the same approval in a loop.
- [ ] **MUST NOT**: The Company MUST NOT put anything in `reason` that the Session couldn't already see.
- [ ] **MUST NOT**: The Company MUST NOT record a declined approval, so a website never finds it for a later request.

### Operations: [7. Retries and at most once](https://personalagentprotocol.org/docs/1.0/extensions/operations#at-most-once)

- [ ] **MUST**: The Company MUST perform each operation at most once, however many times its approval is sent.
- [ ] **MUST**: The Company MUST remember that it performed an operation at least until the approved revision's `expires_at`, and while it is being performed.
- [ ] **MUST NOT**: While an operation is being performed, or the Company doesn't know whether it took effect, for example after a timeout in one of its own systems, the Company MUST NOT respond as if it failed.

### Browser Control: [2. Browser control and Operations](https://personalagentprotocol.org/docs/1.0/extensions/browser-control#operations)

- [ ] **SHOULD**: A Company SHOULD use Operations for an action that it can describe as terms to approve.

### Browser Control: [4. Marking steps](https://personalagentprotocol.org/docs/1.0/extensions/browser-control#marking)

- [ ] **SHOULD**: The Company SHOULD mark every control that performs the step, or the form it is in, and SHOULD mark them before they can be used.
- [ ] **SHOULD NOT**: The Company SHOULD NOT let filling in a `submission` form perform the step itself.
- [ ] **MUST**: Whatever it marks, the Company's servers MUST check the action's conditions themselves, because marks don't stop anything (8.1).

### Browser Control: [5. Handing control to the User](https://personalagentprotocol.org/docs/1.0/extensions/browser-control#user-control)

- [ ] **MUST NOT**: A timeout, a change to the page's marks, or anything the Company sends MUST NOT end it.

### Browser Control: [6. Who controls the browser](https://personalagentprotocol.org/docs/1.0/extensions/browser-control#controller)

- [ ] **MUST NOT**: It MUST NOT rely on `"user"` as a guarantee that the User took the step.

### Recommended: [Operations](https://personalagentprotocol.org/docs/1.0/guides#company-operations)

When you offer the Operations extension:

- [ ] Ask for approval for actions with a business effect that the user would want to confirm, such as ones that cost money or can't be undone. Don't ask for routine changes the user already asked for in so many words, such as updating a saved address.
- [ ] Put everything that affects the action in `terms`. Name its keys after the fields of the request or of your API's resources, such as `order_id`, so personal agents can compare them with what they asked for, and make each value clear on its own, such as an amount with its currency. Personal agents show `terms` to users, or describe them in their own words (Operations 3).
- [ ] Send a `summary` when you want users to read your wording. Write it so it stands alone: what will happen, to what, and any cost, date, or condition. Use bold for what matters most, such as the amount, and keep links out of it. Personal agents that show a summary show yours as is (Operations 3).
- [ ] Say in your OpenAPI description which endpoints can return `approval_required` or `approval_declined` (Operations 4).
- [ ] An approval is a user approval, or an agent approval on the user's instruction, and says which in `approver`. Record `approver` and `reference` with the operation, so you can look into an approval with the personal agent's operator later (Operations 8.1).
- [ ] For actions where you want to see the user approve, don't return operations. Handle them on your website or in your app until signed user approvals exist (roadmap).
- [ ] Choose `expires_at` for each kind of action. Give the user at least 15 minutes, and longer for terms that don't change, such as cancelling a subscription at the end of the month. Keep it short when you hold something for the user, such as a seat or a sale price. If you don't store operations, you can't hold a price: an approval that arrives after the price changed gets a new revision (Operations 3).
- [ ] Keep your record of a performed operation until its approved revision expires, and no longer than you need to. A store with a time to live set from `expires_at` works (Operations 7).
- [ ] To avoid storing operations nobody has approved, compute them from the request (Operations 3). Give a request without an approval a new random `operation_id`, such as `exc_5Rt2`, so a user can repeat an action on purpose. When a request with an approval no longer matches, return the new revision with that approval's `operation_id`. In a conversation, keep the `operation_id` when the user asks for different terms.
- [ ] When you compute operations, make the `revision` the expiry as a Unix time and an HMAC-SHA256, with a key kept like your other signing keys, over the `operation_id`, the expiry, the terms in a canonical form such as RFC 8785 whether or not you return `terms`, and who can approve it: the `client_id`, the User ID, and the account when signed in. Include the method, URL, and the parts of the body or tool arguments that affect the action. Leave out the `summary`, so you can reword it.
- [ ] When the request comes back with an approval, compute the terms again from your current data, such as today's price, then the HMAC. Compare it in constant time and check the expiry. If the price or anything else changed, the HMAC doesn't match, and you return a new revision for the current terms. The revision only shows that the terms changed: always use your current price. If you store operations instead, store each revision's terms with such a fingerprint of the request, so you can check that a request with an approval asks for exactly what was approved (Operations 6).
- [ ] When you call another system to perform the action, such as a payment processor or a warehouse, derive its idempotency key from the operation ID. A retry then can't perform the action twice downstream either.
- [ ] If a downstream call times out, ask that system whether the action happened, using your business reference, before trying again. Until you know, answer retries with 503 and `Retry-After` (Operations 7).
- [ ] Keep a record of each approval: the operation, revision, `client_id`, account, and time. It shows what the personal agent stated the user approved (Operations 8.1).
- [ ] To ask for approval on your website, make the reference in `Poppy-Operation` a sealed copy of the operation and the request's fingerprint, such as a JWS or an HMAC over who can approve it as for the `revision`, so you don't store operations nobody approved (Operations 4).
- [ ] Keep recorded approvals in the store you use for performed operations, by the account, or by the personal agent's `client_id` and User ID when signed out, with a time to live set from `expires_at`. One record can go from approved to performing to performed (Operations 6).
- [ ] When the browser repeats the request, check it against each unused approval recorded for that account or user as you would check a request that carries the approval: compute the terms and the HMAC again with the approved revision's `operation_id` and expiry. Mark the approval used when you perform the action, so a later request gets a new operation.
- [ ] On the page that's waiting, tell the user the action needs their approval in their personal agent, and offer a Continue button that makes the original request again. A page that polls your own status endpoint can repeat the request itself once the approval is recorded. Don't use operations on the website for an action you can't repeat, such as one behind a single-use form token. Handle its approval yourself instead. Send `Poppy-Operation` on the response to the request itself, including a script's `fetch`, so it works for buttons as well as forms.
- [ ] Make sure your CDN or web application firewall passes a 403 with `Poppy-Operation` through unchanged. Some replace the body of error responses with their own page or drop headers, and the personal agent then can't find the operation (Operations 4).
