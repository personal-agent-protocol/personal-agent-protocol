# Milestone: extensions

Optional. Build this only for extensions the design lists, after the milestones they depend on.
Operations version 2 is defined with the protocol. Other extensions can be the Company's own, or
ones others define.

## Read first

- [3.3 Extensions](https://personalagentprotocol.org/docs/spec#extensions)
- [About extensions](https://personalagentprotocol.org/docs/extensions#how)
- The extension's own definition

Local copies: `reference/extensions.md` and `reference/operations.md`.

## Every extension

- List it in `extensions` in `poppy.json`, keyed by name, with its `version` and the fields it
  defines ([3.3](https://personalagentprotocol.org/docs/spec#extensions)).
- Read the Personal Agent's supported extensions from `extensions` in its client metadata document
  ([4.1](https://personalagentprotocol.org/docs/spec#agent-identity)). Behave as the spec alone
  describes for Personal Agents that don't list it, unless the request itself uses the extension,
  such as Mediated Sign-In's grant type.
- If you refuse a request that needs the extension, return `extension_required` (HTTP 403) with the
  name in `extension`: a JSON body at the token endpoint and at endpoints the protocol or an
  extension defines, and in `WWW-Authenticate` at APIs (3.3, section 7). An MCP server returns it only
  to refuse the Personal Agent entirely, not for one tool.
- The Company's own extensions are named with a domain it controls, such as `example.com/gift-wrap`.
  Plain names are reserved for the protocol.

## Operations version 2

Optional. Build it for the actions that need the User's approval, on the interfaces that offer them
([Operations 1](https://personalagentprotocol.org/docs/extensions/operations#intro)). It adds no
endpoints. List `operations` with `version: "2"` in `poppy.json` and use it only when
the Personal Agent lists that version too. Otherwise handle approval yourself, or refuse with
`extension_required`. An MCP tool returns an ordinary tool error instead. See
[Operations 2](https://personalagentprotocol.org/docs/extensions/operations#support).

- **The operation**
  ([Operations 3](https://personalagentprotocol.org/docs/extensions/operations#operation-object)):
  an `operation_id` for the action, a `revision` for its terms, a `summary` that holds everything that
  affects the action, `terms` if you want, and `expires_at`. When the terms change, keep the
  `operation_id` and return a new `revision`. Compute both from the request, so only performed
  operations need storing. The `summary` can use bold, italics, and lists, but no links. An operation
  from a signed-in Session belongs to the account.
  Set `expires_at` late enough for the User to read the terms and decide, unless you can't hold the
  terms that long.
- **Asking**
  ([Operations 4](https://personalagentprotocol.org/docs/extensions/operations#approval-required)):
  perform nothing. An API returns 403 with a JSON body: `error` `approval_required` and the operation in
  `operation`, not a `WWW-Authenticate` challenge. An MCP tool returns an error result with the operation in
  `structuredContent`. The Company Agent puts it in `operation` on its message.
- **Approvals**
  ([Operations 6](https://personalagentprotocol.org/docs/extensions/operations#sending-approval)):
  read the `Poppy-Approval` header at APIs, `personalagentprotocol.org/approval` in an MCP tool call's
  `_meta`, and `approval` on a Personal Agent's message. Make all three checks before acting; their
  order is recommended. Preserve authorization, response semantics, and at-most-once behavior. When the
  revision isn't one you returned, has expired, or the request doesn't match it, return a new
  revision instead. Never answer an approval with the revision it names.
- **At most once**
  ([Operations 7](https://personalagentprotocol.org/docs/extensions/operations#at-most-once)):
  perform each operation once, however often its approval comes. Remember a performed operation until its
  approved revision expires. Until then, a repeated approval gets the first response.
  While the outcome is unknown, answer with 503 and `Retry-After`, never as a failure.

## Decisions for Operations

- Which actions, if any, need the User's approval, how long each can be approved, and whether Users
  can allow some of them in advance with rules you offer
  ([guides](https://personalagentprotocol.org/docs/guides#company-operations)).

## Common Operations mistakes

- Starting an action when asking for approval, or performing a request with an approval without
  checking that it matches the approved operation (Operations 3, 6).
- Downstream calls without an idempotency key derived from the operation ID, so a retry performs the
  action twice ([guides](https://personalagentprotocol.org/docs/guides#company-operations)).

## Check it

This version of the validator doesn't check extensions. Run `check --file ./poppy.json` for the
`extensions` entry's shape, then go through the extensions section of `checklist.md` and test by
hand on staging: a Personal Agent whose metadata doesn't list the extension gets the behavior the
spec alone describes, or `extension_required`.

- **Operations,** if offered: a request for an action that needs approval returns the operation and
  changes nothing. The same request with the approval performs it, and sending it again doesn't
  perform it twice. A different body with the same approval, a revision you didn't return, and an
  expired revision each get a new revision. Make a downstream system time out and see 503 until the
  outcome is known.

Also try metadata with no `operations` entry or with `version: "1"`: return no operation and handle
approval yourself, or refuse as above.

Log anything unclear in `plan/feedback.md`.
