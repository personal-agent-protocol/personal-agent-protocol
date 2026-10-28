# Pattern: web browsing

With `web.browser_session_endpoint`, the Personal Agent's browser joins its Session in three steps
([section 6](https://personalagentprotocol.org/docs/spec#web-browsing)). The browser loads the
endpoint and gets a page with a one-time code and a cookie that ties the code to that browser. The
Personal Agent authorizes the code at `{browser_session_endpoint}/authorize`, with its Session
header and, if signed in, its access token. The browser then submits the form with only the code,
and the Company sets the Session's cookie in its response. The access token never reaches the
browser.

## A browser-session endpoint in the web app

Add the endpoint and its `/authorize` path to the existing web app. A GET returns the form and a
short-lived join cookie, and creates no website session. The `/authorize` POST verifies the Session
header and token as an API would and marks the code authorized for that Session and account. The
form POST, with the code and the join cookie, sets the site's usual session cookie, linked to that
Session.

- Fits: most Companies. The rest of the website needs no changes, because requests arrive with the
  cookie it already understands.
- Needs: the web app can link a website session to a Poppy Session, signed out or signed in to an
  account, and can apply the scopes; Session header verification at `/authorize`, shared with the
  APIs (`patterns/session-header.md`); a record of codes that every server sees, with their state
  (issued, authorized for a Session and account, used), atomic updates, kept until the codes expire.
- Trade-offs: reuses all existing pages. The join cookie can be stateless, such as a keyed hash of
  the code and its expiry, so a GET stores nothing until the code is authorized. The website session
  must follow the Poppy Session and the account's sign-in state, which may mean a lookup on each
  request.

## What to watch for

- The GET returns a form, posting to the endpoint, with the code in a hidden `code` field. Caches
  can't store the page, other pages can't frame it, and its opener keeps no reference to it. The
  code is unguessable, short-lived, and works once. The guides suggest `Cache-Control: no-store`,
  `Content-Security-Policy: frame-ancestors 'none'`, `Cross-Origin-Opener-Policy: same-origin`, and
  a code of at least 128 random bits that expires within 60 seconds.
- The GET sets a join cookie that ties the code to the browser. Forms on other sites don't send it
  and other hosts on your domain can't set it. The guides suggest the `__Host-` prefix, `Secure`,
  `HttpOnly`, and `SameSite=Strict`. It starts, ends, or changes no Session and no other cookie.
- `/authorize` takes `{"code": …}` as JSON. It checks the Session header (5.3), which starts the
  Session if its `sid` is new, and the access token if any, then that the code is one you issued,
  unexpired, and not authorized before. It answers 204, or 400 `invalid_request` for a bad code.
- The form POST checks that the join cookie matches the code, and that the code was authorized,
  hasn't expired, and wasn't submitted before. The first request that submits a code uses it up,
  whatever the result.
- Success sets the Session's cookie, signed in to the account from `/authorize` if there was one,
  clears the join cookie, and responds `303 See Other` to a page on the website. Errors are an error
  page with HTTP 400, or 429, and set no cookie.
- The guides suggest a `Secure`, `HttpOnly` cookie for the Session, with the `__Host-` prefix unless
  it has to cover several hosts.
- The cookie acts for the account and scopes authorized at `/authorize`, stops acting for the
  account at sign-out or disconnect, and doesn't outlive the Session. Look up the Session on each
  request ([guides](https://personalagentprotocol.org/docs/guides#company-browsing)).
- The website applies the cookie's scopes, as the APIs do (`patterns/scopes.md`). A signed-in
  website session for a Personal Agent may allow less than a person's own session.
- While the browser carries the cookie, requests are handled as that Session, whatever other cookies
  it holds (section 6).
- Limit the cookie to the hosts Personal Agents need, and don't log the endpoint's responses or
  request bodies, which contain codes
  ([guides](https://personalagentprotocol.org/docs/guides#company-browsing)).
