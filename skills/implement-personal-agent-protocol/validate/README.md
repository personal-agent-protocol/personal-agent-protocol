# Poppy Company validator

Checks a Company's live Personal Agent Protocol deployment by acting as a test Personal Agent. Each
check tests one requirement, quoted word for word from the docs, and explains a failure: what was
sent, what came back, what was expected, the likely cause, and a link to the section.

**Prefer a test environment.** It works against production too, but it starts real Sessions and
sends test messages to the company agent. At the end of the run it tries to close every test
conversation it saw created, and the output says how many it closed and lists any it couldn't, so you
can close them by hand.

## Requirements

Node 22.18 or later (it runs the TypeScript directly). No dependencies and no install step. Run it
from the folder that holds `plan/`, usually the repository root, so `.poppy/` and `plan/` are found:

```sh
node kit/company/validate/index.ts help
```

The examples below assume you're in the skill folder and use `node validate/index.ts`.

## Commands

| Command                   | What it does                                                                   |
| ------------------------- | ------------------------------------------------------------------------------ |
| `survey <url>`            | Read-only. Reports what the domain already publishes. Sends only GET requests. |
| `check [url]`             | Runs the checks. Writes `.poppy/last-results.json`.                            |
| `keygen --base-url <url>` | Creates the test Personal Agent in `.poppy/`.                                  |
| `report`                  | Drafts the implementation report from `plan/` and the latest results.          |
| `help`                    | Shows usage.                                                                   |

### `check` options

| Option                      | Meaning                                                                                                                                        |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `--milestone <m>`           | `foundation` (1), `interfaces` (2), `sign-in` (3), `extensions` (4), or `all` (the default). Each milestone includes the ones before it.       |
| `--design <path>`           | Reports progress against the ` ```json poppy-design ` block in the design. Its `domain` is the default URL.                                    |
| `--file <poppy.json>`       | Offline: checks a local `poppy.json` against the schema and field rules. No network.                                                           |
| `--only <id or prefix>`     | Runs only matching checks, such as `session.start` or `conversations.`. Repeatable.                                                            |
| `--probe <url>`             | A GET operation in your API that takes the Session header signed out. Used for the Session header checks instead of the conversation endpoint. |
| `--json`                    | Prints the same results as JSON.                                                                                                               |
| `--allow-private-addresses` | Also connects to loopback, private, and link-local addresses, to test a local deployment. Same as `POPPY_VALIDATOR_ALLOW_PRIVATE=1`.           |

Exit codes: `0` no MUST failures, `1` a MUST check failed, `2` usage error. A SHOULD that isn't met
is a warning and doesn't change the exit code.

## The test Personal Agent

Checks past discovery need a Personal Agent identity the Company can verify:

```sh
node validate/index.ts keygen --base-url https://staging.example.com/poppy-test
```

This writes to `.poppy/` and adds `.poppy/` to `.gitignore`:

- `private-key.jwk`: the signing key, mode 0600. Never host or commit it.
- `agent.json` and `jwks.json`: host these two, unchanged, at `<base-url>/agent.json` and
  `<base-url>/jwks.json`, over HTTPS with no redirects.
- `config.json`: the client_id and a random User ID for each Company.

`keygen` won't replace an existing key without `--force`. Before each run, `check` fetches the
hosted files and explains any mismatch with `.poppy/`.

This identity is for testing only, and its key is on your machine. Don't add it to a production
allowlist.

## What's checked

| Milestone     | Checks                                                                                                                                                                                                                     |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Foundation | `discovery.*` poppy.json; `metadata.*` the issuer, from the protected resource metadata, and its OAuth server metadata; `session.*` the Session header at resources; `assertion.*` client assertions at the token endpoint |
| 2. Interfaces | `openapi.*` OpenAPI documents; `mcp.*` MCP servers; `conversations.*` the conversation endpoint; `feedback.*` the feedback endpoint; `web.*` the browser-session endpoint                                                  |
| 3. Sign-in    | `mediated.*` only what needs no real sign-in, such as an unknown `sign_in_id` at the token endpoint. Check the rest of sign-in by hand against `checklist.md`.                                                             |
| 4. Extensions | `operations.*` only what a signed-out run sees: no operations returned to a Personal Agent that doesn't list the Operations extension.                                                                                     |

`catalog.ts` lists every check with its requirement and section.

## Safety

- Requests are limited to:
    - GETs, some with an invented access token or Session JWT, to see that they're rejected;
    - conversation requests, including a handoff request to a closed conversation, which the Company
      rejects;
    - feedback reports;
    - MCP `initialize`, without a token and with an invented one;
    - token requests that can't succeed: refresh requests with a refresh token that doesn't exist, and
      a Mediated Sign-In request with a `sign_in_id` that doesn't exist;
    - authorizing the browser-session page's codes, and submitting its form without the join cookie,
      with a code already used, and with another page's join cookie, which the Company rejects.

    The validator never calls an API operation other than the GET named with `--probe`, never gets a
    token, never signs anyone in, and never joins a browser to a Session.

- Every URL must be HTTPS, and it won't connect to loopback, private, or link-local addresses
  unless you pass `--allow-private-addresses`. Redirects are followed one at a time and checked.
- Work is bounded: a few requests at a time and at most 400 in a run. A 429 with a `Retry-After` of
  up to a minute is waited out; a longer one makes that check inconclusive.
- Conversations carry only the text "Validator test message. Please ignore." The run tries to close
  each one at the end and reports any it couldn't. Feedback reports, five at most, have the task
  "Validator test report" and no details about anyone.
- Session JWTs, delegations, tokens, codes, and keys are never printed or saved. Anything shown is redacted, such
  as `eyJhbGci…(redacted)`. `.poppy/last-results.json` has no secrets.
- `report` never sends anything. It prints a draft and a prefilled issue link; review the draft and
  file it yourself. Your domains are replaced with example.com.

## Disagreeing with a check

Every failure has a "Disagree?" link that opens a feedback issue with the check and its quoted
requirement filled in. If the validator is wrong, or the spec is unclear, say so there.

## Development

The validator's tests aren't part of the kit. They're in the Personal Agent Protocol repository, in
`kit/company/validate/test/`, and run every check against an in-memory Company that follows the
spec, and against versions of it with specific flaws, such as accepting a Session JWT signed by an unknown key.

The JSON Schemas for each document are in `../schemas`. `schema.ts` is a small validator for the
subset they use.

The checks sign Session JWTs with delegated keys from the test identity and send them signed out.
At the token endpoint they send only requests that can't succeed, to check client assertions and
errors, so they never get a token. Signed-in flows, including real access tokens at APIs and MCP
servers, need manual verification in the sign-in milestone.
