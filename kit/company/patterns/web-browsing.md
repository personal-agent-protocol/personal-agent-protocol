# Pattern: web browsing

With `web.browser_session_endpoint`, the Personal Agent's browser joins its Session through a form
([section 5](https://personalagentprotocol.org/docs/spec#web-browsing)). The browser loads the
endpoint and gets a page with a one-time code and a cookie that ties the code to that browser. The
Personal Agent signs a DPoP Proof over the code with its Session Key, and the browser submits the
form. The Company checks both and sets the Session's cookie in its response.

## A browser-session endpoint in the web app

Add the endpoint to the existing web app. A GET returns the form and a short-lived join cookie, and
creates no website session. A POST with the code, the proof, and the join cookie finds the Poppy
Session by the proof's key and sets the site's usual session cookie, linked to that Session.

- Fits: most Companies. The rest of the website needs no changes, because requests arrive with the
  cookie it already understands.
- Needs: the web app can link a website session to a Poppy Session, signed out or signed in to the
  Session's account, and can apply the Session's scopes; DPoP Proof verification at the endpoint,
  shared with the APIs (`patterns/dpop.md`), and a lookup of Sessions by Session Key; a record of
  used codes that every server sees, with an atomic "use once" operation, kept until the codes
  expire.
- Trade-offs: reuses all existing pages. The code and join cookie can be stateless, such as a keyed
  hash of the code and its expiry in the cookie, so a GET stores nothing. The website session must
  follow the Poppy Session, which may mean a lookup on each request.

## What to watch for

- The GET returns a form with the code in a hidden `code` field and an empty text `proof` field,
  with `Cache-Control: no-store`, `Content-Security-Policy: frame-ancestors 'none'`, and
  `Cross-Origin-Opener-Policy: same-origin`. The code has at least 128 random bits and expires
  within 60 seconds.
- The GET sets a join cookie that ties the code to the browser: `__Host-` prefix, `Secure`,
  `HttpOnly`, and `SameSite=Strict`. It starts no Session and changes no other cookie.
- The POST checks that the join cookie matches the code, the code is unexpired and unused, and the
  proof is a valid DPoP Proof with `htm` `POST`, `htu` the endpoint, and `nonce` the code (4.3). The
  first request that sends a code uses it up, whatever the result.
- The proof's key must be the Session Key of an active Session. Unlike at the token endpoint, an
  unknown key is an error, not a new Session.
- Success sets the Session's cookie, clears the join cookie, and responds `303 See Other` to a page
  on the website. Errors are an error page with HTTP 400, or 429, and set no cookie.
- The Session's cookie is `Secure` and `HttpOnly`, and uses the `__Host-` prefix unless it has to
  cover several hosts (section 5).
- The cookie follows the Session: sign-in, sign-out, and scope changes show on the next request,
  and it doesn't outlive the Session. Look up the Session on each request
  ([guides](https://personalagentprotocol.org/docs/guides#company-browsing)).
- The website applies the Session's scopes, as the APIs do (`patterns/scopes.md`). A signed-in
  website session for a Personal Agent may allow less than a person's own session.
- While the browser carries the cookie, requests are handled as that Session, whatever other cookies
  it holds (section 5).
- Limit the cookie to the hosts Personal Agents need, and don't log the endpoint's responses or
  request bodies, which contain codes and proofs
  ([guides](https://personalagentprotocol.org/docs/guides#company-browsing)).
