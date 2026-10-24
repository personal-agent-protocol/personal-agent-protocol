# Pattern: scopes

Scopes say what account access a sign-in grants
([4.4](https://personalagentprotocol.org/docs/0.3/spec#sign-in)). The protocol defines `poppy:read`
(view account information) and `poppy:write` (make changes). They're independent: `poppy:write`
doesn't include `poppy:read`. Companies decide which operations need each scope and enforce them on
the website, APIs, and actions the Company Agent performs (4.4).

## Mapping onto existing permissions

Write a table in the design that maps each Poppy scope to the Company's existing permissions:

| Scope         | Grants                                | Doesn't grant                                   |
| ------------- | ------------------------------------- | ----------------------------------------------- |
| `poppy:read`  | <existing read permissions, by name>  | <sensitive reads kept out, if any>              |
| `poppy:write` | <existing write permissions, by name> | <actions kept out, such as changing a password> |

- Start from what the Company already lets a signed-in customer do, and decide what a Personal Agent
  shouldn't do even with `poppy:write`, such as changing sign-in credentials or closing the
  account.
- Use custom scopes for access that needs separate consent, such as `addresses`. List every scope in
  `scopes_supported` in the OAuth metadata. Describe each custom scope in the OAuth security scheme
  of an OpenAPI description you list, or in `auth.scopes`, a map from
  scope name to description. Names starting with `poppy:` are
  reserved (4.4).
- A Company MAY leave out `poppy:read` and `poppy:write` and offer only narrower custom scopes
  (4.4).
- If the issuer also serves other OAuth clients, leave scopes you don't offer Personal Agents out of
  `scopes_supported`, and limit the scopes you grant by client (3.2, 4.4). Keeping Direct or Device
  Sign-In from Personal Agents needs an issuer only for them, chosen before launch, because changing
  `auth.issuer` later breaks every existing Session (guides#company-agent-issuer).
- Direct and Device Sign-In can grant any scope in `scopes_supported`. Decide which Mediated Sign-In
  can grant, in `auth.mediated.scopes`. It often grants less.

## One shared check

Put the scope check in one place that every channel calls: the website, APIs, MCP tools, the
Company Agent's tools, and live agents' tools
([guides](https://personalagentprotocol.org/docs/0.3/guides#company-scopes)).

- **A policy function or service** that takes the verified Session (`client_id`, account, scopes)
  and an action, and answers allow or deny with the missing scopes. Each channel turns a denial into
  its own error: `insufficient_scope` or `sign_in_required` in `WWW-Authenticate` for APIs
  ([section 6](https://personalagentprotocol.org/docs/0.3/spec#apis)), an `authorization` event in
  conversations ([7.11](https://personalagentprotocol.org/docs/0.3/spec#conversation-sign-in)), and a
  page or redirect on the website.
- **Existing permission checks, fed from scopes.** If services already check permissions, derive
  the permission set from the token's scopes at the edge, and let existing checks do the rest
  ([guides](https://personalagentprotocol.org/docs/0.3/guides#company-internal)).

## What to watch for

- The Company Agent's tools check scopes on every call. Don't rely on the model to decide
  ([guides](https://personalagentprotocol.org/docs/0.3/guides#company-scopes)).
- A live agent who takes over is held to the same scopes
  ([7.9](https://personalagentprotocol.org/docs/0.3/spec#handoff)). Their tools need the same check,
  which may mean changes to the live-agent desk.
- A message never authorizes an account action (7.11).
- The website applies the Session's scopes through the browser-session cookie
  ([section 5](https://personalagentprotocol.org/docs/0.3/spec#web-browsing)).
- Never grant beyond what was requested and allowed for the sign-in type (4.4).
