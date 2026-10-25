# Pattern: Session and token records

The Company keeps a record for each Session and each Account Token ("How sign-in is remembered" in
[4.4](https://personalagentprotocol.org/docs/0.3/spec#sign-in)):

| Record  | Holds                                                           |
| ------- | --------------------------------------------------------------- |
| Session | `client_id`, User ID, and the account it's signed in to, if any |

Find each Session record by the thumbprint of its Session Key
([4.3](https://personalagentprotocol.org/docs/0.3/spec#sending-tokens)). The token endpoint has no other
way to tell which Session a request is for.
| Account Token | `client_id`, User ID, account, granted scopes, and expiry |

In practice a Session record also needs its expiry and the Account Token that signed it in, so
sign-out can find its Sessions ([4.9](https://personalagentprotocol.org/docs/0.3/spec#sign-out)).

## A. New Poppy tables or collections

Store Poppy Sessions and Account Tokens in their own store, linked to the existing account by ID.

- Fits: most Companies. Poppy records have fields that existing session records don't, such as the
  User ID and `client_id`.
- Trade-offs: a clean model, but every channel that checks sign-in state must look here.

## B. Extend the existing session and token records

Add `client_id`, User ID, and Poppy fields to the records the website and OAuth server already keep.

- Fits: when existing systems already look up sessions on every request, and the browser-session
  cookie should be a normal website session ([section 5](https://personalagentprotocol.org/docs/0.3/spec#web-browsing)).
- Trade-offs: existing tooling, such as session lists, revocation, and fraud checks, works on Poppy
  Sessions too. Changes to a shared, critical table.
- Watch for: existing jobs that treat every session as a person's browser session.

## What to watch for

- A Session is signed in to at most one account, and never switches (4.4). Enforce it in the
  record, not only in the token endpoint.
- Signing out revokes the Account Token and signs out every Session signed in with it (4.9).
  Conversations and operations that used the account then answer signed-out tokens with
  `sign_in_required`, so record on each one whether it used the account.
- Session Tokens reflect the Session when issued. To make sign-out take effect right away, look up
  the Session on each request. If you can't, keep Session Tokens to a few minutes
  ([4.9](https://personalagentprotocol.org/docs/0.3/spec#sign-out),
  [guides](https://personalagentprotocol.org/docs/0.3/guides#company-lifetimes)).
- Keep the thumbprints of Sessions you end for a while, and refuse them with `invalid_grant`
  ([4.2](https://personalagentprotocol.org/docs/0.3/spec#starting-sessions)). Otherwise the ended
  Session's key silently starts a new Session.
- Store Account Tokens as hashes, like passwords, so a leaked table doesn't leak usable tokens.
- The User ID isn't personal information, but it is a stable identifier. Don't show it in the
  website or to other Personal Agents.
- Conversations and Sessions are separate: a conversation can outlast its Session
  ([7.2](https://personalagentprotocol.org/docs/0.3/spec#conversation-requests)).
