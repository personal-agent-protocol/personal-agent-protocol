# Extensions

## What extensions are

Extensions add optional features on top of the [specification](https://personalagentprotocol.org/docs/0.3/spec). Each one solves a problem that some companies and personal agents have and others don't, so it stays out of the core protocol that everyone implements.

Supporting an extension is always optional. A personal agent or company that doesn't support one ignores it, and the two sides still work together under the specification alone.

## How they work

The rules are in [the specification's Extensions section](https://personalagentprotocol.org/docs/0.3/spec#extensions). In short:

- A company lists the extensions it supports in `extensions` in its `poppy.json`, with each extension's settings, such as an endpoint.
- A personal agent lists the extensions it supports in `extensions` in its client metadata document, so the company knows what it can use.
- Each entry has a `version`, the extension's major version. It changes only when an update would break existing implementations.
- Plain names are reserved for extensions defined on this site. Anyone can define their own, named with a domain they control, such as `example.com/gift-wrap`.
- An extension can add content to conversation messages, in their `extensions`, keyed by the extension's name. It publishes a JSON Schema for that content, and each side sends it only to a side that lists the same version.
- A company that won't do something without an extension refuses that request with `extension_required`.

## Extensions

| Extension | Version | What it adds |
| --- | --- | --- |
| [`operations`](https://personalagentprotocol.org/docs/0.3/extensions/operations) | 2 | The personal agent gets the user's approval of exact terms and retries the request with it. Retries never perform the action twice. |
| [`mediated-sign-in`](https://personalagentprotocol.org/docs/0.3/extensions/mediated-sign-in) | 1 | Transitional. The personal agent signs in with credentials the user gave it, at a company that doesn't offer Direct or Device Sign-In yet. |
| [`links`](https://personalagentprotocol.org/docs/0.3/extensions/links) | 1 | Company messages carry the web pages they refer to as links. |
| [`disclosures`](https://personalagentprotocol.org/docs/0.3/extensions/disclosures) | 1 | Company messages mark notices, such as allergen warnings, apart from the rest of the message. |

---

Licensed under the [Apache License 2.0](https://personalagentprotocol.org/license).
