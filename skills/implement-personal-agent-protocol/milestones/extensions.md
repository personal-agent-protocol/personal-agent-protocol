# Milestone: extensions

Optional. Build this only for extensions the design lists, after the milestones they depend on.

## Read first

- [3.3 Extensions](https://personalagentprotocol.org/docs/0.3/spec#extensions)
- [About extensions](https://personalagentprotocol.org/docs/0.3/extensions#how)
- The extension's own page, such as the
  [Operations extension](https://personalagentprotocol.org/docs/0.3/extensions/operations#intro)

Local copies: `reference/extensions.md`, `reference/operations.md`.

## Every extension

- List it in `extensions` in `poppy.json`, keyed by name, with its `version` and the fields it
  defines ([3.3](https://personalagentprotocol.org/docs/0.3/spec#extensions)).
- Read the Personal Agent's supported extensions from `extensions` in its client metadata document
  ([4.1](https://personalagentprotocol.org/docs/0.3/spec#agent-identity)). Behave as the spec alone
  describes for Personal Agents that don't list it.
- If you refuse a request that needs the extension, return `extension_required` (HTTP 403) with the
  name in `extension`: a JSON body at the token endpoint and at endpoints the protocol or an
  extension defines, and in `WWW-Authenticate` at APIs (3.3, section 6). An MCP server returns it only
  to refuse the Personal Agent entirely, not for one tool.
- The Company's own extensions are named with a domain it controls, such as `example.com/gift-wrap`.

## Operations

What to build, from the [Operations extension](https://personalagentprotocol.org/docs/0.3/extensions/operations#intro):

- **Advertising** ([section 2](https://personalagentprotocol.org/docs/0.3/extensions/operations#support)):
  the `operations` entry with `version: "1"` and `endpoint`. The endpoint accepts DPoP Session
  Tokens. Never return operations to a Personal Agent that doesn't list the extension.
- **The operation object and states**
  ([section 3](https://personalagentprotocol.org/docs/0.3/extensions/operations#operations)): everything
  that affects the action is in `summary` (and `terms`, if present). Revisions are fixed once issued
  ([3.1](https://personalagentprotocol.org/docs/0.3/extensions/operations#revisions)). Ownership follows
  [3.2](https://personalagentprotocol.org/docs/0.3/extensions/operations#ownership).
- **Proposing** ([section 4](https://personalagentprotocol.org/docs/0.3/extensions/operations#proposing)):
  OpenAPI endpoints return 202 with `operation`, MCP tools return it in `structuredContent`, Company
  messages carry it in `operation`. Return the existing operation when the same action comes up in
  another channel.
- **Confirming** ([5.2](https://personalagentprotocol.org/docs/0.3/extensions/operations#confirm)): the
  checks in order, then `in_progress` and the action.
- **Tracking and at most once**
  ([section 6](https://personalagentprotocol.org/docs/0.3/extensions/operations#tracking)): perform
  each operation at most once across every channel. Never report `failed` while you don't know
  whether the action happened.
- **Cancelling** ([section 7](https://personalagentprotocol.org/docs/0.3/extensions/operations#cancelling))
  and **errors** ([section 9](https://personalagentprotocol.org/docs/0.3/extensions/operations#errors)).

Decisions: which actions become operations, which need `user_approval_required`, how long proposals
last, and how long final operations stay readable.

Common mistakes, from the [guides](https://personalagentprotocol.org/docs/0.3/guides#operations-companies):

- Starting the action when it's proposed rather than confirmed.
- Changing a revision's terms in place instead of issuing a new revision.
- Downstream calls without an idempotency key derived from the operation ID, so a retry performs the
  action twice.
- A `summary` that relies on context the User won't see.

## Check it

This version of the validator doesn't check extensions. Run `check --file ./poppy.json` for the
`extensions` entry's shape, then go through the extensions section of `checklist.md` and test by
hand on staging:

- A Personal Agent whose metadata doesn't list the extension never receives an operation.
- Propose, confirm, and read an operation. Confirm it again and see no second action.
- Issue a new revision, then confirm the old one: `terms_changed`.
- Confirm with `standing_permission` where `user_approval_required` is `true`:
  `user_approval_required`.
- Make a downstream system time out and see the operation stay `in_progress` until the outcome is
  known.

Log anything unclear in `plan/feedback.md`.
