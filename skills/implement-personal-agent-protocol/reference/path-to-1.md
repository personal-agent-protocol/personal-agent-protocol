# Path to 1.0

The [specification](https://personalagentprotocol.org/docs/0.3/spec) is a draft. Before 1.0, we want to learn what works and what doesn't by implementing it, and refine the spec based on what we learn.

## How we get there

- **Anyone can implement it.** Build against the draft, as a personal agent or a company, and [send us feedback](#feedback) on what you run into.
- **We're implementing it with design partners.** The spec's authors are working through implementations with several of the [design partners](#partners).
- **The spec changes based on what we learn.** Until 1.0, a revision can break compatibility with earlier drafts.

## Feedback requested

Feedback is welcome from anyone, whether or not you're a partner. We're most interested in:

- **Privacy and security.** Weaknesses in sign-in, sessions, tokens, permissions, or how user data is handled.
- **Gaps in the spec.** Something you needed that the draft doesn't cover, or something that doesn't work as written.
- **Simplification.** Parts that could be simpler without losing what they make possible.
- **Broadly useful extensions.** Things many implementations need, such as payments, that could be built as extensions. See [open topics](#open-topics).

### How to give feedback

Give feedback by [opening an issue](https://github.com/personal-agent-protocol/personal-agent-protocol/issues/new) on GitHub. Feedback you send is licensed under the [contribution terms](https://personalagentprotocol.org/license/contributions).

Two tools can help you write it:

**Use the site's inline comments.** You can comment on any text on this site, then export your comments to share them. Enable site commenting, then select text to comment on it. To export, use the … button next to Comments, and paste or attach the export in your issue.

**Review with an agent.** If you'd like an agent to review the docs, give it the [implementation kit](https://personalagentprotocol.org/kit/company), which includes all the docs. Paste the agent's review into your issue.

## Open topics

These are larger areas the draft doesn't cover yet, listed so it's clear they are left out on purpose and not overlooked. The list isn't complete, and other gaps will come up as people implement the protocol.

- **Payments.** How a personal agent makes payments in a way that fits the protocol, including how that works with existing payment protocols.
- **Push notifications.** How a company reaches the personal agent when no request is open, for example when an order ships or a person replies hours later.
- **Versions.** How a company serves personal agents that implement different versions at the same time, and how the two sides agree on one, once 1.0 promises compatibility between minor versions.
- **Attachments.** How company messages carry more than text and data, such as receipts, return labels, product images, or forms for the user to fill in.

## Design partners

Partners that have agreed to be listed, in alphabetical order.

### Personal agents

- Instinct
- Meta
- OpenAI

### Companies

- Bank of America
- BBVA
- Chime
- Cigna
- Comcast
- DIRECTV
- FOX
- Gap Inc.
- GEICO
- Hertz
- Insurify
- Liberty Mutual
- Nordstrom
- PayPal/Venmo
- Rocket
- SiriusXM
- Synchrony
- Target
- United Airlines
- Walmart
- Wells Fargo

### Technology providers

- 1Password
- Adyen
- Atomic
- Cloudflare
- ElevenLabs
- Genesys
- Klaviyo
- Mastercard
- NiCE
- Notion
- Okta
- OneSignal
- Plaid
- Shopify
- Sierra
- Stripe
- Visa
- Zapier
- Zendesk

---

Licensed under the [Apache License 2.0](https://personalagentprotocol.org/license).
