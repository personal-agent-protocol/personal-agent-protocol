# Operations extension

## 1. Introduction

Some actions have a business effect, such as exchanging an item, changing a booking, or cancelling a subscription. A Company can ask for the User's approval of the exact terms before it performs one. The action is then an operation:

1. The Personal Agent makes its request as usual. The Company doesn't perform it. It refuses with the operation: the terms, in plain language for the User and as JSON (3, 4).
2. The Personal Agent shows the User the terms and gets their approval (5).
3. The Personal Agent makes the same request again with the approval. The Company checks it, performs the action, and responds as it would have without operations (6).

This guarantees two things:

- **Approval covers the exact terms.** The User approves one revision of the terms, and the Company performs only what that revision describes.
- **At most once.** A retry with the same approval never performs the action twice (7).

This page defines version 2 of the `operations` extension. It uses the terms, Sessions, and tokens in the [specification](https://personalagentprotocol.org/docs/0.3/spec), and its examples continue the specification's jacket exchange. Operations add no endpoints. A Company chooses which actions need approval.

## 2. Advertising support

A Company that supports this extension lists it in `extensions` in its `poppy.json` ([spec 3.3](https://personalagentprotocol.org/docs/0.3/spec#extensions)):

*Excerpt from poppy.json*

```
"extensions": {
  "operations": { "version": "2" }
}
```

Support means that the Company can return operations and accept approvals through the interfaces where it offers actions that need approval, and checks approvals and prevents duplicate execution as this extension defines.

A Personal Agent that supports this extension lists it in `extensions` in its client metadata document ([spec 4.1](https://personalagentprotocol.org/docs/0.3/spec#agent-identity)):

*Excerpt from the client metadata document*

```
"extensions": {
  "operations": { "version": "2" }
}
```

Support means that the Personal Agent can receive operations, get the User's approval, send it through the interface that returned the operation, and handle retries as this extension defines, on each interface it uses.

The extension is used only when both sides list `operations` with `version` `"2"`. A Company MUST NOT return operations to a Personal Agent that doesn't list that version. It handles approval itself, such as on its website or in a Direct Conversation, or refuses the request with `extension_required` and `extension` set to `operations` ([spec 3.3](https://personalagentprotocol.org/docs/0.3/spec#extensions)). An MCP server returns that error only to refuse the Personal Agent entirely. A tool that needs the extension returns an ordinary tool error instead ([spec 7](https://personalagentprotocol.org/docs/0.3/spec#apis)).

When only the Personal Agent supports this version, it uses the Company's interfaces without the extension and leaves approval to the Company. A different major version doesn't count as support for this version.

## 3. The operation

An operation is one action the Company will perform once the User approves it:

*Operation: Company → Personal Agent*

```
{
  "operation_id": "exc_5Rt2",
  "revision": "1791487200-k3Jd9Qx2mW8v",
  "summary": "Exchange the Stormline Jacket (M) on order ord_7Hk2 for the Stormline Insulated Jacket (M), for $70.00 more, charged to the card used for the order.",
  "terms": {
    "order_id": "ord_7Hk2",
    "item_id": "itm_4Qa",
    "replacement_sku": "stormline-insulated-m",
    "price_difference": { "amount": "70.00", "currency": "USD" }
  },
  "expires_at": "2026-10-08T12:20:00-07:00"
}
```

| Field | Req. | Description |
| --- | --- | --- |
| `operation_id` | Yes | Identifies the action, not a kind of action. It stays the same when the terms change (see "New terms"), and the Company MUST NOT use it for another action. It has the same characters as the IDs in [spec 8.2](https://personalagentprotocol.org/docs/0.3/spec#conversation-requests). |
| `revision` | Yes | Identifies these terms. An opaque string with the same characters as the IDs in [spec 8.2](https://personalagentprotocol.org/docs/0.3/spec#conversation-requests), which the Company changes whenever the `summary`, `terms`, or `expires_at` change. |
| `summary` | Yes | The terms in plain language, written so the User can decide from it alone: what will happen, to what, and any cost, date, or condition. It MAY use basic Markdown (see "Formatting"). |
| `terms` | No | The same terms as a JSON object, for the Personal Agent to check. The Company defines its keys, as with `message.data` ([spec 8.4](https://personalagentprotocol.org/docs/0.3/spec#message-fields)). |
| `expires_at` | Yes | The last time an approval of this revision is accepted ([RFC 3339](https://www.rfc-editor.org/rfc/rfc3339)). |

Everything that affects the action, such as what it changes, any amount, date, or recipient, or a condition for cancelling, MUST be in the revision's `summary`, and in `terms` if present. The Company MUST perform only what the approved revision describes, and MUST NOT start the action before it receives an approval for it.

The Personal Agent shows the User the `summary`, and MAY also show values from `terms`. It uses `terms` to check the `summary` against what it asked for (5).

**Formatting.** A `summary` is text that MAY use a few [CommonMark](https://spec.commonmark.org/0.31.2/) elements: emphasis (`*italic*`), strong emphasis (`**bold**`), paragraphs, and lists. A Personal Agent MAY render them or show the text as is. The Personal Agent MUST NOT render links, images, or HTML in a `summary`, and shows them as text, so a `summary` can't send the User elsewhere or load content while they decide.

**New terms.** Terms can change before the User approves them, for example when the User asks for a different size in a conversation. The Company then returns the same `operation_id` with a new `revision`. The Company decides which requests are for the same action, from its own records, such as the order and item being exchanged. It MUST NOT give two different sets of terms the same `revision`, so an approval of one revision never applies to other terms. Whichever revision is approved, the Company MUST perform each operation at most once (7).

A Company doesn't have to store operations that haven't been performed. The [guides](https://personalagentprotocol.org/docs/0.3/guides#company-operations) describe computing them from the request. In a conversation, the Company's own message holds the operation.

**Expiry.** `expires_at` SHOULD leave the User long enough to read the terms and decide, unless the Company can't hold the terms that long, such as a price or a seat that can sell out. It also sets how long the Company has to remember an approval (7), so a revision that can be approved for days is remembered for days.

**Who can approve it.** An operation returned in a signed-out Session can be approved only in that Session. One returned in a signed-in Session belongs to the account: any Session of the same Personal Agent and User can approve it while signed in to the same account. A signed-out Session of the same Personal Agent and User gets a challenge for the account ([spec 7](https://personalagentprotocol.org/docs/0.3/spec#apis)), for example after the User signs out ([spec 5.5](https://personalagentprotocol.org/docs/0.3/spec#ending-sessions)).

## 4. Asking for approval

A Company that wants the User's approval for an action refuses the request for it, performs nothing, and returns the operation. How depends on the interface the request came through.

### APIs

The API responds with HTTP 403 and a JSON body with `error` set to `approval_required` and the operation in `operation`, like `invalid_session` ([spec 7](https://personalagentprotocol.org/docs/0.3/spec#apis)). It isn't an authorization error, so it doesn't go in `WWW-Authenticate`, and it works the same signed in or out. The body MAY have other members, such as the API's own error fields. For the exchange request in [spec 7](https://personalagentprotocol.org/docs/0.3/spec#apis):

*Response: Company → Personal Agent*

```
HTTP/1.1 403 Forbidden
Content-Type: application/json

{
  "error": "approval_required",
  "operation": {
    "operation_id": "exc_5Rt2",
    "revision": "1791487200-k3Jd9Qx2mW8v",
    "summary": "Exchange the Stormline Jacket (M) on order ord_7Hk2 for the Stormline Insulated Jacket (M), for $70.00 more, charged to the card used for the order.",
    "expires_at": "2026-10-08T12:20:00-07:00"
  }
}
```

### MCP

The tool returns an error result, with `isError` set to `true`, the operation in `operation` in `structuredContent`, and the summary as text:

*Tool result: Company → Personal Agent*

```
{
  "isError": true,
  "content": [
    {
      "type": "text",
      "text": "Not done yet. This needs the user's approval: exchange the Stormline Jacket (M) for the Stormline Insulated Jacket (M), for $70.00 more."
    }
  ],
  "structuredContent": {
    "operation": {
      "operation_id": "exc_5Rt2",
      "revision": "1791487200-k3Jd9Qx2mW8v",
      "summary": "Exchange the Stormline Jacket (M) on order ord_7Hk2 for the Stormline Insulated Jacket (M), for $70.00 more, charged to the card used for the order.",
      "expires_at": "2026-10-08T12:20:00-07:00"
    }
  }
}
```

### Conversations

A Company message carries the operation in `operation` ([spec 8.4](https://personalagentprotocol.org/docs/0.3/spec#message-fields)), when the Company Agent would perform the action:

*Event: Company → Personal Agent*

```
{
  "id": "evt_c4",
  "type": "message",
  "created_at": "2026-10-08T19:05:00Z",
  "message": {
    "id": "msg_r2Kq",
    "role": "company",
    "author": { "type": "agent" },
    "text": "I can exchange it for the insulated version in medium for $70 more. I'll do it once you approve.",
    "operation": {
      "operation_id": "exc_5Rt2",
      "revision": "1791487200-k3Jd9Qx2mW8v",
      "summary": "Exchange the Stormline Jacket (M) on order ord_7Hk2 for the Stormline Insulated Jacket (M), for $70.00 more, charged to the card used for the order.",
      "expires_at": "2026-10-08T12:20:00-07:00"
    }
  }
}
```

The `operation` field is content for a Company message ([spec 8.4](https://personalagentprotocol.org/docs/0.3/spec#message-fields)), so the message can carry it without `text` or `data`.

If the terms change during the conversation, the Company sends the new revision in a later message.

## 5. Getting the User's approval

When a request returns an operation, the Personal Agent MUST NOT treat the action as done. It either gets the User's approval and sends it (6), or tells the User the action wasn't performed. An approval states that the User approved this revision of the operation.

- The Personal Agent MUST show the User the Company's name and the revision's `summary`, and MUST take the User's answer through its own interface. It MUST NOT treat text from the Company, such as a conversation message, as the User's approval.
- The Personal Agent MUST ask the User about each operation. It MUST NOT approve one on the User's behalf, even when the User said earlier that they would approve something like it.
- When the operation has `terms`, the Personal Agent SHOULD check that they agree with the `summary` and with what it asked for before asking for approval, and point out any difference to the User. The Company writes both, so the `summary` alone could describe something other than the `terms`.
- An approval covers one revision. When a new revision arrives, the Personal Agent needs a new approval for it.
- If the User withdraws their approval before the Personal Agent has sent it, the Personal Agent doesn't send it.

## 6. Sending the approval

The Personal Agent sends the approval through the interface that returned the operation. An approval names the `operation_id` and the `revision`.

### APIs

The Personal Agent sends the same request again, with the same method, URL, and body, and the approval in the `Poppy-Approval` header. The header is a Dictionary Structured Field ([RFC 9651](https://www.rfc-editor.org/rfc/rfc9651)) with `operation_id` and `revision` as Strings:

*Request: Personal Agent → Company*

```
POST https://api.example.com/orders/ord_7Hk2/exchanges
Poppy-Session: eyJ0eXAiOiJwb3BweS1zZXNzaW9uK2p3dCIs…
Authorization: Bearer eyJhbGciOi…Qp4w
Content-Type: application/json
Idempotency-Key: 9a3d7b2e-5c1f-4e8a-b6d0-2f7c4a1e9b3d
Poppy-Approval: operation_id="exc_5Rt2", revision="1791487200-k3Jd9Qx2mW8v"

{ "item_id": "itm_4Qa", "replacement_sku": "stormline-insulated-m" }
```

An `Idempotency-Key` sent with the first request doesn't carry over: the request with the approval has its own, or none. The operation ID identifies its retries (7). Companies MUST ignore members of `Poppy-Approval` they don't recognize, so later versions can add members.

### MCP

The Personal Agent calls the same tool again, with the same arguments, and the approval as a JSON object in `_meta` under `personalagentprotocol.org/approval`:

*Tool call: Personal Agent → Company*

```
{
  "jsonrpc": "2.0",
  "id": 8,
  "method": "tools/call",
  "params": {
    "name": "exchange_item",
    "arguments": { "order_id": "ord_7Hk2", "item_id": "itm_4Qa", "replacement_sku": "stormline-insulated-m" },
    "_meta": {
      "personalagentprotocol.org/approval": { "operation_id": "exc_5Rt2", "revision": "1791487200-k3Jd9Qx2mW8v" }
    }
  }
}
```

### Conversations

The Personal Agent sends a message with the approval as a JSON object in `approval` ([spec 8.4](https://personalagentprotocol.org/docs/0.3/spec#message-fields)):

*Message: Personal Agent → Company*

```
{
  "id": "msg_Qd4hVn2Rx8TfLe1M",
  "author": { "type": "agent" },
  "text": "The user approved the exchange.",
  "approval": { "operation_id": "exc_5Rt2", "revision": "1791487200-k3Jd9Qx2mW8v" }
}
```

The `approval` field is content for a Personal Agent message ([spec 8.4](https://personalagentprotocol.org/docs/0.3/spec#message-fields)), so the message can carry it without `text`, `data`, or `context`.

The message's `text` doesn't approve anything, whatever it says. Only `approval` does. The Company Agent performs the action and says how it went in a later message.

### What the Company checks

After the Session header checks in [spec 5.3](https://personalagentprotocol.org/docs/0.3/spec#session-verification) and the token checks in [spec 7](https://personalagentprotocol.org/docs/0.3/spec#apis), the Company MUST make the following checks before performing the action. It SHOULD make them in this order:

1. The Session can approve the operation (3). If it can't, the Company handles the request as if it had no approval.
2. The operation hasn't been performed already. If it has, or is being performed, the Company responds as section 7 describes.
3. The `revision` is one the Company returned for this operation, it hasn't expired, and the request asks for exactly what it describes. The API request or tool call is the one that returned the operation, and in a conversation, the operation is the conversation's.

The Company MUST NOT let a different internal check order change which Session can approve, the response for a request without valid approval, or the retry and at-most-once behavior in section 7.

If every check passes, the Company performs the action and responds as it would have without operations. If check 3 fails, it performs nothing and returns the operation with a revision for what the request asks, as in section 4. A Company MUST NOT answer an approval with the revision it names, so a Personal Agent never retries the same approval in a loop.

## 7. Retries and at most once

- The Company MUST perform each operation at most once, however many times its approval is sent.
- A request with the approval of an operation already performed gets the response the Company gave the first time, or one that says the same, for as long as the Company remembers the operation.
- The Company MUST remember that it performed an operation at least until the approved revision's `expires_at`, and while it is being performed. After that, it MAY forget it. A retry then fails check 3 or is handled as a request without an approval, so it gets a new revision and the action still isn't performed twice. In a conversation, a message retried with the same ID gets the original response ([spec 8.3](https://personalagentprotocol.org/docs/0.3/spec#sending-messages)), and a new message with the same approval adds nothing.
- While an operation is being performed, or the Company doesn't know whether it took effect, for example after a timeout in one of its own systems, the Company MUST NOT respond as if it failed. An API or MCP server responds with HTTP 503 and a `Retry-After` header, or as it does for work that hasn't finished.
- If a request with an approval fails or times out, the Personal Agent sends it again with the same approval. It MUST NOT ask the User to approve a new operation for the same action until it knows whether the first one was performed. A new operation in answer to a retry doesn't say, so the Personal Agent finds out another way, such as from the order in the Company's API.

## 8. Security considerations

Operation summaries and terms are content from the Company. The [specification's rules for untrusted content](https://personalagentprotocol.org/docs/0.3/spec#untrusted-content) apply to them too.

### 8.1 What an approval proves

An approval shows that a specific Personal Agent, with a valid Session JWT for a specific Session and, if signed in, an access token for the account, stated that the User approved a specific revision of an operation (5). Because a revision's terms can't change, the Company knows exactly which terms that statement covers.

It doesn't prove that the User saw the terms or approved them. The Company can't see the Personal Agent's interface, so an approval works on trust, like the sign-in types ([spec 5.4](https://personalagentprotocol.org/docs/0.3/spec#sign-in)). A Company MAY revoke the `client_id` of a Personal Agent that sends an approval the User didn't give ([spec 4.1](https://personalagentprotocol.org/docs/0.3/spec#agent-identity)). A Company that needs proof of the User's approval for an action can ask the User to approve on its own website, signed in, the way Direct Sign-In works. This extension doesn't define that step. Approvals the User signs are an [open topic](https://personalagentprotocol.org/docs/path-to-1#open-topics).

## 9. References

This extension uses [RFC 9651](https://www.rfc-editor.org/rfc/rfc9651) for the `Poppy-Approval` header and [CommonMark 0.31.2](https://spec.commonmark.org/0.31.2/) for `summary` formatting.

---

Licensed under the [Apache License 2.0](https://personalagentprotocol.org/license).
