# Feedback

The spec is a draft, and it improves from what implementers run into. Keep a running log in
`plan/feedback.md` from the survey on. The implementation report (`report.md`) is built from it, so
nobody has to remember at the end.

## When to add an entry

Add one as soon as it happens, not at the end:

- The spec is unclear, and you had to choose an interpretation.
- The spec doesn't cover something you needed.
- Two parts of the spec, or the spec and the guides, disagree.
- A rule creates a security or privacy risk, or doesn't prevent one it should.
- Something was much harder to build on existing systems than it needed to be.
- Wording misled you or the engineer.
- You had to ask the engineer something the spec should answer.
- Something in this kit was wrong or confusing: a pattern that didn't fit, a milestone missing a
  step, a checklist item that's unclear, or a validator check that seems wrong.

Don't log ordinary bugs in the Company's code, or decisions the spec rightly leaves to the Company.

## Labels

| Label              | Use for                                                             |
| ------------------ | ------------------------------------------------------------------- |
| **Gap**            | Something needed that the spec doesn't cover.                       |
| **Ambiguous**      | Text you could read more than one way.                              |
| **Contradiction**  | Two places that disagree.                                           |
| **Risk**           | A privacy or security weakness.                                     |
| **Simplification** | A part that could be simpler without losing what it makes possible. |
| **Wording**        | Text that's correct but misleading or hard to follow.               |
| **Question**       | Something you'd like the authors to answer.                         |
| **Kit**            | A problem with this skill, its checklist, or the validator.         |

## Entry format

Append entries to `plan/feedback.md` in this form. Start the file with the first heading.

```markdown
# Poppy feedback

### <Label>: <short title>

- Date: <YYYY-MM-DD>
- Section: <spec link with heading id, such as [4.3](https://personalagentprotocol.org/docs/0.3/spec#sending-tokens), or "Kit: <file>", such as "Kit: milestones/foundation.md">
- What happened: <what you read, tried, or saw, in a few sentences>
- What we did: <the interpretation or workaround you chose, or "asked the engineer: …">
- Suggestion: <optional: a change to the spec or kit>
```

For a validator check, give the check's id in "What happened", and use the dispute link the
validator printed if the engineer wants to raise it on its own.

## Keep entries shareable

Entries go into a public report once the engineer approves it. Write them so they need little
editing:

- Describe the problem in terms of the spec, not the Company's systems: "our token endpoint sits
  behind a proxy that rewrites the host", not a hostname or internal service name.
- Never include hostnames, tokens, keys, credentials, customer data, or internal details. Put
  Company-specific detail in `plan/design.md` instead.
- One problem per entry. If the same issue comes up again, add to the existing entry.

Feedback sent to the project is licensed under the
[contribution terms](https://personalagentprotocol.org/license/contributions).
