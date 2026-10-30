# Mediated Sign-In extension

## 1. Introduction

In Mediated Sign-In, the Personal Agent signs in for the User with credentials the User has given it for this Company, such as an email and password. It is an extension grant at the Company's token endpoint ([RFC 6749](https://www.rfc-editor.org/rfc/rfc6749#section-4.5) §4.5), so it uses OAuth's client authentication, errors, and token responses. This extension defines the grant's parameters, including a step for a one-time code, so that every Company that offers it handles it the same way.

**Mediated Sign-In is transitional.** It lets Personal Agents sign in at Companies that can't offer Direct or Device Sign-In ([spec 4.2](https://personalagentprotocol.org/docs/0.3/spec#direct-sign-in), [4.3](https://personalagentprotocol.org/docs/0.3/spec#device-sign-in)) yet. It isn't where the protocol is headed, in the same way that OAuth's password grant was a transitional step that OAuth 2.1 removes. A Company SHOULD offer Mediated Sign-In only until it can add Direct or Device Sign-In, and SHOULD stop offering it once those cover the scopes it grants. The protocol plans to retire this extension, on a date set when version 1.0 is published. After that, the community will look for ways to encourage the Companies that still offer it to move to Direct or Device Sign-In.

This page defines version 1 of the `mediated-sign-in` extension. It uses the terms and tokens in the [specification](https://personalagentprotocol.org/docs/0.3/spec). A sign-in through it returns the same tokens as Direct and Device Sign-In ([spec 4.7](https://personalagentprotocol.org/docs/0.3/spec#scopes)).

## 2. Advertising support

A Company that offers Mediated Sign-In lists it in `extensions` in its `poppy.json` ([spec 3.3](https://personalagentprotocol.org/docs/0.3/spec#extensions)), and lists the grant type `https://personalagentprotocol.org/grant/mediated-sign-in` in its issuer's `grant_types_supported` ([spec 3.2](https://personalagentprotocol.org/docs/0.3/spec#oauth-server)):

*Excerpt from poppy.json*

```
"extensions": {
  "mediated-sign-in": {
    "version": "1",
    "fields": [
      { "name": "email", "label": "Email", "secret": false },
      { "name": "password", "label": "Password", "secret": true }
    ],
    "scopes": ["orders:read"]
  }
}
```

- `fields` lists the credentials the Company needs. Companies ask for different ones, such as an email and password, or an account number and PIN.
  - `name` is the parameter the Personal Agent sends. It MUST NOT be `grant_type`, `scope`, `resource`, a client authentication parameter such as `client_id` or `client_assertion`, or a parameter this extension defines, such as `sign_in_id`.
  - `label` is what to ask the User for.
  - `secret` marks a value the Personal Agent MUST protect: never shown back to the User, written to logs, or sent anywhere else.
- `scopes` lists the scopes Mediated Sign-In can grant ([spec 4.7](https://personalagentprotocol.org/docs/0.3/spec#scopes)). The Company SHOULD also include them in `scopes_supported`. It often grants less than Direct or Device Sign-In. The Company MUST NOT grant scopes beyond those requested and listed here.

The Personal Agent doesn't need to list the extension in its client metadata document. The Company learns that it uses the extension from the grant type ([spec 3.3](https://personalagentprotocol.org/docs/0.3/spec#extensions)).

## 3. Signing in

The Personal Agent sends a token request to the Company's `token_endpoint` with the grant type, its client assertion ([spec 4.1](https://personalagentprotocol.org/docs/0.3/spec#agent-identity)), `scope` as in [spec 4.7](https://personalagentprotocol.org/docs/0.3/spec#scopes), and every field in `fields` as a parameter:

*Request: Personal Agent → Company*

```
POST https://auth.example.com/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=https%3A%2F%2Fpersonalagentprotocol.org%2Fgrant%2Fmediated-sign-in
&scope=orders%3Aread
&email=…
&password=…
&client_id=https%3A%2F%2Fagent.example%2Fagent.json
&client_assertion_type=urn%3Aietf%3Aparams%3Aoauth%3Aclient-assertion-type%3Ajwt-bearer
&client_assertion=eyJhbGciOiJFUzI1NiIs…
```

If the credentials are correct and nothing else is needed, the Company returns the token response in [spec 4.7](https://personalagentprotocol.org/docs/0.3/spec#scopes).

## 4. One-time codes

If the Company needs a second step, it sends the User a one-time code and returns a `code_required` error with a sign-in ID:

*Response: Company → Personal Agent (HTTP 400)*

```
{
  "error": "code_required",
  "sign_in_id": "sgn_3Hq8",
  "sent_to": "Text to the phone number ending in 71",
  "expires_in": 600
}
```

The Personal Agent gets the code from the User and sends the same grant again with `sign_in_id` and `one_time_code`, and its client assertion, but not the credentials or `scope`. The sign-in keeps the scopes of the first request:

*Request: Personal Agent → Company*

```
POST https://auth.example.com/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=https%3A%2F%2Fpersonalagentprotocol.org%2Fgrant%2Fmediated-sign-in
&sign_in_id=sgn_3Hq8
&one_time_code=…
&client_id=https%3A%2F%2Fagent.example%2Fagent.json
&client_assertion_type=urn%3Aietf%3Aparams%3Aoauth%3Aclient-assertion-type%3Ajwt-bearer
&client_assertion=eyJhbGciOiJFUzI1NiIs…
```

A correct code returns the token response. A wrong code returns `code_required` again, until the Company's attempt limit, and then `invalid_grant`. Only the `client_id` that started a sign-in can finish it.

## 5. Errors

Errors are OAuth error responses from the token endpoint, with HTTP 400 unless shown otherwise. The usual token endpoint errors also apply, such as `invalid_client`. Rate limits are HTTP 429 with `Retry-After`, as in [spec 5.6](https://personalagentprotocol.org/docs/0.3/spec#sending-requests).

| Error | Meaning |
| --- | --- |
| `code_required` | The Company sent the User a one-time code. Send it with `sign_in_id` to continue (4). |
| `invalid_grant` | Sign-in didn't succeed, for example a wrong password or too many wrong codes, or `sign_in_id` is unknown or belongs to another client. |
| `expired_token` | The sign-in took longer than `expires_in`. Start again. |
| `access_denied` | The Company refuses this sign-in. |
| `invalid_scope` | The scopes are missing, unknown, or not in the extension's `scopes`. |

## 6. Security

**Credentials.** Accepting credentials from a Personal Agent puts more responsibility on the Company than Direct Sign-In does. The [guides](https://personalagentprotocol.org/docs/0.3/guides#company-mediated) describe how to protect them.

Personal Agents MUST NOT send credentials anywhere other than the `token_endpoint` of the Company's issuer, with this grant. A Personal Agent MUST choose which stored credentials to send by the Company's issuer, never by the field labels or the endpoint, and MUST show the Company's `organization.name` and domain whenever it asks the User for credentials or a code. Otherwise a Company could ask for another Company's password, or for a code another Company sent the User. Once it has a refresh token, the Personal Agent doesn't need the credentials to get access tokens.

**Storing credentials.** After a sign-in ends, with tokens or an error other than `code_required`, the Personal Agent MUST either discard the credentials or keep them only in a credential store the User chose, such as a password manager. It MUST NOT keep them anywhere else, including model context and logs ([spec 10.2](https://personalagentprotocol.org/docs/0.3/spec#secrets)). After the User or the Company revokes the Personal Agent's access ([spec 5.5](https://personalagentprotocol.org/docs/0.3/spec#ending-sessions)), the Personal Agent SHOULD NOT sign in again with stored credentials unless the User asks it to. Otherwise a stored password could undo the User's decision to disconnect it.

**Preferring delegation.** Mediated Sign-In gives the Personal Agent the User's credentials, but the Company still knows which Personal Agent signed in, and limits it to the extension's `scopes`. That is less than Direct and Device Sign-In give the Company, where the User approves scopes on the Company's own page ([spec 10.5](https://personalagentprotocol.org/docs/0.3/spec#credentials)). A Personal Agent SHOULD use Direct or Device Sign-In rather than Mediated Sign-In when the Company offers it and its scopes cover the task.

---

Licensed under the [Apache License 2.0](https://personalagentprotocol.org/license).
