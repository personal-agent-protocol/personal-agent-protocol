# Disclosures extension

## 1. Introduction

Some notices matter to the User whatever else a message says, such as an allergen warning or a regulatory notice. With this extension, a Company marks them as disclosures, apart from the rest of the message, so the Personal Agent can tell them from ordinary text.

This page defines version 1 of the `disclosures` extension. It uses the terms in the [specification](https://personalagentprotocol.org/docs/0.3/spec).

## 2. Advertising support

A Company that sends disclosures lists the extension in `extensions` in its `poppy.json` ([spec 3.3](https://personalagentprotocol.org/docs/0.3/spec#extensions)), and a Personal Agent that can show them lists it in its client metadata document ([spec 4.1](https://personalagentprotocol.org/docs/0.3/spec#agent-identity)):

*Excerpt from poppy.json or the client metadata document*

```
"extensions": {
  "disclosures": { "version": "1" }
}
```

The Company sends disclosures only to a Personal Agent that lists this version ([spec 8.4](https://personalagentprotocol.org/docs/0.3/spec#message-fields)). A Personal Agent that doesn't list it gets the notice in `text`.

## 3. Disclosures in messages

A Company message carries its disclosures in `extensions.disclosures` ([spec 8.4](https://personalagentprotocol.org/docs/0.3/spec#message-fields)):

*Message: Company → Personal Agent*

```
{
  "id": "msg_p7Rt",
  "role": "company",
  "author": { "type": "agent" },
  "text": "The trail bar comes in boxes of 12 for $18.",
  "extensions": {
    "disclosures": {
      "items": [{ "text": "Contains peanuts. Made in a facility that also processes tree nuts." }]
    }
  }
}
```

| Field | Req. | Description |
| --- | --- | --- |
| `items` | Yes | The disclosures. |
| `items[].text` | Yes | The notice, as text. |

Only Company messages carry disclosures. The JSON Schema is [disclosures-content.schema.json](https://personalagentprotocol.org/kit/company/schemas/disclosures-content.schema.json).

The Personal Agent decides whether and how to show each disclosure, as it does for the rest of the message. Disclosures are content from the Company ([spec 10.1](https://personalagentprotocol.org/docs/0.3/spec#untrusted-content)). The [guides](https://personalagentprotocol.org/docs/0.3/guides#agent-conversations) describe when to show them.

---

Licensed under the [Apache License 2.0](https://personalagentprotocol.org/license).
