# Pattern: the token endpoint

The token endpoint starts and renews Sessions, completes sign-in, and exchanges Account Tokens
([4.2](https://personalagentprotocol.org/docs/0.3/spec#starting-sessions),
[4.4](https://personalagentprotocol.org/docs/0.3/spec#sign-in),
[4.8](https://personalagentprotocol.org/docs/0.3/spec#account-tokens)). Session Tokens are OAuth access
tokens and Account Tokens are OAuth refresh tokens, so a Company can build on its existing OAuth
server ([section 4](https://personalagentprotocol.org/docs/0.3/spec#sessions)). The choice here shapes
most of the build.

What Poppy adds to standard OAuth:

- Clients identified by an HTTPS URL that returns their metadata, authenticated with
  `private_key_jwt` using keys from their `jwks_uri`
  ([4.1](https://personalagentprotocol.org/docs/0.3/spec#agent-identity)).
- The JWT bearer grant to start a signed-out Session, with the User ID in `sub`.
- `session_id` in requests and in responses.
- DPoP-bound tokens ([4.3](https://personalagentprotocol.org/docs/0.3/spec#sending-tokens)), and Bearer
  tokens for MCP only. A token for an MCP server, DPoP or Bearer, is issued for its `resource`.
- `protected_resources` (RFC 9728), `grant_types_supported`, and `scopes_supported` in the metadata
  ([3.2](https://personalagentprotocol.org/docs/0.3/spec#oauth-server)).
- The error codes in 4.2, including `invalid_session` and `account_mismatch`.

## A. Add Poppy to the existing OAuth server

Configure or extend the Company's OAuth server to do all of the above.

- Fits: an OAuth server the Company runs itself or can extend with custom grants, token hooks, and
  client resolution by URL.
- Needs: support for, or a way to add, everything in the list above. Check each capability in the
  survey. Don't assume.
- Trade-offs: one issuer and one set of token records. Resource servers keep validating tokens the
  way they do now. Extensions to a vendor product may be limited or hard to upgrade.
- Watch for: the server issuing tokens for Personal Agents with the same audience and permissions
  as first-party tokens. Map Poppy scopes to narrow permissions (`patterns/scopes.md`).

## B. A Poppy token service beside the existing server

A separate service is the Poppy issuer. It handles Personal Agent identity, Sessions, DPoP, and
sign-in, and mints tokens that the Company's existing systems accept.

Ways to make tokens the existing systems accept:

- **Token exchange.** The service exchanges its own verified state for a token from the existing
  OAuth server (for example RFC 8693), with the narrowest permissions that cover the granted scopes.
- **Encrypted Company credentials.** The Session Token carries the Company's own session
  credentials, encrypted so only the Company's systems can read them. If a token carries them, the
  Company MUST encrypt it (4.2, "Token format").
- **Verify at the edge, pass identity inward.** A gateway verifies the Session Token and DPoP Proof,
  then passes the verified `client_id`, User ID, account, and scopes to internal services through
  service credentials ([guides](https://personalagentprotocol.org/docs/0.3/guides#company-internal)).

Sign-in still uses the Company's existing sign-in pages and account checks. The service sends the
User to them and receives the result.

- Fits: an OAuth server that can't be extended, a vendor-hosted identity provider, or a Company
  that wants Poppy isolated from first-party clients.
- Trade-offs: another service to run and secure, and two sets of token records to keep in step,
  especially at sign-out. Existing systems need no Poppy knowledge.
- Watch for: internal credentials that allow more than the Session Token
  ([guides](https://personalagentprotocol.org/docs/0.3/guides#company-internal)); tokens from the
  existing server reaching the Personal Agent instead of the Poppy token; and revocation that
  doesn't reach both sides ([4.9](https://personalagentprotocol.org/docs/0.3/spec#sign-out)).

## C. A token service in front of the existing server

The same as B, but the service proxies standard requests to the existing server and handles only
what Poppy adds.

- Fits: an OAuth server that does most of standard OAuth well but lacks DPoP or URL-based clients.
- Watch for: a gateway that only checks the proof's signature. It must record the key for each token
  it issues and check that key on every later request
  ([guides](https://personalagentprotocol.org/docs/0.3/guides#company-dpop)).

## For every option

- Verify client metadata as in [Verifying personal agents](https://personalagentprotocol.org/docs/0.3/guides#company-agents)
  and [Fetching metadata safely](https://personalagentprotocol.org/docs/0.3/guides#both-fetching).
- Reject a reused assertion `jti`, and check `aud` is your `auth.issuer` as a single string, and reject your token endpoint URL there
  (4.2).
- Return `Cache-Control: no-store` on token responses
  ([guides](https://personalagentprotocol.org/docs/0.3/guides#both-secrets)).
- `issuer` in the metadata is exactly `auth.issuer` (3.2).
