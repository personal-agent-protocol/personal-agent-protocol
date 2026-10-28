# Survey

The survey records what the Company has today, so the design can build on it. Write it to
`plan/survey.md` in the Company's repo, using the template below.

It combines two sources:

- **What you can see**: code, config, infrastructure definitions, and docs in the repos you have.
- **What's live**: `node <skill-dir>/validate/index.ts survey https://<domain>`. It fetches the
  domain's well-known documents (`poppy.json`, protected resource metadata, OAuth and OpenID
  metadata, MCP protected resource metadata) and reports what they say.

Anything you can't confirm is a question for the engineer. Many Companies run their identity
provider, API gateway, or support platform as a vendor service, which you can't see from code.
Don't guess what a vendor product supports. Ask, or mark it unknown.

Start `plan/feedback.md` now (see `feedback.md`).

## What to look for

**Domains.** The domains the Company serves customers on, and whether they redirect (for example
`example.com` to `www.example.com`). `organization.domain` in `poppy.json` has to be the host that
serves the document after redirects
([3.1](https://personalagentprotocol.org/docs/0.3/spec#fields)). Countries or brands on other domains
that should be one Company share one issuer
([3.2](https://personalagentprotocol.org/docs/0.3/spec#oauth-server)).

**The domain's protected resource metadata.** Whether
`https://{domain}/.well-known/oauth-protected-resource` exists, and which authorization servers it
lists. Personal Agents find the issuer there
([3.2](https://personalagentprotocol.org/docs/0.3/spec#oauth-server)).

**The OAuth server or identity provider.** This decides the token endpoint pattern
(`patterns/token-endpoint.md`). Find out whether it:

- publishes OAuth Authorization Server Metadata (RFC 8414), and whether you can set
  `grant_types_supported`, `scopes_supported`, and `protected_resources` (RFC 9728) in it;
- authenticates clients with `private_key_jwt` (RFC 7523), and can fetch client keys from a
  `jwks_uri`;
- accepts clients it hasn't registered, identified by a URL (Client ID Metadata Documents), or has a
  hook to resolve them;
- issues access tokens that resources can tie to the `client_id` they were issued to (by
  introspection or a claim), which the Session header check needs
  ([5.3](https://personalagentprotocol.org/docs/0.3/spec#session-verification));
- issues DPoP-bound access tokens (RFC 9449), if the Company wants them (optional,
  [4.5](https://personalagentprotocol.org/docs/0.3/spec#access-tokens));
- supports refresh tokens, their lifetimes, and rotation;
- supports the device authorization grant (RFC 8628), PKCE with S256, `iss` in redirects (RFC 9207),
  revocation (RFC 7009), and resource indicators (RFC 8707);
- issues opaque or JWT access tokens, and how resource servers validate them (introspection, JWKS,
  or a shared session store).

**Sessions and accounts.** How the website keeps a signed-in session (cookie name, session store,
lifetime), how a session is looked up on each request, and where session and token records live.
Whether there's an existing "connected apps" or similar list in account settings.

**Sign-in and consent.** The existing sign-in page and methods (password, passkey, social sign-in,
one-time codes), any existing OAuth consent page, and rate limiting and fraud checks on sign-in.

**Permissions.** How the Company models what a signed-in user can do: roles, OAuth scopes, or
per-endpoint checks. Where those checks live. This drives the scope mapping (`patterns/scopes.md`).

**APIs.** Customer-facing APIs, their OpenAPI descriptions, which gateway or proxy is in front, how
they authenticate today, and which endpoints need an account.

**Confirmations.** Actions customers confirm before they happen today, such as exchanges,
cancellations, or booking changes, where the confirmation happens, and how a retry is kept from
performing an action twice. This drives which actions become operations (Operations extension).

**MCP servers.** Any MCP server, its transport and MCP version, how it authorizes, and whether it
publishes protected resource metadata (RFC 9728).

**The support and agent stack.** The chat or support platform, any AI agent behind it, how
conversations and messages are stored and for how long, the live-agent desk and how handoff works
today, and which account actions the agent's tools can perform and how they authorize them.

**Shared infrastructure.** A gateway or edge proxy in front of the APIs and conversation endpoint
(a place to verify the Session header once), a shared store every server can reach (for Session
records, and a replay cache if you want one), secret storage, logging and tracing (and whether they redact headers), rate
limiting, and how staging is set up.

**Somewhere to host the test identity.** An HTTPS location the Company controls, such as a staging
static bucket, where the engineer can host the validator's `agent.json` and `jwks.json`.

## Template for plan/survey.md

```markdown
# Poppy survey: <Company>

Date: <YYYY-MM-DD>. Surveyed by: <agent> with <engineer>.

## Live today

<Summary of `validate/index.ts survey https://<domain>`: what poppy.json, protected resource
metadata, OAuth/OpenID metadata, and MCP metadata exist, and anything notable such as redirects.>

## Domains

| Domain | Redirects to | Serves customers | Notes |
| ------ | ------------ | ---------------- | ----- |
|        |              |                  |       |

## OAuth server or identity provider

<What it is (in-house or a vendor service), where it's configured, and who owns it.>

| Capability                                     | Supported? (yes / no / unknown) | Evidence (file, config, or "engineer said") |
| ---------------------------------------------- | ------------------------------- | ------------------------------------------- |
| RFC 8414 metadata, can add fields              |                                 |                                             |
| `private_key_jwt` with keys from `jwks_uri`    |                                 |                                             |
| Clients identified by URL, not registered      |                                 |                                             |
| Standard OAuth sign-in and refresh grants      |                                 |                                             |
| Token hooks (add response fields, read params) |                                 |                                             |
| Access tokens tied to `client_id` at resources |                                 |                                             |
| DPoP-bound access tokens (optional)            |                                 |                                             |
| Refresh tokens, lifetime, rotation             |                                 |                                             |
| Device authorization grant                     |                                 |                                             |
| PKCE S256, `iss` in redirects                  |                                 |                                             |
| Revocation (RFC 7009)                          |                                 |                                             |
| Resource indicators (RFC 8707)                 |                                 |                                             |
| Access token format and validation             |                                 |                                             |

## Website sessions and accounts

<Session cookie, store, lifetime, lookup per request. Account settings, connected apps.>

## Sign-in and consent

<Sign-in methods, consent page, one-time codes, sign-in rate limits.>

## Permissions

<How permissions are modelled and checked, and where.>

## APIs

| API | Description location | Gateway | Auth today | Needs an account? |
| --- | -------------------- | ------- | ---------- | ----------------- |
|     |                      |         |            |                   |

## MCP servers

<Server, transport, MCP version, authorization, RFC 9728 metadata.>

## Support and agent stack

<Chat or support platform, AI agent, conversation storage and retention, live-agent desk and
handoff, account actions the agent can take and how they're authorized.>

## Shared infrastructure

<Gateway, shared store for Sessions and replay protection, secret storage, logging and redaction, rate limiting, staging.>

## Test identity hosting

<An HTTPS location for agent.json and jwks.json, or "to decide with the engineer".>

## Questions for the engineer

1. <Question, and why it matters for the design.>
```
