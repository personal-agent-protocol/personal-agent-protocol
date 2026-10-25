# Personal Agent Protocol

## 1. Introduction

Personal Agent Protocol (Poppy for short) defines how a Personal Agent, acting for one User, works with a Company on that User's behalf. It covers many parts of that interaction, beyond the agent-to-agent conversations that other agent protocols focus on:

1. **Discovery:** a standard way for the Personal Agent to find everything it needs to work with a Company.
2. **Sessions and authorization:** how the agent identifies itself to the Company, how the Company identifies each User (signed in or not), and how Users sign in to their accounts.
3. **Web browsing:** how the Personal Agent browses the Company's website in the same Session.
4. **APIs:** how the Personal Agent uses the Company's APIs, which can be more efficient than web browsing.
5. **Conversations:** how the Personal Agent starts a conversation with the Company Agent, and how either side can bring in a person: the User on the Personal Agent's side, or a person at the Company.
6. **Extensions:** how Companies and Personal Agents add capabilities beyond this specification, described on the [Extensions page](https://personalagentprotocol.org/docs/0.3/extensions).

This is draft version 0.3. Any part of it can change before a stable version, including in ways that aren't backward compatible. Areas it doesn't cover yet are listed in [Path to 1.0](https://personalagentprotocol.org/docs/path-to-1#open-topics).

The examples use `example.com` for the Company and `agent.example` for the Personal Agent. Tokens, keys, and codes in the examples are shortened placeholders, not real values.

The key words MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY are used as described in BCP 14 ([RFC 2119](https://www.rfc-editor.org/rfc/rfc2119), [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174)) when they appear in capitals, as shown here.

## 2. Terms

| Term | Meaning |
| --- | --- |
| **Parties** |  |
| User | The person a Personal Agent acts for. |
| Personal Agent | Software acting for the User. |
| Company | An entity that implements the protocol so Personal Agents can work with it. |
| **Discovery** |  |
| `poppy.json` | The JSON document a Company publishes at `/.well-known/poppy.json` to tell Personal Agents how to start Sessions and sign in, and which APIs and Company Agent it offers (section 3). |
| **Sessions and authorization** |  |
| User ID | The ID a Personal Agent gives one User at one Company. It is stable, so the Company recognizes the User across Sessions even when they're signed out. It is opaque and different at each Company, so Companies can't match Users with each other (4.2). |
| Session | One User's activity at one Company through one Personal Agent, across web browsing, APIs, and conversations. It starts signed out and can be signed in to one Company account. A Personal Agent can have several Sessions for the same User (section 4). |
| Session Token | The short-lived access token for a Session, used at the Company's APIs and conversations. It is signed out, or signed in with the account scopes the User granted, such as `orders:read` (4.2). |
| Account Token | A long-lived credential from sign-in that lets the Personal Agent get signed-in Session Tokens later without asking the User again. It is used only at the Company's token endpoint (4.8). |
| Session Key | The key pair a Personal Agent creates for one Session. Its Session Tokens are bound to it, and its thumbprint names the Session at the Company's token endpoint (4.3). |
| DPoP Proof | A signature the Personal Agent sends with each request to show it holds the key its Session Token is bound to (4.3). |
| Direct Sign-In | The User signs in on the Company's own page in their browser and approves access (4.5). |
| Device Sign-In | The User signs in on the Company's page on any device, using a link and code the Personal Agent shows them (4.6). |
| Mediated Sign-In | The Personal Agent signs in for the User by sending the User's credentials to the Company (4.7). |
| **Conversations** |  |
| Company Agent | A Company's own agent, reached through a supported conversation protocol. |
| Direct Conversation | A new conversation, linked to an earlier one, in which the User talks with the Company through the Personal Agent's interface (7.10). |
| Conversation ID | Identifies one conversation, in the URL of each request about it. A conversation belongs to one Personal Agent and one User or account (7.2). |

**OAuth terms.** Poppy builds on OAuth (section 4) but names some things for what they do in a Session, because they're narrower than the OAuth terms:

| Poppy term | OAuth term | Why the Poppy name |
| --- | --- | --- |
| Session Token | Access token | It is always for one Session, named by its Session Key, whether it is DPoP-bound or a Bearer token for an MCP server (4.3). |
| Account Token | Refresh token | The Company issues one only when the User signs in to an account. A signed-out Session has none and renews with the Personal Agent's assertion instead (4.2). It can also start new Sessions (4.8). |
| User ID | Pairwise subject identifier, `sub` in the assertion | The Personal Agent assigns it, not the Company's OAuth server as in OpenID Connect (4.2). |
| Sign-in | User authorization | Mediated Sign-In isn't an OAuth grant (4.7). |
| Sign-out | Revoking the refresh token | It is the User ending the Personal Agent's access to their account. The Sessions continue signed out (4.9). |
| Signed out | Pseudonymous | The Company recognizes the User by User ID but doesn't know who they are (4.2). |

## 3. Discovery

A Company MUST publish its `poppy.json` document at `https://{domain}/.well-known/poppy.json` over HTTPS, where `{domain}` is the Company's domain or a subdomain it controls.

The well-known URL MAY redirect, for example from `www.example.com` to `example.com`. Personal Agents MUST follow redirects, and every redirect MUST be to an HTTPS URL. A redirect MAY go to another host, but Personal Agents MUST use the document only when the last URL's path is exactly `/.well-known/poppy.json` and it has no query. Otherwise anyone who can serve a file from some path on a domain, such as an upload, could redirect to it and have it speak for that domain. Personal Agents SHOULD cache the document according to its HTTP caching headers.

**Which Company a document speaks for.** A `poppy.json` speaks for the host that serves it at the well-known path, after any redirects, so a Company that uses a provider has the provider serve it on the Company's own domain. The document names the Company's OAuth issuer in `auth.issuer`, and the issuer identifies the Company (3.2). The issuer confirms the link from its side by listing, in its metadata, the domains whose documents name it. Before using a document, the Personal Agent checks both directions:

1. `organization.domain` is the host that served the document (3.1). This stops a document copied to another domain from speaking for the Company.
2. The issuer's metadata has the same `issuer`, and its `protected_resources` lists `https://{organization.domain}` (3.2). This stops a domain from claiming another Company's issuer and receiving its tokens.

**HTTPS.** Every URL this protocol defines or exchanges MUST be an HTTPS URL: in `poppy.json`, in authorization server and protected resource metadata, in client metadata documents (4.1), in extensions, and in assertions, proofs, and responses. Personal Agents MUST NOT use a URL from a Company that has another scheme, and Companies MUST reject one from a Personal Agent. This doesn't cover the pages of a Company's website, which Personal Agents browse as any visitor would (section 5).

**Redirects and addresses.** Outside discovery, a redirect never carries the protocol's secrets. If the token, revocation, device authorization, or Mediated Sign-In endpoint, an API, or a conversation, feedback, or extension endpoint answers with a redirect, the Personal Agent MUST NOT send a token, DPoP Proof, assertion, or credentials to the new URL. Personal Agents and Companies MUST NOT connect to a loopback, private, or link-local address for a URL the other party gave them, unless they were configured to on purpose. Otherwise a Company could aim Personal Agents at another Company's servers or at internal ones.

An example document:

*poppy.json, published by the Company*

```
{
  "protocol_version": "0.3",
  "organization": {
    "name": "Example Company",
    "domain": "example.com"
  },
  "auth": {
    "issuer": "https://auth.example.com",
    "mediated": {
      "endpoint": "https://auth.example.com/poppy/sign-in",
      "fields": [
        { "name": "email", "label": "Email", "secret": false },
        { "name": "password", "label": "Password", "secret": true }
      ],
      "scopes": ["orders:read"]
    },
    "scopes": {
      "orders:read": "See your orders, returns, and bookings",
      "orders:write": "Exchange or return items, and change bookings",
      "addresses": "See and change your saved shipping addresses"
    }
  },
  "agent": {
    "protocols": [
      {
        "type": "poppy",
        "endpoint": "https://api.example.com/poppy/conversations"
      }
    ]
  },
  "web": {
    "browser_session_endpoint": "https://example.com/poppy/browser-session"
  },
  "feedback": {
    "endpoint": "https://api.example.com/poppy/feedback"
  },
  "excluded_tasks": {
    "url": "https://example.com/poppy/excluded-tasks.json"
  },
  "apis": [
    {
      "type": "openapi",
      "url": "https://api.example.com/openapi.json",
      "description": "Orders, returns, and exchanges"
    },
    {
      "type": "mcp",
      "url": "https://mcp.example.com/mcp",
      "description": "Product search and sizing"
    }
  ]
}
```

### 3.1 Fields

| Field | Req. | Description |
| --- | --- | --- |
| `protocol_version` | Yes | The protocol version the document follows, as `major.minor`. This draft is `0.3`. Before 1.0, each version can change the protocol in ways that aren't backward compatible, so a Personal Agent MUST NOT use a document whose `major.minor` version it doesn't support. From 1.0, a newer minor version won't break older Personal Agents, which use the document and ignore fields they don't recognize. |
| `organization` | Yes | Display name and domain. `domain` MUST be the host that serves the document, after any redirects. Domains are compared ignoring case, with no other normalization. |
| `auth` | If `agent`, `apis`, `feedback`, or `web.browser_session_endpoint` is present | `issuer` is the Company's OAuth issuer identifier, an HTTPS URL. It identifies the Company, and the Personal Agent finds the Company's OAuth endpoints, scopes, and Direct and Device Sign-In from it (3.2). Sessions need `auth`, so a Company without it can only be browsed as an ordinary website (section 5). |
| `auth.mediated` | If supported | Transitional (4.7). `endpoint` is where the Personal Agent sends credentials, and `fields` lists them (4.7). `scopes` lists the scopes Mediated Sign-In can grant. |
| `auth.scopes` | For scopes no OpenAPI description describes | A description of each scope, keyed by scope name, in the same form as the `scopes` of an OAuth 2.0 security scheme in OpenAPI. It describes each scope in `scopes_supported` that no OpenAPI description the Company lists describes (4.4). |
| `agent` | One of `agent`, `apis`, or `web` | The Company Agent. `protocols` lists its supported conversation protocols, each with a `type` and HTTPS `endpoint` (section 7). An entry MAY include a `resource` to require tokens issued for it (4.3). |
| `apis` | One of `agent`, `apis`, or `web` | A list of APIs. Each has a `type` from section 6, a `url`, and a short `description` that helps the Personal Agent pick the right one. An entry MAY include a `resource` to require tokens issued for it (4.3). |
| `web` | One of `agent`, `apis`, or `web` | The Company's website. The optional `browser_session_endpoint` is where the Personal Agent's browser joins a Session (section 5). Without it, Personal Agents browse the site as ordinary signed-out visitors. |
| `feedback` | No | `endpoint` is an HTTPS URL where Personal Agents report a User's task that can't be done through this protocol (8.3). |
| `excluded_tasks` | No | `url` is an HTTPS URL of the document that lists the tasks the Company chose not to offer through this protocol (8.1). |
| `extensions` | No | The extensions the Company supports, keyed by name (below). |

### 3.2 OAuth server

A Company is identified by its `auth.issuer`. Several domains MAY name the same issuer, such as a Company with a domain for each country, and they are then one Company: the same User IDs (4.2), Sessions, and Account Tokens apply to all of them. Their documents MUST have the same `auth`, which describes the issuer. Other fields MAY differ by domain, such as the APIs or the website, and the Personal Agent uses the document of the domain it is working with.

An issuer MUST represent exactly one Company. A provider that hosts several Companies MUST give each its own issuer, such as `https://auth.provider.example/shop-a`, even when they share servers. Otherwise the Companies would be one Company under this protocol: Personal Agents would send each of them the same User IDs, and an Account Token from one would be valid at the others.

The issuer MUST publish OAuth Authorization Server Metadata ([RFC 8414](https://www.rfc-editor.org/rfc/rfc8414)), and `protected_resources` in it ([RFC 9728](https://www.rfc-editor.org/rfc/rfc9728) §4) MUST list `https://{domain}` for every domain whose `poppy.json` names the issuer, exactly in that form: the scheme and host only, with no path, port, or trailing slash, like the canonical server URI of the MCP authorization specification. It MAY list other resources too, such as the Company's MCP servers. The metadata is at the URL RFC 8414 (section 3.1) defines, which puts `/.well-known/oauth-authorization-server` between the issuer's host and its path, if it has one, such as `https://auth.provider.example/.well-known/oauth-authorization-server/shop-a`. Before using a Company's `poppy.json`, the Personal Agent fetches the metadata and MUST check that its `issuer` exactly matches `auth.issuer`, character for character. It MUST also check that `protected_resources` includes `https://{organization.domain}`, comparing the strings exactly except that the host is compared ignoring case, as for `organization.domain` (3.1). An entry with a path or a trailing slash doesn't match. Resource identifiers are compared as exact strings, as in [RFC 9728](https://www.rfc-editor.org/rfc/rfc9728) §3.3, and `https://{domain}` is a resource identifier in the form [RFC 8707](https://www.rfc-editor.org/rfc/rfc8707) §2 recommends. Otherwise any domain could claim another Company's issuer and receive its tokens.

*GET https://auth.example.com/.well-known/oauth-authorization-server*

```
{
  "issuer": "https://auth.example.com",
  "token_endpoint": "https://auth.example.com/oauth/token",
  "revocation_endpoint": "https://auth.example.com/oauth/revoke",
  "authorization_endpoint": "https://auth.example.com/oauth/authorize",
  "device_authorization_endpoint": "https://auth.example.com/oauth/device",
  "grant_types_supported": [
    "urn:ietf:params:oauth:grant-type:jwt-bearer",
    "refresh_token",
    "authorization_code",
    "urn:ietf:params:oauth:grant-type:device_code"
  ],
  "scopes_supported": ["orders:read", "orders:write", "addresses"],
  "dpop_signing_alg_values_supported": ["ES256", "RS256"],
  "protected_resources": [
    "https://example.com",
    "https://example.co.uk",
    "https://mcp.example.com/mcp"
  ]
}
```

The Personal Agent uses these fields of the metadata:

- `issuer` and `protected_resources`, which it checks against `poppy.json` (above). Required.
- `token_endpoint` issues Session and Account Tokens (4.2, 4.8). Required.
- `revocation_endpoint` revokes Account Tokens (4.9). Required.
- `grant_types_supported` lists the grant types the token endpoint accepts. Required, and it MUST include `urn:ietf:params:oauth:grant-type:jwt-bearer` (4.2) and `refresh_token` (4.8). It also says which of Direct and Device Sign-In the Company offers (4.4): `authorization_code` for Direct Sign-In and `urn:ietf:params:oauth:grant-type:device_code` for Device Sign-In. It MUST include `urn:ietf:params:oauth:grant-type:token-exchange` if the Company lists an MCP server that doesn't support DPoP (4.3).
- `authorization_endpoint` starts Direct Sign-In (4.5). Required if `grant_types_supported` includes `authorization_code`.
- `device_authorization_endpoint` starts Device Sign-In (4.6). Required if `grant_types_supported` includes `urn:ietf:params:oauth:grant-type:device_code`.
- `pushed_authorization_request_endpoint` accepts pushed authorization requests for Direct Sign-In (4.5). Optional.
- `scopes_supported` lists the scopes the issuer supports. Required if the Company offers any type of sign-in, and it MUST then include every account scope a Personal Agent can request (4.4). It MAY leave out scopes the Company doesn't offer Personal Agents, as RFC 8414 §2 allows ("Servers MAY choose not to advertise some supported scope values"), so an issuer that serves other clients doesn't need a separate issuer for Personal Agents to limit their scopes.

Companies MUST accept DPoP Proofs (4.3) signed with `ES256`, so every Personal Agent has an algorithm that works at every Company. A Company MAY list the algorithms it accepts in `dpop_signing_alg_values_supported`, as [RFC 9449](https://www.rfc-editor.org/rfc/rfc9449) §5.1 defines, and the list MUST then include `ES256`. Personal Agents MUST sign DPoP Proofs with `ES256` or with an algorithm from that list, except at an MCP server, where the list in the server's protected resource metadata applies (4.3). The field also tells every other OAuth client of the issuer that it supports DPoP, so a Company whose issuer serves other clients, such as MCP clients that use Bearer tokens (section 6), can leave it out.

The metadata MAY have other fields, which Personal Agents ignore. Personal Agents SHOULD cache it according to its HTTP caching headers.

### 3.3 Extensions

Extensions add optional features on top of this protocol, such as [operations](https://personalagentprotocol.org/docs/0.3/extensions/operations). A Company lists the ones it supports in `extensions`:

*Excerpt from poppy.json*

```
"extensions": {
  "operations": {
    "version": "1",
    "endpoint": "https://api.example.com/poppy/operations"
  }
}
```

- Extensions defined with this protocol have plain names, such as `operations`. Anyone else MUST start an extension's name with a domain they control, such as `example.com/gift-wrap`.
- Each entry has a `version`, the extension's major version. Changes that implementations can safely ignore keep the version, and incompatible changes get a new one. Each extension defines its other fields.
- A Personal Agent lists the extensions it supports the same way, in `extensions` in its client metadata document (4.1).
- Personal Agents and Companies MUST ignore extensions they don't support and fields they don't recognize, so either side can work with the other under this specification alone.
- A Company MAY refuse a request it handles only with an extension the Personal Agent doesn't list. It returns `extension_required` (HTTP 403) with the extension's name in `extension`. At the token endpoint and at endpoints this protocol or an extension defines, such as conversations, the error is a JSON body, like other errors there. At APIs, it goes in the `WWW-Authenticate` header, like the errors in section 6.

*Response body: Company → Personal Agent*

```
{ "error": "extension_required", "extension": "operations" }
```

## 4. Sessions and authorization

Everything a Personal Agent does at a Company happens in a Session. A Session belongs to one User, at one Company, through one Personal Agent, and ties that User's activity together across web browsing, API calls, and conversations, such as a cart or an open conversation. A Personal Agent can run several Sessions for the same User at once, for example for tasks running in parallel. Companies MAY limit what a Personal Agent can do in a Session, signed in or out.

The protocol uses two kinds of token:

| Token | What it is | Used at |
| --- | --- | --- |
| Session Token | A short-lived access token for one Session, signed in or out. It is bound to a key the Personal Agent holds (4.3). | The Company's APIs and conversations |
| Account Token | A long-lived credential from sign-in. It stands for the User's approval for this Personal Agent to use their account. It is an OAuth refresh token. | Only the Company's token endpoint, to get signed-in Session Tokens (4.8) |

A Session starts signed out: the Company knows which Personal Agent is asking and can recognize the same User over time, but not who the User is. When a task needs the User's account, the User signs in once, and the Personal Agent keeps the Account Token it gets. Later Sessions use the Account Token to start signed in without asking the User again, until the User signs out, disconnects the Personal Agent, or the Account Token expires. Ending a Session doesn't affect the Account Token.

The steps, in the order they usually happen:

| Step | Request | Result |
| --- | --- | --- |
| Start a Session (4.2) | `token_endpoint` with the Personal Agent's assertion | A new Session and a signed-out Session Token |
| Renew a Session Token (4.2) | The same, with a proof from the same Session Key | A new signed-out Session Token for the same Session |
| Sign in (4.4–4.7) | Direct, device, or Mediated Sign-In | An Account Token, and a signed-in Session Token for the current Session |
| Use the Account Token (4.8) | `token_endpoint` with the Account Token | A signed-in Session Token, for a new or existing Session |
| Sign out (4.9) | `revocation_endpoint` with the Account Token | The Account Token is revoked, and Sessions continue signed out |

The endpoints come from the Company's OAuth server metadata (3.2). Session Tokens are OAuth access tokens and Account Tokens are OAuth refresh tokens. Everything except Mediated Sign-In is built on OAuth 2.0 ([RFC 6749](https://www.rfc-editor.org/rfc/rfc6749)) with the JWT bearer grant and client authentication ([RFC 7523](https://www.rfc-editor.org/rfc/rfc7523)), PKCE ([RFC 7636](https://www.rfc-editor.org/rfc/rfc7636)), the device authorization grant ([RFC 8628](https://www.rfc-editor.org/rfc/rfc8628)), DPoP ([RFC 9449](https://www.rfc-editor.org/rfc/rfc9449)), resource indicators ([RFC 8707](https://www.rfc-editor.org/rfc/rfc8707)), and token revocation ([RFC 7009](https://www.rfc-editor.org/rfc/rfc7009)), and follows the OAuth 2.0 Security Best Current Practice ([RFC 9700](https://www.rfc-editor.org/rfc/rfc9700)). A Company can use an existing authorization server that supports them. The protocol adds the rules in this section. Token requests use only standard OAuth parameters: each Session is named by the key its tokens are bound to, the Session Key (4.3).

### 4.1 Agent identity

A Personal Agent's `client_id` MUST be an HTTPS URL that returns its metadata document. Companies fetch it to learn who the Personal Agent is, to get the keys it signs with, and to check where Direct Sign-In may return the User. This follows the OAuth Client ID Metadata Document draft that MCP also uses.

*Client metadata document, published by the Personal Agent*

```
{
  "client_id": "https://agent.example/agent.json",
  "client_name": "Example Agent",
  "logo_uri": "https://agent.example/logo.png",
  "jwks_uri": "https://agent.example/jwks.json",
  "redirect_uris": ["https://agent.example/oauth/callback"],
  "token_endpoint_auth_method": "private_key_jwt",
  "extensions": {
    "operations": { "version": "1" }
  }
}
```

- `client_id` MUST equal the URL the document was fetched from.
- `jwks_uri` and every entry in `redirect_uris` MUST be HTTPS URLs on the same domain as `client_id`. The key set contains only public keys.
- `redirect_uris` lists where Direct Sign-In may send the User back to (4.5).
- `extensions` lists the extensions the Personal Agent supports, keyed by name, each with its `version` (3.3). It is optional.
- The Personal Agent authenticates at the token endpoint with a client assertion signed by a key from `jwks_uri` (`private_key_jwt`, [RFC 7523](https://www.rfc-editor.org/rfc/rfc7523)). The same keys sign its Session assertions (4.2). Its DPoP keys (4.3) are separate and aren't published.
- The client assertion's `aud` MUST be the Company's `auth.issuer`, as a single string. Companies MUST reject a client assertion with any other `aud`, compared character for character, including their token endpoint URL. This follows [draft-ietf-oauth-rfc7523bis](https://datatracker.ietf.org/doc/draft-ietf-oauth-rfc7523bis/). The endpoints in a Company's metadata aren't checked (3.2), so an `aud` set to an endpoint could name another Company's endpoint, and that Company would accept the assertion.
- The client assertion has `iat`, `exp`, and `jti` with the same rules as a Session assertion (4.2).

Companies MAY require Personal Agents to register ahead of time. How registration works is outside this specification. A Company that requires registration rejects an unregistered Personal Agent with the OAuth `invalid_client` error (HTTP 401) when it starts a Session.

Companies MAY keep allowlists or blocklists of Personal Agents by `client_id`, and MAY revoke a `client_id` that misuses the protocol. Companies MAY rate-limit Session creation by `client_id`. A Company that doesn't require registration MAY also limit how many new `client_id` values it accepts.

### 4.2 Starting a Session

The Personal Agent MUST give each of its Users a User ID for each Company, where a Company is identified by its `auth.issuer` (3.2). The ID is stable, so the Company sees the same User across Sessions. It is opaque and different for each Company, so Companies can't match Users with each other. Because the ID is scoped by issuer, this depends on each Company having its own issuer (3.2). It MUST NOT contain or be derived from personal information, such as an email address, phone number, or name, even with a keyed hash. User IDs are pairwise subject identifiers, as in [OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html#SubjectIDTypes) §8, except that the Personal Agent assigns them, one for each pair of User and Company.

A Personal Agent MAY instead give a User a new User ID for each anonymous browsing session, like a private browser window. The Company sees a new User each time. The Personal Agent uses the ID for nothing else, discards it when the browsing session ends, and MUST NOT sign in with a Session that uses it (4.4).

The Personal Agent holds the User IDs of each of its Users at every Company, and MUST keep that mapping confidential: it MUST NOT publish it or share it with third parties, other than service providers that process it on the Personal Agent's behalf.

To start a Session, the Personal Agent requests a Session Token from the Company's `token_endpoint` with the JWT bearer grant ([RFC 7523](https://www.rfc-editor.org/rfc/rfc7523) §2.1). The assertion is a short-lived JWT signed with a key from its `jwks_uri`, naming itself in `iss` and the User in `sub`. Unlike most uses of this grant, the client issues the assertion itself: the Personal Agent obtains its own authorization, as [draft-ietf-wimse-aims](https://datatracker.ietf.org/doc/draft-ietf-wimse-aims/) §10.4.2 describes, for one User the Company knows only by User ID. Like every token request, it also carries the Personal Agent's client assertion (4.1) and a DPoP Proof (4.3). The Personal Agent creates a new Session Key for the Session and signs the proof with it.

*Request: Personal Agent → Company*

```
POST https://auth.example.com/oauth/token
Content-Type: application/x-www-form-urlencoded
DPoP: eyJ0eXAiOiJkcG9wK2p3dCIs…

grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer
&assertion=eyJhbGciOiJFUzI1NiIs…
&client_id=https%3A%2F%2Fagent.example%2Fagent.json
&client_assertion_type=urn%3Aietf%3Aparams%3Aoauth%3Aclient-assertion-type%3Ajwt-bearer
&client_assertion=eyJhbGciOiJFUzI1NiIs…
```

*Assertion claims (JWT payload)*

```
{
  "iss": "https://agent.example/agent.json",
  "sub": "usr_Q7c1vK",
  "aud": "https://auth.example.com",
  "iat": 1790900000,
  "exp": 1790900060,
  "jti": "V6vJGs2ixBAvGdaQgGaTzg"
}
```

- `iss` is the Personal Agent's `client_id` (4.1).
- `sub` is the User ID for this Company, described above.
- `aud` is the Company's `auth.issuer`, as a single string rather than an array, so the assertion can't be used at another Company. As with the client assertion (4.1), the Company MUST reject any other `aud`, compared character for character.
- `iat` and `exp` are when the assertion was issued and when it expires, in seconds since 1970 (Unix time). `exp` MUST be at most five minutes after `iat`. The assertion is short-lived: one minute in this example.
- `jti` is a unique ID for the assertion, with at least 128 random bits. The Company MUST reject a `jti` it has already seen from the same `client_id` until the assertion expires, so a copied assertion can't be used again.

The Company verifies both assertions against the Personal Agent's `jwks_uri`, checks that the assertion's `iss` is the authenticated `client_id`, rejects a reused `jti`, and returns a new Session, named by the key in the proof:

*Response: Company → Personal Agent*

```
HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: no-store

{
  "access_token": "eyJhbGciOi…Lm9x",
  "token_type": "DPoP",
  "expires_in": 3600
}
```

- `access_token` is the Session Token. `token_type` is `DPoP`. Bearer tokens for MCP servers that don't support DPoP come from Token Exchange (4.3).
- `expires_in` is the token's lifetime in seconds. The Company chooses the value, and it MUST be greater than 0. Session Tokens SHOULD last hours, not days.
- There's no `scope`, because a Session started with the assertion is signed out and has no account scopes (4.4). The grant says whether a token is signed in: this grant always returns signed-out tokens, and a sign-in (4.4) or an Account Token (4.8) always returns signed-in ones.

**Renewing.** When a signed-out Session Token expires, the Personal Agent sends the same request with fresh assertions and a proof signed with the same Session Key:

*Request: Personal Agent → Company*

```
POST https://auth.example.com/oauth/token
Content-Type: application/x-www-form-urlencoded
DPoP: eyJ0eXAiOiJkcG9wK2p3dCIs…

grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer
&assertion=eyJhbGciOiJFUzI1NiIs…
&client_id=https%3A%2F%2Fagent.example%2Fagent.json
&client_assertion_type=urn%3Aietf%3Aparams%3Aoauth%3Aclient-assertion-type%3Ajwt-bearer
&client_assertion=eyJhbGciOiJFUzI1NiIs…
```

The Company finds the Session by the proof's key, checks that it belongs to the same `client_id` and User ID as the assertion, and returns a new signed-out Session Token for it. A key that names a Session for a different `client_id` or User ID gets `invalid_grant`. A signed-in Session is renewed with the Account Token instead (4.8).

**Ended Sessions.** The Company decides how long a Session lasts. A key the Company doesn't know starts a new Session, so after a Session ends, its key would start a new one without the Personal Agent knowing. To prevent that, a Company SHOULD remember the keys of the Sessions it ended, for as long as it chooses, and reject them with `invalid_grant`. After `invalid_grant` on a Session Key, the Personal Agent MUST NOT use that key again, and starts a new Session with a new key. Because a Company can forget an ended Session's key, the Personal Agent MUST be prepared for a renewal to start a new Session, for example finding that the website no longer recognizes it (section 5).

**Token format.** Session Tokens are issued by the Company and are opaque to the Personal Agent. Personal Agents MUST NOT depend on their contents; everything they need is in the response. A Company MAY include its own Session credentials in a token so its existing systems can read them. If it does, it MUST encrypt the token.

Errors use the OAuth error response, with these codes:

| Error | Status | Meaning |
| --- | --- | --- |
| `invalid_client` | 401 | The Company doesn't accept this `client_id`: it is unregistered, blocked, or revoked, or its metadata or signature doesn't check out. |
| `invalid_grant` | 400 | The assertion or Account Token is missing, expired, reused, revoked, or malformed, or the Session Key's Session has ended or belongs to a different Personal Agent or User. |
| `account_mismatch` | 400 | The Session is, or was, signed in to a different account than the one requested. Start a new Session (4.4). |
| `invalid_target` | 400 | The `resource` is unknown, or needs a different token type: Token Exchange only for an MCP server that doesn't support DPoP (4.3). |
| `invalid_dpop_proof`, `use_dpop_nonce` | 400 | The DPoP Proof is missing or invalid, or needs a nonce (4.3). |
| `extension_required` | 403 | The Company requires an extension the Personal Agent doesn't list, named in `extension` (3.3). |
| `rate_limited` | 429 | Too many requests for this `client_id`. Retry after the time in the `Retry-After` header. |

### 4.3 Using Session Tokens

API calls and conversations MUST carry the Session Token in the `Authorization` header with the `DPoP` scheme, together with a DPoP Proof ([RFC 9449](https://www.rfc-editor.org/rfc/rfc9449)):

*Request headers: Personal Agent → Company*

```
Authorization: DPoP eyJhbGciOi…Lm9x
DPoP: eyJ0eXAiOiJkcG9wK2p3dCIs…
```

DPoP in this protocol is meant to match RFC 9449, and anything this section doesn't cover works as the RFC describes. Where this section and the RFC differ, this section applies. The choices it makes are:

- Companies MUST accept `ES256`, and listing their algorithms in `dpop_signing_alg_values_supported` is optional (3.2).
- Personal Agents MUST support nonces.
- The token endpoint MUST reject a reused `jti`. Elsewhere the check is optional, as in the RFC.
- Each Session has its own key, and the key's thumbprint names the Session at the token endpoint (below).
- An MCP server that doesn't support DPoP uses Bearer Session Tokens, each for that server only, which the Personal Agent gets by Token Exchange. Companies MUST require DPoP everywhere else (below).
- Companies MUST support `dpop_jkt` (RFC 9449 §10), and Personal Agents MUST bind the authorization code in Direct Sign-In to the Session Key (4.5).

**Session Keys.** Session Tokens are bound to a key the Personal Agent holds, so a copied token is useless without it. The Personal Agent MUST create a new key pair for each Session, its Session Key, and MUST NOT use it for any other Session, so Companies can't link Sessions or Users by their keys. The key's JWK thumbprint ([RFC 7638](https://www.rfc-editor.org/rfc/rfc7638)) names the Session: every token request for the Session carries a proof signed with its key, so the Company knows which Session the request is for without a separate parameter. A Session can't change its key. To use a new key, the Personal Agent starts a new Session. Conversations already outlast Sessions (7.2), so nothing is lost.

The Personal Agent keeps the private key to itself and signs a new proof for every request to the token endpoint, every request that carries a Session Token, and every browser-session form (section 5). Requests that carry none of these, such as revocation (4.9) and device authorization (4.6), don't need a proof. A proof is a JWT with the public key in its header:

*DPoP Proof (JWT header and payload)*

```
{
  "typ": "dpop+jwt",
  "alg": "ES256",
  "jwk": { "kty": "EC", "crv": "P-256", "x": "l8tFrhx-34tV3hRICRDY9zCkDlpBhF42UQUfWVAWBFs", "y": "9VE4jf_Ok_o64zbTTlcuNJajHmt6v9TDVrU0CdvGRDA" }
}
.
{
  "jti": "e1j3V_bKic8-LAEBq7Rw2g",
  "htm": "POST",
  "htu": "https://api.example.com/orders/ord_7Hk2/exchanges",
  "iat": 1790900000,
  "ath": "fUHyO2r2Z3DZ53EsNrWBb0xWXoaNy59IiKCAqksmQEo"
}
```

- `jti` is a unique ID for the proof.
- `htm` and `htu` are the request's HTTP method and URL, without the query or fragment.
- `iat` is when the proof was made.
- `ath` is the SHA-256 hash of the Session Token sent with it. Proofs sent to the token endpoint or in a browser-session form don't have one.
- `nonce` is included when the Company requires one (below).

When the Company issues a Session Token, it binds the token to the key in that request's proof. The Company MUST validate every proof as RFC 9449 §4.3 describes. That means checking that:

- The request has exactly one `DPoP` header, holding a well-formed JWT with the claims above.
- `typ` is `dpop+jwt`, `alg` is an asymmetric algorithm the Company accepts (3.2), never `none`, and `jwk` holds a public key and no private key.
- The proof's signature verifies with the key in its header.
- `htm` and `htu` match the request.
- The proof was made within the Company's acceptance window, such as one minute. The Company judges this by `iat`, or by when it issued the proof's `nonce`.
- `nonce` matches one the Company issued, if it requires nonces (below).
- On requests with a Session Token, the key is the one the token is bound to, and `ath` matches the token.

**Replayed proofs.** At the token endpoint, the Company MUST reject a proof whose `jti` it has already accepted within the acceptance window, because a replayed proof there could get a new token. Everywhere else it accepts DPoP Session Tokens, such as APIs and conversation endpoints, it MAY reject a reused `jti`, ideally across all its servers. RFC 9449 (§11.1) doesn't require this check, because servers behind one endpoint don't always share state. Without it, a copied proof still works only with the same Session Token (`ath`), for the same method and URL (`htm` and `htu`), and only within the acceptance window. A request that changes something then relies on being idempotent, so a replay doesn't repeat it. Conversation messages already are, through their IDs (7.3).

A Company MAY require proofs to include a nonce it issued, as RFC 9449 describes, so proofs can't be made in advance. Personal Agents MUST support nonces. A failed check returns `invalid_dpop_proof`, or `use_dpop_nonce` with the nonce to use in the `DPoP-Nonce` header. The token endpoint returns them as OAuth errors with HTTP 400 (4.2). APIs and conversation endpoints return HTTP 401 with the error in the `WWW-Authenticate: DPoP` header (section 6).

**MCP.** MCP authorization uses Bearer tokens, and many MCP servers and clients don't support DPoP. An MCP server supports DPoP if its protected resource metadata (section 6) lists `dpop_signing_alg_values_supported`, as [RFC 9728](https://www.rfc-editor.org/rfc/rfc9728) §2 defines. To get a token for an MCP server, the Personal Agent MUST include `resource` set to the MCP server's `url` from `poppy.json`, as MCP authorization requires. The token type depends on the server:

- For an MCP server that supports DPoP, the Personal Agent sends the request that starts a Session (4.2, 4.8) or renews its token (4.2, or 4.8 for a signed-in Session), and the Company issues a DPoP Session Token, which the Personal Agent uses with proofs, as at any other API.
- For an MCP server that doesn't support DPoP, the Personal Agent exchanges a DPoP Session Token for a `Bearer` one with the token exchange grant ([RFC 8693](https://www.rfc-editor.org/rfc/rfc8693)), described below. The Company MUST NOT issue a Personal Agent a Bearer Session Token any other way. It rejects a token exchange for an MCP server that supports DPoP, and any other token request for one that doesn't, with `invalid_target`.

The Personal Agent MUST use the scheme that `token_type` names. A Session can have a token for each MCP server and one for its other APIs at the same time. Anyone who copies a Bearer token can use it, so each one works at only one MCP server. Companies MUST accept a Bearer Session Token only at the MCP server whose `url` equals its `resource`, and MUST reject it at every other endpoint, including other paths on the same host. Everywhere else, Companies MUST require DPoP, and MUST reject a DPoP Session Token sent with the `Bearer` scheme (RFC 9449 §7.1). Web pages, including the browser-session page, don't use Session Tokens. The browser carries a cookie instead (section 5).

New MCP servers SHOULD support DPoP. Leaving it out is meant for existing MCP servers whose software can't verify DPoP Proofs yet. An MCP server that supports DPoP MUST list `ES256` in its `dpop_signing_alg_values_supported`, and Personal Agents sign proofs for it with `ES256` or with an algorithm from that list. It verifies proofs as this section describes, and rejects a DPoP Session Token sent with the `Bearer` scheme. It still accepts Bearer tokens from MCP clients that don't implement this protocol (section 6).

**Token Exchange.** A Company that lists an MCP server that doesn't support DPoP MUST support the token exchange grant, and list `urn:ietf:params:oauth:grant-type:token-exchange` in `grant_types_supported` (3.2). The Personal Agent sends a current DPoP Session Token as `subject_token`, with `resource`, its client assertion, and a proof signed with the Session Key:

*Request: Personal Agent → Company*

```
POST https://auth.example.com/oauth/token
Content-Type: application/x-www-form-urlencoded
DPoP: eyJ0eXAiOiJkcG9wK2p3dCIs…

grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Atoken-exchange
&subject_token=eyJhbGciOi…Qp4w
&subject_token_type=urn%3Aietf%3Aparams%3Aoauth%3Atoken-type%3Aaccess_token
&resource=https%3A%2F%2Fmcp.example.com%2Fmcp
&client_id=https%3A%2F%2Fagent.example%2Fagent.json
&client_assertion_type=urn%3Aietf%3Aparams%3Aoauth%3Aclient-assertion-type%3Ajwt-bearer
&client_assertion=eyJhbGciOiJFUzI1NiIs…
```

The Company checks that the subject token is valid, was issued to the same `client_id`, and is bound to the proof's key. It returns a Bearer Session Token for the same Session, with the subject token's scopes, or fewer if the request includes `scope`:

*Response: Company → Personal Agent*

```
{
  "access_token": "eyJhbGciOi…Mc8r",
  "issued_token_type": "urn:ietf:params:oauth:token-type:access_token",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "orders:read"
}
```

The Bearer token reflects the Session as it was when the subject token was issued. When it expires, or the Session signs in or out, the Personal Agent exchanges a current DPoP Session Token for a new one. An invalid or expired subject token gets `invalid_grant`.

**Narrower tokens.** Any token request MAY include `scope`, to ask for fewer scopes than the Session has, and `resource` ([RFC 8707](https://www.rfc-editor.org/rfc/rfc8707)), to ask for a token for one service. By default, one DPoP Session Token works at all of a Company's services, except MCP servers, which accept only tokens issued for them (above). A Company that wants separate tokens for some services gives those entries a `resource` in its `poppy.json` (section 3), and accepts a token at such a service only if it was issued for that `resource`.

- Companies MUST accept the token in the `Authorization` header without requiring cookies.
- Personal Agents MUST send a Session Token on every API and conversation request, and MUST NOT leave it out to appear to the Company as a person on their own. Web browsing follows section 5.
- Whenever the Personal Agent gets a new Session Token for a Session, it MUST use the new token from then on.
- Personal Agents MUST NOT send tokens in a URL, and Companies MUST NOT accept them from one.

**Rate limits.** A Company that limits how often a Personal Agent can make requests returns HTTP 429 with a `Retry-After` header when a request goes over the limit, on any of its endpoints, APIs, conversations, or website. The Personal Agent MUST wait at least that long before sending the request again. At the token endpoint and at endpoints this protocol or an extension defines, such as conversations and Mediated Sign-In, the body is `{"error": "rate_limited"}`. APIs and the website keep their own response bodies.

### 4.4 Signing in

A Session does not require sign-in. When a task needs account access and the Personal Agent has no Account Token that covers it (4.8), the User signs in using one of the types the Company supports. The Company's OAuth server metadata says whether it offers Direct and Device Sign-In, in `grant_types_supported` (3.2), and `auth.mediated` in its `poppy.json` describes Mediated Sign-In. A Company that offers none offers only signed-out Sessions. A Company whose issuer supports the authorization code or device grant for other clients offers Direct or Device Sign-In to Personal Agents too. A Company that wants to keep one of them from Personal Agents can use an issuer only for Personal Agents ([guides](https://personalagentprotocol.org/docs/0.3/guides#company-agent-issuer)).

| Type | Who signs in | How |
| --- | --- | --- |
| `direct` | The User | The User signs in on the Company's own page in their browser and approves access. Standard OAuth 2.0 authorization code flow (4.5). |
| `device` | The User | The Personal Agent shows the User a link and code. The User signs in on the Company's page on any device and approves access. Standard OAuth 2.0 device authorization grant (4.6). |
| `mediated` | The Personal Agent, for the User | The Personal Agent sends the User's credentials to the Company's sign-in endpoint (4.7). |

A Company can't always verify which type actually happened. For example, a Personal Agent could complete a Direct Sign-In page itself. The types work on trust: a Personal Agent MUST use direct or Device Sign-In only when the User signs in themselves. Companies MAY revoke the `client_id` of a Personal Agent that doesn't (4.1).

A Personal Agent SHOULD use Direct or Device Sign-In rather than Mediated Sign-In when the Company offers it and the scopes it can grant cover the task. With Direct and Device Sign-In, the User's password stays with the Company, and the User can see and revoke what they approved. In turn, a Company that offers Direct or Device Sign-In SHOULD make its scopes and APIs cover the tasks Users ask Personal Agents to do, so that Personal Agents don't need the User's credentials (9.5).

#### Scopes

Scopes say what account access a sign-in grants. Each Company defines its own scopes, such as `orders:read`, `orders:write`, and `addresses`, usually the OAuth scopes it already has. The protocol defines none. Names starting with `poppy:` are reserved for this protocol, so a Company's scopes can't clash with ones it defines later.

- The Company lists the scopes it supports in `scopes_supported` in its OAuth server metadata (3.2). The Personal Agent requests only scopes from that list. The list MAY leave out scopes the Company offers only to its other clients, and the Company MAY limit the scopes it grants by client, as [RFC 6749](https://www.rfc-editor.org/rfc/rfc6749#section-3.3) §3.3 allows.
- The Company MUST describe each scope in `scopes_supported`, so the Personal Agent can choose the ones a task needs: in the scopes of an OAuth 2.0 security scheme in an OpenAPI description it lists (section 6), or otherwise in `auth.scopes`. The protocol doesn't mark scopes as read-only: the Personal Agent relies on the descriptions to tell what each scope allows.
- Companies decide which operations require each scope and enforce them across web browsing, APIs, and actions performed by the Company Agent.
- Direct and Device Sign-In can grant any scope in `scopes_supported`. Mediated Sign-In can grant only the scopes in `auth.mediated.scopes`: in the discovery example, only `orders:read`. The Company MUST NOT grant scopes beyond those requested and allowed for the type used.
- Each sign-in request MUST include `scope` as a space-separated string, following [OAuth scope syntax](https://www.rfc-editor.org/rfc/rfc6749#section-3.3). Missing, unknown, or unavailable scopes are rejected with `invalid_scope`.
- A Personal Agent SHOULD request only the scopes the User's tasks need, following [RFC 9700](https://www.rfc-editor.org/rfc/rfc9700#section-2.3) §2.3.
- If a task needs more access than the Account Token allows, the User signs in again, through a type that allows the required scopes, and the Personal Agent requests all the scopes it needs. The new Account Token replaces the old one, which the Personal Agent SHOULD revoke (4.9). A pending or failed sign-in leaves existing tokens unchanged.

All three types end the same way: the Company returns an Account Token as `refresh_token`, and a signed-in Session Token for the current Session. The User may have approved fewer scopes than requested, so the Personal Agent checks `scope` before continuing. As [RFC 6749](https://www.rfc-editor.org/rfc/rfc6749) §5.1 describes, the response leaves `scope` out only when the Company granted exactly the scopes requested. A sign-in grants at least one scope: if the User approves none, it ends as a decline.

*Response: Company → Personal Agent*

```
{
  "access_token": "eyJhbGciOi…Qp4w",
  "token_type": "DPoP",
  "expires_in": 3600,
  "refresh_token": "pat_8Hk2…Wq1",
  "refresh_token_expires_in": 2592000,
  "scope": "orders:read orders:write"
}
```

- `refresh_token` is the Account Token (4.8).
- `refresh_token_expires_in` is the Account Token's lifetime in seconds, if the Company sets one. After it, the User signs in again.

#### How sign-in is remembered

The Company keeps a record for each Account Token: the `client_id`, the User ID, the account, the granted scopes, and when it expires. It also keeps a record for each Session, found by its Session Key's thumbprint: the `client_id`, the User ID, and the account the Session is signed in to, if any.

A Session is signed in to at most one account. Once it has been, it can't switch to another, even after it is signed out (4.9): the Company returns `account_mismatch`, and the Personal Agent starts a new Session. This applies to every sign-in type. If the User signs in to a different account than the Session's, the code exchange, device poll, or Mediated Sign-In returns `account_mismatch` and issues no tokens. The User then signs in again in a new Session. A User with two accounts at the same Company, such as a personal and a business account, has an Account Token for each and uses separate Sessions for them.

Each Session Token reflects the Session as it was when the token was issued. Several tasks can share one Session, so one may still hold a signed-out token after another task signed in. A request with that token is handled as signed out, and an account action fails with `insufficient_scope` (section 6). Before starting a new sign-in, the Personal Agent SHOULD check whether it already holds an Account Token that covers the task (4.8).

### 4.5 Direct Sign-In

Direct Sign-In is the OAuth 2.0 authorization code flow with PKCE ([RFC 6749](https://www.rfc-editor.org/rfc/rfc6749), [RFC 7636](https://www.rfc-editor.org/rfc/rfc7636)). It adds one thing: the code is bound to the Session Key, so the Company knows which Session to sign in, and a code taken from the redirect can't be used with any other key. The Company's OAuth server metadata gives the `authorization_endpoint` (3.2).

**1. Send the User to the Company.** The Personal Agent creates a random `state` and a PKCE code verifier, then opens the authorization URL in the User's browser, for example in a new tab, a popup, or a link sent to the User's phone. The Personal Agent MUST include `dpop_jkt` in the URL, the Session Key's thumbprint ([RFC 9449](https://www.rfc-editor.org/rfc/rfc9449) §10):

*Authorization URL, opened in the User's browser*

```
https://auth.example.com/oauth/authorize
  ?response_type=code
  &client_id=https%3A%2F%2Fagent.example%2Fagent.json
  &redirect_uri=https%3A%2F%2Fagent.example%2Foauth%2Fcallback
  &scope=orders%3Aread%20orders%3Awrite
  &state=Xq81vR
  &code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
  &code_challenge_method=S256
  &dpop_jkt=0ZcOCORZNYy-DWpqq30jZyJGHTN0d2HglBV3uiguA4I
```

A Company that supports pushed authorization requests ([RFC 9126](https://www.rfc-editor.org/rfc/rfc9126)) lists `pushed_authorization_request_endpoint` in its metadata. There, the Personal Agent MAY instead push the request with a proof signed with the Session Key, and leave out `dpop_jkt` (RFC 9449 §10.1). Either way, the Company binds the code to that key.

**2. The User signs in and approves.** The Company's page shows which Personal Agent is asking, using the name and logo from its metadata document. The User signs in however the Company allows, such as a password, a passkey, or a provider like Google or Apple. The page shows the requested scopes and lets the User approve some or all of them, or decline.

**3. The Company sends the User back.** The Company redirects the browser to `redirect_uri` with a one-time `code`, the same `state`, and its `auth.issuer` in `iss` ([RFC 9207](https://www.rfc-editor.org/rfc/rfc9207)). `redirect_uri` MUST exactly match an entry in the Personal Agent's `redirect_uris` (4.1). If the User declines, the redirect carries `error=access_denied` and `iss` instead.

**4. The Personal Agent exchanges the code.** The Personal Agent checks `state`, and MUST check that `iss` exactly matches the `auth.issuer` of the Company it started sign-in with. This stops a response from another Company's sign-in being swapped in. It then sends the code to the `token_endpoint` with its client assertion and a proof signed with the Session Key:

*Request: Personal Agent → Company*

```
POST https://auth.example.com/oauth/token
Content-Type: application/x-www-form-urlencoded
DPoP: eyJ0eXAiOiJkcG9wK2p3dCIs…

grant_type=authorization_code
&code=SplxlOBeZQQYbYS6WxSbIA
&redirect_uri=https%3A%2F%2Fagent.example%2Foauth%2Fcallback
&code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
&client_id=https%3A%2F%2Fagent.example%2Fagent.json
&client_assertion_type=urn%3Aietf%3Aparams%3Aoauth%3Aclient-assertion-type%3Ajwt-bearer
&client_assertion=eyJhbGciOiJFUzI1NiIs…
```

The Company verifies the code, the verifier, and the client assertion, checks that the proof's key is the one the code is bound to, and checks that the key's Session belongs to the same `client_id`. It returns an Account Token and a signed-in Session Token for that Session, as shown in 4.4. Errors follow OAuth 2.0, such as `invalid_grant` for an expired or reused code, or a proof from a different key.

### 4.6 Device Sign-In

Device Sign-In is the OAuth 2.0 device authorization grant ([RFC 8628](https://www.rfc-editor.org/rfc/rfc8628)). The Personal Agent shows the User a link and a short code, and the User signs in on the Company's page on whatever device they like, such as their phone. It suits Personal Agents that can't receive a browser redirect, and Companies that already offer this kind of sign-in. The Company's OAuth server metadata gives the `device_authorization_endpoint` (3.2).

Device Sign-In is a cross-device flow, and it is easier to use for phishing than Direct Sign-In: whoever holds the `device_code` gets the tokens, so an attacker can start a request and persuade the User to approve it ([RFC 10027](https://www.rfc-editor.org/rfc/rfc10027) §4.1.1). Companies that offer Device Sign-In and Personal Agents that use it MUST follow the best practices in RFC 10027 (BCP 247) §2. They include its protocol selection guidance, which says to use the device authorization grant only when other cross-device flows aren't viable (§6.2.1.5), so a Personal Agent uses Direct Sign-In when it can.

**1. Start the request.** The Personal Agent sends the scopes it needs, with its client assertion:

*Request: Personal Agent → Company*

```
POST https://auth.example.com/oauth/device
Content-Type: application/x-www-form-urlencoded

scope=orders%3Aread%20orders%3Awrite
&client_id=https%3A%2F%2Fagent.example%2Fagent.json
&client_assertion_type=urn%3Aietf%3Aparams%3Aoauth%3Aclient-assertion-type%3Ajwt-bearer
&client_assertion=eyJhbGciOiJFUzI1NiIs…
```

*Response: Company → Personal Agent*

```
{
  "device_code": "GmRhmhcxhwAzkoEqiMEg_DnyEysNkuNhszIySk9eS",
  "user_code": "WDJB-MJHT",
  "verification_uri": "https://auth.example.com/device",
  "verification_uri_complete": "https://auth.example.com/device?user_code=WDJB-MJHT",
  "expires_in": 600,
  "interval": 5
}
```

**2. The User signs in and approves.** The Personal Agent shows the User `verification_uri` and `user_code`, or `verification_uri_complete` as a link or QR code. It keeps `device_code` private. Before showing them, the Personal Agent MUST check that the link's host is the host of `auth.issuer` or of a URL in the issuer's `protected_resources` (3.2), or a subdomain of either, and MUST show the Company's `organization.name` and domain with them. Otherwise a Company could pass off another Company's sign-in page as its own, and the User would approve a sign-in there for the Company that asked. The Company's page shows which Personal Agent is asking and the requested scopes, as in Direct Sign-In, and the User approves some or all of them, or declines. Opening the link MUST NOT approve the request by itself.

**3. The Personal Agent waits.** Every `interval` seconds, the Personal Agent asks the `token_endpoint` whether the User has finished, with a proof signed with the Session Key:

*Request: Personal Agent → Company*

```
POST https://auth.example.com/oauth/token
Content-Type: application/x-www-form-urlencoded
DPoP: eyJ0eXAiOiJkcG9wK2p3dCIs…

grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code
&device_code=GmRhmhcxhwAzkoEqiMEg_DnyEysNkuNhszIySk9eS
&client_id=https%3A%2F%2Fagent.example%2Fagent.json
&client_assertion_type=urn%3Aietf%3Aparams%3Aoauth%3Aclient-assertion-type%3Ajwt-bearer
&client_assertion=eyJhbGciOiJFUzI1NiIs…
```

The device authorization request in step 1 carries no proof, so the Company binds the `device_code` to the key of the first poll's proof, and returns `invalid_grant` to a poll with any other key. Once the User approves, the Company signs in that key's Session.

Until the User finishes, the Company returns `authorization_pending`, or `slow_down` to ask the Personal Agent to wait longer between requests. Once the User approves, it returns an Account Token and a signed-in Session Token, as shown in 4.4. If the User declines, it returns `access_denied`, and if the request runs past `expires_in`, `expired_token`. The Personal Agent stops asking after either.

### 4.7 Mediated Sign-In

In Mediated Sign-In, the Personal Agent signs in for the User with credentials the User has given it for this Company. This is not an OAuth flow. The protocol defines the requests and responses so that every Company that offers Mediated Sign-In handles it the same way.

**Mediated Sign-In is transitional.** It lets Personal Agents sign in at Companies that can't offer Direct or Device Sign-In yet. It isn't where the protocol is headed, in the same way that OAuth's password grant was a transitional step that OAuth 2.1 removes. A Company SHOULD offer Mediated Sign-In only until it can add Direct or Device Sign-In, and SHOULD stop offering it once those cover the scopes it grants. The protocol plans to remove Mediated Sign-In, on a date set when version 1.0 is published. After that, the community will look for ways to encourage the Companies that still offer it to move to Direct or Device Sign-In.

Companies ask for different credentials, such as an email and password, or an account number and PIN. `auth.mediated.fields` lists the ones the Company needs:

*Excerpt from poppy.json*

```
"fields": [
  { "name": "email", "label": "Email", "secret": false },
  { "name": "password", "label": "Password", "secret": true }
]
```

- `name` is the key the Personal Agent sends.
- `label` is what to ask the User for.
- `secret` marks a value the Personal Agent MUST protect: never shown back to the User, written to logs, or sent anywhere else.

The Personal Agent sends every field in `credentials` to `auth.mediated.endpoint`, with its current Session Token:

*Request: Personal Agent → Company*

```
POST https://auth.example.com/poppy/sign-in
Authorization: DPoP eyJhbGciOi…Lm9x
DPoP: eyJ0eXAiOiJkcG9wK2p3dCIs…
Content-Type: application/json

{
  "scope": "orders:read",
  "credentials": { "email": "…", "password": "…" }
}
```

If the credentials are correct and nothing else is needed, the Company signs in the Session and returns `complete` with the same fields as the response in 4.4:

*Response: Company → Personal Agent*

```
{
  "status": "complete",
  "access_token": "eyJhbGciOi…Qp4w",
  "token_type": "DPoP",
  "expires_in": 3600,
  "refresh_token": "pat_3Vn7…Lk2",
  "scope": "orders:read"
}
```

**One-time codes.** If the Company needs a second step, it sends the User a one-time code and returns a sign-in ID instead:

*Response: Company → Personal Agent*

```
{
  "status": "code_required",
  "sign_in_id": "sgn_3Hq8",
  "code": { "sent_to": "Text to the phone number ending in 71" },
  "expires_at": "2026-10-02T17:15:00-07:00"
}
```

The Personal Agent gets the code from the User and submits only the code, not the credentials again, with a Session Token for the same Session:

*Request: Personal Agent → Company*

```
POST https://auth.example.com/poppy/sign-in/sgn_3Hq8
Authorization: DPoP eyJhbGciOi…Lm9x
DPoP: eyJ0eXAiOiJkcG9wK2p3dCIs…
Content-Type: application/json

{ "code": "…" }
```

A correct code returns `complete` with the tokens. A wrong code returns `code_required` again, until the Company's attempt limit, and then `failed`. Only the Session that started a sign-in can finish it.

| Status | Meaning |
| --- | --- |
| `complete` | Signed in. The response includes the Account Token, the new Session Token, and the granted `scope`. |
| `code_required` | The Company sent the User a one-time code. Submit it to continue. |
| `failed` | Sign-in didn't succeed, for example a wrong password or too many wrong codes. |
| `expired` | The sign-in took longer than `expires_at`. Start again. |

Every status comes with HTTP 200. Once a sign-in is `failed` or `expired`, submitting a code to it returns the same status again. Problems with the request itself are errors with a JSON body, as at the token endpoint:

| Error | Status | Meaning |
| --- | --- | --- |
| `invalid_scope` | 400 | The scopes are missing, unknown, or not available for Mediated Sign-In (4.4). |
| `account_mismatch` | 400 | The Session is, or was, signed in to a different account than the credentials are for (4.4). |
| `sign_in_not_found` | 404 | The `sign_in_id` is unknown or was started by a different Session. Both return the same error. |

Accepting credentials from a Personal Agent puts more responsibility on the Company than Direct Sign-In does. A Company that offers Mediated Sign-In MUST rate-limit attempts, MUST NOT return credentials in any response, and SHOULD require a one-time code when a sign-in looks unusual. Personal Agents MUST NOT send credentials to any endpoint other than the Company's `auth.mediated.endpoint`. A Personal Agent MUST choose which stored credentials to send by the Company's `auth.issuer`, never by the field labels or the endpoint, and MUST show the Company's `organization.name` and domain whenever it asks the User for credentials or a code. Otherwise a Company could ask for another Company's password, or for a code another Company sent the User. Once it has an Account Token, the Personal Agent doesn't need the credentials to start signed-in Sessions.

After a sign-in ends, as `complete`, `failed`, or `expired`, the Personal Agent MUST either discard the credentials or keep them only in a credential store the User chose, such as a password manager. It MUST NOT keep them anywhere else, including model context and logs. After the User or the Company revokes the Personal Agent's access (4.9), the Personal Agent SHOULD NOT sign in again with stored credentials unless the User asks it to. Otherwise a stored password could undo the User's decision to disconnect it.

### 4.8 Account Tokens

An Account Token lets the Personal Agent get signed-in Session Tokens later without asking the User to sign in again. It is the OAuth refresh token from sign-in ([RFC 6749, section 6](https://www.rfc-editor.org/rfc/rfc6749#section-6)).

The Personal Agent sends the Account Token to the `token_endpoint` with its client assertion and a DPoP Proof. With a proof signed with an existing Session's key, it gets a token for that Session, signing it in if it was signed out. With a proof signed with a new Session Key, it starts a new Session that is already signed in:

*Request: Personal Agent → Company*

```
POST https://auth.example.com/oauth/token
Content-Type: application/x-www-form-urlencoded
DPoP: eyJ0eXAiOiJkcG9wK2p3dCIs…

grant_type=refresh_token
&refresh_token=pat_8Hk2…Wq1
&scope=orders%3Aread
&client_id=https%3A%2F%2Fagent.example%2Fagent.json
&client_assertion_type=urn%3Aietf%3Aparams%3Aoauth%3Aclient-assertion-type%3Ajwt-bearer
&client_assertion=eyJhbGciOiJFUzI1NiIs…
```

The response has the same fields as in 4.4, without a new `refresh_token` unless the Company rotates it (below).

- Companies MUST accept an Account Token only at their `token_endpoint` and `revocation_endpoint`, and only from the `client_id` it was issued to, authenticated by its client assertion. A copied Account Token is useless without the Personal Agent's private key.
- The Session MUST belong to the same `client_id` and User ID as the Account Token, and MUST NOT have been signed in to a different account, even if it is now signed out (4.4). Otherwise the Company returns `invalid_grant` or `account_mismatch`.
- `scope` MAY ask for fewer scopes than the Account Token has, for example read-only access for a task that only looks things up. It can't ask for more.
- Using an Account Token doesn't extend its lifetime. A Company MAY return a new Account Token in `refresh_token`. The Personal Agent then MUST use the new one from then on.
- When the Account Token has expired or been revoked, the Company returns `invalid_grant`. The Session continues signed out, and the User signs in again when a task needs the account. With an existing Session's key, `invalid_grant` can also mean the Session has ended. To tell them apart, the Personal Agent renews the Session with its assertion (4.2): `invalid_grant` there means the Session has ended.
- The Company doesn't bind the Account Token to a Session Key, so one Account Token can start Sessions with different keys. RFC 9449 §5 binds refresh tokens only for public clients, and Personal Agents are confidential clients (4.1).
- Personal Agents MUST store Account Tokens as secrets, and MUST NOT put them in model context, conversation messages, logs, or URLs.

### 4.9 Signing out

Signing out removes the Personal Agent's access to the User's account. The Personal Agent revokes its Account Token at the Company's `revocation_endpoint` ([RFC 7009](https://www.rfc-editor.org/rfc/rfc7009)), with its client assertion:

*Request: Personal Agent → Company*

```
POST https://auth.example.com/oauth/revoke
Content-Type: application/x-www-form-urlencoded

token=pat_8Hk2…Wq1
&token_type_hint=refresh_token
&client_id=https%3A%2F%2Fagent.example%2Fagent.json
&client_assertion_type=urn%3Aietf%3Aparams%3Aoauth%3Aclient-assertion-type%3Ajwt-bearer
&client_assertion=eyJhbGciOiJFUzI1NiIs…
```

The Company revokes the Account Token and signs out every Session signed in with it. Usually those Sessions continue signed out, as described below: the Personal Agent renews them with its assertion (4.2) and gets signed-out Session Tokens. Such a Session can be signed in again only to the same account (4.4). A Company MAY end the Sessions instead, if its policy is to clear everything at sign-out. Renewal then returns `invalid_grant`, and the Personal Agent starts a new Session.

As [RFC 7009](https://www.rfc-editor.org/rfc/rfc7009) §2.1 describes, the Company SHOULD also invalidate the Session Tokens issued under the same sign-in, so sign-out takes effect right away. A Company that can't invalidate them SHOULD check on each request whether the Session is still signed in, and one that does neither SHOULD use much shorter Session Token lifetimes, such as a few minutes.

A Session Token expiring isn't a sign-out. Work the Company accepted with a valid token, such as a long-running job, can continue after that token expires. When the account's access is revoked, by sign-out or by the User disconnecting the Personal Agent, the Company MAY stop work in progress that uses the account, or let it finish.

To end a Session without signing out, the Personal Agent stops using it. The Account Token is unaffected and can start new Sessions.

The User can also disconnect the Personal Agent from the Company's account settings. That revokes the Personal Agent's Account Tokens for that account and signs out its Sessions. The Personal Agent finds out when a request fails with `invalid_token` or `insufficient_scope`, or the token endpoint returns `invalid_grant` for the Account Token. It then continues signed out.

**After sign-out.** When a Session continues signed out, after the User signs out or disconnects the Personal Agent:

- What doesn't need the account carries on, such as a cart or a conversation that hasn't used the account.
- Anything that used the account, such as a conversation (7.11) or an operation ([Operations extension](https://personalagentprotocol.org/docs/0.3/extensions/operations#ownership)), stays as it is, but the Company answers a request on it with a signed-out token with `insufficient_scope`. A conversation stays open, so the User can sign in again and continue it.
- The Personal Agent SHOULD NOT sign in to that account again unless the User asks, even when a request gets `insufficient_scope`.

## 5. Web browsing

A Personal Agent can browse the Company's website in the same Session it uses for APIs and conversations, so the Company sees one Session for the User, whether or not the User is signed in. The Personal Agent's browser joins the Session through a form on the Company's browser-session page. The page gives the browser a one-time code. The Personal Agent signs a DPoP Proof over that code with its Session Key and has the browser submit the form, and the Company answers with a cookie for the Session. Only the browser that loaded the page can submit its code, and only the Personal Agent that holds the Session Key can sign the proof, so no one else can make a browser join the Session (9.6).

This is optional. A Company that supports it lists `web.browser_session_endpoint` in its `poppy.json` (section 3). When it does, the Personal Agent MUST join its browser to a Session before browsing the Company's website. On a website without the endpoint, the Personal Agent browses as an ordinary signed-out visitor.

**1. The browser opens the page.** The Personal Agent has its browser load the endpoint with a GET, as a top-level navigation. The Company responds with an HTML page with a form, and sets a short-lived cookie that ties the form's code to this browser:

*Request: Personal Agent's browser → Company*

```
GET https://example.com/poppy/browser-session
```

*Response: Company → Personal Agent's browser*

```
HTTP/1.1 200 OK
Content-Type: text/html
Cache-Control: no-store
Content-Security-Policy: frame-ancestors 'none'
Cross-Origin-Opener-Policy: same-origin
Set-Cookie: __Host-poppy_join=Jq7mW2…; Path=/; Max-Age=60; Secure; HttpOnly; SameSite=Strict

<!doctype html>
<title>Connecting</title>
<form method="post" action="/poppy/browser-session">
  <input type="hidden" name="code" value="bc_Vn3qT8xLw2Rk9mZ4yHc1Ad">
  <input type="text" name="proof">
</form>
```

- The form has a hidden field named `code` with a one-time code, and an empty text field named `proof`, and posts to the endpoint.
- The Company MUST make the code at least 128 random bits, and MUST expire it no more than 60 seconds after issuing it.
- The Company MUST tie the code to the browser that loaded the page with a cookie set in the same response, so that only that browser can submit it. The cookie MUST be `Secure`, `HttpOnly`, and `SameSite=Strict`, and MUST use the `__Host-` prefix, so other hosts on the Company's domain can't set it in a victim's browser. The Company chooses its name and value, and can keep the code and cookie on its servers, or make them stateless, for example by putting a keyed hash of the code and its expiry in the cookie.
- The Company MUST send the response with `Cache-Control: no-store`. It MUST forbid other pages from framing it, with `Content-Security-Policy: frame-ancestors 'none'`, and from keeping a reference to its window, with `Cross-Origin-Opener-Policy: same-origin`.
- Loading the page MUST NOT start, end, or change any Session, or change the browser's other cookies.

**2. The Personal Agent signs a proof and submits the form.** The Personal Agent reads the code from the page in its browser and signs a DPoP Proof (4.3) with the Session Key of the Session the browser joins, signed in or out. The proof's `htm` is `POST`, its `htu` is the endpoint, and its `nonce` is the code, as a nonce the Company issued ([RFC 9449](https://www.rfc-editor.org/rfc/rfc9449) §8). It has no `ath`. The Personal Agent puts the proof in the `proof` field and has its browser submit the form:

*Request: Personal Agent's browser → Company*

```
POST https://example.com/poppy/browser-session
Content-Type: application/x-www-form-urlencoded
Cookie: __Host-poppy_join=Jq7mW2…

code=bc_Vn3qT8xLw2Rk9mZ4yHc1Ad&proof=eyJ0eXAiOiJkcG9wK2p3dCIs…
```

The Personal Agent MUST take the code only from the page its own browser loaded from the endpoint in step 1, and MUST NOT sign a proof over a code from anywhere else, such as a message, a conversation, or another page. A code from anywhere else may come from someone else's browser, which would then join the User's Session (9.6). The Personal Agent reads the code and signs the proof in software its model can't read (9.2).

**3. The Company sets the Session's cookie.** The Company MUST check that:

- The request has the cookie from step 1, and it matches `code`.
- The code is one it issued, hasn't expired, and hasn't been used. A code is used by the first request that sends it, whatever the result.
- `proof` is a valid DPoP Proof, checked as in 4.3, for this request: `htm` is `POST`, `htu` is the endpoint, and `nonce` is the code.
- The proof's key is the Session Key of an active Session (4.3). Unlike at the token endpoint, a key the Company doesn't know is an error, not a new Session.

If every check passes, the Company sets its cookie for that Session in the response, clears the cookie from step 1, and responds with `303 See Other` to a page on its website. If not, it sets no cookie and returns an error page, with HTTP 400, or 429 when the browser sends too many requests. After an error, the Personal Agent starts again at step 1.

**4. The browser browses.** The Personal Agent then has its browser open any page on the website. The browser sends the cookie, and the Company handles its requests as the Session:

*Request: Personal Agent's browser → Company*

```
GET https://example.com/orders
Cookie: __Host-sb_session=Pz81kQ…
```

**The cookie.** The Session's cookie is the Company's own. The Company chooses its name, value, the hosts it covers, and its lifetime, and links it to the Session on its servers. The cookie:

- MUST be set only in step 3.
- MUST follow the Session's current state: when the Session signs in or out, or its scopes change, the website reflects it on the next request.
- MUST NOT outlive the Session.
- MUST be `Secure` and `HttpOnly`. It SHOULD use the `__Host-` prefix ([RFC 6265bis](https://datatracker.ietf.org/doc/draft-ietf-httpbis-rfc6265bis/)), so other hosts on the Company's domain can't set it, unless it has to cover several hosts.

The website applies the Session's scopes, as the Company's APIs do. While the browser carries the Session's cookie, the Company handles its requests as that Session, signed in or out, whatever other cookies the browser holds from earlier visits. When the website refuses an action because the Session lacks a scope, it SHOULD show a visible error message that names the missing scopes, so the Personal Agent can request them (4.4).

The Personal Agent MAY join again at any time, for example when the website no longer recognizes the Session. Each time, step 3 replaces the cookie the Company set before.

## 6. APIs

A Company can list APIs in its `poppy.json` (section 3). Each API's `type` MUST be one of these:

| Type | `url` points to | Specification |
| --- | --- | --- |
| `openapi` | An OpenAPI 3.0 or 3.1 description of the API. | [OpenAPI Specification 3.1](https://spec.openapis.org/oas/v3.1.1.html) |
| `mcp` | A remote MCP server endpoint, using the Streamable HTTP transport and MCP version 2025-06-18 or later. | [Model Context Protocol 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18) |

Personal Agents SHOULD skip API types they don't recognize, so later versions can add types. The protocol leaves each API's schema to that API. Every listed API MUST accept Session Tokens as described in 4.3: DPoP for OpenAPI, and for MCP, DPoP if the server supports it and Bearer if it doesn't.

A listed MCP server MUST accept Session Tokens as its access tokens and enforce their scopes. It MUST accept only tokens issued for its `url` (4.3). MCP clients find where to get a token from the server's protected resource metadata ([RFC 9728](https://www.rfc-editor.org/rfc/rfc9728)), and its `authorization_servers` MUST include `auth.issuer`. An MCP client that doesn't implement this protocol can then sign in with MCP's own authorization flow, and the Company treats that sign-in as starting a new signed-in Session. Such a Session has no User ID, so the User ID rules (4.2) don't apply: it belongs to the MCP client and the signed-in account. It can't continue signed out, so it ends when the sign-in is revoked or expires.

The Personal Agent calls a Company API the way that API's type describes, with the token in the `Authorization` header:

*Request: Personal Agent → Company*

```
POST https://api.example.com/orders/ord_7Hk2/exchanges
Authorization: DPoP eyJhbGciOi…Qp4w
DPoP: eyJ0eXAiOiJkcG9wK2p3dCIs…
Content-Type: application/json
Idempotency-Key: 4f1c2e8a-9b7d-4c3e-a5f6-0d8b1e2c3a4f

{ "item_id": "itm_4Qa", "replacement_sku": "stormline-insulated-m" }
```

These errors are returned in the `WWW-Authenticate` header ([RFC 9449](https://www.rfc-editor.org/rfc/rfc9449), or [RFC 6750](https://www.rfc-editor.org/rfc/rfc6750) for Bearer tokens). An MCP server's 401 responses carry a challenge for each scheme it accepts, `Bearer` and, if it supports DPoP, `DPoP`, and each challenge includes `resource_metadata` with the server's protected resource metadata URL ([RFC 9728](https://www.rfc-editor.org/rfc/rfc9728) §5.1):

| Error | Status | Meaning |
| --- | --- | --- |
| `invalid_token` | 401 | The token is missing or expired. The Personal Agent gets a new one (4.2, 4.8). |
| `invalid_dpop_proof` | 401 | The DPoP Proof is missing or invalid (4.3). |
| `use_dpop_nonce` | 401 | The Company requires a nonce, given in the `DPoP-Nonce` header (4.3). The Personal Agent retries with a new proof that includes it. |
| `insufficient_scope` | 403 | The token lacks the scopes the request needs, which the response names in the `scope` attribute. A signed-out token has no scopes, so this is also the answer to a request that needs the User's account. The Personal Agent uses an Account Token that covers them (4.8), or signs in (4.4), and retries, unless the User signed out or disconnected it (4.9). |
| `extension_required` | 403 | The request needs an extension the Personal Agent doesn't list, named in the `extension` attribute (3.3). An MCP server returns it only to refuse the Personal Agent entirely, not for one tool. |

Because every token is issued to a known `client_id` and User, the Company always knows a request comes from a Personal Agent, which one, and for which User.

*Response: Company → Personal Agent*

```
HTTP/1.1 403 Forbidden
WWW-Authenticate: DPoP error="insufficient_scope", scope="orders:read orders:write"
```

## 7. Conversations

A conversation is how the Personal Agent and the Company talk. The Personal Agent talks with the Company on the User's behalf, and brings decisions back to the User when needed. Each message says whether a person or an AI wrote it (7.8).

When the User wants to talk with the Company themselves, or the Company asks for them, the Personal Agent opens a Direct Conversation (7.10): a new conversation, linked to the first, that the User sees and takes part in. The User doesn't have to read the exchange between the two agents that came before it.

### 7.1 Conversation protocols

A Company lists one or more conversation protocols in `agent.protocols`. Each entry has a `type` and an `endpoint`. The Personal Agent chooses a protocol it supports and uses that entry's endpoint for the conversation. It skips unfamiliar types. The currently defined protocol is:

| Type | Protocol | Reference |
| --- | --- | --- |
| `poppy` | Personal Agent Protocol conversations | The message, event, and streaming format defined in 7.2–7.13 below. |

### 7.2 Requests

Personal Agent Protocol conversations use JSON over HTTPS. Below, `{endpoint}` is the `endpoint` of the selected `poppy` entry, and `{id}` is a Conversation ID. Every request carries a Session Token with a DPoP Proof (4.3).

| Request | Purpose |
| --- | --- |
| `POST {endpoint}` | Start a conversation with its first message (7.3), or a Direct Conversation (7.10). |
| `POST {endpoint}/{id}/messages` | Send another message (7.3). |
| `GET {endpoint}/{id}/events` | Read messages and other events, or stream them (7.5, 7.6). |
| `POST {endpoint}/{id}/handoff` | Ask for a person at the Company (7.9). |
| `POST {endpoint}/{id}/close` | Close the conversation (7.12). |

A conversation belongs to the Personal Agent's `client_id` and the User ID that started it. Once it uses the User's account, it belongs to that account instead. Any Session that matches can continue it, so a conversation can outlast the Session that started it. The Company MUST reject requests from any other `client_id`, User, or account.

**IDs.** Conversation IDs, message IDs, and event IDs are strings of 1 to 256 characters from the URL-safe base64 alphabet ([RFC 4648, section 5](https://www.rfc-editor.org/rfc/rfc4648#section-5)): letters, digits, `-`, and `_`. They SHOULD start with a short prefix for their kind, such as `cnv_`, `msg_`, or `evt_`. The Company chooses Conversation IDs and event IDs, and the Personal Agent chooses message IDs for its own messages. Beyond these rules, the side that chooses an ID decides its format, and the other side MUST NOT depend on it.

### 7.3 Sending messages

A new conversation starts with its first message:

*Request: Personal Agent → Company*

```
POST https://api.example.com/poppy/conversations
Authorization: DPoP eyJhbGciOi…Qp4w
DPoP: eyJ0eXAiOiJkcG9wK2p3dCIs…
Content-Type: application/json

{
  "message": {
    "id": "msg_Yq3v8LrT0aWc5NkE",
    "sender": "agent",
    "text": "The jacket from order #1042 isn't warm enough. The user wants to return it.",
    "context": { "locale": "en-US", "time_zone": "America/Los_Angeles", "user_available": true }
  }
}
```

The Company returns the new conversation's ID:

*Response: Company → Personal Agent*

```
HTTP/1.1 201 Created
Content-Type: application/json

{
  "conversation_id": "cnv_8f3Kd2",
  "status": "working",
  "responder": "agent"
}
```

Later messages go to the conversation's `messages` URL, which returns HTTP 202 with the same fields:

*Request: Personal Agent → Company*

```
POST https://api.example.com/poppy/conversations/cnv_8f3Kd2/messages
Authorization: DPoP eyJhbGciOi…Qp4w
DPoP: eyJ0eXAiOiJkcG9wK2p3dCIs…
Content-Type: application/json

{
  "message": { "id": "msg_Hc72PwZn4eKs1QxB", "sender": "agent", "text": "Does the insulated version come in medium?" }
}
```

**Message IDs.** The Personal Agent chooses each message's `id`, and MUST make it unique for the User. To retry a message, it sends it again with the same ID. If the Company has already accepted a message with that ID and the same content, it returns the original response and doesn't add the message again. Because the ID is unique for the User rather than for one conversation, the Company can recognize a retried first message and return the conversation it already started. If the content is different, the Company returns `message_id_conflict`. The Company keeps this check for as long as it keeps the conversation.

**Replies in the response.** To get the Company's reply in the same request, the Personal Agent adds the `wait` query parameter to either `POST`, and `cursor` if it has one. The Company accepts the message, then responds as a read of the conversation's events from that cursor would (7.5), holding the request for up to `wait` seconds. Without a cursor, it reads from the start of the conversation. The status code stays 201 or 202:

*Request: Personal Agent → Company*

```
POST https://api.example.com/poppy/conversations/cnv_8f3Kd2/messages?cursor=evt_c2&wait=10
Authorization: DPoP eyJhbGciOi…Qp4w
DPoP: eyJ0eXAiOiJkcG9wK2p3dCIs…
Content-Type: application/json

{
  "message": { "id": "msg_Tb5nRw8Ke2Lp0VsD", "sender": "agent", "text": "Medium, please." }
}
```

### 7.4 Message fields

| Field | Req. | Description |
| --- | --- | --- |
| `id` | Yes | The message's ID, chosen by the Personal Agent and unique for the User (7.3). |
| `role` | No | `user` or `company`, the side the message came from. The Company sets it when it records the message as an event (7.5). The Personal Agent doesn't send it, and the Company ignores it if sent. |
| `sender` | Yes | `agent` if the Personal Agent wrote the message, `human` if the User wrote it (7.8). |
| `text` | No | The message in natural language. |
| `data` | No | A JSON object for structured details that would need markup, like a list or a table, to fit in a sentence. The protocol doesn't define its keys. |
| `context` | No | Facts about the User's situation, such as `locale`, `time_zone`, and `user_available` (below). |

A message MUST have at least one of `text`, `data`, or `context`.

Use `text` for the message itself, including simple values like an email address or an order number. Use `data` for structured details that would otherwise need markup to fit in a sentence. Personal Agents and Company Agents SHOULD NOT put JSON or other markup in `text`. The Company Agent's replies use `data` the same way.

For example, choosing seats for a family of six, with their loyalty and security numbers:

*Message: Personal Agent → Company*

```
{
  "id": "msg_Ns8dXo1Gv6JpUa3C",
  "sender": "agent",
  "text": "The user would like seats together for their family of six on flight SB 482.",
  "data": {
    "travelers": [
      { "name": "Dana Reyes", "seat": "14A", "frequent_flyer": "SB 4821 9930", "known_traveler": "TT7K2M9QX" },
      { "name": "Sam Reyes", "seat": "14B", "frequent_flyer": "SB 4821 9947", "known_traveler": "TT9W4R1LD" },
      { "name": "Ava Reyes", "seat": "14C", "frequent_flyer": "SB 5530 1182" },
      { "name": "Leo Reyes", "seat": "15A" },
      { "name": "Mia Reyes", "seat": "15B" },
      { "name": "Noah Reyes", "seat": "15C" }
    ]
  }
}
```

The Personal Agent decides how much of the User's situation to share, and sharing more up front saves rounds of back-and-forth.

**Context.** `context` holds facts about the User's situation that affect how the Company replies, so the Personal Agent doesn't have to write them into the text. The Company gives it to the Company Agent along with the messages. When a Personal Agent shares one of these facts, it MUST use the field and format defined here:

- `locale` is a language tag such as `en-US` ([RFC 5646](https://www.rfc-editor.org/rfc/rfc5646)), for the language and formatting of replies.
- `time_zone` is an IANA time zone name such as `America/Los_Angeles`, for reading and showing times.
- `user_available` is `true` if the User can answer questions right now.

`context` MAY include other fields, such as accessibility needs or preferred units. The Company Agent interprets them as it sees fit, and a Company MAY ignore them. Details of the request itself belong in `text` or `data`, not `context`. Personal Agents SHOULD share only what the task needs.

Any message can carry `context`, and fields it leaves out keep their previous values. A message with only `context` updates it without saying anything else, for example when the User steps away:

*Message: Personal Agent → Company*

```
{
  "id": "msg_Lw0eFj7Tc2RbVy5H",
  "sender": "agent",
  "context": { "user_available": false }
}
```

Company messages have `id`, `role`, `sender`, `text`, and `data`, with an ID the Company chooses. Only the Personal Agent sends `context`. Extensions can add fields, such as `operation` in the [Operations extension](https://personalagentprotocol.org/docs/0.3/extensions/operations#binding-conversations).

### 7.5 Reading events

The Company records each conversation as an ordered list of events: the messages from both sides, and changes to the conversation. The Personal Agent reads the events after the last cursor it saved:

*Request: Personal Agent → Company*

```
GET https://api.example.com/poppy/conversations/cnv_8f3Kd2/events?cursor=evt_c1&wait=30
Authorization: DPoP eyJhbGciOi…Qp4w
DPoP: eyJ0eXAiOiJkcG9wK2p3dCIs…
```

*Response: Company → Personal Agent*

```
{
  "conversation_id": "cnv_8f3Kd2",
  "events": [
    {
      "id": "evt_c2",
      "type": "message",
      "created_at": "2026-10-08T19:03:00Z",
      "message": {
        "id": "msg_r2Kq",
        "role": "company",
        "sender": "agent",
        "text": "I can do that. The insulated version would be warmer. Want to exchange instead for $70 more?",
        "data": { "replacement_sku": "stormline-insulated-m", "price_difference": 70 }
      }
    }
  ],
  "cursor": "evt_c2",
  "has_more": false,
  "status": "idle",
  "responder": "agent"
}
```

Every event has an `id`, a `type`, and a `created_at` time ([RFC 3339](https://www.rfc-editor.org/rfc/rfc3339)). The type says which other fields it has:

| Type | Fields |
| --- | --- |
| `message` | `message`: a message from either side, as it was sent, with `role` set by the Company to `user` or `company` for the side it came from. Every message the Company accepts is recorded, including one with only `context`. |
| `state` | `status` and `responder`, after either one changes. See 7.7 for their values. |
| `authorization` | `error`, and `scope` when needed: the Company needs sign-in or more scopes (7.11). |
| `user_requested` | `reason`: the Company asks to talk with the User directly (7.10). |
| `direct_opened`, `direct_closed` | `conversation_id`: a Direct Conversation linked to this one opened or closed (7.10). |

Personal Agents MUST skip event types they don't recognize, so later versions and extensions can add types.

- `cursor` and `wait` are query parameters, here and on the `POST` requests in 7.3.
- Each event's `id` is also a cursor. Without a `cursor`, the read starts at the beginning of the conversation. Cursors are opaque, so the Personal Agent MUST NOT compare or sort them.
- `wait` is a whole number of seconds, 0 or more. The Company holds the request for up to `wait` seconds until there is an event to return. It MAY return sooner, or cap `wait`: a larger `wait` is held only as long as the cap, not rejected. Without `wait`, it returns right away. A read that times out returns an empty `events` list.
- Every successful read MUST include `conversation_id`, `events`, `cursor`, `has_more`, `status`, and `responder`, with `events` empty when there are none. `cursor` is the last event returned, or the request's cursor if there were none. When `has_more` is `true`, the Personal Agent reads again right away.
- The Personal Agent handles events in order and saves the cursor after them. A read after a reconnect can return events again, so it skips event IDs it has already handled.
- The Company keeps events for as long as it chooses. A cursor for events it no longer has returns `cursor_expired`. The Personal Agent then reads from the beginning and SHOULD tell the User that part of the conversation is missing.

### 7.6 Streaming

A Company MAY stream events with server-sent events ([SSE](https://html.spec.whatwg.org/multipage/server-sent-events.html)). The Personal Agent asks for a stream by sending `Accept: text/event-stream` on a read. A Company that doesn't stream returns JSON as usual. In a stream, each event has its event ID as the SSE `id` and the same event JSON as `data`:

*Stream: Company → Personal Agent*

```
id: evt_c2
data: {"id":"evt_c2","type":"message","created_at":"2026-10-08T19:03:00Z","message":{…}}
```

Changes to `status` and `responder` arrive as `state` events. The Company MAY close a stream at any time, for example when the Session Token expires. The Personal Agent reconnects with `Last-Event-ID` set to the last event it handled, in place of `cursor`. If a request has both, `Last-Event-ID` wins, because SSE clients add it to the URL the stream was first opened with.

While the Company Agent writes a message, the Company MAY send pieces of its text as `text-delta` events, with no SSE `id`:

*Stream: Company → Personal Agent*

```
event: text-delta
data: {"message_id":"msg_r2Kq","text":"I can do that. "}
```

The Personal Agent can show the pieces as they arrive, then replaces them with the complete `message` event. It MUST NOT act on text from a `text-delta` event. After a reconnect, it drops any pieces of a message it didn't receive in full.

### 7.7 Status and responder

| Status | Meaning |
| --- | --- |
| `working` | The Company is still working. Read again with the cursor. |
| `idle` | The Company has no work in progress and is waiting for the User's side. |
| `queued` | Waiting for a person at the Company to join (7.9). |
| `closed` | The conversation takes no more messages (7.12). |

`responder` tells the Personal Agent who is currently handling the Company side of the conversation. It is independent of `status`:

| Responder | Meaning |
| --- | --- |
| `agent` | An automated Company Agent is handling the conversation. |
| `human` | A live person at the Company is handling the conversation. |

Every successful response to a `POST` or a read MUST include `status` and `responder`. Every change to either one adds a `state` event with both, even if there is no new text. `human` means a person has joined. While the conversation is `queued`, `responder` stays `agent`. In a closed conversation, `responder` is whoever handled it last.

Each Company message MUST also include `sender`, with `agent` or `human`, to identify who wrote it. This distinguishes earlier automated replies from human replies when both arrive in one response. The `role` stays `company` in either case.

*Response: Company → Personal Agent*

```
{
  "conversation_id": "cnv_8f3Kd2",
  "events": [
    {
      "id": "evt_c4",
      "type": "state",
      "created_at": "2026-10-08T19:05:10Z",
      "status": "idle",
      "responder": "human"
    },
    {
      "id": "evt_c5",
      "type": "message",
      "created_at": "2026-10-08T19:05:20Z",
      "message": {
        "id": "msg_t8Vn",
        "role": "company",
        "sender": "human",
        "text": "I've reviewed the exchange. Can you confirm which size the user wants?"
      }
    }
  ],
  "cursor": "evt_c5",
  "has_more": false,
  "status": "idle",
  "responder": "human"
}
```

### 7.8 Human or AI

Both sides say whether a person or an AI is taking part. On the Personal Agent's side, the Personal Agent MUST set each message's `sender`: `agent` when the Personal Agent wrote it, and `human` only when it carries the User's own words. A summary, paraphrase, or translation of what the User said is `agent`. On the Company's side, `responder` and each message's `sender` do the same (7.7).

When the User steps in, the Personal Agent sends their words with `sender: "human"` in the same conversation:

*Request: Personal Agent → Company*

```
POST https://api.example.com/poppy/conversations/cnv_8f3Kd2/messages
Authorization: DPoP eyJhbGciOi…Qp4w
DPoP: eyJ0eXAiOiJkcG9wK2p3dCIs…
Content-Type: application/json

{
  "message": { "id": "msg_Fz4kQa9Ue1YoBs6R", "sender": "human", "text": "Medium, please." }
}
```

Each side uses this to adapt. When both sides are AI, they can skip greetings and small talk, keep text short, and put structured details in `data`. When a person is on either side, the other side writes for that person: plain sentences, a pace they can follow, and details in `text` rather than only in `data`. In a Direct Conversation, the Company replies as it would to the customer on its own channels.

### 7.9 Handoff to a person

The Personal Agent asks for a person at the Company with an empty JSON object:

*Request: Personal Agent → Company*

```
POST https://api.example.com/poppy/conversations/cnv_8f3Kd2/handoff
Authorization: DPoP eyJhbGciOi…Qp4w
DPoP: eyJ0eXAiOiJkcG9wK2p3dCIs…
Content-Type: application/json

{}
```

The Company returns HTTP 202 with `status` and `responder`, and the status becomes `queued` while it finds someone. When a person joins, `responder` becomes `human`. If no one is available, the status goes back to `idle` with `responder` still `agent`, and the Company Agent says why in a message. The Company Agent can also hand off to a person on its own. If the conversation is already `queued`, or a person is already handling it, the Company returns HTTP 202 with the current `status` and `responder` and changes nothing.

The Personal Agent can keep sending messages while it waits, for example to explain the problem for the person who joins or to update `user_available`. Closing the conversation cancels a pending handoff. A person at the Company is held to the same scopes as the Company Agent (7.11).

### 7.10 Direct Conversations

A Direct Conversation lets the User talk with the Company themselves. It is a new conversation, linked to the one before it, so the User sees only the Direct Conversation, while the Company keeps the earlier history and can use it. The Personal Agent sends the User's messages as written, with `sender: "human"` (7.8), and shows the Company's replies to the User.

**Starting one.** The Personal Agent starts a Direct Conversation like any other (7.3), adding `parent_conversation_id` with the earlier conversation's ID. The Company returns a new Conversation ID as usual:

*Request: Personal Agent → Company*

```
POST https://api.example.com/poppy/conversations
Authorization: DPoP eyJhbGciOi…Qp4w
DPoP: eyJ0eXAiOiJkcG9wK2p3dCIs…
Content-Type: application/json

{
  "parent_conversation_id": "cnv_8f3Kd2",
  "message": { "id": "msg_Pe6jWm3Kd0RtXc8V", "sender": "human", "text": "Hi, I have a question about the exchange." }
}
```

The parent conversation MUST be open, belong to the same owner (7.2), and not be a Direct Conversation itself. It can have one open Direct Conversation at a time. Otherwise the Company returns `conversation_not_found`, `conversation_closed`, or `direct_conversation_open`.

**When the Company asks.** The Company asks to talk with the User by adding a `user_requested` event to the conversation, with a short `reason`:

*Event: Company → Personal Agent*

```
{
  "id": "evt_c6",
  "type": "user_requested",
  "created_at": "2026-10-08T19:06:00Z",
  "reason": "A specialist needs to confirm the exchange with the customer."
}
```

The event doesn't change `status` or `responder`.

The Personal Agent asks the User. If they agree, it starts a Direct Conversation as above. If they decline or aren't available, it says so in the conversation. Only the Personal Agent starts Direct Conversations, so the User decides when they're brought in.

**The parent conversation meanwhile.** When a Direct Conversation opens, the Company adds a `direct_opened` event to the parent, with the Direct Conversation's ID in `conversation_id`. While it is open, the parent can still be read, but messages and handoff requests to the parent return `direct_conversation_open`, with the Direct Conversation's ID in `conversation_id`. When the Direct Conversation closes, the Company adds a `direct_closed` event to the parent, and the parent takes messages again. The Company Agent in the parent knows what was said in the Direct Conversation. Closing the parent also closes its open Direct Conversation.

### 7.11 Sign-in during a conversation

With a signed-out token, the Company Agent can answer general questions. When the Company Agent needs the User's account, the Company adds an `authorization` event. It SHOULD also ask in a message, so a User in a Direct Conversation sees the request:

*Event: Company → Personal Agent*

```
{
  "id": "evt_d3",
  "type": "authorization",
  "created_at": "2026-10-08T19:04:00Z",
  "error": "insufficient_scope",
  "scope": "orders:read orders:write"
}
```

`error` is `insufficient_scope`, with the same meaning as the error in section 6, and `scope` names the scopes needed. The Personal Agent responds as it would to that error, with its Account Token (4.8) or by signing in (4.4). It then continues the same conversation with the new token. The conversation stays open meanwhile.

A conversation isn't tied to one Session Token or Session. The Personal Agent MAY switch to a new Session Token partway through a conversation, after signing in, renewing, or signing out, or continue it in a new Session, as long as the token matches the conversation's owner (7.2). The conversation keeps its `conversation_id` throughout.

A signed-in conversation also respects the token's scopes. Before reading account information or making a change, the Company Agent checks for the required scopes, whoever is handling the conversation. Sending a message does not authorize the requested account action.

Once a conversation has used the User's account, a request on it from a token for the same User that isn't signed in to that account gets `insufficient_scope`. After a sign-out, the conversation stays open, as 4.9 describes.

### 7.12 Closing

The Personal Agent closes a conversation it's done with by sending an empty JSON object to its `close` URL. The Company adds a `state` event with `status: "closed"`, cancels any pending handoff, and returns HTTP 200 with `status` and `responder`. Closing a conversation that is already closed returns the same response and adds no event. The Company can also close a conversation, for example after a period of inactivity.

A closed conversation takes no more messages, and its events stay readable for as long as the Company keeps them. Closing a conversation doesn't cancel anything it started, such as an order or a return.

### 7.13 Errors

Token errors are the ones in section 6. Other errors have a JSON body with an `error` code, like OAuth error responses:

| Error | Status | Meaning |
| --- | --- | --- |
| `conversation_not_found` | 404 | The Conversation ID is unknown or belongs to a different Personal Agent, User, or account (7.2). All return the same error. |
| `conversation_closed` | 409 | A message or handoff was sent to a closed conversation. |
| `direct_conversation_open` | 409 | The conversation has an open Direct Conversation, named in `conversation_id` (7.10). |
| `message_id_conflict` | 409 | A message reused an ID that the Company accepted with different content (7.3). |
| `invalid_cursor` | 400 | The cursor is unknown or doesn't belong to this conversation. |
| `cursor_expired` | 410 | The Company no longer has the events at this cursor (7.5). |
| `invalid_request` | 400 | The request is malformed, such as a message with none of `text`, `data`, or `context`, an ID with characters not allowed (7.2), or a `wait` that isn't a whole number of seconds. |
| `extension_required` | 403 | The request needs an extension the Personal Agent doesn't list, named in `extension` (3.3). |
| `rate_limited` | 429 | Too many requests. Retry after the time in the `Retry-After` header (4.3). |

## 8. Tasks a Company doesn't offer

A Personal Agent can spend a long time looking for a way to do a task that the Company doesn't offer through this protocol, and the Company sees only a customer who left. A Company can list the tasks it chose not to offer, so Personal Agents know up front (8.1). Personal Agents can report a task they couldn't do (8.3), and the Company can answer with a way to do it. Both point to other ways to do a task in the same form (8.2).

Neither is for errors. A Company already returns errors in its responses (sections 6 and 7), including for a task it doesn't offer, and can see them in its own logs.

### 8.1 Excluded tasks

A Company that lists tasks it doesn't offer lists `excluded_tasks.url` in `poppy.json` (3.1). The URL points to a JSON document:

*Excluded tasks, published by the Company*

```
{
  "tasks": [
    {
      "task": "Send a wire transfer",
      "alternative": {
        "instructions": "Wire transfers can only be sent in the Example app, after the User verifies their identity.",
        "references": [{ "type": "web", "url": "https://example.com/transfers/wire" }]
      }
    },
    { "task": "Close an account" }
  ]
}
```

| Field | Req. | Description |
| --- | --- | --- |
| `tasks` | Yes | The tasks the Company chose not to offer through this protocol. Each has the fields below. |

| Field | Req. | Description |
| --- | --- | --- |
| `task` | Yes | The task, in a short phrase, such as "Send a wire transfer" or "Close an account". At most 200 characters. |
| `alternative` | No | Another way to do the task, such as in the Company's app or on its website, or a different task that serves the same need (8.2). |

- A listed task isn't offered through any of the Company's interfaces: its Company Agent, its APIs, or its website in a browser session.
- The document is the same for every User. The Personal Agent fetches it with a GET and no token, and SHOULD cache it according to its HTTP caching headers.
- A Personal Agent SHOULD read the document before it starts on a task at the Company. Whether the User's task is one listed is the Personal Agent's judgment, since each `task` is a phrase.
- A limit that depends on the User or their account, such as a transfer limit, isn't an excluded task. The Company returns an error for it, as for any request it refuses.
- Personal Agents MUST skip fields they don't recognize, so later versions can add fields.

### 8.2 Alternatives

An alternative tells the Personal Agent another way to do a task, in `instructions`, `references`, or both:

*Alternative: Company → Personal Agent*

```
{
  "instructions": "Gift cards are applied with the payment API, before the order is placed.",
  "references": [
    { "type": "openapi", "url": "https://api.example.com/openapi.json", "operation_id": "applyGiftCard" },
    { "type": "web", "url": "https://example.com/checkout" }
  ]
}
```

| Field | Req. | Description |
| --- | --- | --- |
| `instructions` | No | How to do the task, in natural language. At most 2,000 characters. |
| `references` | No | Where to do it: a list of references to the Company's interfaces (below). |

An alternative MUST have at least one of `instructions` or `references`. Each reference has a `type`, which says what it points to and which other fields it has:

| Type | Fields | Points to |
| --- | --- | --- |
| `openapi` | `url`, `operation_id` | An operation in an OpenAPI API. `url` is the `url` of an `openapi` entry in `apis` (section 6), and `operation_id` is the operation's `operationId` in that description. |
| `mcp` | `url`, `tool` | A tool on an MCP server. `url` is the `url` of an `mcp` entry in `apis`, and `tool` is the tool's `name`. |
| `web` | `url` | A page the User can open, on the Company's website or in its app through an HTTPS link the app claims, such as an iOS universal link or an Android App Link. |

- An `openapi` or `mcp` reference MUST name an API listed in the Company's `poppy.json`. Personal Agents MUST ignore one that doesn't, so an alternative can't aim them at another Company's servers.
- Personal Agents MUST skip reference types they don't recognize, so later versions can add types, such as the Company Agent or an extension.
- An alternative is content from the Company (9.1). Its `instructions` describe the Company's interfaces for the Personal Agent to use on the User's behalf. They are not instructions the Personal Agent has to follow.

### 8.3 Feedback

A Company can ask Personal Agents to tell it when a User's task can't be done through this protocol.

A Company that wants feedback lists `feedback.endpoint` in `poppy.json` (3.1). When a User's task can't be done, the Personal Agent MAY send `POST {feedback.endpoint}` with a Session Token and a DPoP Proof (4.3), and a JSON body:

*Request body: Personal Agent → Company*

```
{
  "kind": "missing",
  "task": "Pay with a gift card",
  "description": "The User wanted to pay for a new order with a gift card they were given. Neither the API nor the Company Agent can apply a gift card, and the checkout page in the browser session has no field for one."
}
```

| Field | Req. | Description |
| --- | --- | --- |
| `kind` | Yes | `missing`: the Company offers no way to do the task through this protocol, whether with its Company Agent, its APIs, or its website in a browser session. Personal Agents MUST NOT send other values, which are reserved for later versions. |
| `task` | Yes | What the User was trying to do, in a short phrase, such as "Return a jacket", "Move a flight to the next day", or "Pay with a gift card". At most 200 characters. |
| `description` | Yes | What the Personal Agent was trying to accomplish, in detail, and why, without identifiers such as order numbers, account numbers, or names. At most 2,000 characters. |

- A Company MUST accept a report only with a Session Token, signed in or signed out, and needs no scope for it. The Session tells the Company which Personal Agent sent the report and for which User, so the report doesn't repeat that, or say where the problem happened.
- Personal Agents SHOULD NOT put personal data in a report, such as the User's name, contact details, or order details. A report describes the task, not the User. Personal Agents MUST NOT put secrets in a report (9.2).
- A Personal Agent SHOULD send one report for each task it couldn't do, not one for each attempt.
- A Personal Agent SHOULD NOT report a task the Company lists as excluded (8.1), since the Company already knows it doesn't offer it.
- A Company MUST accept a `kind` it doesn't recognize, so later versions can add kinds.
- A report can be wrong, or written to mislead. Companies MUST treat a report's text as data, not as instructions, including when a model reads it.

The Company responds with HTTP 202 and no body. When the task can be done after all, it MAY instead respond with HTTP 200 and an alternative (8.2) as the body, such as the one in 8.2 for paying with a gift card. Personal Agents MUST accept either response. Token errors are the ones in section 6. Other errors have a JSON body with an `error` code, as in 7.13: `invalid_request` (400) for a report that is malformed or too long, and `rate_limited` (429).

## 9. Security considerations

This section collects risks that cut across the protocol. The sections it points to hold the detailed rules.

### 9.1 Content from Companies

A Personal Agent passes what a Company returns to its model: conversation messages, API descriptions and responses, MCP tool descriptions and results, web pages, excluded tasks and alternatives (section 8), and, with the Operations extension, an operation's `summary`. The same model may hold the User's personal context and have Sessions open at other Companies. A malicious or compromised Company can write content that tries to direct the model, known as prompt injection.

- Personal Agents MUST treat content from a Company as data, not as instructions. Only the User decides what the Personal Agent does.
- A Personal Agent MUST NOT act at one Company, or send it information, because content from another Company asked it to. It acts at a Company only when the User's task needs it.
- A Personal Agent SHOULD send a Company only information relevant to the User's task. That includes context that helps the Company handle it, such as the reason for a return or a deadline the User has. It doesn't include unrelated details from the User's context or from other Companies.
- Text from a Company is never the User's approval or consent. The Operations extension states this for approving an operation ([Operations 5.1](https://personalagentprotocol.org/docs/0.3/extensions/operations#approval)).

### 9.2 Secrets and the model

A model can be led to repeat what is in its context, so a secret in context can leak through any message the Personal Agent sends. [draft-ietf-wimse-aims](https://datatracker.ietf.org/doc/draft-ietf-wimse-aims/) §8 says the model MUST NOT have access to an agent's credentials. Personal Agents MUST keep these out of model context: Session Tokens (4.3), Account Tokens (4.8), private keys, authorization codes and PKCE code verifiers (4.5), and device codes (4.6). Credentials from Mediated Sign-In are never shown back or sent anywhere except the Company, and once a sign-in ends they are discarded or kept only in a credential store the User chose (4.7). Personal Agents SHOULD keep every other secret out of model context too, such as one-time codes, and sign and send requests in code the model can't read. The [guides](https://personalagentprotocol.org/docs/0.3/guides#both-secrets) list these secrets and how to handle them.

### 9.3 What a domain vouches for

A Company's `poppy.json` is where the Personal Agent learns everything about the Company: its issuer, and through it the Company's sign-in types and scopes, the Mediated Sign-In endpoint, its APIs, and its Company Agent. Whoever controls that document speaks for the Company at the host that serves it at `/.well-known/poppy.json`, as whoever controls its website does today. The document's endpoints can be on any host. The checks in section 3 cover both directions of the link between domain and issuer, which stops a domain from claiming another Company's issuer and receiving its tokens. They don't make the issuer metadata more trustworthy than `poppy.json`, because the document chooses the issuer.

### 9.4 Assertions

A Personal Agent works with many Companies it has no prior relationship with, and each Company's metadata names its own endpoints, which nobody checks (3.2). A malicious Company could name another Company's token endpoint in its metadata. If assertions were addressed to that endpoint, the malicious Company could collect them at its other endpoints and replay them at the other Company. That is why client and Session assertions name the Company's `auth.issuer` in `aud` (4.1, 4.2). The issuer is the value the Personal Agent verified for that Company, so an assertion collected by one Company is rejected by every other. Each Company has its own issuer (3.2), so this holds even for Companies a provider hosts on shared servers.

### 9.5 Signing in with the User's credentials

Direct and Device Sign-In delegate access: the User approves scopes on the Company's own page, and the Company knows which Personal Agent acts and can limit or revoke it without affecting the User. Mediated Sign-In gives the Personal Agent the User's credentials, but the Company still knows which Personal Agent signed in, and limits it to `auth.mediated.scopes` (4.7). A Personal Agent that signs in on the Company's website with the User's credentials, outside this protocol, looks like the User: the Company can't limit what it does, and can only stop it by blocking it entirely. A Company that offers no Direct or Device Sign-In, or whose scopes don't cover what Users need, can expect Personal Agents to sign in that way. That is why 4.4 asks Personal Agents to prefer Direct and Device Sign-In over Mediated Sign-In, and Companies that offer them to make them cover what Users need. It is also why Mediated Sign-In is only a transitional step (4.7).

### 9.6 Joining a browser to a Session

A browser that carries a Session's cookie acts as that Session. If a credential carried by the browser were enough to join, anyone who could get one could put it in someone else's browser. A malicious Personal Agent could start a Session, sign it in to an account it controls, and have a victim's browser post the credential from a page that submits itself. The victim would then use the attacker's account without noticing, and could save payment details, addresses, or health information in it. This is the cross-site request forgery that [RFC 9700 §4.7](https://www.rfc-editor.org/rfc/rfc9700#section-4.7) describes for OAuth clients.

Section 5 prevents it with two checks that only the right browser and the right Personal Agent can pass together. The proof has to be signed over a code the browser got from the Company's page, and a page on another site can make a browser load that page but can't read it. The code has to come back with the cookie set alongside it, so a code and proof the attacker made in its own browser fail in the victim's, which doesn't have that cookie. The cookie is `SameSite=Strict`, so the browser doesn't send it with a form submitted from another site. The page can't be framed or kept as a reference by the page that opened it, so another site can't watch it or trick a person into using it.

The opposite risk is a Personal Agent signing a proof over a code from someone else's browser, which would join that browser to the User's Session. This is the consent phishing that [RFC 10027](https://www.rfc-editor.org/rfc/rfc10027) describes for cross-device flows, and it's why the Personal Agent takes the code only from its own browser (section 5).

## 10. References

This draft uses these standards and versions:

| Subject | References |
| --- | --- |
| Requirement words | [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119), [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174) |
| OAuth | [RFC 6749](https://www.rfc-editor.org/rfc/rfc6749), [RFC 6750](https://www.rfc-editor.org/rfc/rfc6750), [RFC 7009](https://www.rfc-editor.org/rfc/rfc7009), [RFC 8414](https://www.rfc-editor.org/rfc/rfc8414), [RFC 8693](https://www.rfc-editor.org/rfc/rfc8693), [RFC 9728](https://www.rfc-editor.org/rfc/rfc9728) |
| Agent identity and assertions | [OAuth Client ID Metadata Document](https://datatracker.ietf.org/doc/draft-ietf-oauth-client-id-metadata-document/), [RFC 7519](https://www.rfc-editor.org/rfc/rfc7519), [RFC 7523](https://www.rfc-editor.org/rfc/rfc7523), [draft-ietf-oauth-rfc7523bis](https://datatracker.ietf.org/doc/draft-ietf-oauth-rfc7523bis/), [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html), [draft-ietf-wimse-aims](https://datatracker.ietf.org/doc/draft-ietf-wimse-aims/) |
| Sign-in | [RFC 7636](https://www.rfc-editor.org/rfc/rfc7636), [RFC 8628](https://www.rfc-editor.org/rfc/rfc8628), [RFC 9207](https://www.rfc-editor.org/rfc/rfc9207) |
| Token binding and audience | [RFC 9449](https://www.rfc-editor.org/rfc/rfc9449), [RFC 8707](https://www.rfc-editor.org/rfc/rfc8707) |
| Web browsing | [RFC 9111](https://www.rfc-editor.org/rfc/rfc9111), [RFC 6265bis](https://datatracker.ietf.org/doc/draft-ietf-httpbis-rfc6265bis/) |
| Security | [RFC 9700](https://www.rfc-editor.org/rfc/rfc9700), [RFC 10027](https://www.rfc-editor.org/rfc/rfc10027) |
| APIs | [OpenAPI Specification 3.1](https://spec.openapis.org/oas/v3.1.1.html), [Model Context Protocol 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18), [RFC 9728](https://www.rfc-editor.org/rfc/rfc9728) |

---

Licensed under the [Apache License 2.0](https://personalagentprotocol.org/license).
