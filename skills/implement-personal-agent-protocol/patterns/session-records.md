# Pattern: Session and token records

The Company keeps a record for each Session, and its OAuth server keeps its usual token records
([5.3](https://personalagentprotocol.org/docs/0.3/spec#session-verification),
[5.4](https://personalagentprotocol.org/docs/0.3/spec#sign-in)):

| Record        | Holds                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------ |
| Session       | `client_id` and `sid` (its key), User ID, optional Agent ID, account it used, ended or not |
| Refresh token | `client_id`, account, granted scopes, and expiry                                           |
| Access token  | `client_id`, account, scopes, `resource` if any, the refresh token it came from, expiry    |

Find each Session by `client_id` and `sid` from the verified Session header. Sign-in doesn't touch
Session records: a Session is signed in on each request that carries an access token, with that
token's account and scopes. Record on the Session the account it has used, if the Company refuses
account changes, and on conversations and operations whether they used the account.

## A. New Poppy tables or collections

Store Poppy Sessions in their own store, linked to the existing account by ID when they use one.

- Fits: most Companies. Poppy Sessions have fields that existing session records don't, such as the
  User ID, `sid`, and `client_id`.
- Trade-offs: a clean model, but every channel that handles Poppy requests must look here.

## B. Extend the existing session records

Add `client_id`, `sid`, User ID, and Poppy fields to the records the website already keeps.

- Fits: when existing systems already look up sessions on every request, and the browser-session
  cookie should be a normal website session ([section 6](https://personalagentprotocol.org/docs/0.3/spec#web-browsing)).
- Trade-offs: existing tooling, such as session lists and fraud checks, works on Poppy Sessions too.
  Changes to a shared, critical table.
- Watch for: existing jobs that treat every session as a person's browser session.

## What to watch for

- A Session can change accounts unless the Company refuses it. Decide whether to refuse a request
  whose access token is for another account than the Session used before, with `invalid_session`
  (5.4). Personal Agents should start a new Session for another account.
- When a refresh token is revoked, invalidate the access tokens issued under it, or check on
  each request whether the authorization is still active. If you can't, keep access tokens to a few
  minutes ([5.5](https://personalagentprotocol.org/docs/0.3/spec#ending-sessions),
  [guides](https://personalagentprotocol.org/docs/0.3/guides#company-lifetimes)).
- The account is signed out of a Personal Agent once no refresh token you issued to its `client_id`
  for the account is still valid. Revoking one that a new sign-in replaced isn't sign-out, so the
  website cookie keeps its account access ([5.5](https://personalagentprotocol.org/docs/0.3/spec#ending-sessions)).
- Conversations and operations that used the account answer requests without its access token with
  the 401 challenge ([section 7](https://personalagentprotocol.org/docs/0.3/spec#apis)).
- Remember the `sid`s of Sessions you end for a while, and refuse them with 400 `invalid_session`
  ([5.5](https://personalagentprotocol.org/docs/0.3/spec#ending-sessions)). Otherwise the ended Session
  silently starts again.
- A known `sid` with a different User ID or Agent ID is refused (5.3).
- Store refresh tokens as hashes, like passwords, so a leaked table doesn't leak usable tokens.
- The User ID isn't personal information, but it is a stable identifier. Don't show it in the
  website or to other Personal Agents.
- Conversations and Sessions are separate: a conversation can outlast its Session
  ([8.2](https://personalagentprotocol.org/docs/0.3/spec#conversation-requests)).
