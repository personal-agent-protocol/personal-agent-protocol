# Pattern: web browsing

With `web.browser_session_endpoint`, the Personal Agent's browser joins its Session by posting a
signed browser assertion, and the Company sets a cookie of its own for that Session
([section 5](https://personalagentprotocol.org/docs/0.3/spec#web-browsing)).

## A browser-session endpoint in the web app

Add the endpoint to the existing web app. It verifies the assertion, then creates a normal website
session for the Poppy Session and sets the site's usual session cookie.

- Fits: most Companies. The rest of the website needs no changes, because requests arrive with the
  cookie it already understands.
- Needs: the web app can create a session linked to a Poppy Session, signed out or signed in to the
  Session's account, and can apply the Session's scopes; a way to verify assertions against the
  Personal Agent's `jwks_uri` (shared with the token endpoint's verification); the shared replay
  cache for `jti` (`patterns/dpop.md`).
- Trade-offs: reuses all existing pages. The website session must follow the Poppy Session, which
  may mean a lookup on each request.

## What to watch for

- Every check in section 5, step 3: `typ` is `poppy-browser+jwt`, `aud` is the endpoint, `exp` is
  no more than 60 seconds after `iat`, `jti` not seen before, the Session active and owned by the
  same `client_id` and User, and `return_to` on the Company's own domain.
- Success is `303 See Other` to `return_to` with the cookie. Failure is HTTP 400 and no cookie.
- The cookie is `Secure`, `HttpOnly`, and `SameSite=Lax` or `None`, never `Strict` (section 5).
- The cookie follows the Session: sign-in, sign-out, and scope changes show on the next request,
  and it doesn't outlive the Session. Look up the Session on each request
  ([guides](https://personalagentprotocol.org/docs/0.3/guides#company-browsing)).
- The website applies the Session's scopes, as the APIs do (`patterns/scopes.md`). A signed-in
  website session for a Personal Agent may allow less than a person's own session.
- While the browser carries the cookie, requests are handled as that Session, whatever other cookies
  it holds (section 5).
- Limit the cookie to the hosts Personal Agents need, and don't log request bodies at the endpoint
  ([guides](https://personalagentprotocol.org/docs/0.3/guides#company-browsing)).
- Parse `return_to` as a URL and compare its host, rather than matching a string prefix.
