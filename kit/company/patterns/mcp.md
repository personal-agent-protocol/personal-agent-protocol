# Pattern: MCP

A listed MCP server uses Streamable HTTP and MCP 2025-06-18 or later, accepts Session Tokens as its
access tokens, accepts only tokens issued for its `url`, enforces their scopes, and publishes RFC
9728 protected resource metadata whose `authorization_servers` includes `auth.issuer`
([section 6](https://personalagentprotocol.org/docs/spec#apis)). MCP uses Bearer tokens. A new MCP
server should also support DPoP by listing `dpop_signing_alg_values_supported` in its protected
resource metadata, and Personal Agents then use DPoP there
([4.3](https://personalagentprotocol.org/docs/spec#sending-tokens)). Bearer-only is for existing
servers that can't verify DPoP Proofs yet.

## A. The existing MCP server accepts Session Tokens

Point the server's token validation at the Poppy issuer, and check the token's `resource` (audience)
is the server's `url`.

- Fits: an existing MCP server that already does MCP authorization.
- Needs: the token endpoint supports the token exchange grant (RFC 8693), and issues a Bearer
  Session Token for the server's `url` in exchange for a DPoP Session Token bound to the request's
  proof. It issues Personal Agents Bearer tokens no other way (4.3). Token validation that can read
  the token's scopes, `resource`, and Session.
- Watch for: accepting tokens for any audience. Each Bearer token must work at only one MCP server.

## B. An MCP server in front of existing APIs

A new MCP server whose tools call the existing APIs with the verified identity.

- Fits: Companies with APIs but no MCP server.
- Needs: DPoP support, since it's new (4.3). It can reuse the DPoP verification of the existing APIs,
  and still accepts Bearer tokens from MCP clients that don't implement Poppy. The token endpoint
  issues Personal Agents only DPoP Session Tokens for it, and refuses a token exchange for it with
  `invalid_target`.
- Watch for: the tools' calls to existing APIs must not allow more than the Session Token does
  ([guides](https://personalagentprotocol.org/docs/guides#company-internal)).

## What to watch for

- A Bearer Session Token is accepted only at the MCP server whose `url` is its `resource` (4.3). A
  gateway that accepts it anywhere else, including other paths on the same host, defeats DPoP.
- An MCP server's 401 responses carry a challenge for each scheme it accepts, each with
  `resource_metadata` (section 6).
- An MCP server that supports DPoP rejects a DPoP Session Token sent with the `Bearer` scheme
  (RFC 9449 §7.1). Otherwise a copied DPoP token works there without its key.
- MCP clients that don't implement Poppy can sign in through MCP's own authorization flow. The
  Company treats that as a new signed-in Session with no User ID, which ends when the sign-in is
  revoked or expires (section 6).
- `extension_required` from an MCP server refuses the Personal Agent entirely, never one tool
  (section 6).
- Tools check scopes on every call (`patterns/scopes.md`).
