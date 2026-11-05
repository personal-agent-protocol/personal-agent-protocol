# Extensions

## What extensions are

Extensions add optional features on top of the [specification](https://personalagentprotocol.org/docs/0.4/spec). Each one solves a problem that some companies and personal agents have and others don't, so it stays out of the core protocol that everyone implements.

Supporting an extension is always optional. A personal agent or company that doesn't support one ignores it, and the two sides still work together under the specification alone.

## How they work

The rules are in [the specification's Extensions section](https://personalagentprotocol.org/docs/0.4/spec#extensions). In short:

- A company lists the extensions it supports in `extensions` in its `poppy.json`, with an entry for each version it supports and that version's settings, such as an endpoint.
- A personal agent declares the extensions it uses with a company, one version of each, in the `Poppy-Extensions` header of its requests, so it can use different versions with different companies.
- Each entry has a `version`, the extension's major version. It changes only when an update would break existing implementations.
- Plain names are reserved for extensions defined on this site. Anyone can define their own, named with a domain they control, such as `example.com/gift-wrap`.
- An extension can add content to conversation messages, in their `extensions`, keyed by the extension's name. It publishes a JSON Schema for that content, and each side sends it only to a side that uses the same version.
- A company that won't do something without an extension refuses that request with `extension_required`.

## Extensions

| Extension | Version | What it adds |
| --- | --- | --- |
| [`disclosures`](https://personalagentprotocol.org/docs/0.4/extensions/disclosures) | 1 | Company messages mark notices, such as allergen warnings, apart from the rest of the message. |
| [`links`](https://personalagentprotocol.org/docs/0.4/extensions/links) | 1 | Company messages carry the web pages they refer to as links. |
| [`mediated-sign-in`](https://personalagentprotocol.org/docs/0.4/extensions/mediated-sign-in) | 1 | Transitional. The personal agent signs in with credentials the user gave it, at a company that doesn't offer Direct or Device Sign-In yet. |
| [`operations`](https://personalagentprotocol.org/docs/0.4/extensions/operations) | 2 | The personal agent gets the user's approval of exact terms and retries the request with it. Retries never perform the action twice. |
| [`ucp`](https://personalagentprotocol.org/docs/0.4/extensions/ucp) | 1 | The company speaks the Universal Commerce Protocol: this protocol finds it and signs the user in, and the shopping happens through UCP. |

---

Licensed under the [Apache License 2.0](https://personalagentprotocol.org/license).
