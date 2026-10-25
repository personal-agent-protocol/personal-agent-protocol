# Company checklist

Generated from the Personal Agent Protocol docs, draft 0.3. It lists every
requirement on the Company in the specification and the Operations extension, and the guides'
recommendations for companies, grouped by milestone. Go through the sections for the
milestones and features in your design. The validator checks some of these. The rest need a
review or a manual test.

Requirements that apply to both parties are included. Requirements only on Personal Agents
are left out.

## Foundation

### Specification: [3. Discovery](https://personalagentprotocol.org/docs/0.3/spec#discovery)

- [ ] **MUST**: A Company MUST publish its `poppy.json` document at `https://{domain}/.well-known/poppy.json` over HTTPS, where `{domain}` is the Company's domain or a subdomain it controls.
- [ ] **MUST**: Every URL this protocol defines or exchanges MUST be an HTTPS URL: in `poppy.json`, in authorization server and protected resource metadata, in client metadata documents (4.1), in extensions, and in assertions, proofs, and responses.
- [ ] **MUST NOT**: Personal Agents and Companies MUST NOT connect to a loopback, private, or link-local address for a URL the other party gave them, unless they were configured to on purpose.

### Specification: [3.1 Fields](https://personalagentprotocol.org/docs/0.3/spec#fields)

- [ ] **MUST**: `domain` MUST be the host that serves the document, after any redirects.

### Specification: [3.2 OAuth server](https://personalagentprotocol.org/docs/0.3/spec#oauth-server)

- [ ] **MUST**: Their documents MUST have the same `auth`, which describes the issuer.
- [ ] **MUST**: An issuer MUST represent exactly one Company.
- [ ] **MUST**: A provider that hosts several Companies MUST give each its own issuer, such as `https://auth.provider.example/shop-a`, even when they share servers.
- [ ] **MUST**: The issuer MUST publish OAuth Authorization Server Metadata (RFC 8414), and `protected_resources` in it (RFC 9728 §4) MUST list `https://{domain}` for every domain whose `poppy.json` names the issuer, exactly in that form: the scheme and host only, with no path, port, or trailing slash, like the canonical server URI of the MCP authorization specification.
- [ ] **MUST**: Required, and it MUST include `urn:ietf:params:oauth:grant-type:jwt-bearer` (4.2) and `refresh_token` (4.8).
- [ ] **MUST**: It MUST include `urn:ietf:params:oauth:grant-type:token-exchange` if the Company lists an MCP server that doesn't support DPoP (4.3).
- [ ] **MUST**: Required if the Company offers any type of sign-in, and it MUST then include every account scope a Personal Agent can request (4.4).
- [ ] **MUST**: Companies MUST accept DPoP Proofs (4.3) signed with `ES256`, so every Personal Agent has an algorithm that works at every Company.
- [ ] **MUST**: A Company MAY list the algorithms it accepts in `dpop_signing_alg_values_supported`, as RFC 9449 §5.1 defines, and the list MUST then include `ES256`.

### Specification: [4.1 Agent identity](https://personalagentprotocol.org/docs/0.3/spec#agent-identity)

- [ ] **MUST**: Companies MUST reject a client assertion with any other `aud`, compared character for character, including their token endpoint URL.

### Specification: [4.2 Starting a Session](https://personalagentprotocol.org/docs/0.3/spec#starting-sessions)

- [ ] **MUST**: As with the client assertion (4.1), the Company MUST reject any other `aud`, compared character for character.
- [ ] **MUST**: The Company MUST reject a `jti` it has already seen from the same `client_id` until the assertion expires, so a copied assertion can't be used again.
- [ ] **MUST**: The Company chooses the value, and it MUST be greater than 0.
- [ ] **SHOULD**: Session Tokens SHOULD last hours, not days.
- [ ] **SHOULD**: To prevent that, a Company SHOULD remember the keys of the Sessions it ended, for as long as it chooses, and reject them with `invalid_grant`.
- [ ] **MUST**: If it does, it MUST encrypt the token.

### Specification: [4.3 Using Session Tokens](https://personalagentprotocol.org/docs/0.3/spec#sending-tokens)

- [ ] **MUST**: Companies MUST require DPoP everywhere else (below).
- [ ] **MUST**: Companies MUST support `dpop_jkt` (RFC 9449 §10), and Personal Agents MUST bind the authorization code in Direct Sign-In to the Session Key (4.5).
- [ ] **MUST**: The Company MUST validate every proof as RFC 9449 §4.3 describes.
- [ ] **MUST**: At the token endpoint, the Company MUST reject a proof whose `jti` it has already accepted within the acceptance window, because a replayed proof there could get a new token.
- [ ] **MUST NOT**: The Company MUST NOT issue a Personal Agent a Bearer Session Token any other way.
- [ ] **MUST**: Companies MUST accept a Bearer Session Token only at the MCP server whose `url` equals its `resource`, and MUST reject it at every other endpoint, including other paths on the same host.
- [ ] **MUST**: Everywhere else, Companies MUST require DPoP, and MUST reject a DPoP Session Token sent with the `Bearer` scheme (RFC 9449 §7.1).
- [ ] **SHOULD**: New MCP servers SHOULD support DPoP.
- [ ] **MUST**: An MCP server that supports DPoP MUST list `ES256` in its `dpop_signing_alg_values_supported`, and Personal Agents sign proofs for it with `ES256` or with an algorithm from that list.
- [ ] **MUST**: A Company that lists an MCP server that doesn't support DPoP MUST support the token exchange grant, and list `urn:ietf:params:oauth:grant-type:token-exchange` in `grant_types_supported` (3.2).
- [ ] **MUST**: Companies MUST accept the token in the `Authorization` header without requiring cookies.
- [ ] **MUST NOT**: Personal Agents MUST NOT send tokens in a URL, and Companies MUST NOT accept them from one.

### Recommended: [Handling secrets](https://personalagentprotocol.org/docs/0.3/guides#both-secrets)

These are secrets:

- Session tokens and account tokens.
- Private keys, client assertions, session assertions, and DPoP proofs.
- Authorization codes, PKCE code verifiers, device codes, one-time sign-in codes, browser-session codes, and credentials sent in mediated sign-in.

To handle them:

- [ ] Keep them out of logs, telemetry, error reports, model context, conversation messages, and URLs. Tokens MUST NOT be sent in a URL (4.3), account tokens MUST NOT go in model context, messages, logs, or URLs (4.8), and tokens, private keys, authorization codes, PKCE code verifiers, and device codes MUST NOT go in model context (9.2).
- [ ] Redact the `Authorization`, `DPoP`, and `Cookie` headers and credential fields before a request reaches a logger or tracer.
- [ ] Send `Cache-Control: no-store` on every response that carries a token or code.

### Recommended: [Signing and verifying JWTs](https://personalagentprotocol.org/docs/0.3/guides#both-signing)

Assertions and DPoP proofs are JWTs. To sign and verify them consistently:

- [ ] Personal agents: sign assertions and DPoP proofs with ES256. Every company accepts it in proofs (MUST, 3.2). Companies: accept ES256 and RS256 in assertions. Use RSA keys of at least 2048 bits.
- [ ] Reject `alg: none` and symmetric algorithms such as HS256.
- [ ] Verify assertions only with keys from the personal agent's verified `jwks_uri` (4.1). Ignore `jku`, `x5u`, and any key embedded in an assertion. DPoP proofs are the one exception: the public key in their `jwk` header is how they work (4.3).
- [ ] Check `aud`, `exp`, and `iat`. A client assertion or Session assertion has the company's `auth.issuer` as its `aud`, never an endpoint URL (4.1). Allow a small clock skew, such as 30 seconds, and reject assertions that claim a long lifetime.
- [ ] Make each `jti` at least 128 random bits.

### Recommended: [Rotating keys](https://personalagentprotocol.org/docs/0.3/guides#both-key-rotation)

- [ ] Give every key a `kid`.
- [ ] Publish a new key in `jwks_uri` before signing with it, early enough for companies' caches to pick it up.
- [ ] Keep an old public key published until everything signed with it has expired.
- [ ] Companies refetch `jwks_uri` when they see an unknown `kid`. The refetch happens before any signature is checked, so anyone can trigger it by naming a real personal agent and a made-up `kid`. Refetch each `jwks_uri` at most once per interval, such as 30 seconds, and count failed fetches too. Otherwise a stream of bad assertions can flood the personal agent's server.
- [ ] Rotating signing keys doesn't affect account tokens. They are tied to the `client_id`, not a key (4.8).

### Recommended: [Fetching metadata safely](https://personalagentprotocol.org/docs/0.3/guides#both-fetching)

Personal agents fetch `poppy.json` files and API descriptions. Companies fetch client metadata documents and key sets. Each fetch goes to a URL the other party controls, so:

- [ ] Set limits: a few redirects at most, a response size such as 100 KB, and a timeout of a few seconds.
- [ ] Validate HTTPS certificates. Personal agents MUST follow discovery redirects only to HTTPS URLs (section 3).
- [ ] Never send cookies, tokens, or other credentials on these fetches.
- [ ] Reject loopback, private, and link-local addresses unless you've configured them on purpose. Check the address you actually connect to, not only the one DNS returned first.
- [ ] Cache according to HTTP caching headers, within bounds you set, such as at least a minute and at most a day. The upper bound means a removed key stops being trusted.

### Recommended: [Rate limits](https://personalagentprotocol.org/docs/0.3/guides#both-rate-limits)

- [ ] Companies: limit by `client_id`, by user, and by session, so one busy personal agent or user doesn't crowd out others. Count a request against a `client_id` only after its client assertion's signature checks pass. Otherwise anyone can name a personal agent and use up its limit, so its real users are refused. Limit unverified requests by network instead.
- [ ] Companies: also send the `RateLimit` and `RateLimit-Policy` headers (IETF draft), so personal agents can slow down before they hit a limit.
- [ ] Personal agents: keep track of limits for each company and share them across your tasks and users, rather than letting each task find the limit on its own.
- [ ] Personal agents: prefer long polling or streaming over repeated short polls, and check for changes no more often than the task needs. Checking once a day for a price drop is usually enough.
- [ ] Personal agents: run work that isn't time-sensitive, such as checking order status in the background, outside the company's busy hours, and spread it out instead of starting it all at the same moment.

### Recommended: [Transport and JSON](https://personalagentprotocol.org/docs/0.3/guides#both-transport)

- [ ] Use TLS 1.2 or later. Prefer TLS 1.3.
- [ ] Encode JSON as UTF-8 and reject objects with duplicate member names.
- [ ] Write timestamps in RFC 3339 with a time zone offset, such as `2026-10-02T17:15:00-07:00`.
- [ ] Ignore fields you don't recognize, so later versions can add them.

### Recommended: [Verifying personal agents](https://personalagentprotocol.org/docs/0.3/guides#company-agents)

- [ ] Fetch the `client_id` URL without following redirects. Its `client_id` MUST equal the URL you fetched (4.1).
- [ ] Cache client metadata and key sets, as described in Fetching metadata safely.
- [ ] Keep allowlists or blocklists of `client_id` values, and rate-limit session creation and new `client_id` values (4.1).

### Recommended: [Verifying DPoP](https://personalagentprotocol.org/docs/0.3/guides#company-dpop)

Section 4.3 lists the checks you MUST make on every proof. To make them reliably:

- [ ] Check that `typ` is `dpop+jwt`, that `alg` is ES256 or one you list in `dpop_signing_alg_values_supported` (3.2), and that `jwk` holds only a public key.
- [ ] Keep a replay cache keyed by `jti`, holding entries for the acceptance window. Your token endpoint MUST reject a reused `jti` (4.3), so share its cache across every server behind it. Your APIs and conversation endpoint can have one too, ideally shared the same way. Otherwise a proof accepted by one server can be replayed at another.
- [ ] Behind proxies and load balancers, compare `htu` with the public URL the personal agent used. Build it from your configured public origin, not from the `Host` header your server receives.
- [ ] Use an acceptance window of about one minute, plus a small clock skew.
- [ ] Require nonces if you want proofs that can't be made in advance. A nonce stays valid for a while, so it doesn't stop a proof being replayed. It doesn't replace the replay cache.
- [ ] Check whether your authorization server can issue DPoP-bound tokens. If it can't, put a gateway in front of both your token endpoint and your APIs and conversation endpoint. It checks the proof on each token request, records the key for the token it issues, and checks that key on every later request. Checking a proof's signature alone isn't enough.
- [ ] Accept a Bearer session token only at the MCP server whose `url` is its `resource`, not at other paths on the same host (MUST, 4.3).
- [ ] If you list an MCP server that doesn't support DPoP, support the token exchange grant (MUST, 4.3). Issue Bearer tokens to personal agents only through it, and check that the subject token is bound to the proof's key.
- [ ] Support DPoP on a new MCP server (SHOULD, 4.3): list `dpop_signing_alg_values_supported` in its protected resource metadata, with ES256, and verify proofs as on your other APIs. Then issue personal agents only DPoP tokens for it. Keep accepting Bearer tokens from MCP clients that don't implement Poppy, and reject a DPoP token sent as a Bearer token.
- [ ] Serve personal agent conversations only from your conversation endpoint (7.2). If your website chat or other channels can open the same conversations, they may not check DPoP, and anyone with a copied token could read them there.

### Recommended: [Internal services](https://personalagentprotocol.org/docs/0.3/guides#company-internal)

- [ ] Don't forward a session token from one of your services to another.
- [ ] Verify the token at the edge, then pass the verified `client_id`, user ID, account, and scopes to internal services through a gateway or service credentials.
- [ ] Internal credentials used for a request shouldn't allow more than the session token does.

### Recommended: [Hosting several companies](https://personalagentprotocol.org/docs/0.3/guides#company-hosting)

- [ ] Publish metadata for each issuer at its own URL, such as `https://auth.platform.example/.well-known/oauth-authorization-server/outfitters` (3.2). Its `issuer` is the full issuer, and its `protected_resources` lists only that company's storefronts and resources, such as `https://outfitters.example`.
- [ ] Serve each storefront's `poppy.json` on the storefront's own domain. A document redirected to the platform's domain speaks for the platform, not the storefront (3.1).
- [ ] Companies can share a token endpoint, servers, and signing keys. Only the issuer decides which company a token belongs to.
- [ ] Record the issuer with every session and account token, and check it on every request. A session token or account token from Outfitters must not work at Books, even when both are served by the same code.
- [ ] Don't use one company's records for another. A user's sessions, user IDs, and accounts at one company are unknown to every other company the platform hosts.

## Interfaces

### Specification: [5. Web browsing](https://personalagentprotocol.org/docs/0.3/spec#web-browsing)

- [ ] **MUST**: The Company MUST make the code at least 128 random bits, and MUST expire it no more than 60 seconds after issuing it.
- [ ] **MUST**: The Company MUST tie the code to the browser that loaded the page with a cookie set in the same response, so that only that browser can submit it.
- [ ] **MUST**: The cookie MUST be `Secure`, `HttpOnly`, and `SameSite=Strict`, and MUST use the `__Host-` prefix, so other hosts on the Company's domain can't set it in a victim's browser.
- [ ] **MUST**: The Company MUST send the response with `Cache-Control: no-store`.
- [ ] **MUST**: It MUST forbid other pages from framing it, with `Content-Security-Policy: frame-ancestors 'none'`, and from keeping a reference to its window, with `Cross-Origin-Opener-Policy: same-origin`.
- [ ] **MUST NOT**: Loading the page MUST NOT start, end, or change any Session, or change the browser's other cookies.
- [ ] **MUST**: The Company MUST check that:
    - [ ] The request has the cookie from step 1, and it matches `code`.
    - [ ] The code is one it issued, hasn't expired, and hasn't been used. A code is used by the first request that sends it, whatever the result.
    - [ ] `proof` is a valid DPoP Proof, checked as in 4.3, for this request: `htm` is `POST`, `htu` is the endpoint, and `nonce` is the code.
    - [ ] The proof's key is the Session Key of an active Session (4.3). Unlike at the token endpoint, a key the Company doesn't know is an error, not a new Session.
- [ ] **MUST**: MUST be set only in step 3.
- [ ] **MUST**: MUST follow the Session's current state: when the Session signs in or out, or its scopes change, the website reflects it on the next request.
- [ ] **MUST NOT**: MUST NOT outlive the Session.
- [ ] **MUST**: MUST be `Secure` and `HttpOnly`.
- [ ] **SHOULD**: It SHOULD use the `__Host-` prefix (RFC 6265bis), so other hosts on the Company's domain can't set it, unless it has to cover several hosts.
- [ ] **SHOULD**: When the website refuses an action because the Session lacks a scope, it SHOULD show a visible error message that names the missing scopes, so the Personal Agent can request them (4.4).

### Specification: [6. APIs](https://personalagentprotocol.org/docs/0.3/spec#apis)

- [ ] **MUST**: Each API's `type` MUST be one of these:
- [ ] **MUST**: Every listed API MUST accept Session Tokens as described in 4.3: DPoP for OpenAPI, and for MCP, DPoP if the server supports it and Bearer if it doesn't.
- [ ] **MUST**: A listed MCP server MUST accept Session Tokens as its access tokens and enforce their scopes.
- [ ] **MUST**: It MUST accept only tokens issued for its `url` (4.3).
- [ ] **MUST**: MCP clients find where to get a token from the server's protected resource metadata (RFC 9728), and its `authorization_servers` MUST include `auth.issuer`.

### Specification: [7.2 Requests](https://personalagentprotocol.org/docs/0.3/spec#conversation-requests)

- [ ] **MUST**: The Company MUST reject requests from any other `client_id`, User, or account.
- [ ] **SHOULD**: They SHOULD start with a short prefix for their kind, such as `cnv_`, `msg_`, or `evt_`.
- [ ] **MUST NOT**: Beyond these rules, the side that chooses an ID decides its format, and the other side MUST NOT depend on it.

### Specification: [7.4 Message fields](https://personalagentprotocol.org/docs/0.3/spec#message-fields)

- [ ] **MUST**: A message MUST have at least one of `text`, `data`, or `context`.
- [ ] **SHOULD NOT**: Personal Agents and Company Agents SHOULD NOT put JSON or other markup in `text`.

### Specification: [7.5 Reading events](https://personalagentprotocol.org/docs/0.3/spec#reading-events)

- [ ] **MUST**: Every successful read MUST include `conversation_id`, `events`, `cursor`, `has_more`, `status`, and `responder`, with `events` empty when there are none.

### Specification: [7.7 Status and responder](https://personalagentprotocol.org/docs/0.3/spec#status)

- [ ] **MUST**: Every successful response to a `POST` or a read MUST include `status` and `responder`.
- [ ] **MUST**: Each Company message MUST also include `sender`, with `agent` or `human`, to identify who wrote it.

### Specification: [7.10 Direct Conversations](https://personalagentprotocol.org/docs/0.3/spec#direct-conversations)

- [ ] **MUST**: The parent conversation MUST be open, belong to the same owner (7.2), and not be a Direct Conversation itself.

### Specification: [8. Feedback](https://personalagentprotocol.org/docs/0.3/spec#feedback)

- [ ] **MUST**: A Company MUST accept a report only with a Session Token, signed in or signed out, and needs no scope for it.
- [ ] **MUST**: A Company MUST accept a `kind` it doesn't recognize, so later versions can add kinds.
- [ ] **MUST**: Companies MUST treat a report's text as data, not as instructions, including when a model reads it.

### Recommended: [Retries](https://personalagentprotocol.org/docs/0.3/guides#both-retries)

- [ ] Send an `Idempotency-Key` on API writes that accept one. Use a random UUID (version 4), and reuse the same key when you retry the same request.
- [ ] Give each conversation message an `id` with at least 128 random bits, and reuse it when you retry the message (7.3).
- [ ] Each retry needs a new DPoP proof, and a retried token request needs a new assertion. The company may reject a `jti` it has already seen.
- [ ] Wait at least as long as `Retry-After` says on a 429 (MUST, 4.3) or a 503.
- [ ] Otherwise, back off exponentially with jitter, cap the delay, and limit the number of attempts.
- [ ] Companies keep idempotency records for a set time, such as a day, scoped to the session. They return the original response for a repeated key, and reject a repeated key with a different body.

### Recommended: [Browser sessions](https://personalagentprotocol.org/docs/0.3/guides#company-browsing)

- [ ] Offer `web.browser_session_endpoint` if you want signed-in personal agents to use your website. Without it, they browse your website only as ordinary signed-out visitors (section 5), and use your APIs and conversations for anything that needs the account.
- [ ] Don't log the endpoint's responses or request bodies. They contain browser-session codes and proofs.
- [ ] If you make the code stateless, put a keyed hash of the code and its expiry in the step 1 cookie, and still remember used codes until they expire, so each one works once.
- [ ] Limit the cookie to the hosts personal agents need, such as your main site, rather than your whole domain.
- [ ] Look up the session on each request, so sign-out and scope changes take effect on the website right away.

### Recommended: [Conversations](https://personalagentprotocol.org/docs/0.3/guides#company-conversations)

- [ ] Let your company agent do everything customers can do by phone, as fully as you can, so personal agents have no reason to call.
- [ ] Keep a conversation's events for at least 30 days, so a personal agent that reconnects rarely hits `cursor_expired` (7.5).
- [ ] On a stream with nothing to send, send an SSE comment every 15 to 30 seconds, so proxies don't close it (7.6).
- [ ] When a session signs out, answer a signed-out token on its conversations that used the account with `insufficient_scope`, including reads of their events, so their account details can't be read signed out (4.9, 7.11). Leave them open, so the user can sign in again and continue, or close them if your policy is to clear everything at sign-out.
- [ ] Before closing an inactive conversation, say so in a message (7.12).

### Recommended: [Error messages](https://personalagentprotocol.org/docs/0.3/guides#company-errors)

- [ ] Keep `error_description` and other error text free of account details and other users' data.
- [ ] Return the same error for "doesn't exist" and "belongs to someone else", as `conversation_not_found` does (7.13).

## Sign-in and accounts

### Specification: [4.4 Signing in](https://personalagentprotocol.org/docs/0.3/spec#sign-in)

- [ ] **SHOULD**: In turn, a Company that offers Direct or Device Sign-In SHOULD make its scopes and APIs cover the tasks Users ask Personal Agents to do, so that Personal Agents don't need the User's credentials (9.5).
- [ ] **MUST**: The Company MUST describe each scope in `scopes_supported`, so the Personal Agent can choose the ones a task needs: in the scopes of an OAuth 2.0 security scheme in an OpenAPI description it lists (section 6), or otherwise in `auth.scopes`.
- [ ] **MUST NOT**: The Company MUST NOT grant scopes beyond those requested and allowed for the type used.

### Specification: [4.5 Direct Sign-In](https://personalagentprotocol.org/docs/0.3/spec#direct-sign-in)

- [ ] **MUST**: `redirect_uri` MUST exactly match an entry in the Personal Agent's `redirect_uris` (4.1).

### Specification: [4.6 Device Sign-In](https://personalagentprotocol.org/docs/0.3/spec#device-sign-in)

- [ ] **MUST NOT**: Opening the link MUST NOT approve the request by itself.

### Specification: [4.7 Mediated Sign-In](https://personalagentprotocol.org/docs/0.3/spec#mediated-sign-in)

- [ ] **SHOULD**: A Company SHOULD offer Mediated Sign-In only until it can add Direct or Device Sign-In, and SHOULD stop offering it once those cover the scopes it grants.
- [ ] **MUST**: A Company that offers Mediated Sign-In MUST rate-limit attempts, MUST NOT return credentials in any response, and SHOULD require a one-time code when a sign-in looks unusual.

### Specification: [4.8 Account Tokens](https://personalagentprotocol.org/docs/0.3/spec#account-tokens)

- [ ] **MUST**: Companies MUST accept an Account Token only at their `token_endpoint` and `revocation_endpoint`, and only from the `client_id` it was issued to, authenticated by its client assertion.
- [ ] **MUST**: The Session MUST belong to the same `client_id` and User ID as the Account Token, and MUST NOT have been signed in to a different account, even if it is now signed out (4.4).

### Specification: [4.9 Signing out](https://personalagentprotocol.org/docs/0.3/spec#sign-out)

- [ ] **SHOULD**: As RFC 7009 §2.1 describes, the Company SHOULD also invalidate the Session Tokens issued under the same sign-in, so sign-out takes effect right away.
- [ ] **SHOULD**: A Company that can't invalidate them SHOULD check on each request whether the Session is still signed in, and one that does neither SHOULD use much shorter Session Token lifetimes, such as a few minutes.

### Specification: [7.11 Sign-in during a conversation](https://personalagentprotocol.org/docs/0.3/spec#conversation-sign-in)

- [ ] **SHOULD**: It SHOULD also ask in a message, so a User in a Direct Conversation sees the request:

### Recommended: [Token lifetimes and sign-out](https://personalagentprotocol.org/docs/0.3/guides#company-lifetimes)

- [ ] Session tokens should last hours, not days (4.2).
- [ ] Check on each request whether the session is still signed in, so sign-out takes effect right away. If you can't, keep session tokens to a few minutes (4.9).
- [ ] Don't stop accepted work because the session token that started it expired. A job can outlast the token (4.9).
- [ ] Where work in progress can take consequential actions on the user's account, such as payments or changes that are hard to undo, tie it to the account token, so revoking access stops it right away.
- [ ] Give account tokens a lifetime that fits the account, such as 90 days, and expire ones that go unused sooner.
- [ ] Revoke a user's account tokens when they reset their password or you suspect the account is compromised.

### Recommended: [Describing scopes](https://personalagentprotocol.org/docs/0.3/guides#company-scope-descriptions)

Every scope in `scopes_supported` needs a description, in the OAuth security scheme of an OpenAPI description you list or in `auth.scopes` (MUST, 4.4). Personal agents read them to choose scopes, and a language model often does the choosing:

- [ ] Say what the scope lets the personal agent see or do, in words a user understands.
- [ ] Be specific enough for a model to match a task to the scopes it needs. "See your orders and returns" works better than "Read access".
- [ ] Say whether the scope only reads, and whether a write scope also allows reading.

### Recommended: [Consent pages](https://personalagentprotocol.org/docs/0.3/guides#company-consent)

The page where the user approves access, in direct and device sign-in (4.5, 4.6):

- [ ] Show the personal agent's name and logo, and the domain of its `client_id`. The personal agent chooses its own name, so the domain is what the user can trust.
- [ ] Show the account being connected, the requested scopes in plain language, and how long access lasts. Group related scopes rather than listing their names.
- [ ] When the user already granted some of the scopes, show which ones are new, so the user doesn't review the whole list again. A personal agent that needs more access requests every scope it needs again (4.4).
- [ ] Protect the page against cross-site request forgery, and against framing by other sites with `Content-Security-Policy: frame-ancestors`.
- [ ] `redirect_uri` MUST exactly match an entry in the personal agent's `redirect_uris` (4.5).
- [ ] Accept PKCE with `S256` only, and reject `plain`.
- [ ] Return `iss` in every redirect, success or error (4.5). Personal agents reject a redirect without it.
- [ ] For extra protection, support Pushed Authorization Requests (RFC 9126).

### Recommended: [Device sign-in](https://personalagentprotocol.org/docs/0.3/guides#company-device)

- [ ] Follow the best practices for cross-device flows in RFC 10027 §2 (MUST, 4.6): assess the risk before offering device sign-in, and choose mitigations from its §6.1, such as short-lived single-use codes, rate limits, limited scopes, and a consent page that says which personal agent is asking and tells the user to decline a code they didn't ask for.
- [ ] Opening the link MUST NOT approve the request by itself (4.6). The same goes for scanning the QR code. The user signs in and approves on the page.
- [ ] Ask the user to confirm that the code on the page matches the one the personal agent shows.
- [ ] Return `slow_down` to personal agents that poll faster than `interval`, and limit wrong `user_code` entries.
- [ ] Keep `expires_in` short, such as 10 minutes.

### Recommended: [Mediated sign-in](https://personalagentprotocol.org/docs/0.3/guides#company-mediated)

If you offer mediated sign-in, you MUST rate-limit attempts and MUST NOT return credentials in any response. Also:

- [ ] Rate-limit by account, by `client_id`, and by user ID, and cap wrong one-time codes.
- [ ] Require a one-time code when a sign-in looks unusual, including a personal agent's first mediated sign-in after the user disconnected it.
- [ ] Return the same `failed` response for an unknown account and a wrong password, so responses don't reveal whether an account exists.
- [ ] Never store raw credentials or codes, including in logs, traces, and idempotency records.
- [ ] Tell the user, for example by email, when a personal agent signs in.

### Recommended: [Account settings](https://personalagentprotocol.org/docs/0.3/guides#company-account-settings)

- [ ] In account settings, list each connected personal agent with its name, domain, scopes, and when it was last used.
- [ ] Offer a control to disconnect each one. Disconnecting revokes its account tokens and signs out its sessions (4.9).

### Recommended: [Enforcing scopes everywhere](https://personalagentprotocol.org/docs/0.3/guides#company-scopes)

- [ ] Apply the same scope rules on your website, APIs, company agent, and live agents. One shared check that every channel calls is easiest to keep consistent.
- [ ] Have the company agent's tools check the token's scopes on every call. Don't rely on the model to decide.
- [ ] Give live agents' tools the same checks, so a person can't make a change the token doesn't allow (7.11).
- [ ] Check read and write scopes separately. If a write scope also allows reading, say so in its description.
- [ ] When your website refuses an action for a missing scope, show an error that names the scopes (SHOULD, section 5).

## Extensions

### Specification: [3.3 Extensions](https://personalagentprotocol.org/docs/0.3/spec#extensions)

- [ ] **MUST**: Anyone else MUST start an extension's name with a domain they control, such as `example.com/gift-wrap`.
- [ ] **MUST**: Personal Agents and Companies MUST ignore extensions they don't support and fields they don't recognize, so either side can work with the other under this specification alone.

### Operations extension: [2. Advertising support](https://personalagentprotocol.org/docs/0.3/extensions/operations#support)

- [ ] **MUST NOT**: A Company MUST NOT return operations to a Personal Agent that doesn't list the extension.

### Operations extension: [3. Operations](https://personalagentprotocol.org/docs/0.3/extensions/operations#operations)

- [ ] **MUST**: Everything that affects the action, such as the item, quantity, price, recipient, date, or a condition for cancelling, MUST be in the revision's `summary`, and in `terms` if present.
- [ ] **MUST**: The Company MUST perform only what the confirmed revision describes.
- [ ] **MUST NOT**: Proposing an operation doesn't perform it, and the Company MUST NOT start the action before it is confirmed.

### Operations extension: [3.1 Revisions](https://personalagentprotocol.org/docs/0.3/extensions/operations#revisions)

- [ ] **MUST NOT**: Each revision is fixed once issued: the Company MUST NOT change the terms of a revision, and only the latest revision can be confirmed.

### Operations extension: [3.2 Who can use an operation](https://personalagentprotocol.org/docs/0.3/extensions/operations#ownership)

- [ ] **MUST**: The Company MUST keep an operation readable at least until it is final.

### Operations extension: [4. Proposing an operation](https://personalagentprotocol.org/docs/0.3/extensions/operations#proposing)

- [ ] **SHOULD**: If the same action comes up again through another channel, for example in an API call after a conversation proposed it, the Company SHOULD return the existing operation instead of proposing a new one.

### Operations extension: [4.1 OpenAPI](https://personalagentprotocol.org/docs/0.3/extensions/operations#binding-openapi)

- [ ] **SHOULD**: The Company SHOULD say in its OpenAPI description which endpoints return operations.

### Operations extension: [6. Tracking and recovery](https://personalagentprotocol.org/docs/0.3/extensions/operations#tracking)

- [ ] **SHOULD**: While it is `in_progress`, the Company SHOULD include `Retry-After`, and the Personal Agent reads again after that time.
- [ ] **MUST**: The Company MUST perform each operation at most once, however many times and through whichever channels it is confirmed.
- [ ] **MUST NOT**: The Company MUST NOT report `failed` while it doesn't know whether the action took effect, for example after a timeout in one of its own systems.
- [ ] **MUST**: In a final state, `result.summary` MUST describe every change that was made, including any made by an operation that failed or was cancelled partway.

### Recommended: [Companies](https://personalagentprotocol.org/docs/0.3/guides#operations-companies)

- [ ] When you call another system to perform the action, such as a payment processor or a warehouse, derive its idempotency key from the operation ID. A retry then can't perform the action twice downstream either.
- [ ] If a downstream call times out, ask that system whether the action happened, using your business reference, before trying again. Keep the operation `in_progress` until you know.
- [ ] To spot the same action coming up in another channel, look for an open operation in the same session or account with the same terms before proposing a new one.
- [ ] Keep final operations readable for as long as the user can see the related order or booking on your website, or at least 30 days.
- [ ] Write the `summary` so it stands alone: what will happen, to what, and any cost, date, or condition. Personal agents show it to users as is.
