# Pattern: scopes

Scopes say what account access a sign-in grants
([4.7](https://personalagentprotocol.org/docs/0.3/spec#scopes)). The protocol defines none: each
Company defines its own, usually the OAuth scopes it already has. Companies decide which actions need each scope and enforce them on the website, APIs,
and actions the Company Agent performs (4.7).

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
- List every offered scope in `scopes_supported` in the OAuth metadata, and describe every one (SHOULD, 4.7):
  in the OAuth security scheme of an OpenAPI description you list, or in `auth.scopes`, a map from
  scope name to description in the same form.
- Write descriptions in words a User understands, specific enough for a language model to pick the
  scopes a task needs. Say whether it only reads, whether a write scope also allows reading, which
  actions can't be undone, and what personal data it shows
  ([guides](https://personalagentprotocol.org/docs/0.3/guides#company-scope-descriptions)).
- Add `auth.scope_hints` (MAY, 4.7): for each scope, `changes` (`none`, `reversible`, or
  `irreversible`) and `personal_data` (`true` or `false`), both required (MUST, 4.7), judged by the
  most consequential operation that requires the scope. Leave out a scope you're unsure about. Add a
  column for the hints to the table.
- On the consent page, present scopes in plain words, group related ones, and show which are new
  when the User already granted some
  ([guides](https://personalagentprotocol.org/docs/0.3/guides#company-consent)).
- If the issuer also serves other OAuth clients, leave scopes you don't offer Personal Agents out of
  `scopes_supported`, and limit the scopes you grant by client (3.2, 4.7). Keeping Direct or Device
  Sign-In from Personal Agents needs an issuer only for them, chosen before launch, because changing
  the issuer later makes every User look new to the Company
  ([guides](https://personalagentprotocol.org/docs/0.3/guides#company-agent-issuer)).
- Agents can also request scopes documented by the Company's APIs or sign-in extensions, even if
  `scopes_supported` omits them. Direct and Device Sign-In can grant the scopes their policies allow. Decide which Mediated Sign-In
  can grant, in its extension's `scopes`. It often grants less.
- Make the scopes cover what Users ask Personal Agents to do, so they don't fall back to the User's
  credentials (SHOULD, [5.4](https://personalagentprotocol.org/docs/0.3/spec#sign-in),
  [10.5](https://personalagentprotocol.org/docs/0.3/spec#credentials)).

## One shared check

Put the scope check in one place that every channel calls: the website, APIs, MCP tools, the
Company Agent's tools, and live agents' tools
([guides](https://personalagentprotocol.org/docs/0.3/guides#company-scopes)).

- **A policy function or service** that takes the verified Session (`client_id`, account, scopes)
  and an action, and answers allow or deny with the missing scopes. Each channel turns a denial into
  its own error: for APIs, a 401 challenge with `scope` when signed out, or `insufficient_scope`
  when the access token lacks the scopes, in `WWW-Authenticate`
  ([section 7](https://personalagentprotocol.org/docs/0.3/spec#apis)), an `authorization` event in
  conversations ([8.11](https://personalagentprotocol.org/docs/0.3/spec#conversation-sign-in)), and a
  visible error naming the missing scopes on the website (SHOULD,
  [section 6](https://personalagentprotocol.org/docs/0.3/spec#web-browsing)).
- **Existing permission checks, fed from scopes.** If services already check permissions, derive
  the permission set from the token's scopes at the edge, and let existing checks do the rest
  ([guides](https://personalagentprotocol.org/docs/0.3/guides#company-internal)).

## What to watch for

- The Company Agent's tools check scopes on every call. Don't rely on the model to decide
  ([guides](https://personalagentprotocol.org/docs/0.3/guides#company-scopes)).
- A live agent who takes over is held to the same scopes
  ([8.9](https://personalagentprotocol.org/docs/0.3/spec#handoff)). Their tools need the same check,
  which may mean changes to the live-agent desk.
- A message never authorizes an account action (8.11).
- The website applies the scopes authorized when the browser joined, through its cookie
  ([section 6](https://personalagentprotocol.org/docs/0.3/spec#web-browsing)).
- Never grant beyond what was requested and allowed for the sign-in type (4.7).
