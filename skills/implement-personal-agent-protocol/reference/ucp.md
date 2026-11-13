# UCP extension

## 1. Introduction

The [Universal Commerce Protocol](https://ucp.dev) (UCP) is an open protocol for agentic commerce: how an agent discovers what a business offers, searches its catalog, builds a cart, completes a checkout with a negotiated payment handler, follows an order, and asks the business questions. A business that speaks UCP publishes a profile at `/.well-known/ucp` that names its capabilities, versions, transports, and authorization, and the agent negotiates with it on each request.

This extension tells a Personal Agent that a Company speaks UCP, and says how the two protocols fit together: this protocol finds the Company, identifies the Personal Agent and a pseudonymous User, and signs the User in; UCP is the business protocol for how a Personal Agent shops once it is there. UCP's Business, Platform, and Buyer are this protocol's Company, Personal Agent, and User.

This page defines version 1 of the `ucp` extension. It uses the terms, Sessions, and tokens in the [specification](https://personalagentprotocol.org/docs/1.0/spec). Where it names a UCP capability, field, or rule, UCP's current specification is the reference: this page describes the connection, and UCP describes the commerce. A Company's UCP version is negotiated per UCP; this extension's version tracks this page alone.

## 2. Advertising support

A Company that speaks UCP lists the extension in `extensions` in its `poppy.json` ([spec 3.3](https://personalagentprotocol.org/docs/1.0/spec#extensions)):

*Excerpt from poppy.json*

```
"extensions": {
  "ucp": [{ "version": "1" }]
}
```

- The Company's UCP profile is at `https://{organization.domain}/.well-known/ucp`, where UCP puts it (3). The document that speaks for the domain ([spec 10.3](https://personalagentprotocol.org/docs/1.0/spec#trust)) and the UCP profile are on the same host.
- A Company that offers sign-in has an issuer ([spec 3.2](https://personalagentprotocol.org/docs/1.0/spec#oauth-server)), found from the protected resource metadata at `https://{organization.domain}/.well-known/oauth-protected-resource`. For this extension, the Personal Agent selects the issuer as spec 3.2 describes, including `auth.issuer` when that document lists more than one authorization server, and the Company's UCP services SHOULD support account access through that issuer. If a UCP service requires a different issuer, the Personal Agent MUST NOT use that issuer through this extension. Account access through this extension is unavailable for that service, though UCP used independently may still offer it (below). A Company that offers no sign-in can offer UCP signed out without an issuer ([spec 3.2](https://personalagentprotocol.org/docs/1.0/spec#oauth-server)), and one that sets `auth.disabled` offers UCP signed out to Personal Agents too. Its UCP identity linking stays available to UCP used independently of this extension (below).
- Support means that the Company's UCP services, at the endpoints its profile lists, are endpoints this extension defines: the Personal Agent sends them the Session header ([spec 5.2](https://personalagentprotocol.org/docs/1.0/spec#session-header)), and the Company handles its requests as UCP defines (4, 8).

A Personal Agent that supports this extension SHOULD declare `"ucp";v="1"` in `Poppy-Extensions` ([spec 3.4](https://personalagentprotocol.org/docs/1.0/spec#versions)), so a Company can tell from its other requests that the Personal Agent speaks UCP, for example to point it to UCP from another of its interfaces. A Company doesn't rely on the declaration: it recognizes a UCP request from the request itself ([spec 3.3](https://personalagentprotocol.org/docs/1.0/spec#extensions)), which names the Personal Agent's UCP platform profile (3).

A Personal Agent that doesn't support this extension ignores the entry and uses the Company's `agent`, `apis`, and `web` as the specification describes. A Company MAY also list its UCP MCP endpoint in `apis`, for MCP clients that speak UCP but don't know this extension. The tools there are UCP's: UCP requires the Personal Agent to advertise its platform profile on every request, in the form the transport defines (3), so a client that does gets UCP's tools, and one that doesn't gets UCP's `invalid_profile_url` error rather than a result. An MCP endpoint listed in `apis` follows [spec 7](https://personalagentprotocol.org/docs/1.0/spec#apis): its protected resource metadata `resource` equals its `url`, and tokens for it are requested with that `resource`. Listing it is optional.

**UCP without this extension.** A Company MUST NOT require a UCP platform to implement this protocol as a condition of access UCP otherwise permits. Software that implements this protocol MAY also use UCP with the Company independently of this extension, with any mechanism UCP permits, such as the Accelerated IdP Flow. Whether a request is made through this extension or independently is decided for each request (4).

## 3. Discovery and negotiation

The Personal Agent fetches `https://{organization.domain}/.well-known/ucp`, alongside or after the Company's `poppy.json` ([spec 3](https://personalagentprotocol.org/docs/1.0/spec#discovery)). The fetches can run in parallel. After any `poppy.json` redirects, such as from `www.example.com` to `example.com`, the Personal Agent uses the UCP profile at the validated `organization.domain`. A profile fetched from another host doesn't apply to this Company. A `poppy.json` may redirect; a UCP profile doesn't. The Personal Agent MUST NOT follow a redirect from this URL, and MUST NOT use a UCP profile from another host for this Company, as [UCP requires](https://ucp.dev/latest/specification/overview/#hosting). The `poppy.json` and the UCP profile then speak for the same host ([spec 10.3](https://personalagentprotocol.org/docs/1.0/spec#trust)).

From there, discovery and negotiation are UCP's: [version selection](https://ucp.dev/latest/specification/overview/#version-selection), the [intersection](https://ucp.dev/latest/specification/overview/#intersection-algorithm) of capabilities and extensions, [authority binding](https://ucp.dev/latest/specification/overview/#authority-binding) for schemas, and the choice of a transport. On every UCP request the Personal Agent advertises its own platform profile URL ([request advertisement](https://ucp.dev/latest/specification/overview/#platform-advertisement-on-request)). The form is the transport binding's, as UCP defines. The Company fetches that profile, and its response says which capabilities and versions apply. What the Company offers an agent is what the negotiated UCP profile says it offers; `poppy.json` carries nothing about it.

**Several UCP versions.** A UCP business reads the platform's UCP version from the profile the request names. A Personal Agent that supports several UCP versions publishes one platform profile for each, and names the one for the version it selected with this Company.

**Profiles aren't per User.** A platform profile describes the Personal Agent, not a User. It MUST NOT be specific to a User or say anything about a User or the Companies they use; otherwise its URL would let Companies match the User across Companies, which User IDs exist to prevent ([spec 5.1](https://personalagentprotocol.org/docs/1.0/spec#user-ids), 10).

## 4. Identity and authorization

The specification describes a request in layers ([spec 1.1](https://personalagentprotocol.org/docs/1.0/spec#layers)). On a UCP request they line up as follows:

| Layer ([spec 1.1](https://personalagentprotocol.org/docs/1.0/spec#layers)) | On a UCP request |
| --- | --- |
| Discovery | `poppy.json` leads to the UCP profile at `/.well-known/ucp` (3). |
| Operator recognition | The Personal Agent's operator signature, and its UCP platform profile named in `UCP-Agent`. In UCP's terms this is agent-authenticated access. |
| Sessions | The Session header. UCP's sessions are per workflow: a conversation, a cart, a checkout, an order, each with its own identifier and lifecycle, and a cart leads to a checkout leads to an order (8). There is no overarching UCP session. |
| Account access | An access token from the Company's issuer: UCP's user-authenticated access, through identity linking (below). |

A UCP request in this extension carries:

- The platform profile advertisement, in the transport's form (3), naming the profile for the selected version, and the other request metadata UCP's binding requires, such as an idempotency key on requests that change state. Where a transport carries the profile in more than one place, the Personal Agent MUST send the same URL in each, and the Company MUST reject a request where they differ; otherwise a request could authenticate as one platform and negotiate as another. This extends UCP's [identity binding](https://ucp.dev/latest/specification/overview/#identity-binding), which rejects a request whose authenticated identity conflicts with `UCP-Agent`.
- `Poppy-Session`, the Session header, as on any endpoint this protocol or an extension defines ([spec 5.2](https://personalagentprotocol.org/docs/1.0/spec#session-header)).
- An operator signature: the Personal Agent SHOULD sign UCP requests with an HTTP Message Signature, as [spec 5.3](https://personalagentprotocol.org/docs/1.0/spec#operator-signatures) recommends for every request that carries the Session header. One signature can serve both protocols when it covers `poppy-session` and `authorization` for this protocol, and the request target, `content-digest`, `content-type`, `ucp-agent`, and `idempotency-key` for UCP, as UCP's [identity resolution](https://ucp.dev/latest/specification/overview/#identity-resolution-algorithm) and [signature rules](https://ucp.dev/latest/specification/signatures/#wba-interop) describe. When the signing key is published in the platform profile's `keys`, a verified signature identifies the same profile the request negotiates with. The key's algorithm has to be one both verifiers accept.
- `Authorization`, with an access token, when signed in.

The profile URL names the platform for negotiation. A verified signature authenticates the key that signed. A verified Session header authenticates the Personal Agent and the User ID ([spec 5.3](https://personalagentprotocol.org/docs/1.0/spec#session-verification)). Each establishes only what it says. A Company MAY verify the Session header on UCP requests and use it, for example to recognize a returning signed-out User; it MUST verify the header before relying on any Session claim, and a UCP service that uses no Session claims can ignore it (8).

**Bearer tokens.** When a UCP request is signed in, the access token is a `Bearer` token ([RFC 6750](https://www.rfc-editor.org/rfc/rfc6750)), whatever the transport. The Company returns `token_type` `Bearer` for tokens for its UCP services, as [spec 4.5](https://personalagentprotocol.org/docs/1.0/spec#access-tokens) allows for a service that doesn't accept DPoP, for example for a `resource` that names them, and the Personal Agent sends each token as its `token_type` names. Signed-out requests carry none.

A UCP request is then in one of two states:

| Request | What the Personal Agent sends | What it gets |
| --- | --- | --- |
| Signed out | The Session header; no access token | What the Company offers without an account, as its UCP profile and access policy allow: catalog search and lookup, policies, Ask, carts, and guest checkout |
| Signed in | The Session header and an access token ([spec 4.5](https://personalagentprotocol.org/docs/1.0/spec#access-tokens)) | The same, personalized and extended by the token's scopes: search that reflects the User's preferences and entitlements, saved addresses and instruments in checkout, order history, and whatever else the Company's identity linking gates |

**Signing in.** UCP's [identity linking](https://ucp.dev/latest/specification/common/identity-linking/) finds the business's issuer from its protected resource metadata and links the account with the authorization code grant, PKCE, and `iss` checks. When the Company also offers this protocol's sign-in, and the UCP service supports the issuer this protocol selected (2), that is Direct Sign-In ([spec 4.2](https://personalagentprotocol.org/docs/1.0/spec#direct-sign-in)) at that issuer. A Personal Agent signs the User in for UCP the way it signs in for anything else at the Company, and the same refresh token serves UCP, the Company's other APIs, and its conversations.

- A Company that offers both this protocol's sign-in and identity linking makes them one: it MUST offer Direct Sign-In, and MUST list `private_key_jwt` in its issuer's `token_endpoint_auth_methods_supported`, so a Personal Agent can authenticate as [spec 4.1](https://personalagentprotocol.org/docs/1.0/spec#agent-identity) describes.
- The Company MUST list each scope in its identity linking `config.scopes` in `scopes_supported`, as UCP requires. It SHOULD describe each scope in its UCP `description`, in `auth.scopes`, or in an OpenAPI description it lists, and SHOULD give `auth.scope_hints` for it wherever the description is ([spec 4.7](https://personalagentprotocol.org/docs/1.0/spec#scopes)). The scopes are UCP's: its well-known scopes, such as `dev.ucp.shopping.order:read` and `dev.ucp.common.ask:read`, and any the Company adds under UCP's rules.
- The Personal Agent requests the scopes a task needs, from `config.scopes` for operations that require an account, and from the Company's other described scopes for ones that unlock more without being required, such as member pricing. Many UCP scopes are of the second kind: catalog search and checkout often work signed out. A Company says in each scope's description what the scope adds and whether the operation works without it, so a Personal Agent knows when to request it ([guides](https://personalagentprotocol.org/docs/1.0/guides#company-scope-descriptions)).

**Through this extension, or independently.** A request made through this extension carries the Session header, and its account access comes only from this protocol's sign-in. Where this protocol offers no sign-in, such as at a Company that sets `auth.disabled` ([spec 3.2](https://personalagentprotocol.org/docs/1.0/spec#oauth-server)), the request is signed out. A request made independently of this extension doesn't carry the Session header, and its access is UCP's alone, as UCP defines (2). A Personal Agent MUST NOT send a token it got independently of this extension on a request that carries the Session header. A Company that needs to tell the two apart keeps track of which grants came from this protocol's sign-in, for example with a separate client registration.

**Challenges.** The Personal Agent handles UCP's authorization responses as the specification's API challenges ([spec 7](https://personalagentprotocol.org/docs/1.0/spec#apis)):

| UCP response | The Personal Agent |
| --- | --- |
| `401` with `identity_required` and no `error` in the challenge | Uses a refresh token that covers the scopes, or signs in for them, and retries ([spec 5.4](https://personalagentprotocol.org/docs/1.0/spec#sign-in)). |
| `401` with `error="invalid_token"` | Refreshes the access token ([spec 4.4](https://personalagentprotocol.org/docs/1.0/spec#refresh-tokens)), or continues signed out if refresh fails ([spec 5.5](https://personalagentprotocol.org/docs/1.0/spec#ending-sessions)). |
| `403` with `insufficient_scope` and the full required set in `scope` | Uses a refresh token that covers the scopes if it has one. Otherwise it signs in for every scope it still needs (below) and retries. |
| `identity_optional` in `messages` | Tells the User what signing in would unlock, and signs in only if the User wants to. |

UCP's `identity_required` challenge carries `realm` and `resource_metadata`, and need not carry `scope`; the Personal Agent takes the scopes from the UCP profile's `config.scopes`. On every UCP transport these are HTTP responses: the status and `WWW-Authenticate` header carry the challenge, UCP's binding says how the body appears, and they are never a successful result. The Personal Agent handles them as it handles any API's challenge ([spec 7](https://personalagentprotocol.org/docs/1.0/spec#apis)), then retries the request.

**Requesting more scopes.** For `insufficient_scope`, the Personal Agent requests every scope it still needs, as [spec 4.7](https://personalagentprotocol.org/docs/1.0/spec#scopes) describes: the scopes the challenge names, and the scopes it already has and wants to keep, including scopes for the Company's other APIs. This is a new sign-in, not account linking started over, which UCP forbids. UCP's identity linking says to request only the missing scopes, but OAuth doesn't define how a Company would keep the earlier ones, so this extension doesn't use that rule. The Company grants only the scopes the request names (spec 4.7), even when the User granted others before. The new refresh token replaces the old one, and the Personal Agent checks the token response's `scope` before continuing, as spec 4.7 describes.

**The Accelerated IdP Flow.** UCP's identity linking also lets a platform present a grant from an identity provider the business trusts, in `config.providers`, instead of the browser sign-in. This extension doesn't use it: a Personal Agent signs in with Direct or Device Sign-In. Software can still use it with the Company independently of this extension, as UCP defines (2). A later version of this protocol may support an equivalent flow for its own sign-in.

## 5. Conversations through Ask

UCP's Ask capability (`dev.ucp.common.ask`) lets a Personal Agent ask a Company a natural-language question — about its offerings, its policies, or a resource it holds such as an order or a cart — and get an answer with links to the resources the answer mentions. A Company MAY return a `conversation` so follow-up questions build on earlier turns. Ask is in UCP's current draft and ships in a later UCP release.

**UCP Ask is a conversation protocol.** This extension adds `ucp` to the conversation protocols a Company can list in `agent.protocols` ([spec 8.1](https://personalagentprotocol.org/docs/1.0/spec#conversation-protocols)):

*Excerpt from poppy.json*

```
"agent": {
  "protocols": [
    {
      "type": "ucp",
      "endpoint": "https://example.com/.well-known/ucp",
      "description": "Questions about our products, policies, orders, and carts"
    }
  ]
}
```

- A `ucp` entry's `endpoint` is the Company's UCP profile URL (2). The Personal Agent finds `dev.ucp.common.ask` among the profile's capabilities, and reaches it at the `dev.ucp.common` service's endpoint for a transport it supports.
- A Company that lists a `ucp` entry MUST list this extension, and its UCP profile MUST offer `dev.ucp.common.ask`.
- Requests follow UCP's Ask bindings and section 4 of this page, not [spec 8.2–8.13](https://personalagentprotocol.org/docs/1.0/spec#conversation-requests).
- A Company MAY list a `poppy` entry too, for example a support agent run by another provider. Ask and a Company Agent are independent, and a Personal Agent uses whichever fits the task, going by each entry's `description` (spec 8.1). This extension defines no relationship between them.

How the concepts map. The translation is small, and the two caveats below it are the whole of what doesn't carry over.

| Personal Agent Protocol conversation ([spec 8](https://personalagentprotocol.org/docs/1.0/spec#conversations)) | UCP Ask |
| --- | --- |
| Conversation, with a Company-chosen `conversation_id` | `conversation.id`, Company-returned; replay it on follow-ups |
| Conversation lifetime | `conversation.expires_at`, Company-chosen |
| Message `text` | `query` |
| Message `data` | `ids`: the resources the question is about |
| Message `context` (`locale`, `time_zone`, `user_available`) | `context` (`language`, `address_country`, `currency`, …); `locale` → `language` |
| Request `id`, as idempotency key | UCP's idempotency key (`Idempotency-Key`, or `meta["idempotency-key"]` over MCP) |
| The Company's reply, as `message` events with plain `text` | `answer.plain` (`markdown`, `html` optional), plus `links` and `messages` |
| `working`, `handoff`, `closed` | `working` is `false` after every turn: Ask is synchronous. No handoff, and no close |
| `responder`, `author.type` | None. A `query` is the Personal Agent's words, `agent` by [spec 8.8](https://personalagentprotocol.org/docs/1.0/spec#human-or-ai) |
| `authorization` event (`insufficient_scope`, `scope`) | 401 `identity_required` or 403 `insufficient_scope` on the request itself (4); or an `insufficient_scope` message in `messages` when the Company answered what it could |
| Handoff to a person, Direct Conversation | None |

- `conversation.id` carries context, not authority: each turn is authorized by the credential it carries, as [spec 8.11](https://personalagentprotocol.org/docs/1.0/spec#conversation-sign-in) also requires of this protocol's conversations.
- A question that asks for an action gets an answer that says it wasn't performed, optionally with UCP's `operation_not_performed` message. Whether to perform it through the UCP capability that owns it is the Personal Agent's decision from the User's request, not the answer's.

## 6. Commerce and approval

Carts, checkouts, orders, catalog search, and payment are defined by UCP, with their schemas, lifecycles, and negotiation. This protocol is how the Personal Agent finds them and signs the User in; once there, it shops as UCP describes.

- **Payment.** Payment is part of UCP checkout: the Company's UCP profile advertises the payment handlers it accepts, the Personal Agent's platform profile says which it supports, and the checkout carries the instrument. For a Company that advertises this extension, UCP is its payment mechanism, and a Personal Agent that supports the extension pays through it.
- **Approval.** UCP's checkout carries its own approval. The checkout resource is the terms; UCP's messages say when the User's review is required and when a step must finish on the Company's page (7); the User reviews and approves the checkout in a trusted interface, as UCP requires; and Complete Checkout is the call the Personal Agent makes once the User has committed. That is the one approval for a purchase, so a Company SHOULD NOT also return an [operation](https://personalagentprotocol.org/docs/1.0/extensions/operations) for a UCP capability's operation, unless a UCP extension the two have negotiated defines how an operation rides in a UCP response; two approval records for one action can disagree. A Personal Agent that receives one outside such an extension treats it as content ([spec 10.1](https://personalagentprotocol.org/docs/1.0/spec#untrusted-content)) and approves nothing.
- **Retries.** UCP's idempotency keys and checkout lifecycle give a retried completion the first result. The Operations extension's retry rules apply to the Company's other APIs.

## 7. Escalation to the User, and web browsing

A checkout moves `incomplete` → `ready_for_complete` → `completed`, and enters `requires_escalation` from `incomplete`, `ready_for_complete`, or `complete_in_progress` when the User must finish a step on the Company's own page ([UCP: checkout status lifecycle](https://ucp.dev/latest/specification/shopping/checkout/#checkout-status-lifecycle)): a payment method's verification, an age or identity check, a rule the Company applies only on its site. The checkout then carries a `continue_url`. The URL is for the User, not the Personal Agent's browser. The Personal Agent presents it the way it presents a Direct Sign-In URL ([spec 4.2](https://personalagentprotocol.org/docs/1.0/spec#direct-sign-in)): in the User's browser, as a new tab, a popup, or a link sent to the User's phone, showing which Company the page belongs to — or, where the Company's UCP profile offers embedded checkout and the Personal Agent supports it, in UCP's embedded checkout. The User acts on the Company's page as themselves. The URL carries what the page needs, as UCP defines, and the Personal Agent sends no token or Session header to it. Afterwards the Personal Agent reads the checkout again through UCP; its status is the outcome. This is the step the [Operations extension](https://personalagentprotocol.org/docs/1.0/extensions/operations#approval-proof) leaves to the Company; for UCP checkout, UCP defines it.

Web browsing ([spec 6](https://personalagentprotocol.org/docs/1.0/spec#web-browsing)) is separate: the Personal Agent's own browser joining the Session to browse the website. A Company MAY offer `web.browser_session_endpoint` for its site as at any Company; a `continue_url` doesn't use it. If the Company's UCP profile lists a WebMCP transport, the website's WebMCP tools are UCP's capabilities, and a Personal Agent browsing in its own browser calls them as UCP tools under the Session its browser joined, with the Session's scopes applied as the website applies them; a later version of this extension will say how that maps once UCP's WebMCP binding is published.

## 8. Sessions and UCP resources

UCP workflows carry their own state. Each has an identifier and a lifecycle the Company issues: an Ask `conversation` that follow-up questions build on, a cart that is edited until a checkout is created from it or from line items directly, a checkout that moves through its statuses to completion, an order that is followed afterwards. The Personal Agent keeps track of those identifiers by Company and User, and replays them. A workflow can outlive the Session that created it: the Personal Agent MAY continue it in a later Session for the same User while the workflow remains available and the Company's access policy allows. It MUST NOT reuse one User's UCP workflow identifier for another User. Each UCP capability applies its own access policy to each request; a UCP identifier carries context, not authority.

A Session is this protocol's envelope around all of that for one User, across the Personal Agent's UCP requests, its conversation with a Company Agent, and its browser ([spec 5](https://personalagentprotocol.org/docs/1.0/spec#sessions)). UCP state is per workflow; a Session is per visitor. They compose:

- The Personal Agent sends the Session header on its UCP requests as on any API ([spec 5.2](https://personalagentprotocol.org/docs/1.0/spec#session-header)), with the same `sid` for every request in a task.
- A Company MAY verify the header at its UCP endpoints (4) and group the UCP workflows a Session creates under that Session, so they appear on the website after a browser join and the User is recognized across Sessions by User ID ([spec 5.1](https://personalagentprotocol.org/docs/1.0/spec#user-ids)). Grouping changes nothing about the workflows themselves, and this extension doesn't expect it: a Personal Agent MUST NOT assume that a cart or checkout it created through UCP appears on the Company's website, in a Company Agent conversation, or in another Session unless the Company says so.
- A UCP endpoint MAY instead ignore the Session header, as [spec 7](https://personalagentprotocol.org/docs/1.0/spec#apis) allows an MCP server to. Unlike such a server, it still takes signed-out calls from Personal Agents: UCP identifies the Personal Agent on every request by its platform profile and operator signature (4), so the Company knows which Personal Agent is calling without the header.
- Which of the two is the Company's choice. A Company MAY also require a verified Session header on requests through this extension, and rely on its claims (4). UCP used independently follows section 2 and the Company's UCP access policy.
- A UCP request without a user token is signed out, and one with a user token is signed in to that token's account, whatever the Session's history. Each UCP workflow follows its own access policy across that change, as UCP defines; this protocol's rules for its own conversations after sign-out ([spec 5.5](https://personalagentprotocol.org/docs/1.0/spec#ending-sessions)) don't carry over to UCP workflows.

## 9. Errors

Errors at UCP endpoints are UCP's: its message codes in response bodies, its HTTP status codes, and its JSON-RPC error codes over MCP, with the HTTP status as the primary signal. Token errors follow OAuth and [spec 7](https://personalagentprotocol.org/docs/1.0/spec#apis). `invalid_session` ([spec 5.3](https://personalagentprotocol.org/docs/1.0/spec#session-verification)) and `session_ended` ([spec 5.5](https://personalagentprotocol.org/docs/1.0/spec#ending-sessions)) come only from endpoints that verify the Session header. A UCP endpoint returns them as UCP responses, not in the specification's JSON body: HTTP 400 with UCP's error body and `code` set to the error's name over REST, and a JSON-RPC error whose `data.code` names it over MCP. The Personal Agent handles them as section 7 of the specification says: for `session_ended` it starts a new Session and sends the request again, once, and for `invalid_session` it stops sending the request until it fixes the cause. A Company serves UCP to any client UCP admits, so `extension_required` has no role here.

## 10. Security considerations

- **One issuer, one document.** Through this extension, the Personal Agent uses the issuer it selected from the protected resource metadata at `organization.domain` (2). It signs in only at that issuer, whatever `realm` or `resource_metadata` a UCP challenge carries, so a UCP endpoint can't send the User to someone else's sign-in and a `poppy.json` can't send a User's token to someone else's UCP.
- **What the domain vouches for.** The UCP profile is on the same host as `poppy.json` and can't redirect elsewhere (3), so whoever speaks for the Company in this protocol speaks for it in UCP ([spec 10.3](https://personalagentprotocol.org/docs/1.0/spec#trust)). UCP's authority binding shows who published each schema the profile names, not that the Company should be trusted.
- **Content from the Company.** Product data, `messages`, and Ask answers are content from the Company ([spec 10.1](https://personalagentprotocol.org/docs/1.0/spec#untrusted-content)): data, never instructions, and never the User's approval of a purchase. An Ask answer is indicative; the capability that owns a resource is authoritative when they differ. UCP's own messages, including the disclosures UCP requires the Personal Agent to show, keep UCP's rules; the [Disclosures extension](https://personalagentprotocol.org/docs/1.0/extensions/disclosures) covers this protocol's conversation messages, not UCP's. A link is never an instruction to act.
- **Scopes travel with the token, not the conversation.** Replaying an Ask `conversation` carries no access from an earlier turn. Each turn is authorized on its own, as UCP requires and as [spec 8.11](https://personalagentprotocol.org/docs/1.0/spec#conversation-sign-in) requires for this protocol's conversations.
- **Profiles aren't per User.** A platform profile specific to a User would let Companies match that User across Companies by its URL, which User IDs prevent ([spec 5.1](https://personalagentprotocol.org/docs/1.0/spec#user-ids)) (3).
- **Payments.** UCP handles payment through payment handlers the two profiles negotiate, which tokenize instruments so the Personal Agent carries tokens rather than raw credentials. Those tokens, and any credential the Personal Agent does handle, are secrets, kept out of model context with the others in [spec 10.2](https://personalagentprotocol.org/docs/1.0/spec#secrets).
- **Webhooks.** A UCP platform profile can name a webhook URL for order updates. Webhooks reach the Personal Agent's own systems, which then learn which Companies its Users buy from, even when the rest of the Personal Agent keeps that on the User's device ([spec 10.7](https://personalagentprotocol.org/docs/1.0/spec#delegated-key-security)). A Personal Agent that keeps that private leaves order webhooks out of its profile; one that uses them verifies their signatures as UCP requires.

## 11. Example

Kettle & Leaf sells tea at `kettleandleaf.example`.

*GET https://kettleandleaf.example/.well-known/poppy.json*

```
{
  "protocol_version": "1.0",
  "organization": { "name": "Kettle & Leaf", "domain": "kettleandleaf.example" },
  "auth": {
    "scopes": {
      "dev.ucp.shopping.catalog.search:read": "Personalized search results, from your preferences and past orders. Not needed to search the catalog",
      "dev.ucp.shopping.checkout:manage": "Check out signed in, with member pricing and your saved address and payment methods. Not needed to check out as a guest",
      "dev.ucp.shopping.order:read": "See your orders. Needed to track an order or find one to return"
    },
    "scope_hints": {
      "dev.ucp.shopping.catalog.search:read": { "changes": "none", "personal_data": false },
      "dev.ucp.shopping.checkout:manage": { "changes": "irreversible", "personal_data": true },
      "dev.ucp.shopping.order:read": { "changes": "none", "personal_data": true }
    }
  },
  "agent": {
    "protocols": [
      {
        "type": "ucp",
        "endpoint": "https://kettleandleaf.example/.well-known/ucp",
        "description": "Questions about our teas, orders, and shipping"
      }
    ]
  },
  "web": {},
  "apis": [
    {
      "type": "mcp",
      "url": "https://kettleandleaf.example/api/ucp/mcp",
      "description": "UCP tools: catalog search, cart, checkout, and questions through Ask. Calls carry UCP request metadata."
    }
  ],
  "extensions": {
    "ucp": [{ "version": "1" }]
  }
}
```

- `agent.protocols` lists UCP Ask as the Company's conversation protocol (5).
- `web` is present with no `browser_session_endpoint`: the Company offers UCP for commerce and its website for the User. A `continue_url` goes to the User's browser (7).
- `apis` lists the UCP MCP endpoint for MCP clients that speak UCP but don't know this extension. It is optional (3).
- `auth.issuer` is left out, because the domain's protected resource metadata names one authorization server:

*GET https://kettleandleaf.example/.well-known/oauth-protected-resource*

```
{
  "resource": "https://kettleandleaf.example",
  "authorization_servers": ["https://auth.kettleandleaf.example"]
}
```

Both protocols read that document. The issuer's metadata:

*GET https://auth.kettleandleaf.example/.well-known/oauth-authorization-server*

```
{
  "issuer": "https://auth.kettleandleaf.example",
  "authorization_endpoint": "https://auth.kettleandleaf.example/oauth/authorize",
  "token_endpoint": "https://auth.kettleandleaf.example/oauth/token",
  "revocation_endpoint": "https://auth.kettleandleaf.example/oauth/revoke",
  "jwks_uri": "https://auth.kettleandleaf.example/.well-known/jwks.json",
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "response_types_supported": ["code"],
  "code_challenge_methods_supported": ["S256"],
  "authorization_response_iss_parameter_supported": true,
  "token_endpoint_auth_methods_supported": ["private_key_jwt"],
  "scopes_supported": [
    "dev.ucp.shopping.catalog.search:read",
    "dev.ucp.shopping.checkout:manage",
    "dev.ucp.shopping.order:read"
  ],
  "protected_resources": [
    "https://kettleandleaf.example",
    "https://kettleandleaf.example/api/ucp/mcp"
  ]
}
```

`authorization_code` means Direct Sign-In is offered. `protected_resources` names the Company's domain and its MCP endpoint, whose own protected resource metadata, at `https://kettleandleaf.example/.well-known/oauth-protected-resource/api/ucp/mcp`, has that endpoint's URL as its `resource` ([spec 7](https://personalagentprotocol.org/docs/1.0/spec#apis)).

The UCP profile. Every capability entry carries UCP's `version` and `schema`, and usually its `spec`; an extension entry also names what it `extends` and, where the extension defines one, its `config`. Entries this example doesn't use are elided with `…`. Ask is in UCP's current draft and ships in a later UCP release; the Company advertises it under that release's version.

*GET https://kettleandleaf.example/.well-known/ucp*

```
{
  "ucp": {
    "version": "2026-08-25",
    "supported_versions": {
      "2026-04-08": "https://kettleandleaf.example/.well-known/ucp/2026-04-08"
    },
    "services": {
      "dev.ucp.common": [
        {
          "version": "…",
          "spec": "…",
          "transport": "mcp",
          "endpoint": "https://kettleandleaf.example/api/ucp/mcp",
          "schema": "…/services/common/mcp.openrpc.json"
        }
      ],
      "dev.ucp.shopping": [
        {
          "version": "2026-08-25",
          "spec": "https://ucp.dev/2026-08-25/specification/overview/",
          "transport": "mcp",
          "endpoint": "https://kettleandleaf.example/api/ucp/mcp",
          "schema": "https://ucp.dev/2026-08-25/services/shopping/mcp.openrpc.json"
        },
        { "version": "2026-08-25", "spec": "…", "transport": "embedded", "schema": "…" }
      ]
    },
    "capabilities": {
      "dev.ucp.common.ask": [{ "version": "…", "spec": "…", "schema": "…" }],
      "dev.ucp.shopping.catalog.search": [{ "version": "2026-08-25", "spec": "…", "schema": "…" }],
      "dev.ucp.shopping.catalog.lookup": [{ "version": "2026-08-25", "spec": "…", "schema": "…" }],
      "dev.ucp.shopping.cart": [{ "version": "2026-08-25", "spec": "…", "schema": "…" }],
      "dev.ucp.shopping.checkout": [
        {
          "version": "2026-08-25",
          "spec": "https://ucp.dev/2026-08-25/specification/shopping/checkout/",
          "schema": "https://ucp.dev/2026-08-25/schemas/shopping/checkout.json"
        }
      ],
      "dev.ucp.shopping.fulfillment": [
        {
          "version": "2026-08-25",
          "spec": "…",
          "schema": "…",
          "extends": ["dev.ucp.shopping.checkout", "dev.ucp.shopping.cart"],
          "config": { "multi_destination": [], "method_combinations": [["shipping"]] }
        }
      ],
      "dev.ucp.shopping.discount": [
        { "version": "2026-08-25", "spec": "…", "schema": "…", "extends": ["dev.ucp.shopping.checkout", "dev.ucp.shopping.cart"] }
      ],
      "dev.ucp.shopping.buyer_consent": [{ "version": "2026-08-25", "spec": "…", "schema": "…" }],
      "dev.ucp.shopping.order": [{ "version": "2026-08-25", "spec": "…", "schema": "…" }],
      "dev.ucp.common.identity_linking": [
        {
          "version": "2026-08-25",
          "spec": "https://ucp.dev/2026-08-25/specification/common/identity-linking/",
          "schema": "https://ucp.dev/2026-08-25/schemas/common/identity_linking.json",
          "config": { "scopes": { "dev.ucp.shopping.order:read": {} } }
        }
      ]
    },
    "payment_handlers": {
      "dev.shopify.shop_pay": [
        {
          "id": "shop_pay",
          "version": "2026-04-08",
          "spec": "https://shopify.dev/ucp/shop-pay-handler/2026-04-08/spec.md",
          "schema": "https://shopify.dev/ucp/shop-pay-handler/2026-04-08/schema.json",
          "config": { "shop_id": "8123" }
        }
      ],
      "com.google.pay": [
        { "id": "gpay", "version": "2026-01-11", "spec": "…", "schema": "…", "config": { "…": "…" } }
      ]
    }
  }
}
```

Two things in it matter to this extension. The `dev.ucp.common` service is where Ask is served, at the same endpoint as the shopping service here. And identity linking gates only `dev.ucp.shopping.order:read`: everything else works without an account, and `dev.ucp.shopping.checkout:manage` is a scope the Company accepts but never requires.

**What a Personal Agent that supports this extension does.** It fetches `poppy.json` and checks that `organization.domain` is the host that served it. It fetches the domain's protected resource metadata and the issuer's metadata, and checks `issuer` and `protected_resources` ([spec 3.2](https://personalagentprotocol.org/docs/1.0/spec#oauth-server)). It fetches the UCP profile and negotiates, advertising its platform profile URL. Then, for a User who asks whether the tea ships to Canada, it calls `ask_business` at the MCP endpoint, signed out. The answer links to the shipping policy.

The User picks a tea. The Personal Agent calls `search_catalog`, `create_cart`, and `create_checkout` with the cart's `id`, still signed out. The checkout comes back `incomplete`, with an `identity_optional` message: "Sign in for member pricing." The User has an account here and wants the discount, which the scope's description had said checkout gives signed in. The Personal Agent opens Direct Sign-In at the `authorization_endpoint` with `dev.ucp.shopping.checkout:manage`, the scope the Company accepts but never requires. The User signs in on the Company's page, sees the Personal Agent's name and the one scope, and approves; `scope_hints` had already told the Personal Agent this scope is irreversible and touches personal data, so it asked the User first. The Personal Agent exchanges the code with its client assertion, stores the refresh token, and calls `update_checkout` with the access token and a Session header whose `ath` covers it. The Company applies the member discount and fills in the User's saved address and instrument; the Personal Agent picks the fulfillment option, and the checkout reaches `ready_for_complete`. The Personal Agent shows the User the checkout's terms for review, and when the User commits, calls `complete_checkout` with the payment instrument and an idempotency key (6). Had the checkout returned `requires_escalation`, the Personal Agent would have handed its `continue_url` to the User to finish on the Company's page, then read the checkout again (7).

A month later the User asks where that order is. `get_order` with the same access token answers HTTP 403 with `WWW-Authenticate: Bearer realm="https://auth.kettleandleaf.example", error="insufficient_scope", scope="dev.ucp.shopping.order:read"` and a body whose message code is `insufficient_scope` (4). The Personal Agent asks the User, then signs in through Direct Sign-In for `dev.ucp.shopping.order:read` and `dev.ucp.shopping.checkout:manage`, so the new token keeps the scope the User already granted. The Company's consent page lists both and marks `dev.ucp.shopping.order:read` as new. The Personal Agent retries `get_order` with the new access token, and the order comes back. Had the User never signed in, the answer would have been HTTP 401 with `identity_required` and a `resource_metadata` pointing at `https://kettleandleaf.example/.well-known/oauth-protected-resource/api/ucp/mcp`, and the Personal Agent would have read the gating scope from the UCP profile's `config.scopes`.

**What a Personal Agent without this extension does.** It ignores `extensions.ucp` and finds the MCP endpoint in `apis`. If it speaks UCP's MCP binding, it lists the tools, sends its platform profile URL in each call's request metadata, and gets the same catalog, cart, checkout, and answers through MCP's own authorization. If it doesn't, its calls get UCP's `invalid_profile_url` error, and it uses the Company's website as any visitor would.

## 12. References

- Universal Commerce Protocol: specification overview, Ask, identity linking, shopping checkout — [https://ucp.dev](https://ucp.dev)
- [RFC 8414](https://www.rfc-editor.org/rfc/rfc8414), [RFC 9728](https://www.rfc-editor.org/rfc/rfc9728), [RFC 6750](https://www.rfc-editor.org/rfc/rfc6750), [RFC 8707](https://www.rfc-editor.org/rfc/rfc8707)
- [RFC 9421](https://www.rfc-editor.org/rfc/rfc9421), [Web Bot Auth](https://datatracker.ietf.org/doc/draft-ietf-webbotauth-httpsig-protocol/), [UCP Message Signatures](https://ucp.dev/latest/specification/signatures/)
- Model Context Protocol 2025-06-18, for UCP's MCP transport

---

Licensed under the [Apache License 2.0](https://personalagentprotocol.org/license).
