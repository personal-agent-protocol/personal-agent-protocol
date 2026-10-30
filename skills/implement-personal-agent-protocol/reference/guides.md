# Guides

## About the guides

The [specification](https://personalagentprotocol.org/docs/0.3/spec) covers only what a company and a personal agent need to work together. These guides cover the rest: recommended practices for a secure, reliable implementation, and advice for each party.

Following the guides is not required to comply with the protocol. Each item is a recommendation, in the sense of SHOULD: do it unless you have a good reason not to. Where a guide repeats something the specification requires, it says MUST and links to the section that requires it.

Start with [For both parties](#both), then read the part for your side. The examples use the same placeholder domains as the specification: `example.com` for the company and `agent.example` for the personal agent.

## For both parties

### Handling secrets

These are secrets:

- Access tokens and refresh tokens.
- Private keys, client assertions, Session JWTs, and DPoP proofs.
- Authorization codes, PKCE code verifiers, device codes, one-time sign-in codes, browser-session codes, and credentials sent in mediated sign-in.

To handle them:

- Keep them out of logs, telemetry, error reports, model context, conversation messages, and URLs. Tokens and Session JWTs MUST NOT be sent in a URL ([5.6](https://personalagentprotocol.org/docs/0.3/spec#sending-requests)), and tokens, Session JWTs, private keys, authorization codes, PKCE code verifiers, and device codes MUST NOT go in model context ([10.2](https://personalagentprotocol.org/docs/0.3/spec#secrets)).
- Redact the `Authorization`, `Poppy-Session`, `DPoP`, and `Cookie` headers and credential fields before a request reaches a logger or tracer.
- Send `Cache-Control: no-store` on every response that carries a token or code.

### Signing and verifying JWTs

Client assertions, delegations, Session JWTs, and DPoP proofs are JWTs. To sign and verify them consistently:

- Personal agents: sign Session JWTs with ES256 (MUST, [5.2](https://personalagentprotocol.org/docs/0.3/spec#session-header)). Sign client assertions and delegations with ES256, or with PS384 if you sign them blindly ([10.7](https://personalagentprotocol.org/docs/0.3/spec#delegated-key-security)). Companies: accept ES256 (MUST) and PS384 (SHOULD) in client assertions and delegations ([4.1](https://personalagentprotocol.org/docs/0.3/spec#agent-identity), [5.2](https://personalagentprotocol.org/docs/0.3/spec#delegated-keys)), and RS256 in client assertions. Use RSA keys of at least 2048 bits.
- Personal agents: use `token_endpoint_auth_signing_alg_values_supported` in the Company's OAuth metadata to choose a supported client-assertion algorithm. This list does not establish support for delegation signatures. The protocol has no delegation-algorithm discovery field, and `invalid_session` does not distinguish an unsupported algorithm from other failures. An agent that requires blind signing may be unable to work with a Company that doesn't support PS384. Falling back to ES256 needs a suitable published key and gives up this blind-signing mechanism; don't switch automatically when blind signing is required by the User's privacy settings.
- Reject `alg: none` and symmetric algorithms such as HS256.
- Verify client assertions and delegations only with keys from the personal agent's verified `jwks_uri` ([4.1](https://personalagentprotocol.org/docs/0.3/spec#agent-identity)), and Session JWTs only with the key their verified delegation names in `cnf.jwk` ([5.2](https://personalagentprotocol.org/docs/0.3/spec#delegated-keys)). Ignore `jku`, `x5u`, and any other key embedded in a JWT. DPoP proofs for DPoP-bound access tokens are the one other exception: the public key in their `jwk` header is how they work.
- Check `aud` and `iat`, and `exp` on client assertions and delegations. Session JWTs have no `exp`: accept them only within your `iat` window ([5.3](https://personalagentprotocol.org/docs/0.3/spec#session-verification)). A client assertion has the company's issuer as its `aud`; a Session JWT has the Company's identifier (its issuer, or its HTTPS domain without one), never an endpoint URL ([4.1](https://personalagentprotocol.org/docs/0.3/spec#agent-identity), [5.2](https://personalagentprotocol.org/docs/0.3/spec#session-header)). Allow a small clock skew, such as 30 seconds, and reject assertions that claim a long lifetime.
- Make the `jti` of each client assertion, delegation, Session JWT, and DPoP proof at least 128 random bits, and each Session ID too.
- Personal agents: set a client assertion's `exp` at most five minutes after its `iat`.
- Companies: reject a reused client assertion `jti` from the same `client_id` until it expires, as [RFC 7523](https://www.rfc-editor.org/rfc/rfc7523) §3 allows.

### Operator signatures and bot defenses

The Session JWT is the core authentication mechanism. Personal agents should also send an HTTP Message Signature so existing bot defenses can recognize the operator (SHOULD, [5.3](https://personalagentprotocol.org/docs/0.3/spec#operator-signatures)). Use [RFC 9421](https://www.rfc-editor.org/rfc/rfc9421) and [Web Bot Auth](https://datatracker.ietf.org/doc/draft-ietf-webbotauth-httpsig-protocol/) for signing, key publication, and discovery. Check the receiving deployment's supported draft, algorithms, and header form; current products do not all implement the same revision.

- Build the request body, any DPoP proof, and Session JWT first, then the operator signature. Cover `poppy-session` and `authorization` when present, as the spec requires. Include method, authority, path, query, and a verified content digest when the verifier relies on those components.
- Keep operator keys separate from delegated Session keys. Publishing every User's delegated key in an operator directory is not equivalent to verifying a delegation, and exposes a new key mapping.
- For a centralized agent, signing can happen where requests already pass. For on-device agents, sending requests to an authenticated operator signing service can reveal which Company each User visits. This signature profile does not provide blind signing. Do not send devices a shared operator private key to avoid that service.
- A verified operator signature establishes control of its key source. It does not establish every client metadata URL on the same origin. Verify the Session JWT's exact `iss` before accepting it as that client, then apply Company policy and account authorization.
- Test the actual edge and origin together: registration, directory caching, key rotation, accepted signature components, body handling, and forwarded authentication results. Protect the origin from forged forwarding headers. A bot-verification result is not a replay check or account grant.
- Remove the extra signature where an edge verifies delegated Session JWTs directly. Keep Company acceptance and all remaining Session and OAuth checks. The JWT covers method, URL without query, and access token, not the request body; do not assume removing an operator signature preserves any additional query or body protection it supplied.

### Rotating keys

- Give every key in `jwks_uri` a `kid`.
- Publish a new key in `jwks_uri` before signing with it, early enough for companies' caches to pick it up.
- Keep an old public key published until every client assertion and delegation signed with it has expired.
- Personal agents: rotate delegated keys as often as you like. Each Session JWT carries its own delegation, so companies don't depend on a delegated key lasting ([5.2](https://personalagentprotocol.org/docs/0.3/spec#delegated-keys)).
- Companies refetch `jwks_uri` when they see an unknown `kid`. The refetch happens before any signature is checked, so anyone can trigger it by naming a real personal agent and a made-up `kid`. Refetch each `jwks_uri` at most once per interval, such as 30 seconds, and count failed fetches too. Otherwise a stream of bad assertions can flood the personal agent's server.
- Rotating signing keys doesn't affect refresh tokens. They are tied to the `client_id`, not a key ([4.4](https://personalagentprotocol.org/docs/0.3/spec#refresh-tokens)).

### Fetching metadata safely

Personal agents fetch `poppy.json` files, OAuth and protected resource metadata, API descriptions, and excluded-task documents. Companies fetch client metadata documents and key sets. Each fetch goes to a URL the other party controls, so:

- Set limits: a few redirects at most, a response size such as 100 KB, and a timeout of a few seconds.
- Validate HTTPS certificates. Personal agents MUST follow discovery redirects only to HTTPS URLs ([section 3](https://personalagentprotocol.org/docs/0.3/spec#discovery)).
- Never send cookies, tokens, or other credentials on these fetches.
- Reject loopback, private, and link-local addresses unless you've configured them on purpose. Check the address you actually connect to, not only the one DNS returned first.
- Cache according to HTTP caching headers, within bounds you set, such as at least a minute and at most a day. The upper bound means a removed key stops being trusted.

### Retries

- Send an `Idempotency-Key` on API writes that accept one. Use a random UUID (version 4), and reuse the same key when you retry the same request.
- Give each conversation message an `id` with at least 128 random bits, and reuse it when you retry the message ([8.3](https://personalagentprotocol.org/docs/0.3/spec#sending-messages)).
- Each retry needs a new Session JWT, and a new DPoP proof if the access token is DPoP-bound. A retried token request needs a new assertion. The company may reject a `jti` it has already seen.
- Wait at least as long as `Retry-After` says on a 429 (MUST, [5.6](https://personalagentprotocol.org/docs/0.3/spec#sending-requests)) or a 503.
- Otherwise, back off exponentially with jitter, cap the delay, and limit the number of attempts.
- Companies keep idempotency records for a set time, such as a day, scoped to the session. They return the original response for a repeated key, and reject a repeated key with a different body.

### Rate limits

Personal agents change the shape of web traffic: one user's request can turn into many automated calls, at any hour. Existing HTTP patterns handle most of this.

- Companies: limit by `client_id`, by user, and by session, so one busy personal agent or user doesn't crowd out others. Count a request against a `client_id` only after its Session JWT or client assertion's signature checks pass. Otherwise anyone can name a personal agent and use up its limit, so its real users are refused. Limit unverified requests by network instead.
- Companies: also send the `RateLimit` and `RateLimit-Policy` headers ([IETF draft](https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/)), so personal agents can slow down before they hit a limit.
- Personal agents: keep track of limits for each company and share them across your tasks and users, rather than letting each task find the limit on its own.
- Personal agents: prefer long polling or streaming over repeated short polls, and check for changes no more often than the task needs. Checking once a day for a price drop is usually enough.
- Personal agents: run work that isn't time-sensitive, such as checking order status in the background, outside the company's busy hours, and spread it out instead of starting it all at the same moment.

### Transport and JSON

- Use TLS 1.2 or later. Prefer TLS 1.3.
- Encode JSON as UTF-8 and reject objects with duplicate member names.
- Write timestamps in RFC 3339 with a time zone offset, such as `2026-10-02T17:15:00-07:00`.
- Ignore fields you don't recognize, so later versions can add them.

### MCP and UCP interoperability

For MCP, use the lifecycle for the version you and the server support. MCP [2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning) puts version and client metadata on each request and supports `server/discover`; older supported versions use `initialize`. Follow the version's HTTP binding for headers, negotiation, and legacy fallback. Poppy's `sid` continues to identify the Session in either case. It is not an `Mcp-Session-Id`.

Use Bearer tokens for ordinary MCP authorization. Use DPoP only with a server that advertises it and a client that supports it ([section 7](https://personalagentprotocol.org/docs/0.3/spec#apis)). Keep cached results specific to the Poppy User and Session when those affect the result; account scopes alone are not an adequate cache key. In versions with `cacheScope`, mark such results `private` and isolate the client cache accordingly.

A deployment that also uses the Universal Commerce Protocol (UCP) can reuse an authorization server where its [Identity Linking](https://ucp.dev/specification/identity-linking/) requirements and Poppy's match. Their scopes and client metadata still need to be checked separately. UCP [signatures](https://ucp.dev/specification/signatures/) can share operator keys where algorithms and key-discovery rules match; its ES256 baseline does not ensure a verifier accepts Ed25519. Check required covered headers, including `UCP-Agent`, for each protocol. Neither a UCP signature nor a Poppy operator signature replaces Poppy's delegated Session JWT. Do not assume one token or signature works in both protocols without checking the receiving interface's requirements.

## For personal agents

### Finding a company

When the company you reach is on a different domain from the one the user asked for, tell the user which company you're dealing with, its `organization.name` and domain, before you sign in or act for them. A well-known URL can redirect to any host's `/.well-known/poppy.json` ([section 3](https://personalagentprotocol.org/docs/0.3/spec#discovery)). A rebrand, such as `oldname.example` redirecting to `newname.example`, then costs one line, and a domain that sends you to another company can't move the user's task there without them noticing.

### User IDs

Each user needs a stable, opaque ID for each company ([5.1](https://personalagentprotocol.org/docs/0.3/spec#user-ids)). Two ways to make one:

- **Store a random ID** for each user and company the first time they're needed. This is the simplest choice.
- **Derive one with a keyed hash**, such as HMAC-SHA256 of your internal user ID and the company's identifier (its issuer, or its HTTPS domain without one), with a secret key. Changing the key changes every ID, so the company sees all your users as new.

The ID MUST NOT contain or be derived from personal information, such as an email address, phone number, or name ([5.1](https://personalagentprotocol.org/docs/0.3/spec#user-ids)). This includes hashes of it, keyed or not. If you derive the ID, start from an internal ID that is itself random.

Key user IDs by the company's identifier: its full issuer, including any path, or `https://{organization.domain}` with a lowercase host and no trailing slash when there is no issuer. A provider can host several companies on one host, such as `https://auth.platform.example/outfitters` and `https://auth.platform.example/books`, and each is a different company with its own user IDs ([3.2](https://personalagentprotocol.org/docs/0.3/spec#oauth-server)).

When adding or changing an issuer changes the Company's identifier, use new user IDs, agent IDs, delegated keys, and sessions. Its old carts and conversations do not carry over automatically. Do not fall back to the domain because issuer discovery failed ([3.2](https://personalagentprotocol.org/docs/0.3/spec#oauth-server)).

Tell your users, such as in your privacy notice, that each company recognizes them across visits through their user ID, even when they're signed out, and that signing in lets the company link those earlier visits to their account.

You MAY offer anonymous browsing, like a private browser window, with a new user ID for each anonymous browsing session ([5.1](https://personalagentprotocol.org/docs/0.3/spec#user-ids)). The company sees a new user each time, and nothing in the protocol links that browsing to the user's regular ID, their account, or their other anonymous sessions. Other signals, such as IP addresses, still can.

- Create a random ID for each anonymous browsing session. Its sessions have their own `sid`, and its delegated keys sign for no other user ID ([5.2](https://personalagentprotocol.org/docs/0.3/spec#delegated-keys)), so nothing links it to the user's other sessions.
- Discard the ID when the browsing session ends. Carts and conversations from it end with it.
- Never send an access token with an anonymous ID (MUST NOT, [5.4](https://personalagentprotocol.org/docs/0.3/spec#sign-in)). If the user wants to sign in, switch to their regular ID in a new session.

Keep the mapping of each user's IDs across companies confidential (MUST, [5.1](https://personalagentprotocol.org/docs/0.3/spec#user-ids)). Don't publish it or share it with third parties, other than service providers that process it for you.

### The Session header

- Choose each session's `sid` at random, and never use it for another session (MUST, [5.2](https://personalagentprotocol.org/docs/0.3/spec#session-header)). Keep it for as long as you use the session: it names the session, so a lost `sid` means a new session.
- Send the same `sub` and `agent_id` in every Session JWT for a session (MUST, [5.2](https://personalagentprotocol.org/docs/0.3/spec#session-header)).
- Sign a new Session JWT for each request, in an HTTP client hook that sees the final method and URL. Don't let the client follow redirects from protocol endpoints with the Session header or a token: you MUST NOT send either to the new URL ([section 3](https://personalagentprotocol.org/docs/0.3/spec#discovery)).
- Generate delegated keys where you sign, and make them non-extractable where your platform allows, such as in a key management service, WebCrypto, or the device's keystore. Use each one for one user ID only (MUST, [5.2](https://personalagentprotocol.org/docs/0.3/spec#delegated-keys)).
- Get a new delegation before the current one expires. You MUST NOT sign a Session JWT after its delegation's `exp` ([5.2](https://personalagentprotocol.org/docs/0.3/spec#delegated-keys)). Round its `iat` down, such as to the start of the hour, and set `exp` from the rounded value, so delegations issued together can't be matched by their times. Keep its lifetime to a few hours.
- Never expose private keys to a model or to tools a model can call. Sign on the model's behalf in code it can't reach.
- When a request gets `invalid_session` because its session ended, start a new session with a new `sid` (MUST, [5.5](https://personalagentprotocol.org/docs/0.3/spec#ending-sessions)). The old session's cart and browser cookie don't carry over. For any other `invalid_session`, fix the JWT rather than starting over.
- If a company issues DPoP-bound access tokens, also sign a DPoP proof for each request that carries one, and support nonces as [RFC 9449](https://www.rfc-editor.org/rfc/rfc9449) §8 describes. The proof and the Session JWT are separate signatures with separate keys ([5.2](https://personalagentprotocol.org/docs/0.3/spec#session-header)).

### Storing tokens

- Store refresh tokens as secrets ([10.2](https://personalagentprotocol.org/docs/0.3/spec#secrets)). Encrypt them at rest, apart from the model and its tools. Give tools a reference to the token, not the token.
- Keep access tokens in memory and drop them when they expire.
- Store refresh tokens by the company's full issuer, as for [user IDs](#agent-user-ids), so a token from one company hosted by a provider is never sent to another.
- Before the first signed-in call to a service, fetch its protected resource metadata. If it has some, request a token for its `resource` and use that token only there ([4.5](https://personalagentprotocol.org/docs/0.3/spec#access-tokens)). Cache the metadata by its HTTP caching headers, and fetch it again when the service answers `invalid_token` with `resource_metadata`.
- At an MCP server, always use a token whose `resource` is the server's `url` (MUST, [section 7](https://personalagentprotocol.org/docs/0.3/spec#apis)), with the scheme `token_type` names. Send the Session header there too: the server may ignore it, but you can't tell in advance.
- When the company returns a new refresh token, you MUST use it from then on ([4.4](https://personalagentprotocol.org/docs/0.3/spec#refresh-tokens)). Replace the stored one right away. When a refresh response omits it, keep the existing refresh token.
- After the user signs in again for more scopes, revoke the old refresh token ([4.7](https://personalagentprotocol.org/docs/0.3/spec#scopes)).
- On `invalid_grant` for a refresh token, continue signed out: send the Session header without an access token ([5.5](https://personalagentprotocol.org/docs/0.3/spec#ending-sessions)).
- Use a new session for a second account ([5.4](https://personalagentprotocol.org/docs/0.3/spec#sign-in)), keeping its tasks and browser cookie separate from the first account's.

### Planning account access

Read OpenAPI security requirements before an operation, including operation-level overrides. Use MCP's authorization discovery and challenges for MCP. A conversation entry's `access: signed_in` hints that it needs account access from the start ([3.2](https://personalagentprotocol.org/docs/0.3/spec#oauth-server)); without that hint, start signed out and respond to challenges or authorization events. Every Poppy request still has a Session header. Use a refresh token that covers the task before asking the User to sign in, and do not automatically reconnect an account the User disconnected.

### Choosing how to sign in

- Before asking the user to sign in, check whether a refresh token you hold already covers the task ([5.4](https://personalagentprotocol.org/docs/0.3/spec#sign-in)).
- Prefer direct or device sign-in to mediated sign-in (SHOULD, [Mediated Sign-In 6](https://personalagentprotocol.org/docs/0.3/extensions/mediated-sign-in#security)), and direct to device sign-in ([4.3](https://personalagentprotocol.org/docs/0.3/spec#device-sign-in)). With direct and device sign-in, the user's password stays with the company.
- Use `scopes_supported`, the company's OpenAPI description, and its sign-in extension metadata to find scopes. The advertised list may be incomplete. Read descriptions where available to pick the ones the task needs ([4.7](https://personalagentprotocol.org/docs/0.3/spec#scopes)); a missing description or hint says nothing about whether a scope is safe to request automatically.
- Use `auth.scope_hints` to decide which scopes need the user's go-ahead before you request them ([4.7](https://personalagentprotocol.org/docs/0.3/spec#scopes)). For example, request a scope whose `changes` is `irreversible`, or whose `personal_data` is `true`, only when the user agreed to that kind of access, and let the user set that preference once rather than for every sign-in. Treat a scope without hints as `irreversible` with personal data.
- Hints describe a whole scope. The consequences of one action still come from the action itself, such as an MCP tool's annotations, or the HTTP method: a `GET` doesn't change anything.
- Ask for the fewest scopes the task needs, not every scope the company offers. For a task that only looks things up, request a read-only access token with a broader refresh token ([4.4](https://personalagentprotocol.org/docs/0.3/spec#refresh-tokens)).
- The user may approve fewer scopes than you asked for. Check `scope` in the response before continuing. A response without `scope` granted every scope you asked for.

### Direct and device sign-in

- Use direct or device sign-in only when the user signs in themselves (MUST, [5.4](https://personalagentprotocol.org/docs/0.3/spec#sign-in)). Never type the user's password, enter their one-time code, or click the company's approval controls for them.
- Open the authorization URL in the user's own browser, not in a browser you automate.
- Make `state` random and single-use. Record which company it belongs to, and exchange the code only at that company's `token_endpoint`. Check that the redirect's `iss` matches that company's issuer (MUST, [4.2](https://personalagentprotocol.org/docs/0.3/spec#direct-sign-in)).
- Use PKCE with `code_challenge_method=S256` ([4.2](https://personalagentprotocol.org/docs/0.3/spec#direct-sign-in)).
- If you can't receive the redirect on the device the user is talking to you on, send the authorization URL to the user, for example to their phone, with a redirect URI you control. Fall back to device sign-in only when that isn't possible ([4.3](https://personalagentprotocol.org/docs/0.3/spec#device-sign-in)).
- For device sign-in ([4.3](https://personalagentprotocol.org/docs/0.3/spec#device-sign-in)), show `verification_uri_complete` as a link or QR code, and show `user_code` too so the user can confirm it matches. Keep `device_code` private. Show the link only if its host is the company's issuer host or the host of a URL in its `protected_resources`, or a subdomain of either, and show the company's name and domain with it (MUST, [4.3](https://personalagentprotocol.org/docs/0.3/spec#device-sign-in)).
- Poll no faster than `interval`. On `slow_down`, add 5 seconds to the interval, as [RFC 8628](https://www.rfc-editor.org/rfc/rfc8628#section-3.5) describes.

### Mediated sign-in

When a company offers the [Mediated Sign-In extension](https://personalagentprotocol.org/docs/0.3/extensions/mediated-sign-in):

- Collect the extension's `fields` in a form that sends them straight to your sign-in code, so secret values never pass through the model.
- Look up stored credentials by the company's issuer, and show the company's name and domain on the form and when asking for a code (MUST, [Mediated Sign-In 6](https://personalagentprotocol.org/docs/0.3/extensions/mediated-sign-in#security)). Field labels come from the company and can name anything.
- Secret fields MUST never be shown back to the user, logged, or sent anywhere other than the token endpoint of the company's issuer ([Mediated Sign-In 2](https://personalagentprotocol.org/docs/0.3/extensions/mediated-sign-in#support)).
- After a sign-in ends, you MUST either discard the credentials or keep them only in a credential store the user chose, such as a password manager ([Mediated Sign-In 6](https://personalagentprotocol.org/docs/0.3/extensions/mediated-sign-in#security)). If you discard them and the user needs to sign in again later, ask again.
- After the user disconnects you or the company revokes your access, don't sign in again with stored credentials unless the user asks you to.
- On `code_required`, tell the user where the code was sent, using `sent_to`, ask for it, and send only the code with `sign_in_id` ([Mediated Sign-In 4](https://personalagentprotocol.org/docs/0.3/extensions/mediated-sign-in#one-time-codes)).

### Native and distributed apps

- Don't put your signing private key in an app you distribute. Anyone could extract it and act as your personal agent. Keep the key on your server, and have the app ask the server to sign assertions for the signed-in user.
- Delegated keys can stay on the device. The app generates one in its platform keystore and asks your server for a delegation for it, then signs Session JWTs itself ([5.2](https://personalagentprotocol.org/docs/0.3/spec#delegated-keys)). [10.7](https://personalagentprotocol.org/docs/0.3/spec#delegated-key-security) explains what this hides from your own servers, and blind signing, which hides more.
- Redirect URIs are HTTPS URLs on your `client_id` domain, or loopback redirect URIs ([4.1](https://personalagentprotocol.org/docs/0.3/spec#agent-identity)). To return the user to a phone app, use an HTTPS link the app claims, such as an iOS universal link or an Android app link, or use device sign-in. A desktop app can listen on a loopback port, as [RFC 8252](https://www.rfc-editor.org/rfc/rfc8252) §7.3 describes.

### Web browsing

- Use a separate browser storage context, with its own cookies and local storage, for each session. Never share one across users.
- Don't type the user's password or other credentials into a company's website. Sign in with direct, device, or mediated sign-in, then join your browser to the session ([section 6](https://personalagentprotocol.org/docs/0.3/spec#web-browsing)).
- Join the browser to the session right before you start browsing, and join again after signing in, or when the website stops recognizing the session.
- A join without an access token leaves a login the browser already has, while a signed-in join replaces it, and the browser is signed out when that sign-in ends ([section 6](https://personalagentprotocol.org/docs/0.3/spec#web-browsing) has a table of each case).
- Read the browser-session code only from the endpoint's page in your own browser, authorize it in code your model can't read, and have the browser submit the form right away. Never authorize a code from a message or another page (MUST NOT, [section 6](https://personalagentprotocol.org/docs/0.3/spec#web-browsing)).
- Close the storage context when the session ends.

### Conversations

- Read events with a long `wait`, such as 30 seconds, or a stream, rather than many short polls ([8.5](https://personalagentprotocol.org/docs/0.3/spec#reading-events)).
- On `cursor_expired`, tell the user that part of the conversation is missing ([8.5](https://personalagentprotocol.org/docs/0.3/spec#reading-events)).
- Show `text-delta` pieces only as a preview. Act only on the complete `message` event ([8.6](https://personalagentprotocol.org/docs/0.3/spec#streaming)).
- Put structured details in `data`, not JSON or other markup in `text` ([8.4](https://personalagentprotocol.org/docs/0.3/spec#message-fields)).
- With a company agent, skip greetings and small talk, and keep text short ([8.8](https://personalagentprotocol.org/docs/0.3/spec#human-or-ai)).
- Before asking for a person, send a short message that sums up the problem, so they don't have to read the whole conversation ([8.9](https://personalagentprotocol.org/docs/0.3/spec#handoff)).
- When a person takes over, write for them: concise, plain sentences, details in `text` rather than only in `data`, and time to reply.
- Close a conversation when the task is done ([8.12](https://personalagentprotocol.org/docs/0.3/spec#closing)).
- If a company agent asks in a message for a one-time code, or for details to verify the user, such as a date of birth or part of an account number, ask it to request sign-in with an `authorization` event instead ([8.11](https://personalagentprotocol.org/docs/0.3/spec#conversation-sign-in)). Don't send codes in messages ([Handling secrets](#both-secrets)).

### Choosing an interface

- Prefer the company's APIs and company agent over browsing its website. They are faster and change less often.
- Don't phone a company that publishes a `poppy.json`. Use the interfaces it lists instead.
- Skip API types and conversation protocols you don't recognize ([section 7](https://personalagentprotocol.org/docs/0.3/spec#apis), [8.1](https://personalagentprotocol.org/docs/0.3/spec#conversation-protocols)).

### Task coverage

- Read the company's excluded tasks before you try a task there. When the user's task is one of them, tell the user right away instead of trying each interface ([9.1](https://personalagentprotocol.org/docs/0.3/spec#excluded-tasks)).
- Offer the alternative when there is one. When it's something the user does themselves, such as a page that opens the company's app, give the user the link instead of browsing it yourself ([9.2](https://personalagentprotocol.org/docs/0.3/spec#alternatives)).
- When a company answers your feedback report with an alternative, try it before you tell the user the task can't be done ([9.3](https://personalagentprotocol.org/docs/0.3/spec#feedback)).

### Operations

When you support the [Operations extension](https://personalagentprotocol.org/docs/0.3/extensions/operations):

- Show the user the operation's `summary` as the company wrote it, with the company's name and the account it applies to. Point out any cost, date, or condition, and whether the action can be undone. Don't replace the summary with your own paraphrase ([Operations 5](https://personalagentprotocol.org/docs/0.3/extensions/operations#approval)).
- When a new revision of an operation arrives, with the same `operation_id`, drop the earlier one and show the user what changed before asking them to approve the new one.
- Show when the revision expires. If it expires before the user answers, make the request again for new terms, and ask again.
- Save the request that returned the operation, its method, URL, and body or the tool's arguments, and send exactly that with the approval. Don't have the model write the request again ([Operations 6](https://personalagentprotocol.org/docs/0.3/extensions/operations#sending-approval)).
- Check `terms` against what you asked for, such as the order, item, and amount, and tell the user about any difference. If you show values from `terms`, label them in words, such as "Order" rather than `order_id`.
- When the user says they'd approve something in advance, such as "go ahead with any exchange under $20", don't approve operations for them. If the company offers its own rules for that, offer to set one up with the company ([Operations 5](https://personalagentprotocol.org/docs/0.3/extensions/operations#approval)).
- After a request with an approval times out or gets a 503, send it again with the same approval, waiting for `Retry-After` if there is one. Don't ask the user to approve the action again until you know whether it happened ([Operations 7](https://personalagentprotocol.org/docs/0.3/extensions/operations#at-most-once)).

## For companies

### Choosing capabilities

Start with the tasks you want personal agents to accomplish and the interfaces you already have. Publish `poppy.json` with at least one of `apis`, `web`, or `agent` (MUST, [3.1](https://personalagentprotocol.org/docs/0.3/spec#fields)). Then choose the capabilities those tasks need:

- **Signed-out APIs.** You can expose a catalog or other stateless API without an OAuth server. Accept the Session header personal agents send. If the endpoint uses no Session claims, it can serve requests without verifying the header ([5.3](https://personalagentprotocol.org/docs/0.3/spec#session-verification)).
- **Session continuity.** Verify Session JWTs when you want to recognize a pseudonymous user, maintain a Session cart, or connect activity across channels. Verification is required before relying on Session identity, ownership, continuity, or state ([5.3](https://personalagentprotocol.org/docs/0.3/spec#session-verification)). This works without OAuth.
- **Account access.** Add OAuth when tasks need access to a user's account. Your endpoints can rely on OAuth alone if they use no Session claims. They still validate tokens and enforce scopes and any required DPoP checks. Check your existing authorization server against [what Poppy adds to OAuth](https://personalagentprotocol.org/docs/0.3/spec#oauth-additions) and [client metadata support](#company-agents).
- **Channels and other capabilities.** Offer APIs, web browsing, conversations, or a combination. Add browser join to connect website activity to a Session. Advertise excluded tasks, feedback, and extensions where they help users complete the tasks you support.

These choices are independent. An OAuth-backed API can work without shared Session state, and a signed-out conversation can use verified Sessions without account access. Personal agents keep sending the Session header on every request covered by [5.2](https://personalagentprotocol.org/docs/0.3/spec#session-header).

If your bot defenses block personal agents, plan operator recognition alongside whichever capabilities you choose. [Operator signatures](#both-operator-signatures) provide compatibility with existing defenses; an edge that verifies delegated Session JWTs can recognize the client directly. Recognition is separate from your decision to accept the client and authorize its work.

### Signed-out support without OAuth

You can offer signed-out Sessions, conversations, APIs, feedback, and browser join without running an authorization server ([3.2](https://personalagentprotocol.org/docs/0.3/spec#oauth-server)). Return 404 from the domain's protected resource metadata URL, or publish valid metadata without authorization servers. Leave out `auth.issuer`, sign-in extensions, and `access: signed_in` hints. Verify Session JWTs against `https://{organization.domain}`, with the host in lowercase and no trailing slash. The Personal Agent's client metadata and delegations need verification before you use Session claims or state ([5.3](https://personalagentprotocol.org/docs/0.3/spec#session-verification)).

When you add OAuth, publish protected resource and authorization server metadata together, and start using the issuer as the Company's identifier. If that identifier changes, Users get new IDs and Sessions. Plan an explicit migration if you need to retain their earlier state; the protocol does not link those identities automatically. Different issuerless domains are separate Companies.

### Verifying personal agents

- Fetch the `client_id` URL without following redirects. Its `client_id` MUST equal the URL you fetched ([4.1](https://personalagentprotocol.org/docs/0.3/spec#agent-identity)).
- Cache client metadata and key sets, as described in [Fetching metadata safely](#both-fetching).
- Keep allowlists or blocklists of `client_id` values, and rate-limit session creation and new `client_id` values ([4.1](https://personalagentprotocol.org/docs/0.3/spec#agent-identity)).
- Check whether your authorization server supports client ID metadata documents. Some do, some support them only for clients an administrator registers by URL, and some don't yet. If yours needs registration, register the personal agents you accept by their `client_id` URL and reject others with `invalid_client`, which 4.1 allows. Your OAuth integration can fetch and check the metadata document. Your resources also fetch it when verifying Session JWTs ([5.3](https://personalagentprotocol.org/docs/0.3/spec#session-verification)).

### Verifying the Session header

Verify Session headers generally (SHOULD, [5.3](https://personalagentprotocol.org/docs/0.3/spec#session-verification)). Complete all checks before trusting Session claims for identity, ownership, continuity, or state (MUST). Conversations, Session carts, browser join, and approval ownership need that verification. A stateless catalog endpoint can ignore the header. An account endpoint can use OAuth alone if it uses no Session claims or state. It still validates the token, its scopes and audience, and any required DPoP proof. To verify reliably:

- Verify the Session header in one place, such as a gateway in front of your APIs, conversation endpoint, and browser-session `/authorize` endpoint, and pass the verified `client_id`, `sid`, user ID, and agent ID to the services behind it.
- Cache verified delegations until they expire ([5.2](https://personalagentprotocol.org/docs/0.3/spec#delegated-keys)). Key the cache by a hash of the whole delegation, such as its SHA-256, not by its `jti`, which a forged delegation could copy. Most requests then need one signature check.
- Behind proxies and load balancers, compare `htu` with the public URL the personal agent used. Build it from your configured public origin, not from the `Host` header your server receives.
- Use an acceptance window of about one minute for `iat`, plus a small clock skew.
- Rejecting a reused `jti` is optional, as it is for DPoP proofs, because servers behind one endpoint don't always share state. Without it, a copied Session JWT still works only for the same method and URL, with the same access token, and within the acceptance window. A request that changes something then relies on being idempotent, so a replay doesn't repeat it. Conversation messages already are, through their IDs ([8.3](https://personalagentprotocol.org/docs/0.3/spec#sending-messages)).
- If you keep a replay cache keyed by `jti`, hold entries for the acceptance window and share it across every server. Otherwise a JWT accepted by one server can be replayed at another ([5.3](https://personalagentprotocol.org/docs/0.3/spec#session-verification)).
- Check `ath` against the access token, and that the token was issued to the JWT's `iss`. Reject an absent header when the request depends on Session claims (MUST, [5.3](https://personalagentprotocol.org/docs/0.3/spec#session-verification)). Don't use an unverified `iss`, `sub`, or `sid` for attribution, rate limits by identity, cache keys, or state lookup.
- Return `invalid_session` for a failed check, and keep access token errors in `WWW-Authenticate`, as OAuth does ([section 7](https://personalagentprotocol.org/docs/0.3/spec#apis)).
- Binding access tokens with DPoP is your choice ([4.5](https://personalagentprotocol.org/docs/0.3/spec#access-tokens)). If you do, verify the proof as RFC 9449 describes, separately from the Session JWT. If your authorization server can't issue DPoP-bound tokens, verifying the Session JWT and its `ath` binds the token to the personal agent's key. Endpoints that skip Session verification lose that extra protection.
- At an MCP server, accept a token issued for its `resource` only at that server (MUST, [section 7](https://personalagentprotocol.org/docs/0.3/spec#apis)). Accept the Session header there too, if you want its calls tied to sessions. Signed-out calls that use no Session state can work without verification.
- Serve personal agent conversations only from your conversation endpoint ([8.2](https://personalagentprotocol.org/docs/0.3/spec#conversation-requests)). If your website chat or other channels can open the same conversations, they may not check the Session header, and anyone with a copied token could read them there.

### Sessions

A session is named by the `client_id` and `sid` of its Session JWTs ([5.3](https://personalagentprotocol.org/docs/0.3/spec#session-verification)). Keep the Poppy session record at your resources, alongside your existing OAuth integration:

- Record the user ID and agent ID a session starts with, and reject later Session JWTs for it with different ones ([5.3](https://personalagentprotocol.org/docs/0.3/spec#session-verification)).
- Your authorization server doesn't see the Session header. Sign-in and refresh are plain OAuth, and a session is signed in on each request that carries an access token ([5.4](https://personalagentprotocol.org/docs/0.3/spec#sign-in)).
- Remember the `sid`s of sessions you end, and answer them with `invalid_session` ([5.5](https://personalagentprotocol.org/docs/0.3/spec#ending-sessions)). Choose a retention period that fits your session lifetimes.
- Use separate sessions for separate accounts. If your policy refuses a second account in a session, answer with `invalid_session` ([5.4](https://personalagentprotocol.org/docs/0.3/spec#sign-in)).
- Don't expect a user's delegated key to stay the same (MUST NOT, [5.2](https://personalagentprotocol.org/docs/0.3/spec#delegated-keys)), and don't store anything by it.

### Token lifetimes and sign-out

- Give access tokens a lifetime of hours, not days.
- At sign-out, invalidate the access tokens issued under the revoked refresh token, as [RFC 7009](https://www.rfc-editor.org/rfc/rfc7009) §2.1 describes, or check on each request whether the authorization is still active, so sign-out takes effect right away. If you can do neither, keep access tokens to a few minutes ([5.5](https://personalagentprotocol.org/docs/0.3/spec#ending-sessions)).
- Don't stop accepted work because the access token that started it expired. A job can outlast the token.
- Where work in progress can take consequential actions on the user's account, such as payments or changes that are hard to undo, tie it to the refresh token, so revoking access stops it right away.
- Give refresh tokens a lifetime that fits the account, such as 90 days, and expire ones that go unused sooner.
- Revoke a user's refresh tokens when they reset their password or you suspect the account is compromised.

### Describing scopes

Describe the scopes you offer personal agents, in the OAuth security scheme of an OpenAPI description you list or in `auth.scopes` (SHOULD, [4.7](https://personalagentprotocol.org/docs/0.3/spec#scopes)). Personal agents read them to choose scopes, and a language model often does the choosing:

- Say what the scope lets the personal agent see or do, in words a user understands.
- Be specific enough for a model to match a task to the scopes it needs. "See your orders and returns" works better than "Read access".
- Say whether the scope only reads, and whether a write scope also allows reading.
- Say in words which actions can't be undone and what personal data the scope shows.
- Give each scope its hints in `auth.scope_hints` ([4.7](https://personalagentprotocol.org/docs/0.3/spec#scopes)). Judge each scope by the most consequential operation that requires it: one operation that can't be undone makes the whole scope `irreversible`. When you're unsure about a scope, leave it out of `auth.scope_hints` rather than guess.
- Splitting a scope can earn it a better hint. A personal agent may request `orders:read` freely but ask the user first before requesting a scope that can cancel orders.

### Describing APIs

If you offer direct or device sign-in, make your scopes and APIs cover the tasks users ask personal agents to do. Otherwise personal agents may sign in on your website with the user's credentials instead ([10.5](https://personalagentprotocol.org/docs/0.3/spec#credentials)).

A language model usually reads your API descriptions and MCP tool descriptions to choose and call operations ([7](https://personalagentprotocol.org/docs/0.3/spec#apis)). Write them for that reader:

- Say clearly what each operation does and when to use it, in terms of the user's task.
- Keep them small. The whole description takes room in the model's context, so leave out what personal agents don't need, such as long examples or operations only your own apps call.

### Consent pages

The page where the user approves access, in direct and device sign-in ([4.2](https://personalagentprotocol.org/docs/0.3/spec#direct-sign-in), [4.3](https://personalagentprotocol.org/docs/0.3/spec#device-sign-in)):

- Show the personal agent's name and logo, and the domain of its `client_id`. The personal agent chooses its own name, so the domain is what the user can trust.
- Show the account being connected, the requested scopes in plain language, and how long access lasts. Group related scopes rather than listing their names.
- Point out scopes that allow changes that can't be undone or that show personal data, the scopes your `auth.scope_hints` mark `irreversible` or with `personal_data`.
- When the user already granted some of the scopes, show which ones are new, so the user doesn't review the whole list again. A personal agent that needs more access requests every scope it needs again ([4.7](https://personalagentprotocol.org/docs/0.3/spec#scopes)).
- Protect the page against cross-site request forgery, and against framing by other sites with `Content-Security-Policy: frame-ancestors`.
- `redirect_uri` MUST exactly match an entry in the personal agent's `redirect_uris` ([4.2](https://personalagentprotocol.org/docs/0.3/spec#direct-sign-in)).
- Accept PKCE with `S256` only, and reject `plain`.
- Return `iss` in every redirect, success or error ([4.2](https://personalagentprotocol.org/docs/0.3/spec#direct-sign-in)). Personal agents reject a redirect without it.
- For extra protection, support Pushed Authorization Requests ([RFC 9126](https://www.rfc-editor.org/rfc/rfc9126)).

### Device sign-in

- Follow the best practices for cross-device flows in [RFC 10027](https://www.rfc-editor.org/rfc/rfc10027) §2 (MUST, [4.3](https://personalagentprotocol.org/docs/0.3/spec#device-sign-in)): assess the risk before offering device sign-in, and choose mitigations from its §6.1, such as short-lived single-use codes, rate limits, limited scopes, and a consent page that says which personal agent is asking and tells the user to decline a code they didn't ask for.
- Opening the link MUST NOT approve the request by itself ([4.3](https://personalagentprotocol.org/docs/0.3/spec#device-sign-in)). The same goes for scanning the QR code. The user signs in and approves on the page.
- Ask the user to confirm that the code on the page matches the one the personal agent shows.
- Return `slow_down` to personal agents that poll faster than `interval`, and limit wrong `user_code` entries.
- Keep `expires_in` short, such as 10 minutes.

### Mediated sign-in

The [Mediated Sign-In extension](https://personalagentprotocol.org/docs/0.3/extensions/mediated-sign-in) is transitional. Offer it only until you can add direct or device sign-in, and plan its removal: the protocol plans to retire it, on a date set when version 1.0 is published.

If you offer mediated sign-in, protect the credentials you accept ([Mediated Sign-In 6](https://personalagentprotocol.org/docs/0.3/extensions/mediated-sign-in#security)):

- Rate-limit attempts by account, by `client_id`, and by network address, and cap wrong one-time codes.
- Require a one-time code when a sign-in looks unusual, including a personal agent's first mediated sign-in after the user disconnected it.
- Return the same `invalid_grant` error for an unknown account and a wrong password, so responses don't reveal whether an account exists.
- Never store raw credentials or codes, including in logs, traces, and idempotency records.
- Tell the user, for example by email, when a personal agent signs in.

### Account settings

- In account settings, list each connected personal agent with its name, domain, scopes, and when it was last used.
- Offer a control to disconnect each one. Disconnecting revokes its refresh tokens and access tokens, and its sessions continue signed out ([5.5](https://personalagentprotocol.org/docs/0.3/spec#ending-sessions)).

### Browser sessions

- Offer `web.browser_session_endpoint` if you want personal agents' browsing in the same session as their API calls and conversations, signed in or out. Without it, they browse your website only as ordinary signed-out visitors ([section 6](https://personalagentprotocol.org/docs/0.3/spec#web-browsing)), and use your APIs and conversations for anything that needs the account.
- Make each code at least 128 random bits, and expire it within 60 seconds.
- Set the cookie that ties the code to the browser as `__Host-poppy_join=…; Path=/; Max-Age=60; Secure; HttpOnly; SameSite=Strict`, with `Max-Age` no longer than the code's lifetime. The `__Host-` prefix keeps other hosts on your domain from setting it, and `SameSite=Strict` keeps a form on another site from sending it ([RFC 6265bis](https://datatracker.ietf.org/doc/draft-ietf-httpbis-rfc6265bis/)).
- Send the page with `Cache-Control: no-store`, `Content-Security-Policy: frame-ancestors 'none'`, and `Cross-Origin-Opener-Policy: same-origin`, so caches don't keep it, other pages can't frame it, and the page that opened it can't keep a reference to its window ([section 6](https://personalagentprotocol.org/docs/0.3/spec#web-browsing)).
- Answer a successful form with `303 See Other`, and a failed one with 400, or 429 when the browser sends too many requests.
- Don't log the endpoint's responses or request bodies. They contain browser-session codes.
- Keep a short-lived record for each code: whether it was authorized, for which session and account, and whether it was submitted. A store with a time to live of the code's lifetime works.
- Use a cookie for the session that's separate from your login cookie, and check it first. After a signed-out join, keep the browser's login cookie. After a signed-in join, clear it, so the browser is signed out when the session's sign-in ends. [Section 6](https://personalagentprotocol.org/docs/0.3/spec#web-browsing) has a table of each case.
- Make the session's cookie `Secure` and `HttpOnly`, and use the `__Host-` prefix unless it has to cover several hosts. Limit it to the hosts personal agents need, such as your main site, rather than your whole domain.
- Look up the session on each request, so sign-out and scope changes take effect on the website right away.

### Enforcing scopes everywhere

- Apply the same scope rules on your website, APIs, company agent, and live agents. One shared check that every channel calls is easiest to keep consistent.
- Have the company agent's tools check the token's scopes on every call. Don't rely on the model to decide.
- Give live agents' tools the same checks, so a person can't make a change the token doesn't allow ([8.11](https://personalagentprotocol.org/docs/0.3/spec#conversation-sign-in)).
- Check read and write scopes separately. If a write scope also allows reading, say so in its description.
- When your website refuses an action for a missing scope, show an error that names the scopes (SHOULD, [section 6](https://personalagentprotocol.org/docs/0.3/spec#web-browsing)).

### Internal services

- Don't forward an access token or Session JWT from one of your services to another.
- Verify them at the edge, then pass the verified `client_id`, session, user ID, account, and scopes to internal services through a gateway or service credentials.
- Internal credentials used for a request shouldn't allow more than the access token does.

### Hosting several companies

A provider, such as a commerce platform, can run the protocol for several independent companies on the same servers. Each company needs its own issuer ([3.2](https://personalagentprotocol.org/docs/0.3/spec#oauth-server)). For example, a platform hosts two merchants. Example Outfitters has a storefront for each of two countries, and Example Books has one:

| Storefront domain | Issuer | Company |
| --- | --- | --- |
| `outfitters.example` | `https://auth.platform.example/outfitters` | Example Outfitters |
| `outfitters-uk.example` | `https://auth.platform.example/outfitters` | Example Outfitters |
| `books.example` | `https://auth.platform.example/books` | Example Books |

The two Outfitters storefronts share an issuer, so they are one company: a user has the same user ID, sessions, and refresh tokens at both. Books has its own issuer, so it's a separate company, even though it runs on the same servers.

- Publish metadata for each issuer at its own URL, such as `https://auth.platform.example/.well-known/oauth-authorization-server/outfitters` ([3.2](https://personalagentprotocol.org/docs/0.3/spec#oauth-server)). Its `issuer` is the full issuer, and its `protected_resources` lists only that company's storefronts and resources, such as `https://outfitters.example`.
- Publish protected resource metadata on each storefront's domain, with its company's issuer in `authorization_servers` ([3.2](https://personalagentprotocol.org/docs/0.3/spec#oauth-server)).
- Serve each storefront's `poppy.json` on the storefront's own domain. A document redirected to the platform's domain speaks for the platform, not the storefront ([3.1](https://personalagentprotocol.org/docs/0.3/spec#fields)).
- Companies can share a token endpoint, servers, and signing keys. Only the issuer decides which company a token belongs to.
- Record the issuer with every session and token, and check it on every request. An access token, refresh token, or Session JWT for Outfitters must not work at Books, even when both are served by the same code.
- Don't use one company's records for another. A user's sessions, user IDs, and accounts at one company are unknown to every other company the platform hosts.

### An issuer for personal agents

A company can offer personal agents less than its other OAuth clients get without a second issuer by limiting the scopes it grants by client, as OAuth allows ([4.7](https://personalagentprotocol.org/docs/0.3/spec#scopes)). It can also leave scopes it doesn't offer personal agents out of `scopes_supported`, as RFC 8414 allows ([3.2](https://personalagentprotocol.org/docs/0.3/spec#oauth-server)). That list is discovery, not enforcement: agents can request scopes documented by an API or sign-in extension too.

Sign-in types are different. `grant_types_supported` has no such allowance, and a company whose issuer offers the authorization code or device grant to other clients offers direct or device sign-in to personal agents too ([section 4](https://personalagentprotocol.org/docs/0.3/spec#oauth)). To keep one of them from personal agents, use an issuer only for personal agents, such as `https://auth.example.com/agents`. It can share servers, signing keys, and user accounts with the main issuer.

Choose the issuer before launch. User IDs and refresh tokens belong to the issuer ([3.2](https://personalagentprotocol.org/docs/0.3/spec#oauth-server)), so changing it later makes the company a new company to every personal agent: existing sessions and refresh tokens stop working, and users sign in again.

### Guest access

Let a signed-out personal agent session do what a signed-out visitor can do on your website, such as search products, read store policies, or ask the company agent general questions. Limit abuse with rate limits by `client_id`, not by turning personal agents away.

### Conversations

- Let your company agent do everything customers can do by phone, as fully as you can, so personal agents have no reason to call.
- Put structured details in `data`, not JSON or other markup in `text` ([8.4](https://personalagentprotocol.org/docs/0.3/spec#message-fields)).
- Write for whoever is on the other side ([8.8](https://personalagentprotocol.org/docs/0.3/spec#human-or-ai)). With a personal agent, skip greetings and small talk and keep text short. With the user, use plain sentences, a pace they can follow, and details in `text` rather than only in `data`. In a direct conversation, reply as you would to the customer on your own channels.
- Keep a conversation's events for at least 30 days, so a personal agent that reconnects rarely hits `cursor_expired` ([8.5](https://personalagentprotocol.org/docs/0.3/spec#reading-events)).
- On a stream with nothing to send, send an SSE comment every 15 to 30 seconds, so proxies don't close it ([8.6](https://personalagentprotocol.org/docs/0.3/spec#streaming)).
- When a session signs out, answer requests without an access token on its conversations that used the account with a 401 challenge, including reads of their events, so their account details can't be read signed out ([5.5](https://personalagentprotocol.org/docs/0.3/spec#ending-sessions), [8.11](https://personalagentprotocol.org/docs/0.3/spec#conversation-sign-in)). Leave them open, so the user can sign in again and continue, or close them if your policy is to clear everything at sign-out.
- Before closing an inactive conversation, say so in a message ([8.12](https://personalagentprotocol.org/docs/0.3/spec#closing)).
- When you send an `authorization` event, also ask in a message, so a user in a direct conversation sees the request ([8.11](https://personalagentprotocol.org/docs/0.3/spec#conversation-sign-in)).
- When sign-in can verify the user, send an `authorization` event ([8.11](https://personalagentprotocol.org/docs/0.3/spec#conversation-sign-in)) rather than asking for identifying details in messages, such as a date of birth, part of an account number, or a code sent by text. Sign-in proves who the user is, and it keeps codes and personal details out of messages and model context ([Handling secrets](#both-secrets)).
- Give the people a conversation is handed to ([8.9](https://personalagentprotocol.org/docs/0.3/spec#handoff)) the same way to ask for sign-in, so they don't fall back to verification questions.

For a conversation endpoint that requires account access before useful work, list `access: signed_in` on its `agent.protocols` entry. Keep it absent or `session` when general questions work signed out. Use the existing authorization event when the account is needed later. If response headers are still available, you can also send a matching `WWW-Authenticate` header ([8.11](https://personalagentprotocol.org/docs/0.3/spec#conversation-sign-in)). Do not change a successful status to a failure after accepting the message, or depend on OAuth libraries reading a challenge from a successful response. Some libraries expose the challenge as an exception even on a successful response. Personal agents using them should check the original status, read the accepted response and its authorization event, and handle the header and event together without retrying the accepted message.

### Excluded tasks and feedback

- List the tasks you've chosen not to offer to personal agents, such as ones you allow only in your app for security or regulatory reasons ([9.1](https://personalagentprotocol.org/docs/0.3/spec#excluded-tasks)). Personal agents then stop looking for a way to do them, and don't send feedback about them.
- Write each task the way a customer would ask for it, such as "Send a wire transfer".
- Give an alternative whenever there is one. Link to the page, or the screen in your app, where the user can do the task ([9.2](https://personalagentprotocol.org/docs/0.3/spec#alternatives)).
- Set caching headers on the document, and update it when you add or remove a task.
- When a feedback report asks for a task you do offer, answer with an alternative that says how, so the personal agent can finish the task ([9.3](https://personalagentprotocol.org/docs/0.3/spec#feedback)).
- Take feedback only at `feedback.endpoint` ([9.3](https://personalagentprotocol.org/docs/0.3/spec#feedback)). Don't offer a second feedback operation in your APIs, so personal agents don't have to choose between them.

### Operations

When you offer the [Operations extension](https://personalagentprotocol.org/docs/0.3/extensions/operations):

- Ask for approval for actions with a business effect that the user would want to confirm, such as ones that cost money or can't be undone. Don't ask for routine changes the user already asked for in so many words, such as updating a saved address.
- Write the `summary` so it stands alone: what will happen, to what, and any cost, date, or condition. Use bold for what matters most, such as the amount, and keep links out of it. Personal agents show it to users as is ([Operations 3](https://personalagentprotocol.org/docs/0.3/extensions/operations#operation-object)).
- Name the keys of `terms` after the fields of the request or of your API's resources, such as `order_id`, so personal agents can compare them with what they asked for ([Operations 3](https://personalagentprotocol.org/docs/0.3/extensions/operations#operation-object)).
- Say in your OpenAPI description which endpoints can return `approval_required` ([Operations 4](https://personalagentprotocol.org/docs/0.3/extensions/operations#approval-required)).
- To let users allow some actions in advance, such as exchanges for a different size that cost under $20, don't return operations for those actions. You can offer your own API or tool for users to set such rules. Make setting a rule an operation itself, so the user approves the exact rule.
- Choose `expires_at` for each kind of action. Give the user at least 15 minutes, and longer for terms that don't change, such as cancelling a subscription at the end of the month. Keep it short when you hold something for the user, such as a seat or a sale price ([Operations 3](https://personalagentprotocol.org/docs/0.3/extensions/operations#operation-object)).
- Keep your record of a performed operation until its approved revision expires, and no longer than you need to. A store with a time to live set from `expires_at` works ([Operations 7](https://personalagentprotocol.org/docs/0.3/extensions/operations#at-most-once)).
- To avoid storing operations nobody has approved, compute them from the request ([Operations 3](https://personalagentprotocol.org/docs/0.3/extensions/operations#operation-object)). Derive the `operation_id` from your record of the action, such as `exchange:ord_7Hk2:itm_4Qa` or a hash of it. Make the `revision` the expiry as a Unix time and an HMAC-SHA256 over the `operation_id`, the method, URL, and canonical body or the tool's arguments, the `summary`, the `terms`, and the expiry, with a key kept like your other signing keys. When the request comes back with an approval, compute the HMAC again, compare it in constant time, and check the expiry. If you store operations instead, store each revision's terms with such a fingerprint of the request, so you can check that a request with an approval asks for exactly what was approved ([Operations 6](https://personalagentprotocol.org/docs/0.3/extensions/operations#sending-approval)).
- When you call another system to perform the action, such as a payment processor or a warehouse, derive its idempotency key from the operation ID. A retry then can't perform the action twice downstream either.
- If a downstream call times out, ask that system whether the action happened, using your business reference, before trying again. Until you know, answer retries with 503 and `Retry-After` ([Operations 7](https://personalagentprotocol.org/docs/0.3/extensions/operations#at-most-once)).
- Keep a record of each approval: the operation, revision, `client_id`, account, and time. It shows what the personal agent stated the user approved ([Operations 8.1](https://personalagentprotocol.org/docs/0.3/extensions/operations#approval-proof)).

### Error messages

- Keep `error_description` and other error text free of account details and other users' data.
- Return the same error for "doesn't exist" and "belongs to someone else", as `conversation_not_found` does ([8.13](https://personalagentprotocol.org/docs/0.3/spec#conversation-errors)).

---

Licensed under the [Apache License 2.0](https://personalagentprotocol.org/license).
