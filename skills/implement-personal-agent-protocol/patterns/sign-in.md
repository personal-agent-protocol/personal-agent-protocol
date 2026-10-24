# Pattern: sign-in pages

Direct and Device Sign-In use the Company's own sign-in and consent pages
([4.5](https://personalagentprotocol.org/docs/0.3/spec#direct-sign-in),
[4.6](https://personalagentprotocol.org/docs/0.3/spec#device-sign-in)). Mediated Sign-In is an endpoint
that checks credentials ([4.7](https://personalagentprotocol.org/docs/0.3/spec#mediated-sign-in)).

## Direct and Device Sign-In: reuse the existing sign-in, add a consent page

The authorization or verification page sends the User through the Company's existing sign-in (any
method the Company allows) and then to a consent page for the Personal Agent.

- Fits: every Company. Existing sign-in, MFA, and fraud checks keep working.
- Needs: the authorization request kept across the existing sign-in, and a consent page that shows
  the Personal Agent's name, logo, and `client_id` domain, the account, each scope in plain
  language, and how long access lasts
  ([guides](https://personalagentprotocol.org/docs/0.3/guides#company-consent)).
- Watch for: an existing OAuth consent page built for first-party or registered clients. Personal
  Agents name themselves, so show the `client_id` domain. Protect the page against cross-site
  request forgery and framing. For Device Sign-In, opening the link never approves by itself
  ([guides](https://personalagentprotocol.org/docs/0.3/guides#company-device)).

## Mediated Sign-In: an endpoint over the existing credential check

The endpoint calls the same credential check and one-time code service the website uses, then
signs in the Session.

- Fits: Companies that decide to accept credentials from Personal Agents, usually for Personal
  Agents that can't use a browser.
- Needs: a credential check callable from a service, a one-time code sender, and rate limits by
  account, `client_id`, and User ID
  ([guides](https://personalagentprotocol.org/docs/0.3/guides#company-mediated)).
- Watch for: the duties in 4.7 (rate-limit attempts, never return credentials, require a one-time
  code when a sign-in looks unusual), the same `failed` for unknown account and wrong password, and
  never storing raw credentials or codes, including in logs, traces, and idempotency records.

## For every type

- The result is the same: an Account Token and a signed-in Session Token for the current Session
  ([4.4](https://personalagentprotocol.org/docs/0.3/spec#sign-in)).
- `account_mismatch` when the User signs in to a different account than the Session's (4.4).
- Tell the User when a Personal Agent connects, for example by email
  ([guides](https://personalagentprotocol.org/docs/0.3/guides#company-mediated) suggest it for Mediated
  Sign-In).
