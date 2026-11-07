# Roadmap

The areas we expect to work on before 1.0, what we want each to achieve, and where the discussion is. It describes direction, not dates or promises: topics change as people implement the protocol and [send feedback](https://personalagentprotocol.org/docs/path-to-1#feedback).

Each topic has a label on GitHub, and its link lists the topic's issues, open and closed. To join a discussion, comment on its issue. To raise something that isn't here, open a new one.

## Payments

**Goal:** A Personal Agent can pay a Company in a way that is tied to what the User approved, using existing payment and checkout protocols rather than replacing them.

**Where it stands:** The [UCP extension](https://personalagentprotocol.org/docs/0.4/extensions/ucp) lets a Company that speaks the Universal Commerce Protocol handle carts, checkout, and payment there, while this protocol finds the Company and signs the User in. How payment works with the Operations extension is open. Proposals cover a Payment Provider that issues a credential bound to one approved operation, financing offers, evidence that a payment settled for an approved revision, and strong customer authentication for EU payments.

**Issues:** [roadmap: payments](https://github.com/personal-agent-protocol/personal-agent-protocol/issues?q=is%3Aissue%20label%3A%22roadmap%3A%20payments%22)

## Push notifications

**Goal:** A Company can tell the Personal Agent that something happened when no request is open, such as an order shipping, a flight being cancelled, or a reply arriving hours later.

**Where it stands:** Not started in the spec. Today a Personal Agent only learns about a change by checking again. The issues collect use cases and design rules.

**Issues:** [roadmap: push notifications](https://github.com/personal-agent-protocol/personal-agent-protocol/issues?q=is%3Aissue%20label%3A%22roadmap%3A%20push%20notifications%22)

## Attachments

**Goal:** Company messages and operation results can carry more than text and data, such as receipts, return labels, product images, and forms for the User to fill in, with enough information for the Personal Agent to fetch, show, and pass them on.

**Where it stands:** Not started in the spec. A Company can put a URL in a message's `data`, but nothing says how to fetch it, who can open it, or when it stops working.

**Issues:** [roadmap: attachments](https://github.com/personal-agent-protocol/personal-agent-protocol/issues?q=is%3Aissue%20label%3A%22roadmap%3A%20attachments%22)

## Signed approvals

**Goal:** For actions that are hard to undo, such as a cancellation or a new payment method, a Company can verify that the User approved the exact terms, instead of trusting the Personal Agent's word.

**Where it stands:** In the [Operations extension](https://personalagentprotocol.org/docs/0.4/extensions/operations), the User approves one revision of an operation's exact terms, and the approval can say when and how the User approved. That is still the Personal Agent's statement, not proof ([Operations 8.1](https://personalagentprotocol.org/docs/0.4/extensions/operations#approval-proof)). The proposals take three approaches: the User approves on the Company's own page or in its app, the User's device signs the terms with a key the User registered with the Company, or a third party attests to the approval. Some actions also need the account holder, not just anyone on the account, to approve.

**Issues:** [roadmap: approvals](https://github.com/personal-agent-protocol/personal-agent-protocol/issues?q=is%3Aissue%20label%3A%22roadmap%3A%20approvals%22)

## Self-hosted personal agents

**Goal:** A Personal Agent that runs on the User's own devices, such as a desktop app, a phone app, or a browser extension, can identify itself and sign in without a server that learns which Companies each User works with, and can act in the browser where the User is already signed in.

**Where it stands:** Desktop apps can receive sign-in responses on a loopback address. A device can sign its own requests with a delegated key, and the agent's server can sign the delegation without seeing it. Browser extensions, and acting in the User's own signed-in browser, are still open: today a Personal Agent joins only a browser it controls.

**Issues:** [roadmap: self-hosted agents](https://github.com/personal-agent-protocol/personal-agent-protocol/issues?q=is%3Aissue%20label%3A%22roadmap%3A%20self-hosted%20agents%22)

## Drop Mediated Sign-In

**Goal:** Remove the [Mediated Sign-In extension](https://personalagentprotocol.org/docs/0.4/extensions/mediated-sign-in), so Users sign in on the Company's own page and Personal Agents never handle a User's password or one-time code.

**Where it stands:** Mediated Sign-In, where the Personal Agent signs in with the User's credentials, is transitional. The protocol plans to remove it on a date set when 1.0 is published, and Direct Sign-In is now the preferred sign-in type. Still open: whether Direct Sign-In should be the one required type, and what to say about agents typing a password into a Company's website, which happens outside the protocol.

**Issues:** [roadmap: mediated sign-in](https://github.com/personal-agent-protocol/personal-agent-protocol/issues?q=is%3Aissue%20label%3A%22roadmap%3A%20mediated%20sign-in%22)

---

Licensed under the [Apache License 2.0](https://personalagentprotocol.org/license).
