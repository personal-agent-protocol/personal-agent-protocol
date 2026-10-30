# Pattern: the token endpoint

Use the Company's existing OAuth authorization server for account access
([4](https://personalagentprotocol.org/docs/0.3/spec#oauth)). Poppy sign-in is plain OAuth: standard
grants (authorization code with PKCE, device authorization, refresh tokens), `private_key_jwt`
client authentication with client ID metadata documents, RFC 7009 revocation, and ordinary access
and refresh tokens.

Signed-out access never reaches this server. The Personal Agent signs a Session header for each
request with a delegated key, and resources verify it
([5.3](https://personalagentprotocol.org/docs/0.3/spec#session-verification)). Don't create an OAuth
user record for each User ID, or add a grant to mint signed-out tokens. The token endpoint doesn't
receive the Session header, and sign-in doesn't need to know the Session.

## Survey the existing server

- Check support for client ID metadata documents, `private_key_jwt` with `ES256` (required) and
  `PS384` (recommended), PKCE,
  `iss` in redirects, resource indicators, and the sign-in types the design chose. Some servers
  support them and some don't.
- Check that resources can tell which `client_id` an access token was issued to, by a claim or
  introspection. The Session header check needs it
  ([5.3](https://personalagentprotocol.org/docs/0.3/spec#session-verification)).
- DPoP-bound access tokens are optional
  ([4.5](https://personalagentprotocol.org/docs/0.3/spec#access-tokens)). Use them if the server
  supports them and the engineer wants them.
- Keep refresh tokens as confidential-client refresh tokens, tied to the `client_id`, not to a
  Session or a key ([4.4](https://personalagentprotocol.org/docs/0.3/spec#refresh-tokens)).
- For a service that accepts only its own tokens, such as an MCP server, issue a token with its
  `resource` at sign-in or refresh, and return `invalid_target` for a `resource` you don't serve.
- Mediated Sign-In, if the design offers it, is an extension grant at this endpoint
  ([Mediated Sign-In](https://personalagentprotocol.org/docs/0.3/extensions/mediated-sign-in)). Check
  that the server can add a custom grant type, or put a small grant handler in front of it.
- Return standard OAuth errors, and HTTP 429 with `Retry-After` for rate limits, as
  [5.6](https://personalagentprotocol.org/docs/0.3/spec#sending-requests) describes.

## The metadata

Publish RFC 8414 metadata with `issuer`, `token_endpoint`, `revocation_endpoint`,
`grant_types_supported` with `refresh_token` and the sign-in grants, the sign-in endpoints,
`scopes_supported`, and `protected_resources` listing `https://{domain}` for every domain whose
issuer it is ([3.2](https://personalagentprotocol.org/docs/0.3/spec#oauth-server)). The domain's own
protected resource metadata names this issuer in `authorization_servers`.

## Client assertions

Verify client assertions under RFC 7523 and the audience rule in
[4.1](https://personalagentprotocol.org/docs/0.3/spec#agent-identity): `aud` exactly the issuer, as a
single string. The guides suggest rejecting a reused `jti` from the same `client_id` until it
expires (4.1 allows it), with a cache every token endpoint server shares. Send `Cache-Control: no-store` on token responses, and include
`expires_in`, as RFC 6749 recommends.

Resources that use Session claims verify the Session header and the access token separately, then apply the same Session and
scope checks. The authorization server needs no grant for an unknown User ID.
