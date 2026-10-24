# Changelog

What changed in each version of the specification, extensions, and guides, newest first. Each published version stays at its own URL, such as [/docs/0.1/spec](https://personalagentprotocol.org/docs/0.1/spec).

## Draft 0.3

In progress, at [/docs/spec](https://personalagentprotocol.org/docs/0.3/spec). This list grows until 0.3 is published. Major changes are design decisions. Minor changes fill gaps, make the text consistent, or follow an RFC. A change tagged "Breaking" can require an implementation that followed the 0.2 text to change, whether it's major or minor.

### Major changes

#### Sign-in types from the OAuth server metadata

Breaking · [Spec 3.1](https://personalagentprotocol.org/docs/0.3/spec#fields) · [Spec 3.2](https://personalagentprotocol.org/docs/0.3/spec#oauth-server) · [Spec 4.4](https://personalagentprotocol.org/docs/0.3/spec#sign-in)

`auth.direct` and `auth.device` are removed from `poppy.json`. A Company offers Direct and Device Sign-In when `grant_types_supported` in its OAuth server metadata includes `authorization_code` or `urn:ietf:params:oauth:grant-type:device_code`, so there's no second list to drift out of sync with the issuer. `grant_types_supported` is now required, with the JWT bearer and refresh token grants. A Company whose issuer offers one of these grants to other clients offers it to Personal Agents too. Direct and Device Sign-In can grant any scope in `scopes_supported`. Only Mediated Sign-In keeps its own list, `auth.mediated.scopes`.

### Minor changes

#### `protected_resources` replaces `poppy_domains`

Breaking · [Spec 3](https://personalagentprotocol.org/docs/0.3/spec#discovery) · [Spec 3.2](https://personalagentprotocol.org/docs/0.3/spec#oauth-server) · [Spec 4.6](https://personalagentprotocol.org/docs/0.3/spec#device-sign-in) · [Spec 9.3](https://personalagentprotocol.org/docs/0.3/spec#trust) · [Guides: Direct and device sign-in](https://personalagentprotocol.org/docs/0.3/guides#agent-direct-device) · [Guides: Hosting several companies](https://personalagentprotocol.org/docs/0.3/guides#company-hosting)

The issuer confirms which domains name it with `protected_resources`, the field RFC 9728 registers in authorization server metadata, instead of the custom `poppy_domains`. It lists `https://{domain}` for each domain, exactly in that form with no path or trailing slash, and may list other resources, such as MCP servers. Personal Agents check that it includes `https://{organization.domain}` by exact string, ignoring case only in the host, and a device sign-in link's host is checked against the hosts of its entries.

#### `scopes_supported` and `auth.scopes`

Breaking · [Spec 3.1](https://personalagentprotocol.org/docs/0.3/spec#fields) · [Spec 3.2](https://personalagentprotocol.org/docs/0.3/spec#oauth-server) · [Spec 4.4](https://personalagentprotocol.org/docs/0.3/spec#sign-in) · [Guides: An issuer for personal agents](https://personalagentprotocol.org/docs/0.3/guides#company-agent-issuer)

A Company lists every scope a Personal Agent can request in `scopes_supported` in its OAuth server metadata, as RFC 8414 defines, and Personal Agents request only scopes from it. A Company describes its own scopes in the OAuth security scheme of an OpenAPI description it lists, or otherwise in `auth.scopes`, which replaces `auth.custom_scopes` and has the same form as the `scopes` of an OAuth 2.0 security scheme in OpenAPI. `scopes_supported` may leave out scopes the Company doesn't offer Personal Agents, and the Company may limit the scopes it grants by client, so an issuer that serves other clients doesn't need a separate one for Personal Agents. The guides explain when a separate issuer is still useful.

#### User IDs as pairwise identifiers

[Spec 4.2](https://personalagentprotocol.org/docs/0.3/spec#starting-sessions) · [Spec 10](https://personalagentprotocol.org/docs/0.3/spec#references)

Section 4.2 relates User IDs to OpenID Connect pairwise subject identifiers, which the Personal Agent assigns for each pair of User and Company. The rules for User IDs don't change.

#### `signed_in` removed

Breaking · [Spec 4.2](https://personalagentprotocol.org/docs/0.3/spec#starting-sessions) · [Spec 4.3](https://personalagentprotocol.org/docs/0.3/spec#sending-tokens) · [Spec 4.4](https://personalagentprotocol.org/docs/0.3/spec#sign-in) · [Spec 4.7](https://personalagentprotocol.org/docs/0.3/spec#mediated-sign-in)

Token responses no longer have `signed_in`. `scope` is always present: empty for a signed-out Session Token, and with at least one scope for a signed-in one. A sign-in where the User approves no scopes ends as a decline.

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
