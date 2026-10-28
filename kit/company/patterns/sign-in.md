# Pattern: sign-in pages

Direct and Device Sign-In use the Company's own sign-in and consent pages
([4.2](https://personalagentprotocol.org/docs/spec#direct-sign-in),
[4.3](https://personalagentprotocol.org/docs/spec#device-sign-in)). Mediated Sign-In is an
extension grant at the token endpoint that checks credentials
([Mediated Sign-In extension](https://personalagentprotocol.org/docs/extensions/mediated-sign-in)).

## Direct and Device Sign-In: reuse the existing sign-in, add a consent page

The authorization or verification page sends the User through the Company's existing sign-in (any
method the Company allows) and then to a consent page for the Personal Agent.

- Fits: every Company. Existing sign-in, MFA, and fraud checks keep working.
- Needs: the authorization request kept across the existing sign-in, and a consent page that shows
  the Personal Agent's name, logo, and `client_id` domain, the account, each scope in plain
  language, and how long access lasts
  ([guides](https://personalagentprotocol.org/docs/guides#company-consent)).
- Watch for: an existing OAuth consent page built for first-party or registered clients. Personal
  Agents name themselves, so show the `client_id` domain. Protect the page against cross-site
  request forgery and framing. For Device Sign-In, opening the link never approves by itself
  ([guides](https://personalagentprotocol.org/docs/guides#company-device)).

## Mediated Sign-In: a grant over the existing credential check

The grant handler at `token_endpoint` calls the same credential check and one-time code service the
website uses, then returns the usual token response. A second step is the OAuth error
`code_required` with a `sign_in_id`.

- Fits: Companies that decide to accept credentials from Personal Agents, usually for Personal
  Agents that can't use a browser.
- Needs: a credential check callable from a service, a way to add a grant type to the token
  endpoint, a one-time code sender, and rate limits by account and `client_id`
  ([guides](https://personalagentprotocol.org/docs/guides#company-mediated)).
- Watch for: the protections in the guides (rate-limit attempts, require a one-time code when a
  sign-in looks unusual), the same `invalid_grant` for unknown account and wrong password, and
  never storing raw credentials or codes, including in logs, traces, and idempotency records.

## For every type

- The result is the same token response: an access token and a refresh token
  ([4.7](https://personalagentprotocol.org/docs/spec#scopes)). Sign-in doesn't know the Session;
  the Personal Agent sends the access token with its Session header afterwards
  ([5.4](https://personalagentprotocol.org/docs/spec#sign-in)).
- Each sign-in request and poll carries the client assertion, checked as at any token request
  (`patterns/token-endpoint.md`).
- Tell the User when a Personal Agent connects, for example by email
  ([guides](https://personalagentprotocol.org/docs/guides#company-mediated) suggest it for Mediated
  Sign-In).
