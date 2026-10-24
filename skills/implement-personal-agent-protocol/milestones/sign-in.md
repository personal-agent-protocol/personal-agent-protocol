# Milestone: sign-in

Users sign in to their Company accounts through the types the design chose, Personal Agents keep
Account Tokens, and every channel enforces the granted scopes. Skip this milestone if the design
offers only signed-out Sessions.

## Read first

- [4.4 Signing in](https://personalagentprotocol.org/docs/0.3/spec#sign-in), including "Scopes" and "How
  sign-in is remembered"
- [4.5 Direct Sign-In](https://personalagentprotocol.org/docs/0.3/spec#direct-sign-in),
  [4.6 Device Sign-In](https://personalagentprotocol.org/docs/0.3/spec#device-sign-in),
  [4.7 Mediated Sign-In](https://personalagentprotocol.org/docs/0.3/spec#mediated-sign-in): the ones
  the design chose
- [4.8 Account Tokens](https://personalagentprotocol.org/docs/0.3/spec#account-tokens)
- [4.9 Signing out](https://personalagentprotocol.org/docs/0.3/spec#sign-out)
- [7.11 Sign-in during a conversation](https://personalagentprotocol.org/docs/0.3/spec#conversation-sign-in)
- Guides: [Consent pages](https://personalagentprotocol.org/docs/0.3/guides#company-consent),
  [Device sign-in](https://personalagentprotocol.org/docs/0.3/guides#company-device),
  [Mediated sign-in](https://personalagentprotocol.org/docs/0.3/guides#company-mediated),
  [Token lifetimes and sign-out](https://personalagentprotocol.org/docs/0.3/guides#company-lifetimes),
  [Account settings](https://personalagentprotocol.org/docs/0.3/guides#company-account-settings),
  [Enforcing scopes everywhere](https://personalagentprotocol.org/docs/0.3/guides#company-scopes)

Patterns: `patterns/sign-in.md`, `patterns/scopes.md`, `patterns/session-records.md`,
`patterns/token-endpoint.md`.

## What to build

**Scopes** ([4.4](https://personalagentprotocol.org/docs/0.3/spec#sign-in)). Every scope a Personal
Agent can request in `scopes_supported` in the OAuth metadata. A description of each custom scope,
in the OAuth security scheme of an OpenAPI description you list or in `auth.scopes`.
`auth.mediated.scopes` if you offer Mediated Sign-In. Every sign-in request must include `scope`.
Reject missing, unknown, or unavailable scopes with `invalid_scope`. Never grant more than was
requested and allowed for the type. The User may approve fewer, but at least one: approving none is
a decline.

**The sign-in response** (4.4). All types end with `refresh_token` (the Account Token), optionally
`refresh_token_expires_in`, a signed-in Session Token for the current Session, the granted `scope`,
and `session_id`.

**One account per Session** (4.4). A Session signed in to one account can't switch to another. If
the User signs in to a different account, the code exchange, device poll, or Mediated Sign-In
returns `account_mismatch` and issues no tokens. A pending or failed sign-in leaves existing tokens
unchanged.

**Direct Sign-In** ([4.5](https://personalagentprotocol.org/docs/0.3/spec#direct-sign-in)).

- `authorization_endpoint` in the OAuth metadata, and `authorization_code` in its
  `grant_types_supported`.
- The authorization code flow with PKCE. Accept `S256` only
  ([guides](https://personalagentprotocol.org/docs/0.3/guides#company-consent)).
- `redirect_uri` exactly matches an entry in the Personal Agent's `redirect_uris`.
- The consent page shows the Personal Agent's name and logo, the domain of its `client_id`, the
  account, each scope in plain language, and how long access lasts. The User can approve some or
  all scopes, or decline.
- Every redirect, success or error, carries `iss`.
- The code exchange takes `session_id`, the client assertion, and a DPoP Proof, and checks the
  Session belongs to the same `client_id`.

**Device Sign-In** ([4.6](https://personalagentprotocol.org/docs/0.3/spec#device-sign-in)).

- `device_authorization_endpoint` in the metadata, and
  `urn:ietf:params:oauth:grant-type:device_code` in its `grant_types_supported`.
- The device authorization request with the client assertion. The poll at `token_endpoint` with
  `session_id` and a DPoP Proof.
- The verification page shows the Personal Agent and scopes. Opening the link or scanning the code
  never approves by itself.
- Poll responses: `authorization_pending`, `slow_down`, `access_denied`, `expired_token`.

**Mediated Sign-In** ([4.7](https://personalagentprotocol.org/docs/0.3/spec#mediated-sign-in)).

- `auth.mediated` with `endpoint`, `fields`, and `scopes`.
- The endpoint takes a DPoP Session Token and JSON with `scope` and `credentials`. Statuses
  `complete`, `code_required`, `failed`, and `expired`, each with HTTP 200. Code submission at
  `{endpoint}/{sign_in_id}`, only from the Session that started it.
- Errors `invalid_scope`, `account_mismatch`, and `sign_in_not_found` as JSON bodies.
- Rate-limit attempts, never return credentials, and require a one-time code when a sign-in looks
  unusual. Return the same `failed` for an unknown account and a wrong password
  ([guides](https://personalagentprotocol.org/docs/0.3/guides#company-mediated)).

**Account Tokens** ([4.8](https://personalagentprotocol.org/docs/0.3/spec#account-tokens)).

- The `refresh_token` grant with the client assertion and DPoP Proof. With `session_id`, return a
  token for that Session, signing it in if it was signed out. Without one, start a new signed-in
  Session.
- Accept an Account Token only at `token_endpoint` and `revocation_endpoint`, and only from the
  `client_id` it was issued to.
- The Session must belong to the same `client_id` and User ID and be signed out or signed in to the
  same account. Otherwise `invalid_session` or `account_mismatch`.
- `scope` can narrow, never widen. Using the token doesn't extend its lifetime. Rotation is
  optional.
- Expired or revoked: `invalid_grant`, and the Session continues signed out.
- For MCP: the same grant with `resource` returns a token for that MCP server, a DPoP token with a
  proof or a Bearer token without one ([4.3](https://personalagentprotocol.org/docs/0.3/spec#sending-tokens)).

**Signing out** ([4.9](https://personalagentprotocol.org/docs/0.3/spec#sign-out)). RFC 7009 revocation
with the client assertion. Revoke the Account Token and sign out every Session signed in with it.
Sessions usually continue signed out. Check on each request whether the Session is still signed in,
or use much shorter Session Token lifetimes.

**Account settings** (4.9). The User can disconnect a Personal Agent, which revokes its Account
Tokens for that account and signs out its Sessions. List each connected Personal Agent with its
name, domain, scopes, and last use
([guides](https://personalagentprotocol.org/docs/0.3/guides#company-account-settings)).

**Scopes on every channel** (4.4,
[guides](https://personalagentprotocol.org/docs/0.3/guides#company-scopes)). One shared check that the
website, APIs, MCP tools, the Company Agent's tools, and live agents' tools all call.
`poppy:write` doesn't include `poppy:read`. See `patterns/scopes.md`.

**Conversations** ([7.11](https://personalagentprotocol.org/docs/0.3/spec#conversation-sign-in)).

- When the Company Agent needs the account, add an `authorization` event with `sign_in_required` or
  `insufficient_scope` and `scope`, and also ask in a message.
- Accept a new Session Token partway through a conversation, as long as it matches the owner.
- Once a conversation has used the account, it belongs to the account (7.2). A token for the same
  User that isn't signed in to that account gets `sign_in_required`.
- The Company Agent and live agents check scopes before reading account information or making a
  change. A message never authorizes an account action.

**Website.** The browser-session cookie follows the Session's sign-in state and scopes on the next
request ([section 5](https://personalagentprotocol.org/docs/0.3/spec#web-browsing)).

**MCP clients without Poppy** ([section 6](https://personalagentprotocol.org/docs/0.3/spec#apis)). If the
MCP server is listed, an MCP client can sign in with MCP's own authorization flow. Treat that as a
new signed-in Session with no User ID, which ends when the sign-in is revoked or expires.

## Decisions for this milestone

- Consent page wording, and how each scope is described to the User.
- Account Token lifetime, rotation, and when Account Tokens are revoked (password reset, suspected
  compromise).
- Whether sign-out ends Sessions or lets them continue signed out.
- Whether to close conversations that used the account when a Session signs out, or leave them open
  and answer signed-out tokens with `sign_in_required`
  ([4.9](https://personalagentprotocol.org/docs/0.3/spec#sign-out),
  [guides](https://personalagentprotocol.org/docs/0.3/guides#company-conversations)).
- For Mediated Sign-In: attempt limits, when to require a one-time code, and how the User is told.

## Common mistakes

- Granting the scopes requested rather than the ones the User approved, or more than the type allows
  (4.4).
- A consent page that names the Personal Agent but not its `client_id` domain, or that approves on
  page load.
- Missing `iss` on error redirects (4.5).
- An Account Token accepted from any `client_id`, or at an API (4.8).
- Signing a Session in to a second account instead of returning `account_mismatch` (4.4).
- Revoking the Account Token without signing out its Sessions, so earlier Session Tokens keep
  account access (4.9).
- Scope checks only in the API layer, so the Company Agent or a live agent can do what the token
  doesn't allow (7.9, 7.11).
- Treating `poppy:write` as including `poppy:read`.
- Logging Mediated Sign-In request bodies or one-time codes
  ([guides](https://personalagentprotocol.org/docs/0.3/guides#company-mediated)).

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
- Sign in to a second account in a Session already signed in to the first: `account_mismatch`, no
  tokens.
- Use the Account Token with and without `session_id`, with a narrower `scope`, and from a different
  `client_id` (refused).
- Revoke it, then see the Session continue signed out, the old Session Token refused for account
  actions, and the Account Token refused with `invalid_grant`.
- Disconnect from account settings and see the same.
- With a `poppy:read` token, try a write on each channel: API, MCP tool, the Company Agent, a live
  agent's tools, and the website. Each refuses.
- In a conversation, ask for an account action signed out: see an `authorization` event and a
  message. Sign in, continue the same conversation, and see it work.
- Check logs for tokens, codes, and credentials.

Log anything unclear in `plan/feedback.md`.
