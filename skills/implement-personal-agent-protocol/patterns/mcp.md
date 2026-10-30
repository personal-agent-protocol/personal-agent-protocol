# Pattern: MCP

A listed MCP server uses Streamable HTTP and MCP 2025-06-18 or later. When it offers account access,
it accepts the Company's access tokens issued for its `url`, enforces their scopes, and publishes RFC 9728 protected resource
metadata whose `authorization_servers` includes the Company's issuer
([section 7](https://personalagentprotocol.org/docs/0.3/spec#apis)). That is ordinary MCP
authorization. An issuerless Company can offer signed-out MCP calls by verifying the Session
header, without OAuth metadata or token handling. An MCP server that uses no Session claims or
state can ignore the header and use OAuth alone or serve signed-out calls. Such calls don't join
the Session's cart, conversations, or website.

## A. The existing MCP server, unchanged

Validate the Company's access tokens and check their `resource` (audience) is the server's `url`,
as MCP authorization already requires. Ignore the Session header.

- Fits: an existing MCP server that already does MCP authorization.
- Needs: the token endpoint issues tokens with `resource` set to the server's `url` (RFC 8707) at
  sign-in or refresh ([4.5](https://personalagentprotocol.org/docs/0.3/spec#access-tokens)). Token
  validation that can read the token's scopes and `resource`.
- Trade-off: the server's calls don't join the Session's cart, conversations, or website. It can
  serve signed-out calls only when they need no Session identity or state.
- Watch for: accepting tokens for any audience. Each token must work at only one MCP server.

## B. An MCP server that accepts the Session header

The server verifies the Session header as the other resources do (`patterns/session-header.md`),
often reusing their library or gateway, as well as the access token.

- Fits: a new MCP server in front of existing APIs, or one whose calls should join the Session.
- Needs: Session header verification, and the Session store.
- Trade-offs: signed-out calls work with the Session header only, if the server allows them, and
  signed-in calls join the Session. Requests from MCP clients that don't implement Poppy have no
  Session header and are handled as in A. A request that needs Session identity or state is
  refused without a verified header ([5.3](https://personalagentprotocol.org/docs/0.3/spec#session-verification)).
- Watch for: the tools' calls to existing APIs must not allow more than the access token does
  ([guides](https://personalagentprotocol.org/docs/0.3/guides#company-internal)).

## What to watch for

- Use the lifecycle of the supported MCP version. MCP 2026-07-28 uses per-request metadata and
  `server/discover`; older versions use `initialize`. Follow that version's HTTP binding for
  headers and fallback. Poppy's `sid` is independent of the MCP lifecycle.
- Bearer is the MCP baseline. Advertise DPoP in the server's protected resource metadata only
  when supported, and preserve ordinary Bearer client support (section 7).
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
