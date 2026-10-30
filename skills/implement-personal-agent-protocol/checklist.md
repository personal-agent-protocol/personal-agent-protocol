# Company checklist

Generated from the Personal Agent Protocol docs, draft 0.3. It lists every
requirement on the Company in the specification and extensions, and the guides' advice for
companies, grouped by milestone. Go through the sections for the milestones and features in
your design. The validator checks some of these. The rest need a review or a manual test.

Requirements that apply to both parties are included. Requirements only on Personal Agents
are left out.

## Foundation

### Specification: [3. Discovery](https://personalagentprotocol.org/docs/0.3/spec#discovery)

- [ ] **MUST**: A Company MUST publish its `poppy.json` document at `https://{domain}/.well-known/poppy.json` over HTTPS, where `{domain}` is the Company's domain or a subdomain it controls.
- [ ] **MUST**: Every URL this protocol defines or exchanges MUST be an HTTPS URL: in `poppy.json`, in authorization server and protected resource metadata, in client metadata documents (4.1), in extensions, and in assertions, Session JWTs, and responses.
- [ ] **MUST NOT**: Personal Agents MUST NOT use a URL from a Company that has another scheme, and Companies MUST reject one from a Personal Agent.
- [ ] **MUST NOT**: Personal Agents and Companies MUST NOT connect to a loopback, private, or link-local address for a URL the other party gave them, unless they were configured to on purpose.

### Specification: [3.1 Fields](https://personalagentprotocol.org/docs/0.3/spec#fields)

- [ ] **MUST**: `domain` MUST be the host that serves the document, after any redirects.
- [ ] **MUST**: It MUST be in that list.
- [ ] **MUST**: With one authorization server, the Company MAY leave it out, and if it includes it, it MUST name that server.

### Specification: [3.2 OAuth server](https://personalagentprotocol.org/docs/0.3/spec#oauth-server)

- [ ] **MUST**: A Company that offers sign-in MUST have an OAuth issuer.
- [ ] **MUST**: If the Company publishes this metadata, its `resource` MUST be exactly `https://{organization.domain}`, and its `authorization_servers`, when nonempty, names the issuer:
    - [ ] HTTP 404, or valid metadata with `authorization_servers` absent or empty, means the Company has no issuer. This is valid only when `auth.issuer` is absent and the Company offers no sign-in.
    - [ ] A Personal Agent MUST NOT use the domain fallback after a timeout, another error status, invalid metadata, or a failure to verify an issuer. It MUST NOT fall back for a Company whose issuer it already knows unless a successful discovery explicitly establishes that the issuer was removed.
    - [ ] If it lists one authorization server, that is the Company's issuer. `auth.issuer` is optional, and if present MUST name that server (3.1).
    - [ ] If it lists more than one, such as one for the Company's employees, `auth.issuer` in `poppy.json` names the one Personal Agents use (3.1). RFC 9728 leaves the choice among them to the client, but User IDs and refresh tokens belong to one issuer (5.1), so every Personal Agent has to choose the same one.
- [ ] **MUST NOT**: It MUST NOT fall back for a Company whose issuer it already knows unless a successful discovery explicitly establishes that the issuer was removed.
- [ ] **MUST**: `auth.issuer` is optional, and if present MUST name that server (3.1).
- [ ] **MUST**: The Company MUST select that same issuer on each domain (above).
- [ ] **MUST**: The Company MUST give each scope the same authorization meaning across these domains.
- [ ] **SHOULD**: The Company SHOULD publish the same scope descriptions and hints across these domains, but MAY expose different scopes or capabilities.
- [ ] **MUST**: An issuer MUST represent exactly one Company.
- [ ] **MUST**: A provider that hosts several Companies MUST give each its own issuer, such as `https://auth.provider.example/shop-a`, even when they share servers.
- [ ] **MUST**: The issuer MUST publish OAuth Authorization Server Metadata (RFC 8414), at the URL RFC 8414 §3.1 defines.
- [ ] **MUST**: Its `protected_resources` (RFC 9728 §4) MUST list `https://{domain}` for every domain whose issuer it is, with no path, port, or trailing slash.
- [ ] **MUST**: Required, and it MUST include `refresh_token` (4.4).
- [ ] **SHOULD**: A Company that offers sign-in SHOULD publish it and include every scope a Personal Agent can request (4.7).
- [ ] **MUST**: A Company that lists `signed_in` MUST have an issuer.

### Specification: [4.1 Agent identity](https://personalagentprotocol.org/docs/0.3/spec#agent-identity)

- [ ] **MUST**: Companies MUST reject a client assertion with any other `aud`, compared character for character, including their token endpoint URL.
- [ ] **MUST**: Companies MUST accept client assertions signed with `ES256`, and SHOULD accept ones signed with `PS384`.

### Specification: [Delegated keys](https://personalagentprotocol.org/docs/0.3/spec#delegated-keys)

- [ ] **MUST**: Companies MUST accept delegations signed with `ES256`, and SHOULD accept delegations signed with `PS384`.
- [ ] **MUST**: When verifying a Session header (5.3), the Company MUST reject, with `invalid_session`, a Session JWT without a delegation, including one signed directly with a key from `jwks_uri`, and a Session JWT whose delegation fails any of these checks.
- [ ] **MUST NOT**: So a Company MUST NOT expect a User's delegated key to stay the same between requests or Sessions, or treat a new one as a reason to reject a request.

### Specification: [5.3 Verifying the Session header](https://personalagentprotocol.org/docs/0.3/spec#session-verification)

- [ ] **SHOULD**: Companies SHOULD verify the Session header on every request that carries it.
- [ ] **MUST**: The Company MUST complete the following checks before relying on Session claims for client or User identity, ownership, continuity, or access to state, including creating or continuing a Session:
    - [ ] Fetches the client metadata from `iss` without following redirects, as the CIMD draft (§5) requires, and the public keys from its `jwks_uri` (4.1), following the address checks in section 3.
    - [ ] Verifies the JWT's delegation and signature, as Delegated keys (5.2) describes, then `typ` and the claims above: `aud` is its Company's identifier, compared character for character; `htm` and `htu` match the request as RFC 9449 §4.3 describes for DPoP proofs; and `iat` is within an acceptance window it chooses, such as one minute. The JWT never grants account access, whatever else it contains.
    - [ ] If the request carries an access token, checks that `ath` matches it, and that the token was issued to the same `client_id` as `iss`. Without an access token, `ath` MUST be absent.
    - [ ] Looks up the Session by `client_id` and `sid`. An unknown `sid` starts a signed-out Session with the verified `client_id`, User ID, and optional Agent ID. A known `sid` continues its Session, and the JWT MUST have that Session's User ID and Agent ID. It checks ended Sessions at this point too (5.5).
- [ ] **MUST**: Without an access token, `ath` MUST be absent.
- [ ] **MUST**: A known `sid` continues its Session, and the JWT MUST have that Session's User ID and Agent ID.
- [ ] **MUST NOT**: The Company MUST NOT use unverified Session claims to attribute a request to a Personal Agent, User, or Session, or to look up their state.
- [ ] **MUST**: The Company MUST reject a request without the Session header when handling it depends on Session claims.

### Specification: [Operator signatures](https://personalagentprotocol.org/docs/0.3/spec#operator-signatures)

- [ ] **MUST**: Before trusting any Session claim, the Company MUST verify the Session JWT independently (5.3).

### Specification: [5.6 Sending requests](https://personalagentprotocol.org/docs/0.3/spec#sending-requests)

- [ ] **MUST**: Companies MUST accept the Session header and access token without requiring cookies.
- [ ] **MUST NOT**: Personal Agents MUST NOT send tokens or Session JWTs in a URL, and Companies MUST NOT accept them from one.

### Recommended: [Handling secrets](https://personalagentprotocol.org/docs/0.3/guides#both-secrets)

These are secrets:

- Access tokens and refresh tokens.
- Private keys, client assertions, Session JWTs, and DPoP proofs.
- Authorization codes, PKCE code verifiers, device codes, one-time sign-in codes, browser-session codes, and credentials sent in mediated sign-in.

To handle them:

- [ ] Keep them out of logs, telemetry, error reports, model context, conversation messages, and URLs. Tokens and Session JWTs MUST NOT be sent in a URL (5.6), and tokens, Session JWTs, private keys, authorization codes, PKCE code verifiers, and device codes MUST NOT go in model context (10.2).
- [ ] Redact the `Authorization`, `Poppy-Session`, `DPoP`, and `Cookie` headers and credential fields before a request reaches a logger or tracer.
- [ ] Send `Cache-Control: no-store` on every response that carries a token or code.

### Recommended: [Signing and verifying JWTs](https://personalagentprotocol.org/docs/0.3/guides#both-signing)

Client assertions, delegations, Session JWTs, and DPoP proofs are JWTs. To sign and verify them consistently:

- [ ] Personal agents: sign Session JWTs with ES256 (MUST, 5.2). Sign client assertions and delegations with ES256, or with PS384 if you sign them blindly (10.7). Companies: accept ES256 (MUST) and PS384 (SHOULD) in client assertions and delegations (4.1, 5.2), and RS256 in client assertions. Use RSA keys of at least 2048 bits.
- [ ] Personal agents: use `token_endpoint_auth_signing_alg_values_supported` in the Company's OAuth metadata to choose a supported client-assertion algorithm. This list does not establish support for delegation signatures. The protocol has no delegation-algorithm discovery field, and `invalid_session` does not distinguish an unsupported algorithm from other failures. An agent that requires blind signing may be unable to work with a Company that doesn't support PS384. Falling back to ES256 needs a suitable published key and gives up this blind-signing mechanism; don't switch automatically when blind signing is required by the User's privacy settings.
- [ ] Reject `alg: none` and symmetric algorithms such as HS256.
- [ ] Verify client assertions and delegations only with keys from the personal agent's verified `jwks_uri` (4.1), and Session JWTs only with the key their verified delegation names in `cnf.jwk` (5.2). Ignore `jku`, `x5u`, and any other key embedded in a JWT. DPoP proofs for DPoP-bound access tokens are the one other exception: the public key in their `jwk` header is how they work.
- [ ] Check `aud` and `iat`, and `exp` on client assertions and delegations. Session JWTs have no `exp`: accept them only within your `iat` window (5.3). A client assertion has the company's issuer as its `aud`; a Session JWT has the Company's identifier (its issuer, or its HTTPS domain without one), never an endpoint URL (4.1, 5.2). Allow a small clock skew, such as 30 seconds, and reject assertions that claim a long lifetime.
- [ ] Make the `jti` of each client assertion, delegation, Session JWT, and DPoP proof at least 128 random bits, and each Session ID too.
- [ ] Personal agents: set a client assertion's `exp` at most five minutes after its `iat`.
- [ ] Companies: reject a reused client assertion `jti` from the same `client_id` until it expires, as RFC 7523 §3 allows.

### Recommended: [Operator signatures and bot defenses](https://personalagentprotocol.org/docs/0.3/guides#both-operator-signatures)

- [ ] Build the request body, any DPoP proof, and Session JWT first, then the operator signature. Cover `poppy-session` and `authorization` when present, as the spec requires. Include method, authority, path, query, and a verified content digest when the verifier relies on those components.
- [ ] Keep operator keys separate from delegated Session keys. Publishing every User's delegated key in an operator directory is not equivalent to verifying a delegation, and exposes a new key mapping.
- [ ] For a centralized agent, signing can happen where requests already pass. For on-device agents, sending requests to an authenticated operator signing service can reveal which Company each User visits. This signature profile does not provide blind signing. Do not send devices a shared operator private key to avoid that service.
- [ ] A verified operator signature establishes control of its key source. It does not establish every client metadata URL on the same origin. Verify the Session JWT's exact `iss` before accepting it as that client, then apply Company policy and account authorization.
- [ ] Test the actual edge and origin together: registration, directory caching, key rotation, accepted signature components, body handling, and forwarded authentication results. Protect the origin from forged forwarding headers. A bot-verification result is not a replay check or account grant.
- [ ] Remove the extra signature where an edge verifies delegated Session JWTs directly. Keep Company acceptance and all remaining Session and OAuth checks. The JWT covers method, URL without query, and access token, not the request body; do not assume removing an operator signature preserves any additional query or body protection it supplied.

### Recommended: [Rotating keys](https://personalagentprotocol.org/docs/0.3/guides#both-key-rotation)

- [ ] Give every key in `jwks_uri` a `kid`.
- [ ] Publish a new key in `jwks_uri` before signing with it, early enough for companies' caches to pick it up.
- [ ] Keep an old public key published until every client assertion and delegation signed with it has expired.
- [ ] Personal agents: rotate delegated keys as often as you like. Each Session JWT carries its own delegation, so companies don't depend on a delegated key lasting (5.2).
- [ ] Companies refetch `jwks_uri` when they see an unknown `kid`. The refetch happens before any signature is checked, so anyone can trigger it by naming a real personal agent and a made-up `kid`. Refetch each `jwks_uri` at most once per interval, such as 30 seconds, and count failed fetches too. Otherwise a stream of bad assertions can flood the personal agent's server.
- [ ] Rotating signing keys doesn't affect refresh tokens. They are tied to the `client_id`, not a key (4.4).

### Recommended: [Fetching metadata safely](https://personalagentprotocol.org/docs/0.3/guides#both-fetching)

Personal agents fetch `poppy.json` files, OAuth and protected resource metadata, API descriptions, and excluded-task documents. Companies fetch client metadata documents and key sets. Each fetch goes to a URL the other party controls, so:

- [ ] Set limits: a few redirects at most, a response size such as 100 KB, and a timeout of a few seconds.
- [ ] Validate HTTPS certificates. Personal agents MUST follow discovery redirects only to HTTPS URLs (section 3).
- [ ] Never send cookies, tokens, or other credentials on these fetches.
- [ ] Reject loopback, private, and link-local addresses unless you've configured them on purpose. Check the address you actually connect to, not only the one DNS returned first.
- [ ] Cache according to HTTP caching headers, within bounds you set, such as at least a minute and at most a day. The upper bound means a removed key stops being trusted.

### Recommended: [Rate limits](https://personalagentprotocol.org/docs/0.3/guides#both-rate-limits)

- [ ] Companies: limit by `client_id`, by user, and by session, so one busy personal agent or user doesn't crowd out others. Count a request against a `client_id` only after its Session JWT or client assertion's signature checks pass. Otherwise anyone can name a personal agent and use up its limit, so its real users are refused. Limit unverified requests by network instead.
- [ ] Companies: also send the `RateLimit` and `RateLimit-Policy` headers (IETF draft), so personal agents can slow down before they hit a limit.
- [ ] Personal agents: keep track of limits for each company and share them across your tasks and users, rather than letting each task find the limit on its own.
- [ ] Personal agents: prefer long polling or streaming over repeated short polls, and check for changes no more often than the task needs. Checking once a day for a price drop is usually enough.
- [ ] Personal agents: run work that isn't time-sensitive, such as checking order status in the background, outside the company's busy hours, and spread it out instead of starting it all at the same moment.

### Recommended: [Transport and JSON](https://personalagentprotocol.org/docs/0.3/guides#both-transport)

- [ ] Use TLS 1.2 or later. Prefer TLS 1.3.
- [ ] Encode JSON as UTF-8 and reject objects with duplicate member names.
- [ ] Write timestamps in RFC 3339 with a time zone offset, such as `2026-10-02T17:15:00-07:00`.
- [ ] Ignore fields you don't recognize, so later versions can add them.

### Recommended: [Choosing capabilities](https://personalagentprotocol.org/docs/0.3/guides#company-adoption)

Start with the tasks you want personal agents to accomplish and the interfaces you already have. Publish `poppy.json` with at least one of `apis`, `web`, or `agent` (MUST, 3.1). Then choose the capabilities those tasks need:

- [ ] Signed-out APIs. You can expose a catalog or other stateless API without an OAuth server. Accept the Session header personal agents send. If the endpoint uses no Session claims, it can serve requests without verifying the header (5.3).
- [ ] Session continuity. Verify Session JWTs when you want to recognize a pseudonymous user, maintain a Session cart, or connect activity across channels. Verification is required before relying on Session identity, ownership, continuity, or state (5.3). This works without OAuth.
- [ ] Account access. Add OAuth when tasks need access to a user's account. Your endpoints can rely on OAuth alone if they use no Session claims. They still validate tokens and enforce scopes and any required DPoP checks. Check your existing authorization server against what Poppy adds to OAuth and client metadata support.
- [ ] Channels and other capabilities. Offer APIs, web browsing, conversations, or a combination. Add browser join to connect website activity to a Session. Advertise excluded tasks, feedback, and extensions where they help users complete the tasks you support.

### Recommended: [Verifying personal agents](https://personalagentprotocol.org/docs/0.3/guides#company-agents)

- [ ] Fetch the `client_id` URL without following redirects. Its `client_id` MUST equal the URL you fetched (4.1).
- [ ] Cache client metadata and key sets, as described in Fetching metadata safely.
- [ ] Keep allowlists or blocklists of `client_id` values, and rate-limit session creation and new `client_id` values (4.1).
- [ ] Check whether your authorization server supports client ID metadata documents. Some do, some support them only for clients an administrator registers by URL, and some don't yet. If yours needs registration, register the personal agents you accept by their `client_id` URL and reject others with `invalid_client`, which 4.1 allows. Your OAuth integration can fetch and check the metadata document. Your resources also fetch it when verifying Session JWTs (5.3).

### Recommended: [Verifying the Session header](https://personalagentprotocol.org/docs/0.3/guides#company-session-header)

Verify Session headers generally (SHOULD, 5.3). Complete all checks before trusting Session claims for identity, ownership, continuity, or state (MUST). Conversations, Session carts, browser join, and approval ownership need that verification. A stateless catalog endpoint can ignore the header. An account endpoint can use OAuth alone if it uses no Session claims or state. It still validates the token, its scopes and audience, and any required DPoP proof. To verify reliably:

- [ ] Verify the Session header in one place, such as a gateway in front of your APIs, conversation endpoint, and browser-session `/authorize` endpoint, and pass the verified `client_id`, `sid`, user ID, and agent ID to the services behind it.
- [ ] Cache verified delegations until they expire (5.2). Key the cache by a hash of the whole delegation, such as its SHA-256, not by its `jti`, which a forged delegation could copy. Most requests then need one signature check.
- [ ] Behind proxies and load balancers, compare `htu` with the public URL the personal agent used. Build it from your configured public origin, not from the `Host` header your server receives.
- [ ] Use an acceptance window of about one minute for `iat`, plus a small clock skew.
- [ ] Rejecting a reused `jti` is optional, as it is for DPoP proofs, because servers behind one endpoint don't always share state. Without it, a copied Session JWT still works only for the same method and URL, with the same access token, and within the acceptance window. A request that changes something then relies on being idempotent, so a replay doesn't repeat it. Conversation messages already are, through their IDs (8.3).
- [ ] If you keep a replay cache keyed by `jti`, hold entries for the acceptance window and share it across every server. Otherwise a JWT accepted by one server can be replayed at another (5.3).
- [ ] Check `ath` against the access token, and that the token was issued to the JWT's `iss`. Reject an absent header when the request depends on Session claims (MUST, 5.3). Don't use an unverified `iss`, `sub`, or `sid` for attribution, rate limits by identity, cache keys, or state lookup.
- [ ] Return `invalid_session` for a failed check, and keep access token errors in `WWW-Authenticate`, as OAuth does (section 7).
- [ ] Binding access tokens with DPoP is your choice (4.5). If you do, verify the proof as RFC 9449 describes, separately from the Session JWT. If your authorization server can't issue DPoP-bound tokens, verifying the Session JWT and its `ath` binds the token to the personal agent's key. Endpoints that skip Session verification lose that extra protection.
- [ ] At an MCP server, accept a token issued for its `resource` only at that server (MUST, section 7). Accept the Session header there too, if you want its calls tied to sessions. Signed-out calls that use no Session state can work without verification.
- [ ] Serve personal agent conversations only from your conversation endpoint (8.2). If your website chat or other channels can open the same conversations, they may not check the Session header, and anyone with a copied token could read them there.

### Recommended: [Sessions](https://personalagentprotocol.org/docs/0.3/guides#company-sessions)

A session is named by the `client_id` and `sid` of its Session JWTs (5.3). Keep the Poppy session record at your resources, alongside your existing OAuth integration:

- [ ] Record the user ID and agent ID a session starts with, and reject later Session JWTs for it with different ones (5.3).
- [ ] Your authorization server doesn't see the Session header. Sign-in and refresh are plain OAuth, and a session is signed in on each request that carries an access token (5.4).
- [ ] Remember the `sid`s of sessions you end, and answer them with `invalid_session` (5.5). Choose a retention period that fits your session lifetimes.
- [ ] Use separate sessions for separate accounts. If your policy refuses a second account in a session, answer with `invalid_session` (5.4).
- [ ] Don't expect a user's delegated key to stay the same (MUST NOT, 5.2), and don't store anything by it.

### Recommended: [Internal services](https://personalagentprotocol.org/docs/0.3/guides#company-internal)

- [ ] Don't forward an access token or Session JWT from one of your services to another.
- [ ] Verify them at the edge, then pass the verified `client_id`, session, user ID, account, and scopes to internal services through a gateway or service credentials.
- [ ] Internal credentials used for a request shouldn't allow more than the access token does.

### Recommended: [Hosting several companies](https://personalagentprotocol.org/docs/0.3/guides#company-hosting)

- [ ] Publish metadata for each issuer at its own URL, such as `https://auth.platform.example/.well-known/oauth-authorization-server/outfitters` (3.2). Its `issuer` is the full issuer, and its `protected_resources` lists only that company's storefronts and resources, such as `https://outfitters.example`.
- [ ] Publish protected resource metadata on each storefront's domain, with its company's issuer in `authorization_servers` (3.2).
- [ ] Serve each storefront's `poppy.json` on the storefront's own domain. A document redirected to the platform's domain speaks for the platform, not the storefront (3.1).
- [ ] Companies can share a token endpoint, servers, and signing keys. Only the issuer decides which company a token belongs to.
- [ ] Record the issuer with every session and token, and check it on every request. An access token, refresh token, or Session JWT for Outfitters must not work at Books, even when both are served by the same code.
- [ ] Don't use one company's records for another. A user's sessions, user IDs, and accounts at one company are unknown to every other company the platform hosts.

## Interfaces

### Specification: [6. Web browsing](https://personalagentprotocol.org/docs/0.3/spec#web-browsing)

- [ ] **MUST**: The Company MUST make the code unguessable and short-lived, and each code works once.
- [ ] **MUST**: The Company MUST tie the code to the browser that loaded the page with a cookie set in the same response, so that only that browser can submit it.
- [ ] **MUST NOT**: The cookie MUST NOT be sent with a form submitted from another site, and other hosts on the Company's domain MUST NOT be able to set it.
- [ ] **MUST NOT**: The page MUST NOT be stored by caches, framed by other pages, or kept as a window reference by the page that opened it.
- [ ] **MUST NOT**: Loading the page MUST NOT start, end, or change any Session, or change the browser's other cookies.
- [ ] **MUST**: The Company MUST check that:
    - [ ] The request has the cookie from step 1, and it matches `code`.
    - [ ] The code was authorized in step 2, hasn't expired, and hasn't been submitted before. A code is used by the first request that submits it, whatever the result.
- [ ] **MUST**: MUST be set only in step 3.
- [ ] **MUST**: MUST act for the account and scopes authorized in step 2, and MUST stop acting for the account when the User signs out or disconnects the Personal Agent (5.5).
- [ ] **MUST NOT**: MUST NOT outlive the Session.
- [ ] **SHOULD**: When the website refuses an action because the Session lacks a scope, it SHOULD show a visible error message that names the missing scopes, so the Personal Agent can request them (5.4).

### Specification: [7. APIs](https://personalagentprotocol.org/docs/0.3/spec#apis)

- [ ] **MUST**: Every listed API MUST accept the Session header (5.2) and, when the Company offers account access, its access tokens (4.5), and enforce their scopes.
- [ ] **MUST**: The `resource` in the server's protected resource metadata MUST equal that `url`.
- [ ] **MUST**: The Company MUST reject it elsewhere.
- [ ] **MUST**: It names the Company's issuer, not the Personal Agent: an MCP server that offers account access MUST include the Company's issuer in its `authorization_servers`.

### Specification: [8.2 Requests](https://personalagentprotocol.org/docs/0.3/spec#conversation-requests)

- [ ] **MUST**: The Company MUST reject requests from any other `client_id`, User, or account.
- [ ] **MUST NOT**: Beyond these rules, the side that chooses an ID decides its format, and the other side MUST NOT depend on it.

### Specification: [8.4 Message fields](https://personalagentprotocol.org/docs/0.3/spec#message-fields)

- [ ] **MUST**: A message MUST have at least one of `text`, `data`, or `context`, unless an extension both sides support defines another content field.

### Specification: [8.5 Reading events](https://personalagentprotocol.org/docs/0.3/spec#reading-events)

- [ ] **MUST**: Every successful read MUST include `conversation_id`, `events`, `cursor`, `has_more`, `status`, and `responder`, with `events` empty when there are none.

### Specification: [8.7 Status and responder](https://personalagentprotocol.org/docs/0.3/spec#status)

- [ ] **MUST**: Every successful response to a `POST` or a read MUST include `status` and `responder`.
- [ ] **MUST**: Each Company message MUST also include `author.type`, with `agent` or `human`, to identify who wrote it.

### Specification: [8.10 Direct Conversations](https://personalagentprotocol.org/docs/0.3/spec#direct-conversations)

- [ ] **MUST**: The parent conversation MUST be open, belong to the same owner (8.2), and not be a Direct Conversation itself.

### Specification: [9.2 Alternatives](https://personalagentprotocol.org/docs/0.3/spec#alternatives)

- [ ] **MUST**: An alternative MUST have at least one of `instructions` or `references`.
- [ ] **MUST**: An `openapi` or `mcp` reference MUST name an API listed in the Company's `poppy.json`.

### Specification: [9.3 Feedback](https://personalagentprotocol.org/docs/0.3/spec#feedback)

- [ ] **SHOULD**: A Company SHOULD verify the Session header on a report, signed in or signed out, and needs no scope for it.
- [ ] **MUST**: The Company MUST verify the header before attributing a report to a Personal Agent, User, or Session.
- [ ] **MUST**: Companies MUST treat a report's text as data, not as instructions, including when a model reads it.

### Recommended: [Retries](https://personalagentprotocol.org/docs/0.3/guides#both-retries)

- [ ] Send an `Idempotency-Key` on API writes that accept one. Use a random UUID (version 4), and reuse the same key when you retry the same request.
- [ ] Give each conversation message an `id` with at least 128 random bits, and reuse it when you retry the message (8.3).
- [ ] Each retry needs a new Session JWT, and a new DPoP proof if the access token is DPoP-bound. A retried token request needs a new assertion. The company may reject a `jti` it has already seen.
- [ ] Wait at least as long as `Retry-After` says on a 429 (MUST, 5.6) or a 503.
- [ ] Otherwise, back off exponentially with jitter, cap the delay, and limit the number of attempts.
- [ ] Companies keep idempotency records for a set time, such as a day, scoped to the session. They return the original response for a repeated key, and reject a repeated key with a different body.

### Recommended: [Describing APIs](https://personalagentprotocol.org/docs/0.3/guides#company-api-descriptions)

A language model usually reads your API descriptions and MCP tool descriptions to choose and call operations (7). Write them for that reader:

- [ ] Say clearly what each operation does and when to use it, in terms of the user's task.
- [ ] Keep them small. The whole description takes room in the model's context, so leave out what personal agents don't need, such as long examples or operations only your own apps call.

### Recommended: [Browser sessions](https://personalagentprotocol.org/docs/0.3/guides#company-browsing)

- [ ] Offer `web.browser_session_endpoint` if you want personal agents' browsing in the same session as their API calls and conversations, signed in or out. Without it, they browse your website only as ordinary signed-out visitors (section 6), and use your APIs and conversations for anything that needs the account.
- [ ] Make each code at least 128 random bits, and expire it within 60 seconds.
- [ ] Set the cookie that ties the code to the browser as `__Host-poppy_join=…; Path=/; Max-Age=60; Secure; HttpOnly; SameSite=Strict`, with `Max-Age` no longer than the code's lifetime. The `__Host-` prefix keeps other hosts on your domain from setting it, and `SameSite=Strict` keeps a form on another site from sending it (RFC 6265bis).
- [ ] Send the page with `Cache-Control: no-store`, `Content-Security-Policy: frame-ancestors 'none'`, and `Cross-Origin-Opener-Policy: same-origin`, so caches don't keep it, other pages can't frame it, and the page that opened it can't keep a reference to its window (section 6).
- [ ] Answer a successful form with `303 See Other`, and a failed one with 400, or 429 when the browser sends too many requests.
- [ ] Don't log the endpoint's responses or request bodies. They contain browser-session codes.
- [ ] Keep a short-lived record for each code: whether it was authorized, for which session and account, and whether it was submitted. A store with a time to live of the code's lifetime works.
- [ ] Make the session's cookie `Secure` and `HttpOnly`, and use the `__Host-` prefix unless it has to cover several hosts. Limit it to the hosts personal agents need, such as your main site, rather than your whole domain.
- [ ] Look up the session on each request, so sign-out and scope changes take effect on the website right away.

### Recommended: [Conversations](https://personalagentprotocol.org/docs/0.3/guides#company-conversations)

- [ ] Let your company agent do everything customers can do by phone, as fully as you can, so personal agents have no reason to call.
- [ ] Put structured details in `data`, not JSON or other markup in `text` (8.4).
- [ ] Write for whoever is on the other side (8.8). With a personal agent, skip greetings and small talk and keep text short. With the user, use plain sentences, a pace they can follow, and details in `text` rather than only in `data`. In a direct conversation, reply as you would to the customer on your own channels.
- [ ] Keep a conversation's events for at least 30 days, so a personal agent that reconnects rarely hits `cursor_expired` (8.5).
- [ ] On a stream with nothing to send, send an SSE comment every 15 to 30 seconds, so proxies don't close it (8.6).
- [ ] When a session signs out, answer requests without an access token on its conversations that used the account with a 401 challenge, including reads of their events, so their account details can't be read signed out (5.5, 8.11). Leave them open, so the user can sign in again and continue, or close them if your policy is to clear everything at sign-out.
- [ ] Before closing an inactive conversation, say so in a message (8.12).
- [ ] When you send an `authorization` event, also ask in a message, so a user in a direct conversation sees the request (8.11).
- [ ] When sign-in can verify the user, send an `authorization` event (8.11) rather than asking for identifying details in messages, such as a date of birth, part of an account number, or a code sent by text. Sign-in proves who the user is, and it keeps codes and personal details out of messages and model context (Handling secrets).
- [ ] Give the people a conversation is handed to (8.9) the same way to ask for sign-in, so they don't fall back to verification questions.

### Recommended: [Excluded tasks and feedback](https://personalagentprotocol.org/docs/0.3/guides#company-excluded-tasks)

- [ ] List the tasks you've chosen not to offer to personal agents, such as ones you allow only in your app for security or regulatory reasons (9.1). Personal agents then stop looking for a way to do them, and don't send feedback about them.
- [ ] Write each task the way a customer would ask for it, such as "Send a wire transfer".
- [ ] Give an alternative whenever there is one. Link to the page, or the screen in your app, where the user can do the task (9.2).
- [ ] Set caching headers on the document, and update it when you add or remove a task.
- [ ] When a feedback report asks for a task you do offer, answer with an alternative that says how, so the personal agent can finish the task (9.3).
- [ ] Take feedback only at `feedback.endpoint` (9.3). Don't offer a second feedback operation in your APIs, so personal agents don't have to choose between them.

### Recommended: [Error messages](https://personalagentprotocol.org/docs/0.3/guides#company-errors)

- [ ] Keep `error_description` and other error text free of account details and other users' data.
- [ ] Return the same error for "doesn't exist" and "belongs to someone else", as `conversation_not_found` does (8.13).

## Sign-in and accounts

### Specification: [4.2 Direct Sign-In](https://personalagentprotocol.org/docs/0.3/spec#direct-sign-in)

- [ ] **MUST**: `redirect_uri` MUST exactly match an entry in the Personal Agent's `redirect_uris` (4.1), except for the port of a loopback redirect URI, as RFC 8252 §7.3 describes.

### Specification: [4.3 Device Sign-In](https://personalagentprotocol.org/docs/0.3/spec#device-sign-in)

- [ ] **MUST**: Companies that offer Device Sign-In and Personal Agents that use it MUST follow the best practices in RFC 10027 (BCP 247) §2.
- [ ] **MUST NOT**: Opening the link MUST NOT approve the request by itself.

### Specification: [4.7 Scopes and token responses](https://personalagentprotocol.org/docs/0.3/spec#scopes)

- [ ] **SHOULD**: The Company SHOULD list the scopes it supports in `scopes_supported` in its OAuth server metadata (3.2).
- [ ] **SHOULD**: The Company SHOULD describe each scope it offers Personal Agents, so the Personal Agent can choose the ones a task needs: in the scopes of an OAuth 2.0 security scheme in an OpenAPI description it lists (section 7), or otherwise in `auth.scopes`.
- [ ] **MUST**: A Company MUST include both fields in each entry.
- [ ] **MUST NOT**: The Company MUST NOT grant scopes beyond those requested.

### Mediated Sign-In: [1. Introduction](https://personalagentprotocol.org/docs/0.3/extensions/mediated-sign-in#intro)

- [ ] **SHOULD**: A Company SHOULD offer Mediated Sign-In only until it can add Direct or Device Sign-In, and SHOULD stop offering it once those cover the scopes it grants.

### Mediated Sign-In: [2. Advertising support](https://personalagentprotocol.org/docs/0.3/extensions/mediated-sign-in#support)

- [ ] **MUST NOT**: It MUST NOT be `grant_type`, `scope`, `resource`, a client authentication parameter such as `client_id` or `client_assertion`, or a parameter this extension defines, such as `sign_in_id`.
- [ ] **SHOULD**: The Company SHOULD also include them in `scopes_supported`.
- [ ] **MUST NOT**: The Company MUST NOT grant scopes beyond those requested and listed here.

### Recommended: [Token lifetimes and sign-out](https://personalagentprotocol.org/docs/0.3/guides#company-lifetimes)

- [ ] Give access tokens a lifetime of hours, not days.
- [ ] At sign-out, invalidate the access tokens issued under the revoked refresh token, as RFC 7009 §2.1 describes, or check on each request whether the authorization is still active, so sign-out takes effect right away. If you can do neither, keep access tokens to a few minutes (5.5).
- [ ] Don't stop accepted work because the access token that started it expired. A job can outlast the token.
- [ ] Where work in progress can take consequential actions on the user's account, such as payments or changes that are hard to undo, tie it to the refresh token, so revoking access stops it right away.
- [ ] Give refresh tokens a lifetime that fits the account, such as 90 days, and expire ones that go unused sooner.
- [ ] Revoke a user's refresh tokens when they reset their password or you suspect the account is compromised.

### Recommended: [Describing scopes](https://personalagentprotocol.org/docs/0.3/guides#company-scope-descriptions)

Describe the scopes you offer personal agents, in the OAuth security scheme of an OpenAPI description you list or in `auth.scopes` (SHOULD, 4.7). Personal agents read them to choose scopes, and a language model often does the choosing:

- [ ] Say what the scope lets the personal agent see or do, in words a user understands.
- [ ] Be specific enough for a model to match a task to the scopes it needs. "See your orders and returns" works better than "Read access".
- [ ] Say whether the scope only reads, and whether a write scope also allows reading.
- [ ] Say in words which actions can't be undone and what personal data the scope shows.
- [ ] Give each scope its hints in `auth.scope_hints` (4.7). Judge each scope by the most consequential operation that requires it: one operation that can't be undone makes the whole scope `irreversible`. When you're unsure about a scope, leave it out of `auth.scope_hints` rather than guess.
- [ ] Splitting a scope can earn it a better hint. A personal agent may request `orders:read` freely but ask the user first before requesting a scope that can cancel orders.

### Recommended: [Consent pages](https://personalagentprotocol.org/docs/0.3/guides#company-consent)

The page where the user approves access, in direct and device sign-in (4.2, 4.3):

- [ ] Show the personal agent's name and logo, and the domain of its `client_id`. The personal agent chooses its own name, so the domain is what the user can trust.
- [ ] Show the account being connected, the requested scopes in plain language, and how long access lasts. Group related scopes rather than listing their names.
- [ ] Point out scopes that allow changes that can't be undone or that show personal data, the scopes your `auth.scope_hints` mark `irreversible` or with `personal_data`.
- [ ] When the user already granted some of the scopes, show which ones are new, so the user doesn't review the whole list again. A personal agent that needs more access requests every scope it needs again (4.7).
- [ ] Protect the page against cross-site request forgery, and against framing by other sites with `Content-Security-Policy: frame-ancestors`.
- [ ] `redirect_uri` MUST exactly match an entry in the personal agent's `redirect_uris` (4.2).
- [ ] Accept PKCE with `S256` only, and reject `plain`.
- [ ] Return `iss` in every redirect, success or error (4.2). Personal agents reject a redirect without it.
- [ ] For extra protection, support Pushed Authorization Requests (RFC 9126).

### Recommended: [Device sign-in](https://personalagentprotocol.org/docs/0.3/guides#company-device)

- [ ] Follow the best practices for cross-device flows in RFC 10027 §2 (MUST, 4.3): assess the risk before offering device sign-in, and choose mitigations from its §6.1, such as short-lived single-use codes, rate limits, limited scopes, and a consent page that says which personal agent is asking and tells the user to decline a code they didn't ask for.
- [ ] Opening the link MUST NOT approve the request by itself (4.3). The same goes for scanning the QR code. The user signs in and approves on the page.
- [ ] Ask the user to confirm that the code on the page matches the one the personal agent shows.
- [ ] Return `slow_down` to personal agents that poll faster than `interval`, and limit wrong `user_code` entries.
- [ ] Keep `expires_in` short, such as 10 minutes.

### Recommended: [Mediated sign-in](https://personalagentprotocol.org/docs/0.3/guides#company-mediated)

If you offer mediated sign-in, protect the credentials you accept (Mediated Sign-In 6):

- [ ] Rate-limit attempts by account, by `client_id`, and by network address, and cap wrong one-time codes.
- [ ] Require a one-time code when a sign-in looks unusual, including a personal agent's first mediated sign-in after the user disconnected it.
- [ ] Return the same `invalid_grant` error for an unknown account and a wrong password, so responses don't reveal whether an account exists.
- [ ] Never store raw credentials or codes, including in logs, traces, and idempotency records.
- [ ] Tell the user, for example by email, when a personal agent signs in.

### Recommended: [Account settings](https://personalagentprotocol.org/docs/0.3/guides#company-account-settings)

- [ ] In account settings, list each connected personal agent with its name, domain, scopes, and when it was last used.
- [ ] Offer a control to disconnect each one. Disconnecting revokes its refresh tokens and access tokens, and its sessions continue signed out (5.5).

### Recommended: [Enforcing scopes everywhere](https://personalagentprotocol.org/docs/0.3/guides#company-scopes)

- [ ] Apply the same scope rules on your website, APIs, company agent, and live agents. One shared check that every channel calls is easiest to keep consistent.
- [ ] Have the company agent's tools check the token's scopes on every call. Don't rely on the model to decide.
- [ ] Give live agents' tools the same checks, so a person can't make a change the token doesn't allow (8.11).
- [ ] Check read and write scopes separately. If a write scope also allows reading, say so in its description.
- [ ] When your website refuses an action for a missing scope, show an error that names the scopes (SHOULD, section 6).

## Extensions

### Specification: [3.3 Extensions](https://personalagentprotocol.org/docs/0.3/spec#extensions)

- [ ] **MUST**: Anyone else MUST start an extension's name with a domain they control, such as `example.com/gift-wrap`.
- [ ] **MUST**: Personal Agents and Companies MUST ignore extensions they don't support and fields they don't recognize, so either side can work with the other under this specification alone.

### Operations: [2. Advertising support](https://personalagentprotocol.org/docs/0.3/extensions/operations#support)

- [ ] **MUST NOT**: A Company MUST NOT return operations to a Personal Agent that doesn't list that version.

### Operations: [3. The operation](https://personalagentprotocol.org/docs/0.3/extensions/operations#operation-object)

- [ ] **MUST NOT**: It stays the same when the terms change (see "New terms"), and the Company MUST NOT use it for another action.
- [ ] **MUST**: Everything that affects the action, such as what it changes, any amount, date, or recipient, or a condition for cancelling, MUST be in the revision's `summary`, and in `terms` if present.
- [ ] **MUST**: The Company MUST perform only what the approved revision describes, and MUST NOT start the action before it receives an approval for it.
- [ ] **MUST NOT**: It MUST NOT give two different sets of terms the same `revision`, so an approval of one revision never applies to other terms.
- [ ] **MUST**: Whichever revision is approved, the Company MUST perform each operation at most once (7).
- [ ] **SHOULD**: `expires_at` SHOULD leave the User long enough to read the terms and decide, unless the Company can't hold the terms that long, such as a price or a seat that can sell out.

### Operations: [6. Sending the approval](https://personalagentprotocol.org/docs/0.3/extensions/operations#sending-approval)

- [ ] **MUST**: Companies MUST ignore members of `Poppy-Approval` they don't recognize, so later versions can add members.
- [ ] **MUST**: After the Session header checks in spec 5.3 and the token checks in spec 7, the Company MUST make the following checks before performing the action.
- [ ] **SHOULD**: It SHOULD make them in this order:
    - [ ] The Session can approve the operation (3). If it can't, the Company handles the request as if it had no approval.
    - [ ] The operation hasn't been performed already. If it has, or is being performed, the Company responds as section 7 describes.
    - [ ] The `revision` is one the Company returned for this operation, it hasn't expired, and the request asks for exactly what it describes. The API request or tool call is the one that returned the operation, and in a conversation, the operation is the conversation's.
- [ ] **MUST NOT**: The Company MUST NOT let a different internal check order change which Session can approve, the response for a request without valid approval, or the retry and at-most-once behavior in section 7.
- [ ] **MUST NOT**: A Company MUST NOT answer an approval with the revision it names, so a Personal Agent never retries the same approval in a loop.

### Operations: [7. Retries and at most once](https://personalagentprotocol.org/docs/0.3/extensions/operations#at-most-once)

- [ ] **MUST**: The Company MUST perform each operation at most once, however many times its approval is sent.
- [ ] **MUST**: The Company MUST remember that it performed an operation at least until the approved revision's `expires_at`, and while it is being performed.
- [ ] **MUST NOT**: While an operation is being performed, or the Company doesn't know whether it took effect, for example after a timeout in one of its own systems, the Company MUST NOT respond as if it failed.

### Recommended: [Operations](https://personalagentprotocol.org/docs/0.3/guides#company-operations)

When you offer the Operations extension:

- [ ] Ask for approval for actions with a business effect that the user would want to confirm, such as ones that cost money or can't be undone. Don't ask for routine changes the user already asked for in so many words, such as updating a saved address.
- [ ] Write the `summary` so it stands alone: what will happen, to what, and any cost, date, or condition. Use bold for what matters most, such as the amount, and keep links out of it. Personal agents show it to users as is (Operations 3).
- [ ] Name the keys of `terms` after the fields of the request or of your API's resources, such as `order_id`, so personal agents can compare them with what they asked for (Operations 3).
- [ ] Say in your OpenAPI description which endpoints can return `approval_required` (Operations 4).
- [ ] To let users allow some actions in advance, such as exchanges for a different size that cost under $20, don't return operations for those actions. You can offer your own API or tool for users to set such rules. Make setting a rule an operation itself, so the user approves the exact rule.
- [ ] Choose `expires_at` for each kind of action. Give the user at least 15 minutes, and longer for terms that don't change, such as cancelling a subscription at the end of the month. Keep it short when you hold something for the user, such as a seat or a sale price (Operations 3).
- [ ] Keep your record of a performed operation until its approved revision expires, and no longer than you need to. A store with a time to live set from `expires_at` works (Operations 7).
- [ ] To avoid storing operations nobody has approved, compute them from the request (Operations 3). Derive the `operation_id` from your record of the action, such as `exchange:ord_7Hk2:itm_4Qa` or a hash of it. Make the `revision` the expiry as a Unix time and an HMAC-SHA256 over the `operation_id`, the method, URL, and canonical body or the tool's arguments, the `summary`, the `terms`, and the expiry, with a key kept like your other signing keys. When the request comes back with an approval, compute the HMAC again, compare it in constant time, and check the expiry. If you store operations instead, store each revision's terms with such a fingerprint of the request, so you can check that a request with an approval asks for exactly what was approved (Operations 6).
- [ ] When you call another system to perform the action, such as a payment processor or a warehouse, derive its idempotency key from the operation ID. A retry then can't perform the action twice downstream either.
- [ ] If a downstream call times out, ask that system whether the action happened, using your business reference, before trying again. Until you know, answer retries with 503 and `Retry-After` (Operations 7).
- [ ] Keep a record of each approval: the operation, revision, `client_id`, account, and time. It shows what the personal agent stated the user approved (Operations 8.1).
