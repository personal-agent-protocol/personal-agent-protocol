# Pattern: scopes

Scopes say what account access a sign-in grants
([4.4](https://personalagentprotocol.org/docs/spec#sign-in)). The protocol defines none: each
Company defines its own, usually the OAuth scopes it already has. Names starting with `poppy:` are
reserved. Companies decide which operations need each scope and enforce them on the website, APIs,
and actions the Company Agent performs (4.4).

## Choosing and describing scopes

Write a table in the design with each scope, its description, and the Company's existing
permissions it grants:

| Scope          | Description                              | Grants                               | Doesn't grant                                   |
| -------------- | ---------------------------------------- | ------------------------------------ | ----------------------------------------------- |
| `orders:read`  | <what the User sees on the consent page> | <existing read permissions, by name> | <sensitive reads kept out, if any>              |
| `orders:write` | <what the Personal Agent can change>     | <existing write permissions>         | <actions kept out, such as changing a password> |

- Start from the scopes the Company's OAuth server already has, and from what a signed-in customer
  can do. Decide what a Personal Agent shouldn't do under any scope, such as changing sign-in
  credentials or closing the account.
- List every scope in `scopes_supported` in the OAuth metadata, and describe every one (MUST, 4.4):
  in the OAuth security scheme of an OpenAPI description you list, or in `auth.scopes`, a map from
  scope name to description in the same form.
- Write descriptions in words a User understands, specific enough for a language model to pick the
  scopes a task needs. Nothing marks a scope as read-only, so say whether it only reads, and
  whether a write scope also allows reading
  ([guides](https://personalagentprotocol.org/docs/guides#company-scope-descriptions)).
- On the consent page, present scopes in plain words, group related ones, and show which are new
  when the User already granted some
  ([guides](https://personalagentprotocol.org/docs/guides#company-consent)).
- If the issuer also serves other OAuth clients, leave scopes you don't offer Personal Agents out of
  `scopes_supported`, and limit the scopes you grant by client (3.2, 4.4). Keeping Direct or Device
  Sign-In from Personal Agents needs an issuer only for them, chosen before launch, because changing
  `auth.issuer` later breaks every existing Session (guides#company-agent-issuer).
- Direct and Device Sign-In can grant any scope in `scopes_supported`. Decide which Mediated Sign-In
  can grant, in `auth.mediated.scopes`. It often grants less.
- Make the scopes cover what Users ask Personal Agents to do, so they don't fall back to the User's
  credentials (SHOULD, [4.4](https://personalagentprotocol.org/docs/spec#sign-in),
  [9.5](https://personalagentprotocol.org/docs/spec#credentials)).

## One shared check

Put the scope check in one place that every channel calls: the website, APIs, MCP tools, the
Company Agent's tools, and live agents' tools
([guides](https://personalagentprotocol.org/docs/guides#company-scopes)).

- **A policy function or service** that takes the verified Session (`client_id`, account, scopes)
  and an action, and answers allow or deny with the missing scopes. Each channel turns a denial into
  its own error: `insufficient_scope` in `WWW-Authenticate` for APIs
  ([section 6](https://personalagentprotocol.org/docs/spec#apis)), an `authorization` event in
  conversations ([7.11](https://personalagentprotocol.org/docs/spec#conversation-sign-in)), and a
  visible error naming the missing scopes on the website (SHOULD,
  [section 5](https://personalagentprotocol.org/docs/spec#web-browsing)).
- **Existing permission checks, fed from scopes.** If services already check permissions, derive
  the permission set from the token's scopes at the edge, and let existing checks do the rest
  ([guides](https://personalagentprotocol.org/docs/guides#company-internal)).

## What to watch for

- The Company Agent's tools check scopes on every call. Don't rely on the model to decide
  ([guides](https://personalagentprotocol.org/docs/guides#company-scopes)).
- A live agent who takes over is held to the same scopes
  ([7.9](https://personalagentprotocol.org/docs/spec#handoff)). Their tools need the same check,
  which may mean changes to the live-agent desk.
- A message never authorizes an account action (7.11).
- The website applies the Session's scopes through the browser-session cookie
  ([section 5](https://personalagentprotocol.org/docs/spec#web-browsing)).
- Never grant beyond what was requested and allowed for the sign-in type (4.4).
