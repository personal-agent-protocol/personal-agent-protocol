# Pattern: MCP

A listed MCP server uses Streamable HTTP and MCP 2025-06-18 or later, accepts the Company's access
tokens issued for its `url`, enforces their scopes, and publishes RFC 9728 protected resource
metadata whose `authorization_servers` includes the Company's issuer
([section 7](https://personalagentprotocol.org/docs/spec#apis)). That is ordinary MCP
authorization. It MAY ignore the Session header, but then its calls belong to no Session and it
can't take signed-out calls from Personal Agents.

## A. The existing MCP server, unchanged

Validate the Company's access tokens and check their `resource` (audience) is the server's `url`,
as MCP authorization already requires. Ignore the Session header.

- Fits: an existing MCP server that already does MCP authorization.
- Needs: the token endpoint issues tokens with `resource` set to the server's `url` (RFC 8707) at
  sign-in or refresh ([4.5](https://personalagentprotocol.org/docs/spec#access-tokens)). Token
  validation that can read the token's scopes and `resource`.
- Trade-off: the server's calls don't join the Session's cart, conversations, or website, and it is
  available only after sign-in. Use another interface for signed-out tasks, or move to B later.
- Watch for: accepting tokens for any audience. Each token must work at only one MCP server.

## B. An MCP server that accepts the Session header

The server verifies the Session header as the other resources do (`patterns/session-header.md`),
often reusing their library or gateway, as well as the access token.

- Fits: a new MCP server in front of existing APIs, or one whose calls should join the Session.
- Needs: Session header verification, and the Session store.
- Trade-offs: signed-out calls work with the Session header only, if the server allows them, and
  signed-in calls join the Session. Requests from MCP clients that don't implement Poppy have no
  Session header and are handled as in A, but a token issued to a Personal Agent without the header
  is refused ([5.3](https://personalagentprotocol.org/docs/spec#session-verification)).
- Watch for: the tools' calls to existing APIs must not allow more than the access token does
  ([guides](https://personalagentprotocol.org/docs/guides#company-internal)).

## What to watch for

- `authorization_servers` names the Company's issuer, not the Personal Agent.
- A token is accepted only at the MCP server whose `url` is its `resource`, not at other paths on the
  same host (section 7). A token for another `resource` gets `invalid_token` with
  `resource_metadata`.
- An MCP server's 401 responses carry a challenge for each scheme it accepts, each with
  `resource_metadata` (section 7).
- If your access tokens are DPoP-bound, the server verifies DPoP proofs too, and rejects a DPoP
  token sent with the `Bearer` scheme (RFC 9449 §7.2).
- MCP clients that don't implement Poppy sign in through MCP's own authorization flow. Their
  requests belong to no Session (section 7).
- `extension_required` from an MCP server refuses the Personal Agent entirely, never one tool
  (section 7).
- Tools check scopes on every call (`patterns/scopes.md`).
