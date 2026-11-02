# Links extension

## 1. Introduction

A Company's message can refer to web pages, such as a return policy or an order's tracking page. With this extension, the Company sends them as links the Personal Agent can show, rather than as URLs written into `text`.

This page defines version 1 of the `links` extension. It uses the terms in the [specification](https://personalagentprotocol.org/docs/0.3/spec).

## 2. Advertising support

A Company that sends links lists the extension in `extensions` in its `poppy.json` ([spec 3.3](https://personalagentprotocol.org/docs/0.3/spec#extensions)), and a Personal Agent that can show them lists it in its client metadata document ([spec 4.1](https://personalagentprotocol.org/docs/0.3/spec#agent-identity)):

*Excerpt from poppy.json or the client metadata document*

```
"extensions": {
  "links": { "version": "1" }
}
```

The Company sends links only to a Personal Agent that lists this version ([spec 8.4](https://personalagentprotocol.org/docs/0.3/spec#message-fields)).

## 3. Links in messages

A Company message carries its links in `extensions.links` ([spec 8.4](https://personalagentprotocol.org/docs/0.3/spec#message-fields)):

*Message: Company → Personal Agent*

```
{
  "id": "msg_t4Wm",
  "role": "company",
  "author": { "type": "agent" },
  "text": "Your jacket shipped this morning and should arrive Thursday.",
  "extensions": {
    "links": {
      "items": [
        { "url": "https://example.com/orders/ord_7Hk2/tracking", "title": "Tracking for order ord_7Hk2" },
        { "url": "https://example.com/help/returns", "title": "Return policy" }
      ]
    }
  }
}
```

| Field | Req. | Description |
| --- | --- | --- |
| `items` | Yes | The links, in the order the message refers to them. |
| `items[].url` | Yes | The page's HTTPS URL. |
| `items[].title` | No | The page's name, as the message refers to it. |

Only Company messages carry links. The JSON Schema is [links-content.schema.json](https://personalagentprotocol.org/kit/company/schemas/links-content.schema.json).

The Personal Agent decides whether and how to show the links. A link's `title` and `url` are content from the Company ([spec 10.1](https://personalagentprotocol.org/docs/0.3/spec#untrusted-content)), and a title can name a page other than the one at its URL. The [guides](https://personalagentprotocol.org/docs/0.3/guides#agent-conversations) suggest showing each link's domain.

---

Licensed under the [Apache License 2.0](https://personalagentprotocol.org/license).
