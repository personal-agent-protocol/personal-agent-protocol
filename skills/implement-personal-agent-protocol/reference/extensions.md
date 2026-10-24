# Extensions

## What extensions are

Extensions add optional features on top of the [specification](https://personalagentprotocol.org/docs/0.3/spec). Each one solves a problem that some companies and personal agents have and others don't, so it stays out of the core protocol that everyone implements.

Supporting an extension is always optional. A personal agent or company that doesn't support one ignores it, and the two sides still work together under the specification alone.

## How they work

The rules are in [the specification's Extensions section](https://personalagentprotocol.org/docs/0.3/spec#extensions). In short:

- A company lists the extensions it supports in `extensions` in its `poppy.json`, with each extension's settings, such as an endpoint.
- A personal agent lists the extensions it supports in `extensions` in its client metadata document, so the company knows what it can use.
- Each entry has a `version`, the extension's major version. It changes only when an update would break existing implementations.
- Extensions defined on this site have plain names, such as `operations`. Anyone can define their own, named with a domain they control, such as `example.com/gift-wrap`.
- A company that won't do something without an extension refuses that request with `extension_required`.

## Extensions

| Extension | Version | What it adds |
| --- | --- | --- |
| [`operations`](https://personalagentprotocol.org/docs/0.3/extensions/operations) | 1 | The personal agent confirms an action before the company performs it. Approval covers the exact terms, the action has one record across channels, and a retry never performs it twice. |

---

Licensed under the [Apache License 2.0](https://personalagentprotocol.org/license).
