# Contributing

Feedback on the specification and fixes to the site are welcome.

## Feedback on the specification

[Providing feedback](https://personalagentprotocol.org/docs/introduction#feedback) in the
introduction says how to send it. You can also download the agent kit and have an AI agent write
a review.

## Security

Report vulnerabilities privately, as [SECURITY.md](SECURITY.md) describes, not in a public issue
or pull request.

## Changes to this repository

Open a pull request against `main`. Keep each pull request to one change, and describe what it
changes and why. Before you open it, run:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm format:check
pnpm build
```

See the [README](README.md) for how to run the site locally.

## License for contributions

By submitting a contribution, you agree to license it under the [Apache License 2.0](LICENSE).
Suggestions and other feedback are licensed under the
[contribution terms](https://personalagentprotocol.org/license/contributions).
