---
name: implement-personal-agent-protocol
description: Add Personal Agent Protocol (Poppy) support to a Company's existing systems, so personal agents can discover the Company, start Sessions, sign Users in, and use its APIs, MCP servers, Company Agent, and website. Use when an engineer asks to implement Poppy, Personal Agent Protocol, poppy.json, or personal agent access for their company. Covers surveying what exists, designing with the engineer, building in milestones, checking each one with the bundled validator, and drafting an implementation report.
---

# Poppy for Companies

You are working with an engineer at a Company to add Personal Agent Protocol ("Poppy" for short)
support to the Company's systems. You survey what exists, write a design for the engineer to
approve, build it one milestone at a time, check each milestone with the validator, and draft an
implementation report. The engineer makes the decisions this skill marks as theirs. You recommend.

Always call it "Personal Agent Protocol" or "Poppy". Use the spec's capitalized terms as the spec
does: Personal Agent, Company, User, User ID, Session, Session header, Delegated key, Direct
Sign-In, Device Sign-In, Mediated Sign-In, Company Agent, Direct Conversation. Tokens keep their
OAuth names: access token and refresh token.

**Done** means the validator passes for everything in the approved design, you have gone through
`checklist.md` for what the validator can't see, and the engineer has a report draft to file.

## Files in this skill

`<skill-dir>` below is the folder that holds this file. Read the other files when a step calls for
them, not all at once. If you're reading this file from a URL rather than an installed copy,
download and unzip https://personalagentprotocol.org/kit/implement-personal-agent-protocol.zip outside the Company's
repository first, and use the `implement-personal-agent-protocol` folder in it as `<skill-dir>`.

| File                    | Read it when                                                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- |
| `survey.md`             | Step 1. What to look for, and the template for `plan/survey.md`.                                                |
| `design.md`             | Step 2. The decisions, and the template for `plan/design.md`.                                                   |
| `patterns/*.md`         | Step 2, to choose how to build each component, and again in step 3.                                             |
| `milestones/*.md`       | Step 3, one milestone at a time.                                                                                |
| `checklist.md`          | At the end of each milestone, and in step 4. Every Company MUST and SHOULD from the spec, grouped by milestone. |
| `feedback.md`           | Before you write the first entry in `plan/feedback.md`.                                                         |
| `report.md`             | Step 5.                                                                                                         |
| `reference/*.md`        | Whenever you need the exact rule. `reference/spec.md` is the spec.                                              |
| `schemas/*.schema.json` | When you build a document or message, to check its shape.                                                       |
| `validate/`             | The validator. Run it, don't edit it.                                                                           |

The spec on the site is the same text as `reference/spec.md`. Links in this skill point to the site,
such as [5.6](https://personalagentprotocol.org/docs/0.3/spec#sending-requests). Read the local copy when
you can't fetch the site.

## The validator

The validator acts as a Personal Agent against the Company's servers and reports each check as pass,
fail, warn (a SHOULD), or skip. It needs Node 22.18 or later and has no dependencies.

```sh
node <skill-dir>/validate/index.ts survey https://example.com
node <skill-dir>/validate/index.ts check https://staging.example.com --milestone foundation
node <skill-dir>/validate/index.ts check https://staging.example.com --milestone interfaces
node <skill-dir>/validate/index.ts check https://staging.example.com --milestone sign-in
node <skill-dir>/validate/index.ts check https://staging.example.com --milestone all
node <skill-dir>/validate/index.ts check https://staging.example.com --design plan/design.md
node <skill-dir>/validate/index.ts check --file ./poppy.json
node <skill-dir>/validate/index.ts keygen --base-url https://static.example.com/poppy-test
node <skill-dir>/validate/index.ts report
```

- Add `--json` to any command for structured output. The exit code is non-zero when a MUST fails.
- `check --file` checks a `poppy.json` offline, before you deploy it.
- Each failing check gives the requirement with its spec link, what was sent and received (tokens
  redacted), the likely cause, and a link to dispute the check. If a check looks wrong, say so in
  `plan/feedback.md` (label **Kit**) and tell the engineer about the dispute link.
- Prefer staging or another test environment. `check` works against production too, but there it
  starts real Sessions and sends test messages to the company agent, so ask the engineer first.
- This version checks the survey, the foundation milestone, and the signed-out parts of the
  interfaces milestone. For sign-in, handoff, Direct Conversations, browser sessions, and
  extensions, the checklist and the manual tests in each milestone file are the check. Don't report
  those parts as validated.

**The test identity.** The validator signs requests as a Personal Agent, so the Company's servers
must be able to fetch its client metadata and keys over HTTPS, as for any Personal Agent
([4.1](https://personalagentprotocol.org/docs/0.3/spec#agent-identity)). In the foundation milestone you
run `keygen` with a base URL the Company controls. It writes `.poppy/` with a private key,
`agent.json`, and `jwks.json`, and adds `.poppy/` to `.gitignore`. The engineer hosts `agent.json`
and `jwks.json` at that base URL, for example in a staging static bucket. `check` then uses
`.poppy/` automatically. The private key never leaves `.poppy/`: never print it, commit it, or copy
it elsewhere. This is a test identity whose key sits on a developer's machine. Don't add it to a production
allowlist.

## Workflow

### 1. Survey

Read `survey.md`, then:

1. Inspect the code and config you can see: the identity provider or OAuth server and what it
   supports, API gateways, OpenAPI descriptions, MCP servers, the support or chat stack and the
   live-agent desk, the website's session handling, consent pages, account settings, and the
   permission model.
2. Run `node <skill-dir>/validate/index.ts survey https://<domain>` for what's live.
3. Write `plan/survey.md` from the template in `survey.md`.
4. Ask the engineer the open questions. Vendor-hosted systems, such as an identity provider or a
   support platform, are often invisible from code. Don't guess what they support.

### 2. Design

Read `design.md` and the patterns that fit what the survey found. Write `plan/design.md` from the
template. It starts with a `poppy-design` block the validator reads.

**Stop and wait for the engineer's approval** before building anything. Scope (which interfaces,
which sign-in types, which scopes, and the registration or allowlist policy) is the engineer's
decision. Present your recommendation with the trade-offs, and record their decisions in the design.
If the design changes later, update `plan/design.md` and get approval again.

### 3. Build, one milestone at a time

For each milestone in the design's plan, in order:

1. Read `milestones/<milestone>.md` and the spec sections it lists.
2. Build it, following the patterns chosen in the design.
3. Run the validator for that milestone and fix every failure before moving on. Treat warnings as
   SHOULDs: fix them or record in the design why the Company doesn't.
4. Go through the milestone's section of `checklist.md` and do the manual tests the milestone file
   lists.
5. Tell the engineer what you built, what passed, and what you checked by hand.

| Milestone                  | Builds                                                                                                                                    | Spec                                     |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `milestones/foundation.md` | `poppy.json`, protected resource and OAuth server metadata, verifying Personal Agents and the Session header, signed-out Sessions, errors | 3, 4.1, 5.1–5.3, 5.6                     |
| `milestones/interfaces.md` | What the design chose: OpenAPI, MCP, conversations, web browsing, feedback. Signed out first.                                             | 6–9                                      |
| `milestones/sign-in.md`    | The chosen sign-in types, refresh and access tokens, sign-out, scope enforcement on every channel, account settings                       | 4.2–4.7, 5.4–5.5, 8.11, Mediated Sign-In |
| `milestones/extensions.md` | Optional. Extensions the design chose.                                                                                                    | 3.3                                      |

A Company that offers only its website stops after publishing `poppy.json` without `auth` and
without `web.browser_session_endpoint` ([3.1](https://personalagentprotocol.org/docs/0.3/spec#fields)).

### 4. Verify

1. Run `node <skill-dir>/validate/index.ts check https://<staging-domain> --design plan/design.md`.
   It runs every check and reports progress against the design. Fix every failure.
2. Go through all of `checklist.md` for what the validator can't see, such as logging and secret
   redaction, consent page wording, rate limits, and token lifetimes. Mark each item done, not
   applicable (with why), or open.
3. Tell the engineer which items are open.

### 5. Report

Read `report.md`. Run `node <skill-dir>/validate/index.ts report`, review the draft with the
engineer, and let the engineer file it. You never file an issue or post anything yourself.

## Feedback, throughout

From the survey on, whenever something in the spec is unclear, missing, contradictory, risky, or
harder than it needs to be, or something in this kit is wrong or confusing, add an entry to
`plan/feedback.md` right away, in the format in `feedback.md`. Don't save it for the end. The report
in step 5 is built from it.

## Rules

- Don't invent requirements. A MUST or SHOULD you state comes from the spec or the guides, with a
  link. When the spec doesn't say, it's the Company's choice: ask the engineer, and log a **Gap** or
  **Question** if it matters.
- Change existing systems as little as the design allows. Poppy is built to sit on top of what the
  Company has.
- Keep secrets out of code, logs, test output, plan files, and the report: tokens, keys, client
  assertions, Session JWTs, credentials, and one-time codes
  ([guides](https://personalagentprotocol.org/docs/0.3/guides#both-secrets)).
- Ask before changing anything in production, shared infrastructure, or a vendor's configuration.
- Don't modify the validator to make a check pass. If you think a check is wrong, log it and tell
  the engineer.
