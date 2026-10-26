# Pattern: serving poppy.json

`poppy.json` is served at `https://{domain}/.well-known/poppy.json` on the Company's own domain
([section 3](https://personalagentprotocol.org/docs/0.3/spec#discovery)). The document speaks for the
host that serves it at `/.well-known/poppy.json` after any redirects, so a redirect must end at that
path, and `organization.domain` must be that host
([3.1](https://personalagentprotocol.org/docs/0.3/spec#fields)).

## Options

**A static file in the website.** Deploy `poppy.json` with the site, or from the CDN or edge that
serves it.

- Fits: most Companies. The content changes only when an interface or Mediated Sign-In is added.
- Needs: a way to serve a path under `/.well-known/` with `Content-Type: application/json`.
- Watch for: caching. Personal Agents cache by HTTP caching headers (section 3), so use a short
  enough lifetime that a change takes effect when you need it to.

**Generated per environment.** Build the file from configuration, so staging and production list
their own endpoints and issuer.

- Fits: Companies with several environments or several country domains.
- Watch for: every domain that names an issuer must appear, as exactly `https://{domain}` with no
  path or trailing slash, in that issuer's `protected_resources`
  ([3.2](https://personalagentprotocol.org/docs/0.3/spec#oauth-server)).

**Served by a provider on the Company's domain.** A provider that runs part of the Company's
Poppy support can serve the document, through a reverse proxy or a hostname the Company points at
the provider.

- Fits: Companies that use a provider for the token endpoint or the Company Agent.
- Watch for: a redirect from the Company's domain to the provider's domain doesn't work. After the
  redirect, the document would speak for the provider's host, not the Company.

## What to watch for

- Redirects are allowed, but only to HTTPS, and the last URL's path must be exactly
  `/.well-known/poppy.json` with no query (section 3). If `example.com` redirects to
  `www.example.com`, `organization.domain` is `www.example.com`. Domains are compared ignoring case
  and nothing else (3.1).
- `auth` is required when `agent`, `apis`, `feedback`, or `web.browser_session_endpoint` is present
  (3.1).
- List only interfaces and Mediated Sign-In when they work. Add each as it ships. Direct and Device
  Sign-In come from the issuer's `grant_types_supported` (3.2), not `poppy.json`.
- Check before deploying: `node <skill-dir>/validate/index.ts check --file ./poppy.json`.
