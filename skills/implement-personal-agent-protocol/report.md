# Implementation report

When the build is verified, or if the work stops partway, draft an implementation report for the
engineer to file. Reports at any stage help the spec improve.

## Draft it

```sh
node <skill-dir>/validate/index.ts report
```

It builds a draft from `plan/feedback.md`, the `poppy-design` block in `plan/design.md`, and the
validator's latest results: what was implemented, the milestones completed, pass and fail counts by
check, and the feedback entries grouped by label, with kit problems separate. It prints the draft
and a link that opens a GitHub issue from the implementation report template with the fields filled
in. If the draft is too long for a link, it prints Markdown to paste into the issue instead.

## Review it with the engineer

Show the engineer the full draft. Before they file it, check together that it contains none of:

- hostnames, URLs, or IP addresses of the Company's systems (spec links are fine);
- tokens, keys, client assertions, Session JWTs, credentials, or one-time codes;
- customer or user data of any kind;
- internal service names, vendor details, security controls, or other internal details the engineer
  hasn't approved for sharing.

Edit the draft as the engineer asks. They may remove any entry, or the Company's name.

## Filing

The engineer files the issue. **You never file an issue, submit a form, or post anything yourself.**
Give them the link or the Markdown, and stop.

A single spec point that can't wait for the report can go in its own issue through the feedback
template:
https://github.com/personal-agent-protocol/personal-agent-protocol/issues/new?template=1-feedback.yml

Feedback sent to the project is licensed under the
[contribution terms](https://personalagentprotocol.org/license/contributions). Mention this to the
engineer before they file.
