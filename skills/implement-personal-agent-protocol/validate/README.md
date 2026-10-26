# Poppy Company validator

Checks a Company's live Personal Agent Protocol deployment by acting as a test Personal Agent. Each
check tests one requirement, quoted word for word from the docs, and explains a failure: what was
sent, what came back, what was expected, the likely cause, and a link to the section.

**Prefer a test environment.** It works against production too, but it starts real Sessions and
sends test messages to the company agent. Conversations are closed at the end of the run.

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

| Option                  | Meaning                                                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `--milestone <m>`       | `foundation` (1), `interfaces` (2), `sign-in` (3), or `all` (the default). Each milestone includes the ones before it.  |
| `--design <path>`       | Reports progress against the ` ```json poppy-design ` block in the design. Its `domain` is the default URL.             |
| `--file <poppy.json>`   | Offline: checks a local `poppy.json` against the schema and field rules. No network.                                    |
| `--only <id or prefix>` | Runs only matching checks, such as `session.start` or `conversations.`. Repeatable.                                     |
| `--probe <url>`         | A GET operation in your API that needs a Session Token. Used for the DPoP checks when there's no conversation endpoint. |
| `--json`                | Prints the same results as JSON.                                                                                        |

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

| Milestone     | Checks                                                                                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Foundation | `discovery.*` poppy.json; `metadata.*` OAuth server metadata; `session.*` starting and renewing Sessions; `dpop.*` DPoP at the token endpoint and resource servers |
| 2. Interfaces | `openapi.*` OpenAPI documents; `mcp.*` MCP servers and Bearer tokens; `conversations.*` the conversation endpoint; `feedback.*` the feedback endpoint              |
| 3. Sign-in    | Not in this version. Check sign-in by hand against `checklist.md`.                                                                                                 |

`catalog.ts` lists every check with its requirement and section.

## Safety

- Requests are limited to GETs, token requests, conversation requests, and feedback reports. The
  validator never calls an API operation other than the GET named with `--probe`.
- Conversations carry only the text "Validator test message. Please ignore." and are closed at the
  end of the run. Feedback reports, three at most, have the task "Validator test report" and no
  details about anyone.
- Tokens, assertions, proofs, and keys are never printed or saved. Anything shown is redacted, such
  as `eyJhbGci…(redacted)`. `.poppy/last-results.json` has no secrets.
- `report` never sends anything. It prints a draft and a prefilled issue link; review the draft and
  file it yourself. Your domains are replaced with example.com.

## Disagreeing with a check

Every failure has a "Disagree?" link that opens a feedback issue with the check and its quoted
requirement filled in. If the validator is wrong, or the spec is unclear, say so there.

## Development

The validator's tests aren't part of the kit. They're in the Personal Agent Protocol repository, in
`kit/company/validate/test/`, and run every check against an in-memory Company that follows the
spec, and against versions of it with specific flaws, such as accepting a replayed DPoP proof.

The JSON Schemas for each document are in `../schemas`. `schema.ts` is a small validator for the
subset they use.
