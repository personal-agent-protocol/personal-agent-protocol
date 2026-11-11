# Operations extension

## 1. Introduction

Some actions have a business effect, such as exchanging an item, changing a booking, or cancelling a subscription. A Company can ask for approval of the exact terms before it performs one. The action is then an operation:

1. The Personal Agent makes its request as usual. The Company doesn't perform it. It refuses with the operation: the terms, in plain language for the User and as JSON (3, 4).
2. The terms are approved: the Personal Agent asks the User, or approves them on an instruction the User gave it (5).
3. The Personal Agent makes the same request again with the approval. The Company checks it, performs the action, and responds as it would have without operations, or declines the approval and performs nothing (6).

This guarantees two things:

- **Approval covers the exact terms.** An approval covers one revision of the terms, and the Company performs only what that revision describes.
- **At most once.** A retry with the same approval never performs the action twice (7).

This page defines version 3 of the `operations` extension. It uses the terms, Sessions, and tokens in the [specification](https://personalagentprotocol.org/docs/0.4/spec), and most of its examples continue the specification's jacket exchange. A Company chooses which actions need approval. Operations at APIs, MCP servers, and conversations add no endpoints. On a website, the Personal Agent's browser makes the request, and the Personal Agent gets the operation and sends the approval at an endpoint the extension adds (4, 6).

## 2. Advertising support

A Company that supports this extension lists it in `extensions` in its `poppy.json` ([spec 3.3](https://personalagentprotocol.org/docs/0.4/spec#extensions)):

*Excerpt from poppy.json*

```
"extensions": {
  "operations": [{ "version": "3", "endpoint": "https://example.com/poppy/operations" }]
}
```

A Company that asks for approval on its website lists `endpoint`, the HTTPS URL where the Personal Agent gets operations its website returned and sends their approvals (4, 6). It MUST list `web.browser_session_endpoint` with it ([spec 6](https://personalagentprotocol.org/docs/0.4/spec#web-browsing)), because only a browser joined to a Session gets operations. A Company that returns no operations on its website doesn't list `endpoint` and doesn't serve it, and its website handles approval itself.

Support means that the Company can return operations and accept approvals through the interfaces where it offers actions that need approval, and checks approvals and prevents duplicate execution as this extension defines.

A Personal Agent that supports this extension declares it in `Poppy-Extensions` ([spec 3.4](https://personalagentprotocol.org/docs/0.4/spec#versions)):

*Request header: Personal Agent → Company*

```
Poppy-Extensions: "operations";v="3"
```

Support means that the Personal Agent can receive operations, approve them as section 5 describes, send the approval through the interface that returned the operation, and handle declines and retries as this extension defines, on each interface it uses.

The extension is used only when the Company lists `operations` with `version` `"3"` and the request declares that version. A browser's requests declare the extensions that step 2 of its browser join declared ([spec 6](https://personalagentprotocol.org/docs/0.4/spec#web-browsing)). A Company MUST NOT return operations in response to a request that doesn't declare it. It handles approval itself, such as on its website or in a Direct Conversation, or refuses the request with `extension_required` and `extension` set to `operations` ([spec 3.3](https://personalagentprotocol.org/docs/0.4/spec#extensions)). An MCP server returns that error only to refuse the Personal Agent entirely. A tool that needs the extension returns an ordinary tool error instead ([spec 7](https://personalagentprotocol.org/docs/0.4/spec#apis)).

When only the Personal Agent supports this version, it uses the Company's interfaces without the extension and leaves approval to the Company. A different major version doesn't count as support for this version.

In conversations, this extension's content is in `extensions.operations` ([spec 8.4](https://personalagentprotocol.org/docs/0.4/spec#message-fields)): an object with `operation` (4) or `declined` (6) in a Company message, or `approval` in a Personal Agent message (6). Its JSON Schema is [operations-content.schema.json](https://personalagentprotocol.org/kit/company/schemas/operations-content.schema.json).

## 3. The operation

An operation is one action the Company will perform once it's approved:

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
| `operation_id` | Yes | Identifies the action, not a kind of action. It stays the same when the terms change (see "New terms"), and the Company MUST NOT use it for another action. It has the same characters as the IDs in [spec 8.2](https://personalagentprotocol.org/docs/0.4/spec#conversation-requests). |
| `revision` | Yes | Identifies these terms. An opaque string with the same characters as the IDs in [spec 8.2](https://personalagentprotocol.org/docs/0.4/spec#conversation-requests), which the Company changes whenever the terms or `expires_at` change. A `summary` reworded without changing the terms can keep it. |
| `summary` | No | The same terms in plain language, written so the User can decide from it alone: what will happen, to what, and any cost, date, or condition. It MAY use basic Markdown (see "Formatting"). |
| `terms` | Yes | The terms as a JSON object, for the Personal Agent to check and show the User. The Company defines its keys, as with `message.data` ([spec 8.4](https://personalagentprotocol.org/docs/0.4/spec#message-fields)). |
| `expires_at` | Yes | The last time an approval of this revision is accepted ([RFC 3339](https://www.rfc-editor.org/rfc/rfc3339)). |

Everything that affects the action, such as what it changes, any amount, date, or recipient, or a condition for cancelling, MUST be in the revision's `terms`, and in `summary` if present. The Company MUST perform only what the approved revision describes, and MUST NOT start the action before it receives an approval for it.

The Personal Agent shows the User the terms: the `summary`, a description it writes from `terms`, or the values in `terms` themselves (5). It uses `terms` to check them against what it asked for.

**Formatting.** A `summary` is text that MAY use a few [CommonMark](https://spec.commonmark.org/0.31.2/) elements: emphasis (`*italic*`), strong emphasis (`**bold**`), paragraphs, and lists. A Personal Agent MAY render them or show the text as is. The Personal Agent MUST NOT render links, images, or HTML in a `summary`, and shows them as text, so a `summary` can't send the User elsewhere or load content while they decide.

**New terms.** The terms of an action can change before it's performed, in two ways. The User can ask for different terms, for example a different size in a conversation. Or the Company's terms can change, for example a price, so that an approval no longer matches them (6). The Company then returns the same `operation_id` with a new `revision`, and the User needs to approve the new terms. The Company decides which requests are for the same action, from its own records or from the approval a request carries. It MUST NOT give two different sets of terms the same `revision`, so an approval of one revision never applies to other terms. Whichever revision is approved, the Company MUST perform each operation at most once (7).

A Company doesn't have to store operations that haven't been performed. The [guides](https://personalagentprotocol.org/docs/0.4/guides#company-operations) describe computing them from the request. In a conversation, the Company's own message holds the operation.

**Expiry.** `expires_at` SHOULD leave the User long enough to read the terms and decide, unless the Company can't hold the terms that long, such as a price or a seat that can sell out. It also sets how long the Company has to remember an approval (7), so a revision that can be approved for days is remembered for days.

**Who can approve it.** An operation can be approved in any Session of the same Personal Agent and User, including one that starts after the Session that returned it ends. An operation returned in a signed-out Session can be approved only while signed out. One returned in a signed-in Session belongs to the account: it can be approved only while signed in to the same account. A signed-out Session of the same Personal Agent and User gets a challenge for the account ([spec 7](https://personalagentprotocol.org/docs/0.4/spec#apis)), for example after the User signs out ([spec 5.5](https://personalagentprotocol.org/docs/0.4/spec#ending-sessions)). The same holds for an operation returned on a website, whose approval applies to a browser joined to any Session that can approve it (6).

## 4. Asking for approval

A Company that wants approval for an action refuses the request for it, performs nothing, and returns the operation. How depends on the interface the request came through.

### APIs

The API responds with HTTP 403 and a JSON body with `error` set to `approval_required` and the operation in `operation`, like `invalid_session` ([spec 7](https://personalagentprotocol.org/docs/0.4/spec#apis)). It isn't an authorization error, so it doesn't go in `WWW-Authenticate`, and it works the same signed in or out. The body MAY have other members, such as the API's own error fields. For the exchange request in [spec 7](https://personalagentprotocol.org/docs/0.4/spec#apis):

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
    "terms": {
      "order_id": "ord_7Hk2",
      "item_id": "itm_4Qa",
      "replacement_sku": "stormline-insulated-m",
      "price_difference": { "amount": "70.00", "currency": "USD" }
    },
    "expires_at": "2026-10-08T12:20:00-07:00"
  }
}
```

### MCP

The tool returns an error result, with `isError` set to `true`, the operation in `operation` in `structuredContent`, and text that says the action needs approval, such as the summary:

*Tool result: Company → Personal Agent*

```
{
  "isError": true,
  "content": [
    {
      "type": "text",
      "text": "Not done yet. This needs approval: exchange the Stormline Jacket (M) for the Stormline Insulated Jacket (M), for $70.00 more."
    }
  ],
  "structuredContent": {
    "operation": {
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
  }
}
```

### Conversations

A Company message carries the operation in `extensions.operations.operation` ([spec 8.4](https://personalagentprotocol.org/docs/0.4/spec#message-fields)), when the Company Agent would perform the action:

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
    "extensions": {
      "operations": {
        "operation": {
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
      }
    }
  }
}
```

If the terms change during the conversation, the Company sends the new revision in a later message.

### Websites

When the request comes from a browser joined to a Session ([spec 6](https://personalagentprotocol.org/docs/0.4/spec#web-browsing)), and the website handles it as that Session, the website performs nothing and responds with HTTP 403 and a reference to the operation in the `Poppy-Operation` header. The website handles a request as the Session when the browser is signed in through a join with an access token, or is signed out with no login of its own. A browser that kept a login its join didn't give it gets the website's own approval flow instead, because its operations would belong to an account the Session isn't signed in to (3).

The header is a Dictionary Structured Field ([RFC 9651](https://www.rfc-editor.org/rfc/rfc9651)) with two Strings:

- `sid` is the `sid` of the Session the website handled the request as ([spec 5.2](https://personalagentprotocol.org/docs/0.4/spec#session-header)), so the Personal Agent knows which of its Sessions, and which Company, the operation is for.
- `ref` is the reference: at most 2048 characters from A–Z, a–z, 0–9, `-`, `_`, and `.`. The Company chooses its form. It works in any Session that can approve the operation (3).

The Company's website SHOULD offer a way to make the original request again, such as a Continue button on the page that's waiting, so the Personal Agent can repeat the action once it's approved (6). An action the website can't repeat, such as one guarded by a single-use form token, isn't suited to operations on the website, and the website handles its approval itself.

The body is for whatever made the request, and doesn't carry the operation, which the Personal Agent gets only from `endpoint`. The Company's website SHOULD answer a page load or form submission with a page that says the action is waiting for approval in the User's personal agent. For the exchange submitted from the order page:

*Response: Company → Personal Agent's browser*

```
HTTP/1.1 403 Forbidden
Content-Type: text/html
Cache-Control: no-store
Poppy-Operation: sid="ses_Hq3vT8nW2kLm9xRb", ref="exc_5Rt2.1791487200.k3Jd9Qx2mW8v"

<!doctype html>
<title>Waiting for approval</title>
<p>This exchange is waiting for your approval in your personal agent.</p>
```

The Company's website SHOULD answer a request from its own scripts that accepts JSON, such as a `fetch`, with a JSON object with `error` set to `approval_required`, like an API's but without the operation. The object MAY have other members, such as the website's own error fields:

*Response: Company → Personal Agent's browser*

```
HTTP/1.1 403 Forbidden
Content-Type: application/json
Cache-Control: no-store
Poppy-Operation: sid="ses_Hq3vT8nW2kLm9xRb", ref="exc_5Rt2.1791487200.k3Jd9Qx2mW8v"

{ "error": "approval_required" }
```

The Personal Agent MUST take a reference only from the `Poppy-Operation` header of a response that its own browser received, never from page content or a message, and only when `sid` names a Session it joined that browser to. It ignores any other `Poppy-Operation` header. It sends the reference only to the `endpoint` of that Session's Company, so a header from anywhere else can't send its Session header to a new destination ([spec 5.2](https://personalagentprotocol.org/docs/0.4/spec#session-header)). It gets the operation by sending the reference there, with the Session header of that Session, or of another Session that can approve the operation (3), and the access token if signed in:

*Request: Personal Agent → Company*

```
POST https://example.com/poppy/operations
Poppy-Session: eyJ0eXAiOiJwb3BweS1zZXNzaW9uK2p3dCIs…
Poppy-Version: 0.4
Poppy-Extensions: "operations";v="3"
Authorization: Bearer eyJhbGciOi…Qp4w
Content-Type: application/json

{ "ref": "exc_5Rt2.1791487200.k3Jd9Qx2mW8v" }
```

The endpoint checks the Session header and the access token as an API does ([spec 7](https://personalagentprotocol.org/docs/0.4/spec#apis)). It requires no scope: recording an approval performs nothing, and the browser's request performs the action with the browser's own access. For a reference to an operation the Session can approve (3), it responds as an API asks for approval, with the operation:

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
    "terms": {
      "order_id": "ord_7Hk2",
      "item_id": "itm_4Qa",
      "replacement_sku": "stormline-insulated-m",
      "price_difference": { "amount": "70.00", "currency": "USD" }
    },
    "expires_at": "2026-10-08T12:20:00-07:00"
  }
}
```

A signed-out Session of the same Personal Agent and User gets a challenge for an operation that belongs to an account, as in section 3. Any other reference that the Session can't use, because the Company didn't return it, its operation has expired, or the Session can't approve it, gets HTTP 400 with `{"error": "invalid_request"}`. The Personal Agent then has its browser make the request again for a new one.

## 5. Approving an operation

When a request returns an operation, the Personal Agent MUST NOT treat the action as done. It either sends an approval of the operation (6), or tells the User the action wasn't performed. An approval states that this revision of the operation is approved, in one of two ways:

- **User approved:** the Personal Agent asks the User, and the User approves.
- **Agent approved:** the Personal Agent approves on an instruction the User gave it, such as "go ahead with any exchange under $20".

A later version can add a third, signed user approval (8.1).

For a user approval:

- The Personal Agent MUST show the User the Company's name and the revision's terms, and MUST take the User's answer through its own interface. It MUST NOT treat text from the Company, such as a conversation message, as the User's approval.
- The Personal Agent can describe the terms itself, or show the values in `terms`. When the operation has a `summary`, the Personal Agent SHOULD show it rather than write its own description.

For an agent approval:

- It MUST rest on an instruction the User gave the Personal Agent. Content from the Company, a website, or anything else the Personal Agent read isn't one, even when it says it comes from the User.
- Before approving, the Personal Agent MUST check the revision's terms against that instruction, and approve only if the instruction covers them. This extension doesn't say how. If the Personal Agent can't tell whether it does, it asks the User.
- If the Company answers the Personal Agent's agent approval with a new revision (6), or a website returns a new operation for the action after recording it, the Personal Agent MUST NOT approve the new one on the same instruction. It asks the User.

For both:

- Before approving, the Personal Agent SHOULD check that `terms` agree with what it asked for, and with the `summary` if there is one, and point out any difference to the User when it asks them. The Company writes both, so the `summary` alone could describe something other than the `terms`. On a website, what it asked for is the action its browser just took (8.2).
- An approval covers one revision. When a new revision arrives, it needs a new approval, from the User or the Personal Agent. If the User prefers an earlier revision, the Personal Agent can send its approval, but the Company may have replaced it (6).
- If the User withdraws their approval, or the instruction an agent approval rests on, before the Personal Agent has sent it, the Personal Agent doesn't send it.

## 6. Sending the approval

The Personal Agent sends the approval through the interface that returned the operation. An approval names the `operation_id` and the `revision`, and says in `approver` how it was approved (5): `user` for a user approval, or `agent` for an agent approval. The Personal Agent MUST include `approver`. An approval can also have:

- `approved_at`, in Unix seconds: when the User approved, with `user`, or when the Personal Agent approved, with `agent`. It can be earlier than the request, for example when the Personal Agent sends the approval later.
- `input_type`, only with `user`: how the User gave their answer, as a short string, such as `tap`, `typed`, or `voice`. Other values are allowed. The Personal Agent MUST NOT include it with `agent`, and a Company ignores it there.
- `reference`: an ID for the Personal Agent's own record of the approval, such as an entry in a ledger the User can see, so the Company and the Personal Agent's operator can look into the approval later. It is opaque, has the same characters as the IDs in [spec 8.2](https://personalagentprotocol.org/docs/0.4/spec#conversation-requests), and is unique among the User's approvals at least. The Personal Agent MUST NOT send the same `reference` to two Companies, so that Companies can't use it to link the User's approvals at one Company to their approvals at another.

The Personal Agent MUST NOT put personal data, or anything that identifies the User or their device, in `input_type` or `reference`. It SHOULD include `approved_at` and `input_type` with `user`. A Company MAY record `approver`, `approved_at`, `input_type`, and `reference`, and MUST NOT reject or decline an approval because an optional member is missing or because it doesn't recognize the `input_type`. Like the approval itself, they are the Personal Agent's statements (8.1).

### APIs

The Personal Agent sends the same request again, with the same method, target URI ([RFC 9110, section 7.1](https://www.rfc-editor.org/rfc/rfc9110#section-7.1)), and content, and the approval in the `Poppy-Approval` header. Other header fields can differ, such as a renewed access token or the Session header of another Session that can approve the operation (3). The header is a Dictionary Structured Field ([RFC 9651](https://www.rfc-editor.org/rfc/rfc9651)) with `operation_id`, `revision`, `approver`, `input_type`, and `reference` as Strings, and `approved_at` as an Integer:

*Request: Personal Agent → Company*

```
POST https://api.example.com/orders/ord_7Hk2/exchanges
Poppy-Session: eyJ0eXAiOiJwb3BweS1zZXNzaW9uK2p3dCIs…
Poppy-Version: 0.4
Authorization: Bearer eyJhbGciOi…Qp4w
Content-Type: application/json
Idempotency-Key: 9a3d7b2e-5c1f-4e8a-b6d0-2f7c4a1e9b3d
Poppy-Approval: operation_id="exc_5Rt2", revision="1791487200-k3Jd9Qx2mW8v", approver="user", approved_at=1791487260, input_type="tap", reference="apr_01JD8ZK3Q9"

{ "item_id": "itm_4Qa", "replacement_sku": "stormline-insulated-m" }
```

An agent approval of the same revision:

*Request header: Personal Agent → Company*

```
Poppy-Approval: operation_id="exc_5Rt2", revision="1791487200-k3Jd9Qx2mW8v", approver="agent", approved_at=1791487255, reference="apr_01JD8ZK3R4"
```

An `Idempotency-Key` ([draft-ietf-httpapi-idempotency-key-header](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/)) sent with the first request doesn't carry over: the request with the approval has its own, or none. The operation ID identifies its retries (7). Companies MUST ignore members of `Poppy-Approval` they don't recognize, so later versions can add members.

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
      "personalagentprotocol.org/approval": {
        "operation_id": "exc_5Rt2",
        "revision": "1791487200-k3Jd9Qx2mW8v",
        "approver": "user",
        "approved_at": 1791487260,
        "input_type": "tap"
      }
    }
  }
}
```

### Conversations

The Personal Agent sends a message with the approval as a JSON object in `extensions.operations.approval` ([spec 8.4](https://personalagentprotocol.org/docs/0.4/spec#message-fields)):

*Message: Personal Agent → Company*

```
{
  "author": { "type": "agent" },
  "text": "The user approved the exchange.",
  "extensions": {
    "operations": {
      "approval": {
        "operation_id": "exc_5Rt2",
        "revision": "1791487200-k3Jd9Qx2mW8v",
        "approver": "user",
        "approved_at": 1791487260,
        "input_type": "voice"
      }
    }
  }
}
```

The message's `text` doesn't approve anything, whatever it says. Only the approval does. The Company Agent performs the action and says how it went in a later message.

### Websites

The approval never passes through the browser, and an operation returned on a website is approved only at `endpoint`. The Company MUST NOT accept an approval of a website's operation at an API, MCP server, or conversation, or an approval of another interface's operation at `endpoint`. The Personal Agent sends the same request to `endpoint` again, with the same body and the approval in the `Poppy-Approval` header, as at an API. The Company makes the checks below and, if they pass, records the approval for the operation and responds with HTTP 204, or declines it (below). It performs nothing yet:

*Request: Personal Agent → Company*

```
POST https://example.com/poppy/operations
Poppy-Session: eyJ0eXAiOiJwb3BweS1zZXNzaW9uK2p3dCIs…
Poppy-Version: 0.4
Poppy-Extensions: "operations";v="3"
Authorization: Bearer eyJhbGciOi…Qp4w
Content-Type: application/json
Poppy-Approval: operation_id="exc_5Rt2", revision="1791487200-k3Jd9Qx2mW8v", approver="user", approved_at=1791487260, input_type="tap"

{ "ref": "exc_5Rt2.1791487200.k3Jd9Qx2mW8v" }
```

The Personal Agent then has its browser make the action's request again, such as by pressing the page's Continue button, submitting the same form, or pressing the same button. The website MAY make it again itself, such as from a page that waits for the approval. Either way, section 7 keeps the action from happening twice.

When a request from a browser joined to a Session asks for an action, the website looks for a recorded approval that the Session can approve (3) and that passes check 3 for the request, as if the request carried it. If several match, it uses the one recorded first, and each request uses up at most one. If it finds one, it makes check 2 and performs the action if it passes, and the approval is then used up. Otherwise, it handles the request as one without an approval, and returns a new reference as in section 4. At `endpoint`, a request that fails check 3 gets the response section 4 describes for its reference: the operation, or `invalid_request` once it has expired. The Company MUST keep a recorded approval that isn't used up until the approved revision's `expires_at`, and MUST NOT apply it to requests from a Session that can't approve the operation.

**Looking up an approved operation.** Once an operation has a recorded approval, a request to `endpoint` with its reference and no approval responds with HTTP 200 and the operation's state in `status`: `approved` while the approval waits for the browser's request, `performing` while the Company performs the action or doesn't yet know whether it took effect, and `performed` after. The Company answers this way for as long as it remembers the operation (7):

*Response body: Company → Personal Agent*

```
{ "operation_id": "exc_5Rt2", "status": "performed" }
```

### What the Company checks

After the Session header checks in [spec 5.3](https://personalagentprotocol.org/docs/0.4/spec#session-verification) and the token checks in [spec 7](https://personalagentprotocol.org/docs/0.4/spec#apis), the Company MUST make the following checks before performing the action, and respond as the first one that fails says, whatever order it makes them in internally:

1. The Session can approve the operation (3). If it can't, the Company handles the request as if it had no approval.
2. The operation hasn't been performed already. If it has, or is being performed, the Company responds as section 7 describes.
3. The `revision` is one the Company returned for this operation, it hasn't expired, and the request asks for exactly what it describes. The API request or tool call asks for the same action as the one that returned the operation, in a conversation, the operation is the conversation's, and at `endpoint`, the reference is the operation's. The Company compares what the requests mean, not their bytes, and MAY ignore differences it considers inconsequential, such as the order of JSON members. It MAY treat a revision it has replaced with a later one as failing this check.

If every check passes, the Company performs the action and responds as it would have without operations, or declines the approval (below). If check 3 fails, it performs nothing and returns the operation with a revision for what the request asks, as in section 4. A Company MUST NOT answer an approval with the revision it names, so a Personal Agent never retries the same approval in a loop.

### Declining an approval

Once the checks pass, a Company MAY decline the approval instead of performing the action, for its own reasons, such as `approver`, the account, or its own risk checks. It performs nothing and returns no new operation. A decline has these members:

| Field | Req. | Description |
| --- | --- | --- |
| `operation_id` | Yes | The approval's `operation_id`. |
| `revision` | Yes | The approval's `revision`. |
| `reason` | No | Why, in short plain language for the User, like the `reason` of a `user_requested` event ([spec 8.10](https://personalagentprotocol.org/docs/0.4/spec#direct-conversations)). |
| `alternative` | No | Another way to do the action, as in [spec 9.2](https://personalagentprotocol.org/docs/0.4/spec#alternatives), such as a `web` reference where the User can do it themselves. |

The Company MUST NOT put anything in `reason` that the Session couldn't already see. There are no reason codes: the Personal Agent does the same whatever the reason, and codes would invite workarounds and reveal the Company's risk rules.

An API responds with HTTP 403 and a JSON body with `error` set to `approval_declined` and the members above, like `approval_required` (4). For an agent approval of an account closure:

*Response: Company → Personal Agent*

```
HTTP/1.1 403 Forbidden
Content-Type: application/json

{
  "error": "approval_declined",
  "operation_id": "cls_2Wq8",
  "revision": "1791487200-p9Lm3Rt6Vx1c",
  "reason": "Only the account holder can close this account.",
  "alternative": {
    "instructions": "The account holder can close the account in the Example app.",
    "references": [{ "type": "web", "url": "https://example.com/account/close" }]
  }
}
```

An MCP tool returns an error result, with `isError` set to `true`, the same members, `error` included, in `structuredContent`, and text that says the action wasn't performed, such as the `reason`. In a conversation, the Company Agent says so in a later message, with the members in `extensions.operations.declined`, without `error`. On a website, the Company declines at `endpoint`, where the approval arrives, and responds as an API does. The Company MUST NOT record a declined approval, so a website never finds it for a later request.

When an approval is declined, the Personal Agent MUST NOT send that approval again, and MUST NOT approve a new revision for the same action without asking the User (5). It tells the User the action wasn't performed, and can pass on `reason` and `alternative`. They are content from the Company ([spec 10.1](https://personalagentprotocol.org/docs/0.4/spec#untrusted-content)): it can show them or put them in its own words, and doesn't follow them as instructions.

## 7. Retries and at most once

- The Company MUST perform each operation at most once, however many times its approval is sent.
- A request with the approval of an operation already performed gets the response the Company gave the first time, or one that says the same, for as long as the Company remembers the operation.
- The Company MUST remember that it performed an operation at least until the approved revision's `expires_at`, and while it is being performed. After that, it MAY forget it. A retry then fails check 3 or is handled as a request without an approval, so it gets a new revision and the action still isn't performed twice. On a website, the browser's request carries no approval, so once the action is performed, the next request for it is a new one and gets a new operation (6). In a conversation, a message retried with the same ID gets the original response ([spec 8.3](https://personalagentprotocol.org/docs/0.4/spec#sending-messages)), and a new message with the same approval adds nothing.
- While an operation is being performed, or the Company doesn't know whether it took effect, for example after a timeout in one of its own systems, the Company MUST NOT respond as if it failed. An API or MCP server responds with HTTP 503 and a `Retry-After` header, or as it does for work that hasn't finished.
- A declined approval (6) means the operation wasn't performed. It isn't a failure, and the Personal Agent doesn't send the approval again.
- If a request with an approval fails or times out, the Personal Agent sends it again with the same approval. It MUST NOT approve a new operation for the same action, or ask the User to, until it knows whether the first one was performed. A new operation in answer to a retry doesn't say, so the Personal Agent finds out another way, such as from the order in the Company's API.
- On a website, if the browser's request fails or times out after the approval was recorded, the Personal Agent has the browser make it again. An approval that wasn't used up still applies. A new reference in answer means the approval was used up or no longer matches. Before approving the new one, or asking the User about it, the Personal Agent looks up the earlier reference at `endpoint` (6): while it is `performing`, it waits, and when it is `performed`, it doesn't approve it.

## 8. Security considerations

Operation summaries and terms are content from the Company. The [specification's rules for untrusted content](https://personalagentprotocol.org/docs/0.4/spec#untrusted-content) apply to them too.

### 8.1 What an approval proves

An approval shows that a specific Personal Agent, with a valid Session JWT for a specific Session and, if signed in, an access token for the account, stated that a specific revision of an operation was approved, by the User or by the Personal Agent on the User's instruction (5). Because a revision's terms can't change, the Company knows exactly which terms that statement covers.

The Company can't see the Personal Agent's interface, so it relies on the Personal Agent for how the approval was given, like the sign-in types ([spec 5.4](https://personalagentprotocol.org/docs/0.4/spec#sign-in)). That includes `approver`, `approved_at`, `input_type`, and `reference` (6), which help the Company keep a record, judge risk, and look into an approval with the Personal Agent's operator. A Company MAY revoke the `client_id` of a Personal Agent that sends an approval the User didn't give or instruct ([spec 4.1](https://personalagentprotocol.org/docs/0.4/spec#agent-identity)).

A Company chooses which actions it returns operations for (1). For an action where it wants to see the User approve, it doesn't return operations, and has the User confirm on its own website or in its app, signed in, the way Direct Sign-In works. This extension doesn't define that step, which differs from operations on a website (4): those are approved by the Personal Agent. A Company can also decline approvals it won't act on, such as agent approvals for an action (6). Accepting only `user` approvals still relies on the Personal Agent's statement, and doesn't show that the User approved.

Signed user approvals are on the [roadmap](https://personalagentprotocol.org/docs/roadmap#signed-approvals). A later version or extension can add a signature over the operation's terms, made on the User's device with a key the User registered with the Company, so the Company can verify the User's approval itself. It would be another member of a user approval, which Companies that don't support it ignore.

### 8.2 Operations on websites

Anything that runs in the browser can send requests in its Session: the website's own scripts, including third-party ones, and pages that the Personal Agent's model was led to open. So on a website, only the Personal Agent's own request to `endpoint`, with the Session header and its access token, can approve an operation (6). Neither the browser's cookie nor anything a page can read or write is enough. A reference isn't a credential either: it gets an operation only in a Session that can approve it (3). The `sid` in `Poppy-Operation` isn't one either. It's in every Session JWT the Company receives, and the header shows it only to the browser already in that Session. Without the Personal Agent's key, it can't be used to sign a request.

A script on the website can still make it return an operation the Personal Agent didn't ask for, because the script's requests belong to the Session too. The terms come from the Company, so the User sees the real terms, but the Personal Agent SHOULD check that the operation is for the action its browser just took, and point out any difference to the User, as with `terms` (5).

Once an approval is recorded, a request for exactly the approved revision from a browser in a Session that can approve it performs it, even one a page script sends. That performs only what was approved, at most once.

## 9. References

This extension uses [RFC 9651](https://www.rfc-editor.org/rfc/rfc9651) for the `Poppy-Approval` and `Poppy-Operation` headers, [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110) for the target URI, [CommonMark 0.31.2](https://spec.commonmark.org/0.31.2/) for `summary` formatting, and [draft-ietf-httpapi-idempotency-key-header](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/) for the `Idempotency-Key` header.

---

Licensed under the [Apache License 2.0](https://personalagentprotocol.org/license).
