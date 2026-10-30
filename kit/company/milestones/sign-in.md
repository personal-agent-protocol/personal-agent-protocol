# Milestone: sign-in

Users sign in to their Company accounts through the types the design chose, Personal Agents keep
refresh tokens and send access tokens with the Session header, and every channel enforces the
granted scopes. Skip this milestone if the design offers only signed-out Sessions.

Sign-in is plain OAuth. It doesn't know about Sessions: a Session is signed in on each request that
carries an access token alongside its Session header
([5.4](https://personalagentprotocol.org/docs/spec#sign-in)).

## Read first

- [5.4 Signing in](https://personalagentprotocol.org/docs/spec#sign-in), with
  [4.7 Scopes](https://personalagentprotocol.org/docs/spec#scopes) for account access
- [4.2 Direct Sign-In](https://personalagentprotocol.org/docs/spec#direct-sign-in),
  [4.3 Device Sign-In](https://personalagentprotocol.org/docs/spec#device-sign-in),
  [Mediated Sign-In extension](https://personalagentprotocol.org/docs/extensions/mediated-sign-in): the ones the design chose
- [4.4 Refresh tokens](https://personalagentprotocol.org/docs/spec#refresh-tokens) and
  [4.5 Access tokens](https://personalagentprotocol.org/docs/spec#access-tokens)
- [5.5 Ending Sessions and signing out](https://personalagentprotocol.org/docs/spec#ending-sessions)
- [8.11 Sign-in during a conversation](https://personalagentprotocol.org/docs/spec#conversation-sign-in)
- Guides: [Describing scopes](https://personalagentprotocol.org/docs/guides#company-scope-descriptions),
  [Consent pages](https://personalagentprotocol.org/docs/guides#company-consent),
  [Device sign-in](https://personalagentprotocol.org/docs/guides#company-device),
  [Mediated sign-in](https://personalagentprotocol.org/docs/guides#company-mediated),
  [Token lifetimes and sign-out](https://personalagentprotocol.org/docs/guides#company-lifetimes),
  [Account settings](https://personalagentprotocol.org/docs/guides#company-account-settings),
  [Enforcing scopes everywhere](https://personalagentprotocol.org/docs/guides#company-scopes)

Patterns: `patterns/sign-in.md`, `patterns/scopes.md`, `patterns/session-records.md`,
`patterns/token-endpoint.md`.

## What to build

**Scopes** ([4.7](https://personalagentprotocol.org/docs/spec#scopes)). Listing every offered scope
in `scopes_supported` and describing it are recommended. Agents can also use scopes documented by
the APIs or sign-in extensions. Put descriptions in
the OAuth security scheme of an OpenAPI description you list or in `auth.scopes`. Write them in
words a User and a language model can understand
([guides](https://personalagentprotocol.org/docs/guides#company-scope-descriptions)).
The extension's `scopes` if you offer Mediated Sign-In. Every sign-in request must include `scope`.
Reject missing, unknown, or unavailable scopes with `invalid_scope`. Never grant more than was
requested and allowed for the type. The User may approve fewer, but at least one: approving none is
a decline.

**The token response** (4.7). Sign-in returns `access_token`, `token_type`, `refresh_token`, and the
granted `scope` when it differs from the request. `expires_in` is recommended. Refresh can omit
`refresh_token` when it doesn't replace it; the agent keeps its existing token (RFC 6749 §6).
Send `Cache-Control: no-store`.

**Access tokens** ([4.5](https://personalagentprotocol.org/docs/spec#access-tokens)).

- Bearer or DPoP-bound, as the design chose. With DPoP, the request carries both the Session JWT
  and a DPoP proof, each signed with its own key.
- Resources must be able to tell which `client_id` a token was issued to, for the Session header
  check ([5.3](https://personalagentprotocol.org/docs/spec#session-verification)).
- A service that accepts only its own tokens publishes protected resource metadata. Issue a token
  for its `resource` (RFC 8707) at sign-in or refresh, accept it only there, and return
  `invalid_target` for a `resource` you don't serve. A service that gets a token not issued for it
  returns `invalid_token` with `resource_metadata`.
- Require a verified Session header wherever handling the request depends on Session claims (5.3).
  An endpoint using OAuth alone still validates the token, audience, scopes, and required DPoP.

**Account changes** (5.4). A Session can change accounts unless the Company refuses it. The
Company may refuse a request whose access token is for a different account than its Session used
before, with `invalid_session`. Decide whether to. Personal Agents should start a new Session for a
second account.

**Direct Sign-In** ([4.2](https://personalagentprotocol.org/docs/spec#direct-sign-in)).

- `authorization_endpoint` in the OAuth metadata, and `authorization_code` in its
  `grant_types_supported`.
- The authorization code flow with PKCE. Accept `S256` only
  ([guides](https://personalagentprotocol.org/docs/guides#company-consent)).
- `redirect_uri` exactly matches an entry in the Personal Agent's `redirect_uris`, except for the
  port of a loopback redirect URI.
- The consent page shows the Personal Agent's name and logo, the domain of its `client_id`, the
  account, each scope in plain language, and how long access lasts. The User can approve some or
  all scopes, or decline.
- Every redirect, success or error, carries `iss`.
- The code exchange takes the client assertion.

**Device Sign-In** ([4.3](https://personalagentprotocol.org/docs/spec#device-sign-in)).

- Follow the best practices for cross-device flows in RFC 10027 §2 (MUST): assess the risk, and
  choose mitigations with the engineer.
- `device_authorization_endpoint` in the metadata, and
  `urn:ietf:params:oauth:grant-type:device_code` in its `grant_types_supported`.
- The device authorization request and each poll at `token_endpoint` carry the client assertion.
- Put the verification page on the host of the issuer or of a URL in `protected_resources`, or a
  subdomain of either. Personal Agents don't show a link anywhere else.
- The verification page shows the Personal Agent and scopes. Opening the link or scanning the code
  never approves by itself.
- Poll responses: `authorization_pending`, `slow_down`, `access_denied`, `expired_token`.

**Mediated Sign-In** ([extension](https://personalagentprotocol.org/docs/extensions/mediated-sign-in)).

- Transitional. Offer it only until Direct or Device Sign-In covers the same scopes. The protocol
  plans to remove it, on a date set when version 1.0 is published.
- `mediated-sign-in` in `extensions` in `poppy.json`, with `version` `"1"`, `fields`, and `scopes`,
  and the grant type `https://personalagentprotocol.org/grant/mediated-sign-in` in the issuer's
  `grant_types_supported`.
- An extension grant at `token_endpoint`: the client assertion, `scope`, and each field in `fields`
  as a form parameter. Field names can't be `grant_type`, `scope`, `resource`, client authentication parameters, or
  parameters the extension defines.
- A second step returns the OAuth error `code_required` (HTTP 400) with `sign_in_id` and
  `expires_in`, and `sent_to` saying where the code went, as in the extension's example. The next request sends `sign_in_id` and `one_time_code`, not the credentials,
  and only the `client_id` that started it can finish it. A wrong code returns `code_required`
  again until your attempt limit, then `invalid_grant`.
- Errors are OAuth errors: `invalid_grant`, `expired_token`, `access_denied`, `invalid_scope`.
- Rate-limit attempts, and require a one-time code when a sign-in looks unusual. Return the same `invalid_grant` for an unknown account and a wrong password
  ([guides](https://personalagentprotocol.org/docs/guides#company-mediated)).

**Refresh tokens** ([4.4](https://personalagentprotocol.org/docs/spec#refresh-tokens)).

- The `refresh_token` grant with the client assertion. Accept a refresh token only at
  `token_endpoint` and `revocation_endpoint`, and only from the `client_id` it was issued to.
- A refresh token isn't tied to a Session or a key. Any of the User's Sessions can use access tokens
  from it.
- `scope` can narrow, never widen. `resource` asks for a token for one service. Using the token
  doesn't extend its lifetime. Rotation is optional.
- Expired or revoked: `invalid_grant`, and the Personal Agent continues signed out.

**Signing out** ([4.6](https://personalagentprotocol.org/docs/spec#revocation)). RFC 7009 revocation
with the client assertion and `token_type_hint=refresh_token`. Then invalidate the access tokens
issued under it, or check on each request whether the authorization is still active. If you do
neither, keep access tokens to a few minutes (5.5). Sessions continue signed out.

**Account settings** (5.5). The User can disconnect a Personal Agent, which revokes its refresh
tokens for that account. List each connected Personal Agent with its name, domain, scopes, and last
use ([guides](https://personalagentprotocol.org/docs/guides#company-account-settings)).

**Scopes on every channel** (4.7,
[guides](https://personalagentprotocol.org/docs/guides#company-scopes)). One shared check that the
website, APIs, MCP tools, the Company Agent's tools, and live agents' tools all call.
Check read and write scopes separately. A signed-out request that needs the account gets a 401
challenge with `scope`; an access token without the scopes gets `insufficient_scope` (403)
([section 7](https://personalagentprotocol.org/docs/spec#apis)). On the website, a refusal for a
missing scope should show a visible error naming the scopes
([section 6](https://personalagentprotocol.org/docs/spec#web-browsing)). See `patterns/scopes.md`.

**Conversations** ([8.11](https://personalagentprotocol.org/docs/spec#conversation-sign-in)).

- When the Company Agent needs the account, add an `authorization` event with `insufficient_scope`
  and the `scope` it needs, and also ask in a message.
- Accept an access token starting or stopping partway through a conversation, or the conversation
  continuing in a new Session, as long as the request matches the owner.
- Once a conversation has used the account, it belongs to the account (8.2). A request on it
  without an access token for that account gets the 401 challenge.
- The Company Agent and live agents check scopes before reading account information or making a
  change. A message never authorizes an account action.

**Website.** Step 2 of the browser join takes the access token, and the cookie set in step 3 acts
for its account and scopes. It stops acting for the account when the User signs out or disconnects
the Personal Agent ([section 6](https://personalagentprotocol.org/docs/spec#web-browsing)).

## Decisions for this milestone

- Bearer or DPoP-bound access tokens, and which services accept only their own tokens.
- Whether to refuse a Session that changes to a different account.
- Consent page wording, and how each scope is described to the User.
- Access and refresh token lifetimes, rotation, and when refresh tokens are revoked (password reset,
  suspected compromise).
- Whether to close conversations that used the account after sign-out, or leave them open and
  answer requests without the account's token with the 401 challenge
  ([5.5](https://personalagentprotocol.org/docs/spec#ending-sessions),
  [guides](https://personalagentprotocol.org/docs/guides#company-conversations)).
- For Mediated Sign-In: attempt limits, when to require a one-time code, and how the User is told.

## Common mistakes

- Granting the scopes requested rather than the ones the User approved, or more than the type allows
  (4.7).
- A consent page that names the Personal Agent but not its `client_id` domain, or that approves on
  page load.
- Missing `iss` on error redirects (4.2).
- A refresh token accepted from any `client_id`, or at an API (4.4).
- Using Session claims with an access token without verifying the header, `ath`, and that the token
  was issued to the Session JWT's `iss` (5.3).
- Expecting a Session parameter, a DPoP key, or a User ID at the token endpoint. Sign-in doesn't
  know the Session.
- Revoking the refresh token but letting its access tokens keep working for hours (5.5).
- Scope checks only in the API layer, so the Company Agent or a live agent can do what the token
  doesn't allow (8.9, 8.11).
- Treating a write scope as including the matching read scope when its description doesn't say so.
- A website that refuses a missing scope with a generic error or a sign-in page, without naming the
  scope (section 6).
- Logging token request bodies, Mediated Sign-In credentials, or one-time codes
  ([guides](https://personalagentprotocol.org/docs/guides#company-mediated)).

## Check it

```sh
node <skill-dir>/validate/index.ts check https://<staging-domain> --milestone sign-in
```

This version of the validator doesn't check sign-in, because it needs a person to sign in. Run the
command anyway to catch metadata problems, then go through the sign-in section of `checklist.md` and
test by hand on staging with a test account. Use a local script that signs with `.poppy/` where a
test needs signed requests, without printing or copying the private key.

- Each sign-in type: sign in, approve fewer scopes than requested, and see only those granted.
  Request an unknown scope and get `invalid_scope`. Decline and see `access_denied`.
- Send the access token with a Session header: the request is signed in. Send it without the
  header, or with a Session JWT whose `ath` doesn't match or whose `iss` is another `client_id`:
  each is refused.
- Use one access token in two Sessions of the same User. If the Company refuses account changes,
  send a second account's token in a Session that used the first, and see `invalid_session`.
- Refresh with a narrower `scope`, and from a different `client_id` (refused). If a service accepts
  only its own tokens, refresh with its `resource` and check that the token works only there.
- Revoke the refresh token, then see the access token refused for account actions, the refresh
  token refused with `invalid_grant`, and the Session continue signed out.
- Disconnect from account settings and see the same.
- With a read-only token, try a write on each channel: API, MCP tool, the Company Agent, a live
  agent's tools, and the website. Each refuses, and the website names the missing scope.
- In a conversation, ask for an account action signed out: see an `authorization` event and a
  message. Sign in, continue the same conversation with the access token, and see it work.
- Check logs for tokens, Session JWTs, codes, and credentials.

Log anything unclear in `plan/feedback.md`.
