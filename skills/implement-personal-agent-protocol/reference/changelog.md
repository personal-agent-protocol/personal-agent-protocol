# Changelog

What changed in each version of the specification, extensions, and guides, newest first. Each published version stays at its own URL, such as [/docs/0.1/spec](https://personalagentprotocol.org/docs/0.1/spec).

## Draft 0.3

In progress, at [/docs/spec](https://personalagentprotocol.org/docs/0.3/spec). This list grows until 0.3 is published. Major changes are design decisions. Minor changes fill gaps, make the text consistent, or follow an RFC. A change tagged "Breaking" can require an implementation that followed the 0.2 text to change, whether it's major or minor.

### Major changes

#### Protocol layers overview

[Spec 1](https://personalagentprotocol.org/docs/0.3/spec#intro) · [Spec 1.1](https://personalagentprotocol.org/docs/0.3/spec#layers) · [Spec 5](https://personalagentprotocol.org/docs/0.3/spec#sessions)

The introduction explains discovery, operator recognition, Sessions, account access, interaction channels, and task coverage and extensions as separate components. It distinguishes the Session header Personal Agents send from the verification Companies perform before relying on Session claims. The Sessions introduction makes the same distinction. This overview changes no protocol requirements.

#### Signed-out Companies without OAuth

Breaking · [Spec 2](https://personalagentprotocol.org/docs/0.3/spec#terms) · [Spec 3](https://personalagentprotocol.org/docs/0.3/spec#discovery) · [Spec 3.1](https://personalagentprotocol.org/docs/0.3/spec#fields) · [Spec 3.2](https://personalagentprotocol.org/docs/0.3/spec#oauth-server) · [Spec 4](https://personalagentprotocol.org/docs/0.3/spec#oauth) · [Spec 5.1](https://personalagentprotocol.org/docs/0.3/spec#user-ids) · [Spec 5.2](https://personalagentprotocol.org/docs/0.3/spec#session-header) · [Spec 5.3](https://personalagentprotocol.org/docs/0.3/spec#session-verification) · [Spec 10.4](https://personalagentprotocol.org/docs/0.3/spec#assertion-audience)

A Company needs an OAuth issuer only for account access. Without one, its identifier, Session JWT audience, and User ID namespace are `https://{organization.domain}`, with a lowercase host and no trailing slash. A 404 or valid protected resource metadata without authorization servers establishes this mode; discovery errors do not. Adding an issuer changes the identifier when it differs from the domain, requiring new User IDs, Agent IDs, and Sessions. Sessions remain required.

#### Shared issuer with per-domain descriptions

[Spec 3.2](https://personalagentprotocol.org/docs/0.3/spec#oauth-server)

Domains sharing a Company issuer must select that issuer and preserve each scope's authorization meaning. Identical scope descriptions and hints are recommended, rather than requiring identical `auth` objects. Domains may expose different scopes and capabilities.

#### Company-defined scopes

Breaking · [Spec 2](https://personalagentprotocol.org/docs/0.3/spec#terms) · [Spec 3](https://personalagentprotocol.org/docs/0.3/spec#discovery) · [Spec 3.1](https://personalagentprotocol.org/docs/0.3/spec#fields) · [Spec 3.2](https://personalagentprotocol.org/docs/0.3/spec#oauth-server) · [Spec 4.7](https://personalagentprotocol.org/docs/0.3/spec#scopes) · [Mediated Sign-In 2](https://personalagentprotocol.org/docs/0.3/extensions/mediated-sign-in#support) · [Guides: Choosing how to sign in](https://personalagentprotocol.org/docs/0.3/guides#agent-choosing-sign-in) · [Guides: Describing scopes](https://personalagentprotocol.org/docs/0.3/guides#company-scope-descriptions) · [Guides: Enforcing scopes everywhere](https://personalagentprotocol.org/docs/0.3/guides#company-scopes) · [Guides: An issuer for personal agents](https://personalagentprotocol.org/docs/0.3/guides#company-agent-issuer)

The protocol no longer defines `poppy:read` and `poppy:write`, or reserves names starting with `poppy:`. Each Company defines its own scopes, usually the OAuth scopes it already has. Publishing a complete `scopes_supported` list in OAuth metadata is recommended, following RFC 8414 §2. Personal Agents can also request scopes documented by the Company's APIs or sign-in extensions. The Company should describe each scope, in the OAuth security scheme of an OpenAPI description it lists, or otherwise in `auth.scopes`, which replaces `auth.custom_scopes` and has the same form as the `scopes` of an OAuth 2.0 security scheme in OpenAPI. `scopes_supported` may leave out scopes the Company doesn't offer Personal Agents, and the Company may limit the scopes it grants by client, so an issuer that serves other clients doesn't need a separate one for Personal Agents.

#### Sign-in types from the OAuth server metadata

Breaking · [Spec 3.1](https://personalagentprotocol.org/docs/0.3/spec#fields) · [Spec 3.2](https://personalagentprotocol.org/docs/0.3/spec#oauth-server) · [Spec 4](https://personalagentprotocol.org/docs/0.3/spec#oauth) · [Spec 10.3](https://personalagentprotocol.org/docs/0.3/spec#trust) · [Guides: An issuer for personal agents](https://personalagentprotocol.org/docs/0.3/guides#company-agent-issuer)

`auth.direct`, `auth.device`, and their `scopes` are removed from `poppy.json`. A Company offers Direct and Device Sign-In when `grant_types_supported` in its OAuth server metadata includes `authorization_code` or `urn:ietf:params:oauth:grant-type:device_code`, so there's no second list to drift out of sync with the issuer. `grant_types_supported` is now required, and includes `refresh_token`. A Company whose issuer offers one of these grants to other clients offers it to Personal Agents too, and the guides explain how to keep one from Personal Agents with an issuer only for them. Direct and Device Sign-In grant the scopes the issuer's policies allow. Only Mediated Sign-In keeps its own list of scopes, now in its extension.

#### Account access before a conversation

[Spec 3.1](https://personalagentprotocol.org/docs/0.3/spec#fields) · [Spec 3.2](https://personalagentprotocol.org/docs/0.3/spec#oauth-server)

A `poppy` conversation entry can declare `access: signed_in` when it needs account access from the start, or `session`, the default. Unknown hints are ignored and runtime authorization remains authoritative. APIs use OpenAPI security requirements and MCP authorization rather than another scope declaration.

#### Scope hints

[Spec 3](https://personalagentprotocol.org/docs/0.3/spec#discovery) · [Spec 3.1](https://personalagentprotocol.org/docs/0.3/spec#fields) · [Spec 4.7](https://personalagentprotocol.org/docs/0.3/spec#scopes) · [Guides: Choosing how to sign in](https://personalagentprotocol.org/docs/0.3/guides#agent-choosing-sign-in) · [Guides: Describing scopes](https://personalagentprotocol.org/docs/0.3/guides#company-scope-descriptions) · [Guides: Consent pages](https://personalagentprotocol.org/docs/0.3/guides#company-consent)

A Company can give hints about each scope in `auth.scope_hints`: whether its `changes` are `none`, `reversible`, or `irreversible`, and whether it touches `personal_data`, after MCP's tool annotations but for a whole scope. Each entry describes the most consequential action that requires the scope. A Personal Agent can then decide before sign-in which scopes need the User's go-ahead, rather than catching each action, and treats a `changes` value it doesn't recognize as `irreversible`. OAuth and OpenAPI describe a scope with one string, so the hints are a field in `poppy.json`, and they cover scopes described in OpenAPI too.

#### OAuth and Sessions sections

[Spec 1](https://personalagentprotocol.org/docs/0.3/spec#intro) · [Spec 4](https://personalagentprotocol.org/docs/0.3/spec#oauth) · [Spec 4.1](https://personalagentprotocol.org/docs/0.3/spec#agent-identity) · [Spec 4.2](https://personalagentprotocol.org/docs/0.3/spec#direct-sign-in) · [Spec 4.3](https://personalagentprotocol.org/docs/0.3/spec#device-sign-in) · [Spec 4.4](https://personalagentprotocol.org/docs/0.3/spec#refresh-tokens) · [Spec 4.5](https://personalagentprotocol.org/docs/0.3/spec#access-tokens) · [Spec 4.6](https://personalagentprotocol.org/docs/0.3/spec#revocation) · [Spec 4.7](https://personalagentprotocol.org/docs/0.3/spec#scopes) · [Spec 4.8](https://personalagentprotocol.org/docs/0.3/spec#oauth-additions) · [Spec 5](https://personalagentprotocol.org/docs/0.3/spec#sessions) · [Spec 5.1](https://personalagentprotocol.org/docs/0.3/spec#user-ids) · [Spec 5.2](https://personalagentprotocol.org/docs/0.3/spec#session-header) · [Spec 5.3](https://personalagentprotocol.org/docs/0.3/spec#session-verification) · [Spec 5.4](https://personalagentprotocol.org/docs/0.3/spec#sign-in) · [Spec 5.5](https://personalagentprotocol.org/docs/0.3/spec#ending-sessions) · [Spec 5.6](https://personalagentprotocol.org/docs/0.3/spec#sending-requests) · [Spec 7](https://personalagentprotocol.org/docs/0.3/spec#apis) · [Spec 11](https://personalagentprotocol.org/docs/0.3/spec#references)

Section 4, "Sessions and authorization", is now two sections, so the spec reads as standard OAuth with Poppy on top. Section 4, "OAuth", has agent identity, Direct and Device Sign-In, refresh tokens, access tokens, revocation, and scopes and token responses, and ends with a list of what Poppy adds to OAuth (4.8), including the choices where it is stricter than OAuth. Section 5, "Sessions", has User IDs, the Session header, its verification, signing in, ending Sessions, and sending requests. Browser join is summarized in the section 5 introduction and defined in section 6. The MCP rules moved to section 7, with the other API rules. Sections 5 to 10 are now 6 to 11.

The OAuth flows now cite their RFCs instead of restating them. Each one summarizes the grant, shows one example, and lists only the rules Poppy adds. Rules that were stated in more than one place are now stated once. The references add RFC 9700.

#### Session header separate from OAuth

Breaking · [Spec 2](https://personalagentprotocol.org/docs/0.3/spec#terms) · [Spec 3](https://personalagentprotocol.org/docs/0.3/spec#discovery) · [Spec 3.2](https://personalagentprotocol.org/docs/0.3/spec#oauth-server) · [Spec 4](https://personalagentprotocol.org/docs/0.3/spec#oauth) · [Spec 4.2](https://personalagentprotocol.org/docs/0.3/spec#direct-sign-in) · [Spec 4.3](https://personalagentprotocol.org/docs/0.3/spec#device-sign-in) · [Spec 4.4](https://personalagentprotocol.org/docs/0.3/spec#refresh-tokens) · [Spec 4.5](https://personalagentprotocol.org/docs/0.3/spec#access-tokens) · [Spec 4.7](https://personalagentprotocol.org/docs/0.3/spec#scopes) · [Spec 4.8](https://personalagentprotocol.org/docs/0.3/spec#oauth-additions) · [Spec 5](https://personalagentprotocol.org/docs/0.3/spec#sessions) · [Spec 5.2](https://personalagentprotocol.org/docs/0.3/spec#session-header) · [Spec 5.3](https://personalagentprotocol.org/docs/0.3/spec#session-verification) · [Spec 5.4](https://personalagentprotocol.org/docs/0.3/spec#sign-in) · [Spec 5.5](https://personalagentprotocol.org/docs/0.3/spec#ending-sessions) · [Spec 5.6](https://personalagentprotocol.org/docs/0.3/spec#sending-requests) · [Spec 6](https://personalagentprotocol.org/docs/0.3/spec#web-browsing) · [Spec 7](https://personalagentprotocol.org/docs/0.3/spec#apis) · [Spec 8.2](https://personalagentprotocol.org/docs/0.3/spec#conversation-requests) · [Spec 8.6](https://personalagentprotocol.org/docs/0.3/spec#streaming) · [Spec 8.11](https://personalagentprotocol.org/docs/0.3/spec#conversation-sign-in) · [Spec 8.13](https://personalagentprotocol.org/docs/0.3/spec#conversation-errors) · [Spec 9.3](https://personalagentprotocol.org/docs/0.3/spec#feedback) · [Spec 10.4](https://personalagentprotocol.org/docs/0.3/spec#assertion-audience) · [Spec 11](https://personalagentprotocol.org/docs/0.3/spec#references) · [Operations 6](https://personalagentprotocol.org/docs/0.3/extensions/operations#sending-approval) · [Guides: Handling secrets](https://personalagentprotocol.org/docs/0.3/guides#both-secrets) · [Guides: Signing and verifying JWTs](https://personalagentprotocol.org/docs/0.3/guides#both-signing) · [Guides: User IDs](https://personalagentprotocol.org/docs/0.3/guides#agent-user-ids) · [Guides: The Session header](https://personalagentprotocol.org/docs/0.3/guides#agent-session-header) · [Guides: Storing tokens](https://personalagentprotocol.org/docs/0.3/guides#agent-tokens) · [Guides: Direct and device sign-in](https://personalagentprotocol.org/docs/0.3/guides#agent-direct-device) · [Guides: Verifying personal agents](https://personalagentprotocol.org/docs/0.3/guides#company-agents) · [Guides: Verifying the Session header](https://personalagentprotocol.org/docs/0.3/guides#company-session-header) · [Guides: Sessions](https://personalagentprotocol.org/docs/0.3/guides#company-sessions) · [Guides: Token lifetimes and sign-out](https://personalagentprotocol.org/docs/0.3/guides#company-lifetimes)

Sessions and account access are now separate. Every request a Personal Agent sends to a Company's APIs, conversations, and protocol and extension endpoints carries a `Poppy-Session` header: a JWT, typed `poppy-session+jwt`, that the Personal Agent signs for that one request. It names the Personal Agent in `iss`, the Company's issuer in `aud`, the Session in `sid`, a random ID the Personal Agent chooses, the User ID in `sub`, and the optional Agent ID, and covers the request's method and URL in `htm` and `htu`, as a DPoP proof does. When the request carries an access token, `ath` covers it too. A request with only the Session header is signed out, and one that also carries an access token is signed in. The Company checks the JWT before it starts or continues a Session. It returns `invalid_session` (HTTP 400, JSON body) at every endpoint that takes the header when a check fails, when it refuses the `client_id`, or when the Session has ended, and may include an `error_description`. The Personal Agent then starts a new Session once, and stops if that fails too. The references list RFC 8725, for the JWT's `typ`, instead of RFC 7519.

Account access is plain OAuth, with OAuth's names: a refresh token, which was the Account Token, and an access token, which was the signed-in Session Token. Sign-in, refresh, and revocation don't know the Session, so one sign-in can serve several Sessions, and `session_id` is removed. So are the JWT bearer grant for signed-out Session Tokens, its renewal, and its Session assertion. Binding access tokens with DPoP is the Company's choice, and Personal Agents should support it. A Personal Agent that does sends a DPoP proof with its token requests when the issuer's metadata lists `dpop_signing_alg_values_supported`, as RFC 9449 §5.1 describes. The DPoP rules Poppy added to RFC 9449 are removed: that Companies accept `ES256` proofs, that Personal Agents support nonces and use a separate DPoP key for each User ID, and that the token endpoint rejects a reused proof `jti`. So is the rule that a Company encrypts Session Tokens that carry its own credentials. When Session verification applies, `ath` binds the access token to the Personal Agent's key. Endpoints that skip Session verification lose this additional protection; OAuth validation and any required DPoP remain.

Session verification is recommended generally and required before trusting Session claims for identity, ownership, continuity, or state. Stateless APIs and OAuth-only account endpoints can ignore the header if they use none of those claims. Conversations, Session carts, browser join and approval ownership still require it. Feedback can be accepted without attribution; attributing a report requires verification. The authorization server doesn't see User IDs.

MCP servers take the Company's access tokens, requested with `resource` set to the server's `url`, as before, and the rules on which MCP servers get Bearer tokens and which get DPoP-bound ones are removed. Like other APIs, an MCP server can ignore the Session header when it uses no Session claims, including for signed-out calls. Its calls then don't join the Session's state. Requests from MCP clients that don't implement this protocol belong to no Session, instead of each sign-in starting a signed-in Session without a User ID.

#### Agent IDs for several agents

[Spec 5.1](https://personalagentprotocol.org/docs/0.3/spec#user-ids) · [Spec 5.2](https://personalagentprotocol.org/docs/0.3/spec#session-header) · [Spec 5.3](https://personalagentprotocol.org/docs/0.3/spec#session-verification) · [Issue #36](https://github.com/personal-agent-protocol/personal-agent-protocol/issues/36)

A Personal Agent that acts for a User through several agents can say which one a Session is for in an optional `agent_id` claim in its Session JWTs. The Agent ID follows the rules for User IDs and doesn't name a separate party. Companies may use it to tell the agents apart, but the agents share the User's account, refresh tokens, and conversations. Every Session JWT for a Session carries the same Agent ID, or none, and the Company rejects one that differs from the Session's.

#### Session JWTs signed with delegated keys

Breaking · [Spec 2](https://personalagentprotocol.org/docs/0.3/spec#terms) · [Spec 4.1](https://personalagentprotocol.org/docs/0.3/spec#agent-identity) · [Spec 4.8](https://personalagentprotocol.org/docs/0.3/spec#oauth-additions) · [Spec 5.2](https://personalagentprotocol.org/docs/0.3/spec#session-header) · [Spec 10.7](https://personalagentprotocol.org/docs/0.3/spec#delegated-key-security) · [Spec 11](https://personalagentprotocol.org/docs/0.3/spec#references) · [Guides: Signing and verifying JWTs](https://personalagentprotocol.org/docs/0.3/guides#both-signing) · [Guides: Rotating keys](https://personalagentprotocol.org/docs/0.3/guides#both-key-rotation) · [Guides: The Session header](https://personalagentprotocol.org/docs/0.3/guides#agent-session-header) · [Guides: Native and distributed apps](https://personalagentprotocol.org/docs/0.3/guides#agent-native-apps)

The keys in a Personal Agent's `jwks_uri`, which signed Session and browser assertions in 0.2, don't sign Session JWTs. They sign delegations: JWTs, typed `pap-delegation+jwt`, that vouch for a delegated key in an RFC 7800 `cnf` claim and last at most 24 hours. The Personal Agent signs its Session JWTs with the delegated key and carries the delegation in the JWT's `pap_dlg` header, and the Company verifies the delegation, then the JWT. A delegation carries nothing about the User or Companies, so the keys in `jwks_uri` sign only delegations and client assertions, and say nothing about which Companies a User uses. Each delegated key signs for one User ID, so a leaked one exposes one User at one Company, and Companies can't match Users by their keys. Companies don't expect a delegated key to stay the same, and the guides suggest rounding a delegation's times. 10.7 says what delegations hide from the Personal Agent's own systems, and what they don't. The references add RFC 7638 and RFC 7800.

#### Recommended operator signatures for edge compatibility

[Spec 1.1](https://personalagentprotocol.org/docs/0.3/spec#layers) · [Spec 5.3](https://personalagentprotocol.org/docs/0.3/spec#session-verification) · [Guides: Operator signatures and bot defenses](https://personalagentprotocol.org/docs/0.3/guides#both-operator-signatures)

Personal Agents should also sign requests carrying the Session header with an HTTP Message Signature using Web Bot Auth, so existing traffic-management infrastructure can authenticate an operator. It covers the Session header and access token when present, but does not replace Session verification or Company acceptance and account authorization. An edge that verifies delegated Session JWTs can authenticate the client without it.

#### Refused account changes

Breaking · [Spec 5.4](https://personalagentprotocol.org/docs/0.3/spec#sign-in) · [Spec 10.4](https://personalagentprotocol.org/docs/0.3/spec#assertion-audience) · [Guides: Storing tokens](https://personalagentprotocol.org/docs/0.3/guides#agent-tokens) · [Guides: Sessions](https://personalagentprotocol.org/docs/0.3/guides#company-sessions)

The `account_mismatch` error is removed, and so is the rule that a Session signed in to one account can never use another. A Company may refuse a request whose access token is for a different account than its Session used before, with `invalid_session`. A Personal Agent should start a new Session rather than use a second account in one Session, so accounts don't get mixed up across Sessions.

#### Browsers join a Session with an authorized one-time code

Breaking · [Spec 3](https://personalagentprotocol.org/docs/0.3/spec#discovery) · [Spec 5](https://personalagentprotocol.org/docs/0.3/spec#sessions) · [Spec 6](https://personalagentprotocol.org/docs/0.3/spec#web-browsing) · [Spec 10.4](https://personalagentprotocol.org/docs/0.3/spec#assertion-audience) · [Spec 10.6](https://personalagentprotocol.org/docs/0.3/spec#browser-join) · [Spec 11](https://personalagentprotocol.org/docs/0.3/spec#references) · [Guides: Handling secrets](https://personalagentprotocol.org/docs/0.3/guides#both-secrets) · [Guides: Web browsing](https://personalagentprotocol.org/docs/0.3/guides#agent-browsing) · [Guides: Browser sessions](https://personalagentprotocol.org/docs/0.3/guides#company-browsing)

The Personal Agent's browser no longer posts a signed browser assertion. Any browser could post one, so a malicious Personal Agent could have a victim's browser join a Session signed in to the attacker's account. Now the browser loads `web.browser_session_endpoint` with a GET and gets a page with a form holding a one-time code, and a cookie that ties the code to that browser, which forms on other sites don't send and other hosts on the Company's domain can't set. Caches can't store the page, and it can't be framed or kept by the page that opened it. The Personal Agent authorizes the code in its own request to `{browser_session_endpoint}/authorize`, with the Session header and, if signed in, its access token, so the access token never reaches the browser. Redirects from that endpoint never carry the protocol's secrets. The browser then submits the form, which holds only the code. The Company checks the cookie and that the code was authorized, and sets the Session's cookie when it redirects the browser, signed in to the authorized account if there was one. The Personal Agent takes the code only from its own browser, outside its model. The guides suggest values, such as a 128-bit code that expires within 60 seconds, a `__Host-` cookie with `SameSite=Strict`, the response headers, and a `303` redirect, and list the code as a secret.

The browser assertion, its `typ`, and `return_to` are removed. The spec no longer sets the Session cookie's attributes: the guides suggest `Secure`, `HttpOnly`, and the `__Host-` prefix, and `SameSite=Strict` is no longer ruled out. The cookie acts for the account and scopes authorized at `/authorize`, instead of following the Session's state, so the Personal Agent joins again after signing in or to change its scopes. A new section 10.6 explains both attacks the design prevents, and the references add RFC 9111 and RFC 6265bis.

#### Excluded tasks

[Spec 1](https://personalagentprotocol.org/docs/0.3/spec#intro) · [Spec 3](https://personalagentprotocol.org/docs/0.3/spec#discovery) · [Spec 3.1](https://personalagentprotocol.org/docs/0.3/spec#fields) · [Spec 9](https://personalagentprotocol.org/docs/0.3/spec#task-coverage) · [Spec 9.1](https://personalagentprotocol.org/docs/0.3/spec#excluded-tasks) · [Spec 9.2](https://personalagentprotocol.org/docs/0.3/spec#alternatives) · [Spec 10.1](https://personalagentprotocol.org/docs/0.3/spec#untrusted-content) · [Guides: Task coverage](https://personalagentprotocol.org/docs/0.3/guides#agent-excluded-tasks) · [Guides: Excluded tasks and feedback](https://personalagentprotocol.org/docs/0.3/guides#company-excluded-tasks)

A Company can list the tasks it chose not to offer through this protocol, so Personal Agents tell the User right away instead of searching every interface for a way to do them. `excluded_tasks.url` in `poppy.json` points to a public JSON document of `tasks`, each a short `task` phrase and an optional `alternative`. Personal Agents should read it before starting a task at the Company. An alternative has natural-language `instructions`, `references`, or both. A reference points to an OpenAPI operation by `operationId`, an MCP tool by name, or a web page, which can be a link that opens the Company's app. An `openapi` or `mcp` reference must name an API listed in `poppy.json`. Section 8, "Feedback", is now section 9, "Task coverage", with excluded tasks in 9.1, alternatives in 9.2, and feedback in 9.3.

#### Answering feedback with an alternative

Breaking · [Spec 9.3](https://personalagentprotocol.org/docs/0.3/spec#feedback) · [Guides: Task coverage](https://personalagentprotocol.org/docs/0.3/guides#agent-excluded-tasks) · [Guides: Excluded tasks and feedback](https://personalagentprotocol.org/docs/0.3/guides#company-excluded-tasks)

A Company can answer a feedback report with HTTP 200 and an alternative (9.2) when the task can be done after all, instead of 202 with no body. Personal Agents must accept either response, and should not report a task the Company lists as excluded.

#### Secrets out of model context

Breaking · [Spec 10.2](https://personalagentprotocol.org/docs/0.3/spec#secrets) · [Guides: Handling secrets](https://personalagentprotocol.org/docs/0.3/guides#both-secrets)

Personal Agents must keep access tokens, Session JWTs, private keys, authorization codes, PKCE code verifiers, and device codes out of model context, as they already did refresh tokens, which 0.2 called Account Tokens. Before, these were a SHOULD. This follows the AI agent identity draft (draft-ietf-wimse-aims §8), which says the model must not have access to an agent's credentials. Other secrets, such as one-time codes, stay a SHOULD. The guides list authorization codes and PKCE code verifiers as secrets.

#### Blind signing

Breaking · [Spec 3.2](https://personalagentprotocol.org/docs/0.3/spec#oauth-server) · [Spec 4.1](https://personalagentprotocol.org/docs/0.3/spec#agent-identity) · [Spec 4.4](https://personalagentprotocol.org/docs/0.3/spec#refresh-tokens) · [Spec 5.2](https://personalagentprotocol.org/docs/0.3/spec#session-header) · [Spec 10.7](https://personalagentprotocol.org/docs/0.3/spec#delegated-key-security) · [Spec 11](https://personalagentprotocol.org/docs/0.3/spec#references) · [Guides: Signing and verifying JWTs](https://personalagentprotocol.org/docs/0.3/guides#both-signing)

Companies must accept client assertions and delegations signed with `ES256`, and should accept `PS384` to support blind signing. OAuth metadata advertises client-assertion algorithms; it does not advertise delegation algorithms. The guides explain that an agent requiring blind signing may be unable to interoperate with a Company that lacks PS384, and that an algorithm fallback is not an equivalent privacy choice. A Personal Agent should have the keys in its `jwks_uri` sign both blindly, unless its own systems need to see which Companies a User works with. It uses RFC 9474 RSA blind signatures, whose RSABSSA-SHA384-PSS-Deterministic variant produces ordinary `PS384` signatures, so its own systems don't see which Company a client assertion names and can't recognize a delegation a Company shows them. That variant is safe only when the message has a value the signer can't guess, so a Personal Agent that signs blindly generates each `jti` on the User's device, and signs both kinds blindly, because a blind key signs whatever a device sends. 10.7 explains that any of its Users can then authenticate as the Personal Agent, so a refresh or access token stolen from one User works for another. The references add RFC 9474.

#### Operations version 2: retry with approval

Breaking · [Spec 8.4](https://personalagentprotocol.org/docs/0.3/spec#message-fields) · [Spec 8.13](https://personalagentprotocol.org/docs/0.3/spec#conversation-errors) · [Operations 1](https://personalagentprotocol.org/docs/0.3/extensions/operations#intro) · [Operations 2](https://personalagentprotocol.org/docs/0.3/extensions/operations#support) · [Operations 3](https://personalagentprotocol.org/docs/0.3/extensions/operations#operation-object) · [Operations 4](https://personalagentprotocol.org/docs/0.3/extensions/operations#approval-required) · [Operations 5](https://personalagentprotocol.org/docs/0.3/extensions/operations#approval) · [Operations 6](https://personalagentprotocol.org/docs/0.3/extensions/operations#sending-approval) · [Operations 7](https://personalagentprotocol.org/docs/0.3/extensions/operations#at-most-once) · [Operations 8.1](https://personalagentprotocol.org/docs/0.3/extensions/operations#approval-proof) · [Operations 9](https://personalagentprotocol.org/docs/0.3/extensions/operations#references) · [Guides: Operations](https://personalagentprotocol.org/docs/0.3/guides#agent-operations) · [Guides: Operations](https://personalagentprotocol.org/docs/0.3/guides#company-operations)

The optional `operations` extension moves from version 1 to incompatible version 2. Both the Company and Personal Agent list `version` `"2"` to use it. When the Personal Agent doesn't, the Company handles approval itself or refuses with `extension_required`. When only the Personal Agent does, it uses the Company's interfaces without the extension. Operations still need the User's approval of exact terms and run at most once.

Instead of returning a proposed operation with HTTP 202 and having the Personal Agent confirm it at an operations endpoint, a Company refuses the request with the operation, and the Personal Agent makes the same request again with the User's approval: in the `Poppy-Approval` header (an RFC 9651 Dictionary) at APIs, in `_meta` for MCP tools, and in a message's new `approval` field in conversations. APIs return the new `approval_required` error (403), in a JSON body with the operation. Section 8.4 lets an extension define message content, so a message can carry only `operation` or `approval`. The Company checks that the request matches the approved revision, performs it at most once, and responds as it would have without operations. While it is being performed, or its outcome is unknown, a retry gets HTTP 503 with `Retry-After`.

The `operation_id` names the action and stays the same when the terms change, and the `revision` is now an opaque string that changes with the terms. A Company can compute both from the request, as the guides describe, so it only stores operations it has performed, and any revision it returned can be approved, not only the latest. `expires_at` is always present, and should leave the User long enough to decide. The Company remembers a performed operation until its approved revision expires, so a retry before then gets the first response. A Personal Agent asks the User about every operation, so `approved_by`, standing permissions, and `user_approval_required` are removed. A Company that wants Users to allow some actions in advance can offer its own rules, as the guides describe. A `summary` can use basic Markdown, without links or images, and the Personal Agent checks `terms` and may show them.

The operations endpoint, the extension entry's `endpoint` and `resource`, the operation's `state`, `url`, `confirmation`, and `result`, tracking, cancelling, and the errors `operation_not_found` and `terms_changed` are removed. Operations 8.1 explains what an approval proves, and points to approvals the User signs as an open topic in Path to 1.0. The internal approval-check order is recommended; authorization, revision checks, response semantics, and at-most-once execution remain required.

#### Mediated Sign-In is an extension grant

Breaking · [Spec 2](https://personalagentprotocol.org/docs/0.3/spec#terms) · [Spec 3](https://personalagentprotocol.org/docs/0.3/spec#discovery) · [Spec 3.1](https://personalagentprotocol.org/docs/0.3/spec#fields) · [Spec 4.7](https://personalagentprotocol.org/docs/0.3/spec#scopes) · [Spec 4.8](https://personalagentprotocol.org/docs/0.3/spec#oauth-additions) · [Spec 10.2](https://personalagentprotocol.org/docs/0.3/spec#secrets) · [Spec 10.3](https://personalagentprotocol.org/docs/0.3/spec#trust) · [Spec 10.5](https://personalagentprotocol.org/docs/0.3/spec#credentials) · [Mediated Sign-In](https://personalagentprotocol.org/docs/0.3/extensions/mediated-sign-in) · [Guides: Choosing how to sign in](https://personalagentprotocol.org/docs/0.3/guides#agent-choosing-sign-in) · [Guides: Mediated sign-in](https://personalagentprotocol.org/docs/0.3/guides#agent-mediated) · [Guides: Mediated sign-in](https://personalagentprotocol.org/docs/0.3/guides#company-mediated)

Mediated Sign-In moves out of the specification into the [Mediated Sign-In extension](https://personalagentprotocol.org/docs/0.3/extensions/mediated-sign-in), version 1, so the core protocol is OAuth and Sessions. A Company lists it in `extensions` in `poppy.json`, with the `fields` and `scopes` that were in `auth.mediated`, which is removed. It is now an OAuth extension grant at the Company's token endpoint, `https://personalagentprotocol.org/grant/mediated-sign-in`, which the Company lists in `grant_types_supported`, so it uses OAuth's client authentication, errors, and token responses. The Personal Agent sends the credentials as form parameters with its client assertion and `scope`, instead of as JSON with a Session Token, and `auth.mediated.endpoint` is removed. A field's `name` can't be `grant_type`, `scope`, `resource`, a client authentication parameter, or a parameter the extension defines. Personal Agents send credentials only to the issuer's token endpoint.

A one-time code is the OAuth error `code_required`, with `sign_in_id`, `sent_to`, which was `code.sent_to`, and `expires_in`, which replaces `expires_at`. The Personal Agent sends the grant again with `sign_in_id` and `one_time_code`, without the credentials or `scope`, and the sign-in keeps the first request's scopes. Only the `client_id` that started a sign-in can finish it, instead of the Session. Failures are `invalid_grant`, `expired_token`, `access_denied`, and `invalid_scope`. The `status` field, which returned every result with HTTP 200, and the errors `account_mismatch` and `sign_in_not_found` are removed. The Personal Agent doesn't need to list the extension in its client metadata, because the Company recognizes it from the grant type (3.3).

#### Mediated Sign-In is transitional

[Spec 10.5](https://personalagentprotocol.org/docs/0.3/spec#credentials) · [Mediated Sign-In 1](https://personalagentprotocol.org/docs/0.3/extensions/mediated-sign-in#intro) · [Mediated Sign-In 6](https://personalagentprotocol.org/docs/0.3/extensions/mediated-sign-in#security) · [Guides: Choosing how to sign in](https://personalagentprotocol.org/docs/0.3/guides#agent-choosing-sign-in) · [Guides: Describing APIs](https://personalagentprotocol.org/docs/0.3/guides#company-api-descriptions) · [Guides: Mediated sign-in](https://personalagentprotocol.org/docs/0.3/guides#company-mediated)

Mediated Sign-In is a transitional step, not where the protocol is headed, like OAuth's password grant. Companies should offer it only until they can add Direct or Device Sign-In, and stop once those cover the same scopes. The protocol plans to remove it, on a date set when version 1.0 is published, and after that the community will look for ways to encourage the Companies that still offer it to move to Direct or Device Sign-In. Personal Agents should use Direct or Device Sign-In rather than Mediated Sign-In when the Company offers it and its scopes cover the task, where 0.2 only suggested this in the guides. A new section 10.5 explains what a Company gives up when Personal Agents sign in with the User's credentials outside the protocol, and the guides suggest that Companies that offer Direct or Device Sign-In make their scopes and APIs cover what Users need.

### Minor changes

#### OAuth terms for Poppy names

[Spec 2](https://personalagentprotocol.org/docs/0.3/spec#terms)

Section 2 gives the OAuth term for User ID, sign-in, sign-out, and signed out, and says why Poppy keeps its own name for each. Tokens use their OAuth names.

#### Discovery redirects end at the well-known path

Breaking · [Spec 3](https://personalagentprotocol.org/docs/0.3/spec#discovery) · [Spec 10.3](https://personalagentprotocol.org/docs/0.3/spec#trust) · [Guides: Finding a company](https://personalagentprotocol.org/docs/0.3/guides#agent-discovery)

A redirect of the well-known URL can still go to another host, but the Personal Agent uses the document only when the last URL's path is exactly `/.well-known/poppy.json`, with no query. Before, a redirect could end at any path, so anyone who could upload a file to a Company's domain could publish a `poppy.json` there that spoke for the Company, with endpoints on their own host.

#### Restated rules and freedoms removed

[Spec 3](https://personalagentprotocol.org/docs/0.3/spec#discovery) · [Spec 3.2](https://personalagentprotocol.org/docs/0.3/spec#oauth-server) · [Spec 4.1](https://personalagentprotocol.org/docs/0.3/spec#agent-identity) · [Spec 4.4](https://personalagentprotocol.org/docs/0.3/spec#refresh-tokens) · [Spec 5](https://personalagentprotocol.org/docs/0.3/spec#sessions) · [Spec 5.5](https://personalagentprotocol.org/docs/0.3/spec#ending-sessions) · [Spec 8.2](https://personalagentprotocol.org/docs/0.3/spec#conversation-requests) · [Spec 8.9](https://personalagentprotocol.org/docs/0.3/spec#handoff) · [Spec 8.10](https://personalagentprotocol.org/docs/0.3/spec#direct-conversations) · [Spec 8.11](https://personalagentprotocol.org/docs/0.3/spec#conversation-sign-in)

Sentences that restated an RFC, or a freedom the Company already has, are removed. The spec no longer says Personal Agents should cache `poppy.json` and the OAuth metadata by their HTTP caching headers, which RFC 9111 covers and the guides already advise. Section 4.1 says a Company decides which Personal Agents it accepts, and how it approves them is outside the spec, instead of listing registration, allowlists, blocklists, revocation, and rate limits, and keeps the error a refused Personal Agent gets. Section 4.4 no longer says the Company accepts a refresh token only at its token and revocation endpoints and from the client it was issued to, which OAuth already requires. Also removed: that Companies may limit what a Personal Agent can do in a Session; that work accepted with a valid token can continue after it expires, and that the Company may stop work in progress after sign-out; that a person at the Company is held to the Company Agent's scopes and that it checks them whoever handles the conversation, which 4.7 already covers; that the Company Agent in a parent conversation knows what was said in its Direct Conversation; and the suggestion that conversation, message, and event IDs start with a prefix such as `cnv_`.

#### The issuer from protected resource metadata

Breaking · [Spec 3](https://personalagentprotocol.org/docs/0.3/spec#discovery) · [Spec 3.1](https://personalagentprotocol.org/docs/0.3/spec#fields) · [Spec 3.2](https://personalagentprotocol.org/docs/0.3/spec#oauth-server) · [Spec 10.3](https://personalagentprotocol.org/docs/0.3/spec#trust) · [Guides: Hosting several companies](https://personalagentprotocol.org/docs/0.3/guides#company-hosting)

The Personal Agent finds the Company's issuer the standard way, from the protected resource metadata (RFC 9728) of `https://{organization.domain}`, at its `/.well-known/oauth-protected-resource`. Its `resource` must be exactly `https://{organization.domain}`, and its `authorization_servers` names the issuer. `auth.issuer` in `poppy.json` is required only when that list has more than one entry, to say which one Personal Agents use, because RFC 9728 leaves the choice among several to the client, while User IDs and refresh tokens belong to one issuer. With one entry it is optional, and if present must name that server. `auth` is optional. A Company needs an issuer when its `poppy.json` lists `agent`, `apis`, `feedback`, `web.browser_session_endpoint`, or an extension that uses the issuer.

#### `protected_resources` replaces `poppy_domains`

Breaking · [Spec 3](https://personalagentprotocol.org/docs/0.3/spec#discovery) · [Spec 3.2](https://personalagentprotocol.org/docs/0.3/spec#oauth-server) · [Spec 4.3](https://personalagentprotocol.org/docs/0.3/spec#device-sign-in) · [Spec 11](https://personalagentprotocol.org/docs/0.3/spec#references) · [Guides: Direct and device sign-in](https://personalagentprotocol.org/docs/0.3/guides#agent-direct-device) · [Guides: Hosting several companies](https://personalagentprotocol.org/docs/0.3/guides#company-hosting)

The issuer lists the domains whose issuer it is in `protected_resources`, the field RFC 9728 registers in authorization server metadata, instead of the custom `poppy_domains`. It lists `https://{domain}` for each domain, with no path, port, or trailing slash, and may list other resources, such as MCP servers. Personal Agents check that it includes `https://{organization.domain}`, compared as RFC 9728 §3.3 describes except that the host ignores case, and check a device sign-in link's host against the hosts of its entries.

#### Other API types allowed

Breaking · [Spec 3.1](https://personalagentprotocol.org/docs/0.3/spec#fields) · [Spec 7](https://personalagentprotocol.org/docs/0.3/spec#apis)

A Company may list APIs with types other than `openapi` and `mcp`, which are the types this version defines. Before, the type had to be one of them. Personal Agents should skip types they don't recognize, as before, so one that didn't must now.

#### Tokens for one service from protected resource metadata

Breaking · [Spec 3.1](https://personalagentprotocol.org/docs/0.3/spec#fields) · [Spec 4.5](https://personalagentprotocol.org/docs/0.3/spec#access-tokens) · [Spec 4.7](https://personalagentprotocol.org/docs/0.3/spec#scopes) · [Spec 7](https://personalagentprotocol.org/docs/0.3/spec#apis) · [Guides: Storing tokens](https://personalagentprotocol.org/docs/0.3/guides#agent-tokens)

The `resource` field of `agent.protocols` and `apis` entries in `poppy.json` is removed. A service that accepts only tokens issued for it publishes protected resource metadata (RFC 9728) whose `resource` isn't the domain's own, as MCP servers do. The domain's own metadata, which names the issuer, doesn't count. Before its first signed-in call to an API or conversation endpoint, the Personal Agent fetches that metadata, and if its `resource` is another one, requests a token with it. An MCP server's `resource` must equal its `url`. The Company returns `invalid_target` for a `resource` it doesn't serve, and a service that gets a token not issued for it returns `invalid_token` with `resource_metadata`, so a Personal Agent with stale metadata learns about it.

#### Extensions recognized from the request

[Spec 3.3](https://personalagentprotocol.org/docs/0.3/spec#extensions) · [Mediated Sign-In 2](https://personalagentprotocol.org/docs/0.3/extensions/mediated-sign-in#support)

A Personal Agent doesn't need to list an extension the Company recognizes from the request itself, such as one with its own grant type, and a Company can't refuse such a request with `extension_required`.

#### Loopback redirect URIs

Breaking · [Spec 3](https://personalagentprotocol.org/docs/0.3/spec#discovery) · [Spec 4.1](https://personalagentprotocol.org/docs/0.3/spec#agent-identity) · [Spec 4.2](https://personalagentprotocol.org/docs/0.3/spec#direct-sign-in) · [Spec 11](https://personalagentprotocol.org/docs/0.3/spec#references) · [Guides: Native and distributed apps](https://personalagentprotocol.org/docs/0.3/guides#agent-native-apps) · [Issue #33](https://github.com/personal-agent-protocol/personal-agent-protocol/issues/33)

A Personal Agent's `redirect_uris` can include loopback redirect URIs, as RFC 8252 §7.3 defines, so an app on the User's computer can receive the authorization response. Companies accept them, and match a loopback redirect URI to an entry with any port. Every other entry is still an HTTPS URL on the `client_id` domain. The references add RFC 8252.

#### Client assertions follow RFC 7523

[Spec 4.1](https://personalagentprotocol.org/docs/0.3/spec#agent-identity) · [Guides: Signing and verifying JWTs](https://personalagentprotocol.org/docs/0.3/guides#both-signing)

A client assertion needs a unique, unguessable `jti`, instead of one with at least 128 random bits, and is short-lived, instead of lasting at most five minutes. A Company may reject a reused client assertion `jti`, as RFC 7523 §3 allows, where it had to before. The guides suggest 128 bits, five minutes, and rejecting reuse.

#### Advice moved to the guides

[Spec 4.2](https://personalagentprotocol.org/docs/0.3/spec#direct-sign-in) · [Spec 5.4](https://personalagentprotocol.org/docs/0.3/spec#sign-in) · [Spec 8.4](https://personalagentprotocol.org/docs/0.3/spec#message-fields) · [Spec 8.5](https://personalagentprotocol.org/docs/0.3/spec#reading-events) · [Spec 8.6](https://personalagentprotocol.org/docs/0.3/spec#streaming) · [Spec 8.8](https://personalagentprotocol.org/docs/0.3/spec#human-or-ai) · [Spec 8.11](https://personalagentprotocol.org/docs/0.3/spec#conversation-sign-in) · [Mediated Sign-In 6](https://personalagentprotocol.org/docs/0.3/extensions/mediated-sign-in#security) · [Operations 4](https://personalagentprotocol.org/docs/0.3/extensions/operations#approval-required) · [Guides: Conversations](https://personalagentprotocol.org/docs/0.3/guides#agent-conversations) · [Guides: Mediated sign-in](https://personalagentprotocol.org/docs/0.3/guides#company-mediated) · [Guides: Conversations](https://personalagentprotocol.org/docs/0.3/guides#company-conversations) · [Guides: Operations](https://personalagentprotocol.org/docs/0.3/guides#company-operations)

Advice that doesn't affect how the two sides work together moves from the specification and extensions to the guides, where it is a recommendation. It covers the consent page's contents, which the guides already had; checking for a refresh token before a new sign-in; no markup in message `text`; telling the User when part of a conversation is missing; acting only on complete messages, not `text-delta` pieces; writing for an AI or a person; asking in a message as well as with an `authorization` event; the Company's rate limits and one-time codes in Mediated Sign-In; and saying in an OpenAPI description which endpoints return operations. "Personal Agents should share only what the task needs" in 8.4 is removed, since 10.1 says it, and so is Mediated Sign-In's rule that a Company doesn't return credentials in a response.

#### Device Sign-In follows RFC 10027

Breaking · [Spec 4.3](https://personalagentprotocol.org/docs/0.3/spec#device-sign-in) · [Spec 11](https://personalagentprotocol.org/docs/0.3/spec#references) · [Guides: Direct and device sign-in](https://personalagentprotocol.org/docs/0.3/guides#agent-direct-device) · [Guides: Device sign-in](https://personalagentprotocol.org/docs/0.3/guides#company-device)

Device Sign-In is a cross-device flow, which is easier to use for phishing than Direct Sign-In. Companies that offer it and Personal Agents that use it must follow the best practices in RFC 10027 (BCP 247) §2: a Company assesses the risk and chooses mitigations, and a Personal Agent uses Direct Sign-In when it can, as the RFC's protocol selection guidance says. The guides suggest sending the authorization URL to the User's phone when a Personal Agent can't receive the redirect on the User's device, and list mitigations for Companies. The references add RFC 10027.

#### Sign-out and access tokens

Breaking · [Spec 4.6](https://personalagentprotocol.org/docs/0.3/spec#revocation) · [Spec 4.7](https://personalagentprotocol.org/docs/0.3/spec#scopes) · [Spec 5.5](https://personalagentprotocol.org/docs/0.3/spec#ending-sessions) · [Spec 6](https://personalagentprotocol.org/docs/0.3/spec#web-browsing) · [Guides: Token lifetimes and sign-out](https://personalagentprotocol.org/docs/0.3/guides#company-lifetimes)

What happens to access tokens issued under a revoked refresh token follows RFC 7009 §2.1, which says a Company that can revoke access tokens should invalidate them too. This replaces the SHOULD to check on each request whether the Session is still signed in, or else use much shorter token lifetimes, which moves to the guides with the suggested lifetimes. The Sessions continue signed out. Sign-out now means revoking every refresh token the Personal Agent holds for the account, so revoking one that a new sign-in replaced isn't sign-out and doesn't sign out the website cookie.

#### Token responses follow RFC 6749

Breaking · [Spec 4.4](https://personalagentprotocol.org/docs/0.3/spec#refresh-tokens) · [Spec 4.7](https://personalagentprotocol.org/docs/0.3/spec#scopes) · [Spec 5.4](https://personalagentprotocol.org/docs/0.3/spec#sign-in) · [Mediated Sign-In 3](https://personalagentprotocol.org/docs/0.3/extensions/mediated-sign-in#signing-in) · [Guides: Storing tokens](https://personalagentprotocol.org/docs/0.3/guides#agent-tokens) · [Guides: Choosing how to sign in](https://personalagentprotocol.org/docs/0.3/guides#agent-choosing-sign-in)

Token responses no longer have `signed_in`, or `refresh_token_expires_in`, which no OAuth RFC defines. A request is signed in when it carries an access token, and signed out otherwise. As in RFC 6749, `expires_in` is recommended rather than required, `scope` is left out only when the Company granted exactly the scopes requested, and access tokens are opaque to the client, so the rule that Personal Agents don't depend on their contents is removed. A sign-in where the User approves no scopes ends as a decline. Refresh responses may omit `refresh_token` when it isn't replaced, as RFC 6749 §6 allows; the Personal Agent keeps its existing refresh token. Sign-in still returns one.

#### Requesting and describing scopes

[Spec 4.7](https://personalagentprotocol.org/docs/0.3/spec#scopes) · [Guides: Choosing how to sign in](https://personalagentprotocol.org/docs/0.3/guides#agent-choosing-sign-in) · [Guides: Describing scopes](https://personalagentprotocol.org/docs/0.3/guides#company-scope-descriptions) · [Guides: Consent pages](https://personalagentprotocol.org/docs/0.3/guides#company-consent)

Personal Agents should request only the scopes a task needs, following RFC 9700 §2.3. The guides add advice on writing scope descriptions a User and a language model can understand, and on consent pages that present scopes in plain words and show which are new.

#### User IDs as pairwise identifiers

[Spec 5.1](https://personalagentprotocol.org/docs/0.3/spec#user-ids) · [Spec 11](https://personalagentprotocol.org/docs/0.3/spec#references)

Section 5.1 relates User IDs to OpenID Connect pairwise subject identifiers, which the Personal Agent assigns for each pair of User and Company. The rules for User IDs don't change. The references add OpenID Connect Core.

#### Client metadata fetched without redirects

Breaking · [Spec 5.3](https://personalagentprotocol.org/docs/0.3/spec#session-verification) · [Guides: Verifying personal agents](https://personalagentprotocol.org/docs/0.3/guides#company-agents)

A Company fetches the client metadata document at `client_id` without following redirects, as the CIMD draft (§5) requires, so a Personal Agent serves it at exactly that URL. In 0.2 only the guides said so.

#### `sign_in_required` replaced by OAuth challenges

Breaking · [Spec 5.4](https://personalagentprotocol.org/docs/0.3/spec#sign-in) · [Spec 5.5](https://personalagentprotocol.org/docs/0.3/spec#ending-sessions) · [Spec 7](https://personalagentprotocol.org/docs/0.3/spec#apis) · [Spec 8.5](https://personalagentprotocol.org/docs/0.3/spec#reading-events) · [Spec 8.11](https://personalagentprotocol.org/docs/0.3/spec#conversation-sign-in) · [Operations 3](https://personalagentprotocol.org/docs/0.3/extensions/operations#operation-object) · [Guides: Conversations](https://personalagentprotocol.org/docs/0.3/guides#company-conversations)

The custom `sign_in_required` error is removed. A request that needs the User's account and has no access token gets a 401 challenge without an error code, with a `scope` attribute naming the scopes it needs, as RFC 6750 §3.1 describes, and the Personal Agent handles it as `insufficient_scope`. An access token without the needed scopes gets `insufficient_scope`. The Personal Agent uses a refresh token that covers them, or signs in. The `authorization` conversation event, which now always has `scope`, uses `insufficient_scope` whether or not the request had an access token.

#### `rate_limited` removed

Breaking · [Spec 5.6](https://personalagentprotocol.org/docs/0.3/spec#sending-requests) · [Spec 8.13](https://personalagentprotocol.org/docs/0.3/spec#conversation-errors) · [Spec 9.3](https://personalagentprotocol.org/docs/0.3/spec#feedback) · [Mediated Sign-In 5](https://personalagentprotocol.org/docs/0.3/extensions/mediated-sign-in#errors)

Rate limits are HTTP 429 with `Retry-After` everywhere, without the custom `rate_limited` body at the token endpoint and the protocol's and extensions' endpoints.

#### Only the Personal Agent's browser joins a Session

[Spec 6](https://personalagentprotocol.org/docs/0.3/spec#web-browsing) · [Issue #53](https://github.com/personal-agent-protocol/personal-agent-protocol/issues/53)

Section 6 restores the rule from 0.2 that a Personal Agent joins only a browser it controls to a Session, never the User's own browser. The browser-join redesign left it out. Otherwise, the Company would treat the User's own visits as the Personal Agent's. Acting in the User's own browser remains an [open topic](https://personalagentprotocol.org/docs/path-to-1#open-topics) for self-hosted personal agents.

#### Browser join and an existing login

[Spec 6](https://personalagentprotocol.org/docs/0.3/spec#web-browsing) · [Guides: Web browsing](https://personalagentprotocol.org/docs/0.3/guides#agent-browsing) · [Guides: Browser sessions](https://personalagentprotocol.org/docs/0.3/guides#company-browsing)

Section 6 says what a join does to a login the browser already has on the website. A signed-in join signs the browser in to the account from step 2 in place of that login, and when the Session's sign-in ends, the browser is signed out, rather than going back to the earlier login. A signed-out join shouldn't end or change that login: the browser's requests belong to the Session, and its own login decides the account. A table shows each case. Before, a Company could replace any login with the Session's cookie. The guides suggest a cookie for the Session that's separate from the login cookie.

#### Missing scopes on the website

[Spec 6](https://personalagentprotocol.org/docs/0.3/spec#web-browsing) · [Guides: Enforcing scopes everywhere](https://personalagentprotocol.org/docs/0.3/guides#company-scopes)

When a Company's website refuses an action because the Session lacks a scope, it should show a visible error that names the missing scopes, so the Personal Agent can request them.

#### MCP lifecycle and token compatibility

[Spec 7](https://personalagentprotocol.org/docs/0.3/spec#apis)

The API rules distinguish Poppy Sessions from MCP's version-specific lifecycle, including stateless MCP 2026-07-28. Bearer remains the MCP baseline; DPoP requires explicit server support. MCP servers need issuer discovery only when they offer account access.

#### `author` replaces `sender`

Breaking · [Spec 8.3](https://personalagentprotocol.org/docs/0.3/spec#sending-messages) · [Spec 8.4](https://personalagentprotocol.org/docs/0.3/spec#message-fields) · [Spec 8.5](https://personalagentprotocol.org/docs/0.3/spec#reading-events) · [Spec 8.7](https://personalagentprotocol.org/docs/0.3/spec#status) · [Spec 8.8](https://personalagentprotocol.org/docs/0.3/spec#human-or-ai) · [Spec 8.10](https://personalagentprotocol.org/docs/0.3/spec#direct-conversations) · [Operations 4](https://personalagentprotocol.org/docs/0.3/extensions/operations#approval-required) · [Issue #19](https://github.com/personal-agent-protocol/personal-agent-protocol/issues/19)

Each message has an `author` object instead of `sender`. Its `type` takes `sender`'s values, `agent` or `human`. A Company message can also say which of the Company's people or AI personas wrote it, with an `id`, a display `name`, and an `image` URL, each optional.

#### Unknown status and responder values

[Spec 8.7](https://personalagentprotocol.org/docs/0.3/spec#status)

A Personal Agent treats a conversation `status` it doesn't recognize as `working`, and a `responder` it doesn't recognize as `human`, so later versions can add values.

#### Challenges with conversation authorization events

[Spec 8.11](https://personalagentprotocol.org/docs/0.3/spec#conversation-sign-in)

A successful response can carry a matching `WWW-Authenticate` challenge alongside an authorization event, as RFC 9110 allows. The event remains sufficient, and a client handles both as one need for authorization without resubmitting the accepted message.

#### `kind` removed from feedback

Breaking · [Spec 9.3](https://personalagentprotocol.org/docs/0.3/spec#feedback)

Feedback reports no longer have `kind`, whose only value was `missing`, and Companies no longer have to accept kinds they don't recognize. Every report is about a task that can't be done through this protocol. A later version can add a field when there is a second kind of report.

### Guides

Advice that goes with the spec. Guides aren't requirements.

#### Choosing Company capabilities

[Guides: Choosing capabilities](https://personalagentprotocol.org/docs/0.3/guides#company-adoption)

A Company adoption guide explains independent implementation choices: signed-out APIs, verified Session continuity, OAuth account access, channels, and other capabilities. It covers operator recognition wherever existing bot defenses need it, without defining adoption levels.

#### Layering and interoperability

[Guides: Signing and verifying JWTs](https://personalagentprotocol.org/docs/0.3/guides#both-signing) · [Guides: Operator signatures and bot defenses](https://personalagentprotocol.org/docs/0.3/guides#both-operator-signatures) · [Guides: MCP and UCP interoperability](https://personalagentprotocol.org/docs/0.3/guides#both-interoperability) · [Guides: Signed-out support without OAuth](https://personalagentprotocol.org/docs/0.3/guides#company-without-oauth) · [Guides: Planning account access](https://personalagentprotocol.org/docs/0.3/guides#agent-account-access) · [Guides: User IDs](https://personalagentprotocol.org/docs/0.3/guides#agent-user-ids) · [Guides: Conversations](https://personalagentprotocol.org/docs/0.3/guides#company-conversations)

Guides cover issuerless deployment and identity migration, recommended operator signatures and their privacy limits, advance account-access information, conversation challenges, and version-aware MCP and UCP interoperability. Operator signatures can be removed where edges verify delegated Session JWTs directly; they do not replace Company policy.

#### Verifying the user by sign-in in conversations

[Guides: Conversations](https://personalagentprotocol.org/docs/0.3/guides#agent-conversations) · [Guides: Conversations](https://personalagentprotocol.org/docs/0.3/guides#company-conversations) · [Issue #35](https://github.com/personal-agent-protocol/personal-agent-protocol/issues/35)

A company agent verifies the user by sending an `authorization` event, not by asking for codes or personal details in messages. Personal agents ask for sign-in when a company agent asks those questions.

#### Authorization servers without client ID metadata documents

[Guides: Verifying personal agents](https://personalagentprotocol.org/docs/0.3/guides#company-agents)

Not every authorization server supports client ID metadata documents. One that needs registration can register the personal agents a company accepts by their `client_id` URL, and reject others with `invalid_client`.

#### API descriptions and one feedback channel

[Guides: Describing APIs](https://personalagentprotocol.org/docs/0.3/guides#company-api-descriptions) · [Guides: Excluded tasks and feedback](https://personalagentprotocol.org/docs/0.3/guides#company-excluded-tasks) · [Issue #27](https://github.com/personal-agent-protocol/personal-agent-protocol/issues/27)

Companies write API and MCP tool descriptions for the language model that reads them: clear about what each operation does, and small enough for its context. They take feedback only at `feedback.endpoint`, not also through an operation in their APIs.

## Version 0.2

Published October 24, 2026. It's frozen at [/docs/0.2/spec](https://personalagentprotocol.org/docs/0.2/spec). Major changes are design decisions. Minor changes fill gaps, make the text consistent, or follow an RFC. A change tagged "Breaking" can require an implementation that followed the 0.1 text to change, whether it's major or minor.

### Major changes

#### Which domain `poppy.json` speaks for

Breaking · [Spec 3](https://personalagentprotocol.org/docs/0.2/spec#discovery) · [Spec 3.1](https://personalagentprotocol.org/docs/0.2/spec#fields) · [Spec 3.2](https://personalagentprotocol.org/docs/0.2/spec#oauth-server) · [Issue #5](https://github.com/personal-agent-protocol/personal-agent-protocol/issues/5)

`organization.domain` is the host that serves the document after any redirects, not the host the Personal Agent requested. Domains are compared ignoring case only, so a leading `www.` is no longer ignored, and the `poppy_domains` check also ignores case. A Company that uses a provider has the provider serve the document on the Company's own domain.

#### One issuer per Company

Breaking · [Spec 3.2](https://personalagentprotocol.org/docs/0.2/spec#oauth-server) · [Spec 4.2](https://personalagentprotocol.org/docs/0.2/spec#starting-sessions) · [Spec 9.4](https://personalagentprotocol.org/docs/0.2/spec#assertion-audience) · [Issue #3](https://github.com/personal-agent-protocol/personal-agent-protocol/issues/3)

An issuer represents exactly one Company. A provider that hosts several Companies gives each its own issuer, even on shared servers, so they don't share User IDs or Account Tokens. The spec also says where the metadata is for an issuer with a path, as RFC 8414 defines.

#### Assertion audience

Breaking · [Spec 4.1](https://personalagentprotocol.org/docs/0.2/spec#agent-identity) · [Spec 4.2](https://personalagentprotocol.org/docs/0.2/spec#starting-sessions) · [Spec 9.4](https://personalagentprotocol.org/docs/0.2/spec#assertion-audience) · [Issue #2](https://github.com/personal-agent-protocol/personal-agent-protocol/issues/2)

In 0.1, a client assertion's `aud` wasn't specified, and a Session assertion's was the Company's token endpoint. Both are now the Company's `auth.issuer`, and Companies reject any other `aud`.

#### User IDs for anonymous browsing

[Spec 4.2](https://personalagentprotocol.org/docs/0.2/spec#starting-sessions) · [Issue #11](https://github.com/personal-agent-protocol/personal-agent-protocol/issues/11)

A Personal Agent may give a User a new User ID for each anonymous browsing session, like a private browser window, and never signs in with it. Personal Agents must keep the mapping of each User's IDs across Companies confidential: no publishing it and no sharing it with third parties, other than service providers that process it for them.

#### A DPoP key per User ID

Breaking · [Spec 4.3](https://personalagentprotocol.org/docs/0.2/spec#sending-tokens)

Personal Agents use a different DPoP key pair for each User ID, so Companies can't link Users by their keys.

#### DPoP at MCP servers

Breaking · [Spec 4.3](https://personalagentprotocol.org/docs/0.2/spec#sending-tokens) · [Spec 6](https://personalagentprotocol.org/docs/0.2/spec#apis) · [Issue #6](https://github.com/personal-agent-protocol/personal-agent-protocol/issues/6)

An MCP server supports DPoP by listing `dpop_signing_alg_values_supported`, with `ES256`, in its protected resource metadata. The Company chooses the token type by the `resource` of the token request: a DPoP Session Token for such a server, never a Bearer one for a Personal Agent, and a Bearer token for any other MCP server, even if the request has a proof. Every token request for an MCP server, including one that starts a Session, includes `resource`. A Bearer token works only at the MCP server whose `url` is its `resource`, not at other paths on the same host. A server with DPoP still accepts Bearer tokens from MCP clients that don't implement this protocol, and rejects a DPoP token sent as a Bearer token. An MCP server's 401 has a challenge for each scheme it accepts, each with `resource_metadata`. New MCP servers should support DPoP.

#### A Session stays tied to its account

Breaking · [Spec 4.4](https://personalagentprotocol.org/docs/0.2/spec#sign-in) · [Spec 4.8](https://personalagentprotocol.org/docs/0.2/spec#account-tokens) · [Spec 4.9](https://personalagentprotocol.org/docs/0.2/spec#sign-out) · [Issue #8](https://github.com/personal-agent-protocol/personal-agent-protocol/issues/8)

Once a Session has been signed in to an account, it can only be signed in to that account again, even after sign-out. This applies to every sign-in type, and to using an Account Token with a signed-out Session.

#### Device sign-in links

Breaking · [Spec 4.6](https://personalagentprotocol.org/docs/0.2/spec#device-sign-in)

Personal Agents show `verification_uri` only if its host is the Company's issuer host or one of its `poppy_domains`, and show the Company's name and domain with it, so a Company can't pass off another Company's sign-in page as its own.

#### Mediated Sign-In credentials

Breaking · [Spec 4.7](https://personalagentprotocol.org/docs/0.2/spec#mediated-sign-in) · [Issue #5](https://github.com/personal-agent-protocol/personal-agent-protocol/issues/5)

After a sign-in ends, Personal Agents MUST discard the credentials or keep them only in a credential store the User chose, such as a password manager. They MUST NOT keep them anywhere else, including model context and logs. After the User or the Company revokes their access, they SHOULD NOT sign in again with stored credentials unless the User asks.

#### After sign-out

Breaking · [Spec 4.9](https://personalagentprotocol.org/docs/0.2/spec#sign-out) · [Spec 6](https://personalagentprotocol.org/docs/0.2/spec#apis) · [Spec 7.11](https://personalagentprotocol.org/docs/0.2/spec#conversation-sign-in)

Section 4.9 gathers the rules for a Session that continues signed out after the User signs out or disconnects the Personal Agent. What doesn't need the account carries on. Anything that used it, such as a conversation or an operation, stays as it is, and a signed-out token gets `sign_in_required` on it. A conversation stays open, so the User can sign in again and continue it. The Personal Agent SHOULD NOT sign in to that account again unless the User asks, even when a request gets `sign_in_required`.

#### Feedback

[Spec 3.1](https://personalagentprotocol.org/docs/0.2/spec#fields) · [Spec 8](https://personalagentprotocol.org/docs/0.2/spec#feedback) · [Issue #9](https://github.com/personal-agent-protocol/personal-agent-protocol/issues/9)

A new section 8 lets a Company list a `feedback.endpoint` in `poppy.json`. With a Session Token, Personal Agents can report a User's task that the Company offers no way to do through this protocol. A report has a `kind`, which is `missing` for now, the `task`, and a `description` without identifiers, and isn't for errors.

#### Security considerations

Breaking · [Spec 9](https://personalagentprotocol.org/docs/0.2/spec#security) · [Spec 9.1](https://personalagentprotocol.org/docs/0.2/spec#untrusted-content) · [Issue #4](https://github.com/personal-agent-protocol/personal-agent-protocol/issues/4)

A new section 9 covers content from Companies and prompt injection, secrets and the model, what a domain vouches for, and why assertions name the issuer. It adds requirements for Personal Agents: they MUST treat content from a Company as data, not instructions, and MUST NOT act at one Company, or send it information, because another Company's content asked. References move to section 10.

### Minor changes

#### HTTPS everywhere

Breaking · [Spec 3](https://personalagentprotocol.org/docs/0.2/spec#discovery)

Every URL the protocol defines or exchanges is an HTTPS URL, including API and MCP URLs, metadata endpoints, and extension endpoints, which 0.1 didn't cover. Personal Agents don't use other URLs from a Company, and Companies reject them from a Personal Agent. Website pages a Personal Agent browses aren't covered.

#### Redirects and addresses

Breaking · [Spec 3](https://personalagentprotocol.org/docs/0.2/spec#discovery)

Outside discovery, a Personal Agent doesn't send a token, DPoP Proof, assertion, or credentials to the URL a protocol endpoint redirects to. Neither side connects to loopback, private, or link-local addresses for URLs the other gave it, unless configured to.

#### Which Company a document speaks for

[Spec 3](https://personalagentprotocol.org/docs/0.2/spec#discovery) · [Spec 3.2](https://personalagentprotocol.org/docs/0.2/spec#oauth-server) · [Spec 9.3](https://personalagentprotocol.org/docs/0.2/spec#trust)

Section 3 now explains in one place how `poppy.json` and the issuer's metadata confirm each other, and 3.2 lists `issuer` and `poppy_domains` among the metadata fields. The issuer is compared exactly and domains ignoring case. The redirect example now matches the example document. The rules themselves don't change.

#### Versions before 1.0

Breaking · [Spec 3.1](https://personalagentprotocol.org/docs/0.2/spec#fields)

Each 0.x version can break the one before, so a Personal Agent uses only a `poppy.json` whose `major.minor` version it supports. 0.1 promised that newer minor versions wouldn't break older Personal Agents, which 0.2 doesn't keep. That promise now starts at 1.0.

#### One `auth` per issuer

Breaking · [Spec 3.2](https://personalagentprotocol.org/docs/0.2/spec#oauth-server)

Documents on several domains that name the same issuer have the same `auth`. Other fields can differ by domain.

#### DPoP algorithms

Breaking · [Spec 3.2](https://personalagentprotocol.org/docs/0.2/spec#oauth-server) · [Issue #12](https://github.com/personal-agent-protocol/personal-agent-protocol/issues/12)

Companies accept DPoP Proofs signed with `ES256`. They may list the algorithms they accept in `dpop_signing_alg_values_supported` in their OAuth metadata, and the list then includes `ES256`. A Company whose issuer serves other OAuth clients can leave the field out, since it tells them the issuer supports DPoP. Personal Agents sign with `ES256` or an algorithm from the list.

#### `extension_required` responses

Breaking · [Spec 3.3](https://personalagentprotocol.org/docs/0.2/spec#extensions) · [Spec 4.2](https://personalagentprotocol.org/docs/0.2/spec#starting-sessions) · [Spec 6](https://personalagentprotocol.org/docs/0.2/spec#apis)

At the token endpoint and at endpoints this protocol or an extension defines, the error is a JSON body. At APIs, it goes in the `WWW-Authenticate` header. It's listed in the token endpoint and API error tables. An MCP server returns it only to refuse the Personal Agent entirely, never for a single tool.

#### Assertion lifetimes and replay

Breaking · [Spec 4.1](https://personalagentprotocol.org/docs/0.2/spec#agent-identity) · [Spec 4.2](https://personalagentprotocol.org/docs/0.2/spec#starting-sessions)

A Session assertion's `exp` is at most five minutes after `iat`, and Companies reject a reused `jti` from the same `client_id` until it expires. Client assertions follow the same rules, and `aud` is compared character for character.

#### DPoP Proof checks

Breaking · [Spec 4.3](https://personalagentprotocol.org/docs/0.2/spec#sending-tokens)

Companies MUST validate every proof as RFC 9449 §4.3 describes. That adds checks that the request has exactly one `DPoP` header, `typ` is `dpop+jwt`, `alg` is an asymmetric algorithm the Company accepts and never `none`, and `jwk` holds no private key. In 0.1, every endpoint had to reject a reused `jti`. Now only the token endpoint must, and APIs and conversation endpoints may. A Company can judge the acceptance window by when it issued the proof's `nonce`, not only by `iat`. Companies don't need to support `dpop_jkt`. Where the spec is silent, RFC 9449 applies.

#### DPoP errors at APIs and conversations

Breaking · [Spec 4.3](https://personalagentprotocol.org/docs/0.2/spec#sending-tokens) · [Spec 6](https://personalagentprotocol.org/docs/0.2/spec#apis)

`invalid_dpop_proof` and `use_dpop_nonce` come with HTTP 401 and the `WWW-Authenticate: DPoP` header. At the token endpoint they're OAuth errors with HTTP 400.

#### Which requests carry a DPoP Proof

[Spec 4.3](https://personalagentprotocol.org/docs/0.2/spec#sending-tokens)

Every request to the token endpoint and every request with a Session Token carries a proof, except a request for a Bearer token for an MCP server. Requests that carry neither, such as revocation and device authorization, don't need one.

#### `rate_limited` body

[Spec 4.3](https://personalagentprotocol.org/docs/0.2/spec#sending-tokens)

At the token endpoint and at endpoints this protocol or an extension defines, such as conversations and Mediated Sign-In, the body is `{"error": "rate_limited"}`. APIs and the website keep their own bodies.

#### Mediated Sign-In responses

Breaking · [Spec 4.7](https://personalagentprotocol.org/docs/0.2/spec#mediated-sign-in)

Every status comes with HTTP 200, and submitting a code to a `failed` or `expired` sign-in returns the same status again. Problems with the request are errors with a JSON body: `invalid_scope` and `account_mismatch` (400), and `sign_in_not_found` (404) for a sign-in that is unknown or that another Session started.

#### Mediated Sign-In for the right Company

Breaking · [Spec 4.7](https://personalagentprotocol.org/docs/0.2/spec#mediated-sign-in)

Personal Agents choose stored credentials by the Company's `auth.issuer`, not by field labels or the endpoint, and show the Company's name and domain when asking for credentials or a code.

#### Work after a token expires

[Spec 4.9](https://personalagentprotocol.org/docs/0.2/spec#sign-out) · [Issue #15](https://github.com/personal-agent-protocol/personal-agent-protocol/issues/15)

A Session Token expiring isn't a sign-out, and work the Company accepted with a valid token can continue. When access is revoked, the Company may stop work in progress that uses the account, or let it finish.

#### Sessions from plain MCP clients

[Spec 6](https://personalagentprotocol.org/docs/0.2/spec#apis)

A Session started by an MCP client that doesn't implement this protocol has no User ID, can't continue signed out, and ends when its sign-in does.

#### Conversation query parameters

[Spec 7.3](https://personalagentprotocol.org/docs/0.2/spec#sending-messages) · [Spec 7.5](https://personalagentprotocol.org/docs/0.2/spec#reading-events)

`cursor` and `wait` are query parameters, as the 0.1 examples showed, on reads and on the `POST` requests that send a message or hand off. `wait` is a whole number of seconds.

#### Messages

Breaking · [Spec 7.4](https://personalagentprotocol.org/docs/0.2/spec#message-fields) · [Spec 7.5](https://personalagentprotocol.org/docs/0.2/spec#reading-events)

`role` is listed as a message field, set by the Company. A `message` event holds the message as it was sent, and every accepted message is recorded, including one with only `context`.

#### Long polling

[Spec 7.5](https://personalagentprotocol.org/docs/0.2/spec#reading-events)

A Company that caps `wait` holds the request for its cap instead of rejecting it.

#### Read fields

Breaking · [Spec 7.5](https://personalagentprotocol.org/docs/0.2/spec#reading-events) · [Issue #13](https://github.com/personal-agent-protocol/personal-agent-protocol/issues/13)

Every successful read includes `conversation_id` and `events`, as the examples showed, along with `cursor`, `has_more`, `status`, and `responder`. `events` is empty when there are none.

#### Streaming

[Spec 7.6](https://personalagentprotocol.org/docs/0.2/spec#streaming)

When a request has both `Last-Event-ID` and `cursor`, `Last-Event-ID` wins.

#### Repeated requests

[Spec 7.9](https://personalagentprotocol.org/docs/0.2/spec#handoff) · [Spec 7.12](https://personalagentprotocol.org/docs/0.2/spec#closing)

Handing off a conversation that is already queued or with a person, or closing one that is already closed, returns the current state and changes nothing.

#### `user_requested`

[Spec 7.10](https://personalagentprotocol.org/docs/0.2/spec#direct-conversations)

The event doesn't change `status` or `responder`.

#### Conversation errors

[Spec 7.13](https://personalagentprotocol.org/docs/0.2/spec#conversation-errors)

Conversations add `invalid_request` (400) and `rate_limited` (429).

#### Browser assertion audience

[Spec 9.4](https://personalagentprotocol.org/docs/0.2/spec#assertion-audience)

Section 9.4 now says that client and Session assertions name the issuer, and that a browser assertion names the browser session endpoint and has its own `typ`.

#### `extension_required` in conversations and Operations

[Spec 7.13](https://personalagentprotocol.org/docs/0.2/spec#conversation-errors) · [Operations 2](https://personalagentprotocol.org/docs/0.2/extensions/operations#support) · [Operations 9](https://personalagentprotocol.org/docs/0.2/extensions/operations#errors)

The conversation error table lists `extension_required`. An MCP tool that needs the Operations extension returns an ordinary tool error, since an MCP server can't refuse a single tool call with `extension_required`. The Operations error table lists `rate_limited` and no longer lists `extension_required`.

#### Operations after sign-out

Breaking · [Operations 3.2](https://personalagentprotocol.org/docs/0.2/extensions/operations#ownership)

An operation proposed in a signed-in Session can be used only by a Session that is signed in to the same account at the time of the request, including the original one. A signed-out Session of the same Personal Agent and User gets `sign_in_required`.

#### Operations

[Operations 5.1](https://personalagentprotocol.org/docs/0.2/extensions/operations#approval) · [Issue #4](https://github.com/personal-agent-protocol/personal-agent-protocol/issues/4)

Personal Agents should show the User the values in an operation's `terms` next to its `summary`, or check that they agree, before asking for approval.

#### Examples

[Spec 7.3](https://personalagentprotocol.org/docs/0.2/spec#sending-messages) · [Operations 4.3](https://personalagentprotocol.org/docs/0.2/extensions/operations#binding-conversations)

The request that waits for a reply is shown in full, the API write examples include an `Idempotency-Key`, the example DPoP Proof's `jti` has 128 random bits, and the Operations conversation example has its own event ID.

### Guides

Advice that goes with the spec. Guides aren't requirements.

#### Signing, replay caches, and Mediated Sign-In

[Guides](https://personalagentprotocol.org/docs/0.2/guides) · [Issue #5](https://github.com/personal-agent-protocol/personal-agent-protocol/issues/5)

Sign DPoP Proofs with ES256, which every company accepts. A company's token endpoint keeps a replay cache shared by every server, and its APIs may keep one too. A client or Session assertion's `aud` is the company's `auth.issuer`. Personal agents keep Mediated Sign-In credentials only in a credential store the user chose, and don't sign in with them again after the user disconnects. Companies ask for a one-time code on a personal agent's first mediated sign-in after the user disconnected it.

#### Key refetches, rate limits, and running work

[Guides: Rotating keys](https://personalagentprotocol.org/docs/0.2/guides#both-key-rotation) · [Guides: Rate limits](https://personalagentprotocol.org/docs/0.2/guides#both-rate-limits) · [Guides: Token lifetimes and sign-out](https://personalagentprotocol.org/docs/0.2/guides#company-lifetimes) · [Issue #15](https://github.com/personal-agent-protocol/personal-agent-protocol/issues/15)

Companies refetch a personal agent's keys at most once per interval, counting failures, and charge per-agent rate limits only after the signature checks pass. Accepted work isn't stopped because a session token expired, and work that can take consequential actions stops right away when access is revoked.

#### Hosting several companies

[Guides: Hosting several companies](https://personalagentprotocol.org/docs/0.2/guides#company-hosting) · [Guides: User IDs](https://personalagentprotocol.org/docs/0.2/guides#agent-user-ids) · [Issue #3](https://github.com/personal-agent-protocol/personal-agent-protocol/issues/3)

A new section for providers that host several companies, with an example of which storefronts share an issuer, metadata for an issuer with a path, and keeping each company's tokens and records apart on shared servers. Personal agents key user IDs and account tokens by the full `auth.issuer`.

#### Conversations after sign-out

[Guides: Conversations](https://personalagentprotocol.org/docs/0.2/guides#company-conversations)

Companies can leave conversations that used the account open after sign-out, answering signed-out tokens with `sign_in_required`, instead of closing them.

#### User ID privacy

[Guides: User IDs](https://personalagentprotocol.org/docs/0.2/guides#agent-user-ids) · [Issue #11](https://github.com/personal-agent-protocol/personal-agent-protocol/issues/11)

Personal agents tell users that companies recognize them across signed-out visits and that signing in links those visits to their account. A new list covers anonymous browsing: a new user ID and DPoP key for each session, discarded when it ends.

#### Finding a company

[Guides: Finding a company](https://personalagentprotocol.org/docs/0.2/guides#agent-discovery)

When the company a personal agent reaches is on a different domain from the one the user asked for, it tells the user which company it's dealing with before signing in or acting for them.

#### Matching the spec

[Guides](https://personalagentprotocol.org/docs/0.2/guides)

Personal agents sign assertions and proofs with ES256, and don't send a token or proof to the URL a protocol endpoint redirects to. Mediated Sign-In credentials are discarded or stored when a sign-in ends. Without a browser session endpoint, personal agents browse only as signed-out visitors. The token endpoint's replay rule and `iss` in Direct Sign-In redirects cite the spec without overstating it.

## Version 0.1

Published October 9, 2026, the first published draft. It's frozen at [/docs/0.1/spec](https://personalagentprotocol.org/docs/0.1/spec).

---

Licensed under the [Apache License 2.0](https://personalagentprotocol.org/license).
