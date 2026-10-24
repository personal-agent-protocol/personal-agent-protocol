import type { Walkthrough } from "../lib/walkthrough-types";
import { LATEST } from "./docs";

// Companies, identifiers, API schemas, and tool payloads in these examples are fictional. Domains
// use the reserved .example top-level domain (RFC 6761).

const PACIFICA = {
    name: "Pacifica Air",
    domain: "pacificaair.example",
    color: "#0b7285",
    logo: "P",
};
const MANZANITA = {
    name: "Manzanita Supply",
    domain: "manzanitasupply.example",
    color: "#2b6a4a",
    logo: "M",
};
const ARROYO = { name: "Arroyo", domain: "arroyorides.example", color: "#212529", logo: "A" };
const CHAPARRAL = {
    name: "Chaparral Hotel",
    domain: "chaparralhotel.example",
    color: "#8a5a2b",
    logo: "C",
};
const MADRONE = {
    name: "Madrone Inn",
    domain: "madroneinn.example",
    color: "#1b3a6b",
    logo: "M",
};
const LAUREL = { name: "Laurel Fiber", domain: "laurelfiber.example", color: "#5f3dc4", logo: "L" };

// Session Tokens are company-issued and opaque, shortened here. Signing in replaces the signed-out
// token with a signed-in one.
const TOKENS = {
    manzanitaSignedOut: "eyJhbGciOi…Lm9x",
    manzanita: "eyJhbGciOi…Qp4w",
    laurelSignedOut: "eyJhbGciOi…Xr3e",
    laurel: "eyJhbGciOi…Tc6r",
    pacifica: "eyJhbGciOi…Nv1p",
    arroyo: "eyJhbGciOi…Qs2v",
    madrone: "eyJhbGciOi…Wx3z",
};

// Atlas signs a new DPoP Proof for every request. All proofs are shortened to this placeholder.
const DPOP = "eyJ0eXAiOiJkcG9wK2p3dCIs…";

// Every token request carries Atlas's client assertion.
const CLIENT_AUTH = `&client_id=https%3A%2F%2Fatlas.example%2Fagent.json
&client_assertion_type=urn%3Aietf%3Aparams%3Aoauth%3Aclient-assertion-type%3Ajwt-bearer
&client_assertion=eyJhbGciOiJFUzI1NiIs…`;

export const walkthroughs: Walkthrough[] = [
    {
        id: "jacket",
        title: "Jacket isn't warm enough",
        shows: "Company agent · Sign-in",
        summary:
            "Atlas finds Manzanita's company agent, asks about a return, and has the user sign in when Manzanita needs to see the order.",
        steps: [
            {
                time: "Thu 7:31 PM",
                title: "Finding Manzanita",
                caption:
                    "The user wants to return a jacket. Atlas reads poppy.json, a file Manzanita publishes on its website, to learn how to reach Manzanita's own agent.",
                chat: [
                    {
                        t: "user",
                        text: "My Manzanita jacket keeps the rain out, but it's not warm enough. Can you return it?",
                    },
                    {
                        t: "agent",
                        text: "I'll ask Manzanita about a return and whether they have something warmer.",
                    },
                ],
                company: {
                    co: MANZANITA,
                    rows: [
                        ["Publishes", `poppy.json, version ${LATEST.id}`],
                        ["Returns", "Handled by its company agent"],
                        ["Sign-in", "On Manzanita's own page"],
                    ],
                },
                wire: [
                    {
                        dir: "Atlas → manzanitasupply.example",
                        kind: "discovery",
                        body: `GET https://manzanitasupply.example/.well-known/poppy.json

HTTP/1.1 200 OK
Content-Type: application/json

{
  "protocol_version": "${LATEST.id}",
  "organization": {
    "name": "Manzanita Supply",
    "domain": "manzanitasupply.example"
  },
  "auth": {
    "issuer": "https://auth.manzanitasupply.example"
  },
  "agent": {
    "protocols": [
      {
        "type": "poppy",
        "endpoint": "https://api.manzanitasupply.example/poppy/conversations"
      }
    ]
  }
}`,
                    },
                    {
                        dir: "Atlas → auth.manzanitasupply.example",
                        kind: "OAuth metadata",
                        body: `GET https://auth.manzanitasupply.example/.well-known/oauth-authorization-server

HTTP/1.1 200 OK
Content-Type: application/json

{
  "issuer": "https://auth.manzanitasupply.example",
  "token_endpoint": "https://auth.manzanitasupply.example/oauth/token",
  "revocation_endpoint": "https://auth.manzanitasupply.example/oauth/revoke",
  "authorization_endpoint": "https://auth.manzanitasupply.example/oauth/authorize",
  "grant_types_supported": [
    "urn:ietf:params:oauth:grant-type:jwt-bearer",
    "refresh_token",
    "authorization_code"
  ],
  "scopes_supported": ["poppy:read", "poppy:write"],
  "protected_resources": ["https://manzanitasupply.example"]
}

// Atlas checks that issuer matches auth.issuer and that
// protected_resources includes https://manzanitasupply.example.
// authorization_code means Direct Sign-In is offered.`,
                    },
                ],
            },
            {
                time: "Thu 7:31 PM",
                title: "Starting signed out",
                caption:
                    "Atlas starts a session: Manzanita's record of this user working through Atlas. It starts signed out, so Atlas can ask about the return right away. Manzanita replies that it needs the user to sign in.",
                chat: [
                    {
                        t: "agent",
                        text: "Manzanita needs you to sign in so they can find your order.",
                    },
                ],
                company: {
                    co: MANZANITA,
                    messages: [
                        [
                            "agent",
                            "The user's jacket keeps the rain out but isn't warm enough. They'd like to return it.",
                        ],
                        [
                            "company",
                            "I can help with that. Please sign in so I can find the order.",
                        ],
                    ],
                    rows: [
                        ["Personal agent", "Atlas"],
                        ["Session", "Signed out"],
                        ["Conversation", "Waiting for sign-in"],
                    ],
                },
                wire: [
                    {
                        dir: "Atlas ↔ auth.manzanitasupply.example",
                        kind: "start a session",
                        body: `POST https://auth.manzanitasupply.example/oauth/token
Content-Type: application/x-www-form-urlencoded
DPoP: ${DPOP}

grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer
&assertion=eyJhbGciOiJFUzI1NiIs…
${CLIENT_AUTH}

// The assertion names Atlas in iss, and this user's
// Manzanita User ID in sub. The DPoP Proof binds the
// token to a key only Atlas holds.

HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: no-store

{
  "access_token": "${TOKENS.manzanitaSignedOut}",
  "token_type": "DPoP",
  "expires_in": 3600,
  "scope": "",
  "session_id": "ses_M4zq"
}`,
                    },
                    {
                        dir: "Atlas ↔ api.manzanitasupply.example",
                        kind: "new conversation",
                        body: `POST https://api.manzanitasupply.example/poppy/conversations?wait=10
Authorization: DPoP ${TOKENS.manzanitaSignedOut}
DPoP: ${DPOP}
Content-Type: application/json

{
  "message": {
    "id": "msg_Jk4tR8wQ2nVb6YpL",
    "sender": "agent",
    "text": "The user's jacket keeps the rain out but isn't warm enough. They'd like to return it.",
    "context": { "locale": "en-US", "time_zone": "America/Los_Angeles", "user_available": true }
  }
}

HTTP/1.1 201 Created
Content-Type: application/json

{
  "conversation_id": "cnv_J6wP3d",
  "events": [
    {
      "id": "evt_m1",
      "type": "message",
      "created_at": "2026-10-08T19:31:20-07:00",
      "message": {
        "id": "msg_Jk4tR8wQ2nVb6YpL",
        "role": "user",
        "sender": "agent",
        "text": "The user's jacket keeps the rain out but isn't warm enough. They'd like to return it.",
        "context": { "locale": "en-US", "time_zone": "America/Los_Angeles", "user_available": true }
      }
    },
    {
      "id": "evt_m2",
      "type": "message",
      "created_at": "2026-10-08T19:31:23-07:00",
      "message": {
        "id": "msg_a7Qe",
        "role": "company",
        "sender": "agent",
        "text": "I can help with that. Please sign in so I can find the order."
      }
    },
    {
      "id": "evt_m3",
      "type": "authorization",
      "created_at": "2026-10-08T19:31:23-07:00",
      "error": "sign_in_required"
    }
  ],
  "cursor": "evt_m3",
  "has_more": false,
  "status": "idle",
  "responder": "agent"
}`,
                    },
                ],
            },
            {
                time: "Thu 7:32 PM",
                title: "The user signs in",
                signIn: {
                    reason: "Let Atlas find your order and arrange a return.",
                    view: {
                        co: MANZANITA,
                        rows: [
                            ["Sign-in", "Waiting for the user"],
                            ["Requested access", "Read and write"],
                            ["Conversation", "Waiting for sign-in"],
                        ],
                    },
                },
                caption:
                    "Atlas opens Manzanita's own sign-in page. The user signs in there and lets Atlas see and change their account. Atlas never sees the password.",
                chat: [
                    { t: "user", text: "I'm signed in." },
                    { t: "agent", text: "Thanks. I'll check your order now." },
                ],
                company: {
                    co: MANZANITA,
                    rows: [
                        ["Sign-in", "Completed by the user"],
                        ["Session", "Signed in, read and write"],
                        ["Conversation", "The same one continues"],
                    ],
                },
                wire: [
                    {
                        dir: "Atlas ↔ auth.manzanitasupply.example",
                        kind: "Direct Sign-In",
                        body: `GET https://auth.manzanitasupply.example/oauth/authorize
  ?response_type=code
  &client_id=https%3A%2F%2Fatlas.example%2Fagent.json
  &redirect_uri=https%3A%2F%2Fatlas.example%2Foauth%2Fcallback
  &scope=poppy%3Aread%20poppy%3Awrite
  &state=Xq81vR
  &code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
  &code_challenge_method=S256

// The user signs in on Manzanita's page and approves access.
// Manzanita sends the browser back to Atlas with a code:

https://atlas.example/oauth/callback
  ?code=SplxlOBeZQQYbYS6WxSbIA
  &state=Xq81vR
  &iss=https%3A%2F%2Fauth.manzanitasupply.example

// Atlas checks that state matches and that iss is
// Manzanita's auth.issuer, then exchanges the code.

POST https://auth.manzanitasupply.example/oauth/token
Content-Type: application/x-www-form-urlencoded
DPoP: ${DPOP}

grant_type=authorization_code
&code=SplxlOBeZQQYbYS6WxSbIA
&redirect_uri=https%3A%2F%2Fatlas.example%2Foauth%2Fcallback
&code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
&session_id=ses_M4zq
${CLIENT_AUTH}

HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: no-store

{
  "access_token": "${TOKENS.manzanita}",
  "token_type": "DPoP",
  "expires_in": 3600,
  "refresh_token": "pat_M8xk…Rf2",
  "refresh_token_expires_in": 2592000,
  "scope": "poppy:read poppy:write",
  "session_id": "ses_M4zq"
}

// refresh_token is the Account Token. Atlas keeps it
// so the user won't need to sign in next time.`,
                    },
                ],
            },
            {
                time: "Thu 7:33 PM",
                title: "An offer comes back",
                caption:
                    "Now signed in, Atlas continues the same conversation. Manzanita finds the order and offers a warmer jacket at the same price, or a refund.",
                chat: [
                    {
                        t: "agent",
                        text: "Manzanita can swap it for the Stormline Insulated, the same jacket with a warm lining, at the same price. Or you can get a full refund. Which would you like?",
                    },
                ],
                company: {
                    co: MANZANITA,
                    messages: [
                        ["agent", "The user has signed in. The order is SW-48213."],
                        [
                            "company",
                            "Thanks. I can exchange it for the Stormline Insulated at no extra cost, or issue a full refund.",
                        ],
                    ],
                    rows: [
                        ["Order", "SW-48213"],
                        ["Options", "Even exchange or refund"],
                        ["Status", "Waiting for the user's choice"],
                    ],
                },
                wire: [
                    {
                        dir: "Atlas ↔ api.manzanitasupply.example",
                        kind: "message and reply",
                        body: `POST https://api.manzanitasupply.example/poppy/conversations/cnv_J6wP3d/messages?cursor=evt_m3&wait=10
Authorization: DPoP ${TOKENS.manzanita}
DPoP: ${DPOP}
Content-Type: application/json

{
  "message": {
    "id": "msg_Wd8nC3kP5tGx1RqZ",
    "sender": "agent",
    "text": "The user has signed in. The order is SW-48213."
  }
}

HTTP/1.1 202 Accepted
Content-Type: application/json

{
  "conversation_id": "cnv_J6wP3d",
  "events": [
    {
      "id": "evt_m4",
      "type": "message",
      "created_at": "2026-10-08T19:33:02-07:00",
      "message": {
        "id": "msg_Wd8nC3kP5tGx1RqZ",
        "role": "user",
        "sender": "agent",
        "text": "The user has signed in. The order is SW-48213."
      }
    },
    {
      "id": "evt_m5",
      "type": "message",
      "created_at": "2026-10-08T19:33:06-07:00",
      "message": {
        "id": "msg_b3Lx",
        "role": "company",
        "sender": "agent",
        "text": "Thanks. I can exchange it for the Stormline Insulated at no extra cost, or issue a full refund.",
        "data": { "exchange_sku": "stormline-insulated-m", "price_difference": 0 }
      }
    }
  ],
  "cursor": "evt_m5",
  "has_more": false,
  "status": "idle",
  "responder": "agent"
}`,
                    },
                ],
            },
            {
                time: "Thu 7:34 PM",
                title: "The exchange is set",
                caption:
                    "Atlas passes on the user's choice. Manzanita arranges the exchange and sends a return label, and Atlas closes the conversation.",
                chat: [
                    { t: "user", text: "Let's do the exchange." },
                    {
                        t: "agent",
                        text: "Done. The Stormline Insulated ships tomorrow, and Manzanita emailed you a prepaid return label for the old jacket.",
                        reaction: { emoji: "👍", label: "Liked by you" },
                    },
                ],
                company: {
                    co: MANZANITA,
                    messages: [
                        ["agent", "The user would like the exchange."],
                        [
                            "company",
                            "Done. The new jacket ships tomorrow, and I've emailed the user a prepaid return label.",
                        ],
                    ],
                    rows: [
                        ["Result", "Exchange arranged"],
                        ["Return code", "MZS-7K4Q"],
                        ["Conversation", "Closed"],
                    ],
                },
                wire: [
                    {
                        dir: "Atlas ↔ api.manzanitasupply.example",
                        kind: "message and reply",
                        body: `POST https://api.manzanitasupply.example/poppy/conversations/cnv_J6wP3d/messages?cursor=evt_m5&wait=10
Authorization: DPoP ${TOKENS.manzanita}
DPoP: ${DPOP}
Content-Type: application/json

{
  "message": {
    "id": "msg_Ue2hV9mJ4sKb7TfA",
    "sender": "agent",
    "text": "The user would like the exchange."
  }
}

// If the connection drops, Atlas sends the same message
// with the same id, and Manzanita won't count it twice.

HTTP/1.1 202 Accepted
Content-Type: application/json

{
  "conversation_id": "cnv_J6wP3d",
  "events": [
    {
      "id": "evt_m6",
      "type": "message",
      "created_at": "2026-10-08T19:34:11-07:00",
      "message": {
        "id": "msg_Ue2hV9mJ4sKb7TfA",
        "role": "user",
        "sender": "agent",
        "text": "The user would like the exchange."
      }
    },
    {
      "id": "evt_m7",
      "type": "message",
      "created_at": "2026-10-08T19:34:15-07:00",
      "message": {
        "id": "msg_c9Pt",
        "role": "company",
        "sender": "agent",
        "text": "Done. The new jacket ships tomorrow, and I've emailed the user a prepaid return label.",
        "data": { "exchange_id": "ex_48213", "return_code": "MZS-7K4Q" }
      }
    }
  ],
  "cursor": "evt_m7",
  "has_more": false,
  "status": "idle",
  "responder": "agent"
}`,
                    },
                    {
                        dir: "Atlas ↔ api.manzanitasupply.example",
                        kind: "close",
                        body: `POST https://api.manzanitasupply.example/poppy/conversations/cnv_J6wP3d/close
Authorization: DPoP ${TOKENS.manzanita}
DPoP: ${DPOP}
Content-Type: application/json

{}

HTTP/1.1 200 OK
Content-Type: application/json

{ "status": "closed", "responder": "agent" }`,
                    },
                ],
            },
        ],
    },
    {
        id: "troubleshoot",
        title: "Internet keeps dropping",
        shows: "Website · A person at the company",
        summary:
            "Atlas signs in to Laurel, checks the connection on Laurel's website, and gets a technician, who then talks with the user directly.",
        steps: [
            {
                time: "Tue 1:22 PM",
                title: "Signing in for the user",
                caption:
                    "Laurel lets Atlas sign in with the user's saved Laurel login, which the protocol calls Mediated Sign-In. Laurel also texts the user a one-time code, and Atlas asks for it.",
                chat: [
                    {
                        t: "user",
                        text: "My internet keeps dropping every few minutes and I have a call at 2. Can you get Laurel to fix it?",
                    },
                    {
                        t: "agent",
                        text: "I'm signing in to Laurel with your saved login. They just texted you a code. What is it?",
                    },
                    { t: "user", text: "482913" },
                    { t: "agent", text: "Thanks, I'm in. Checking your connection now." },
                ],
                company: {
                    co: LAUREL,
                    rows: [
                        ["Sign-in", "By Atlas, with the user's login"],
                        ["Extra check", "Code texted to the user"],
                        ["Session", "Signed in, read and write"],
                    ],
                },
                wire: [
                    {
                        dir: "Atlas → laurelfiber.example",
                        kind: "discovery",
                        body: `GET https://laurelfiber.example/.well-known/poppy.json

HTTP/1.1 200 OK
Content-Type: application/json

{
  "protocol_version": "${LATEST.id}",
  "organization": { "name": "Laurel Fiber", "domain": "laurelfiber.example" },
  "auth": {
    "issuer": "https://auth.laurelfiber.example",
    "mediated": {
      "endpoint": "https://auth.laurelfiber.example/poppy/sign-in",
      "fields": [
        { "name": "email", "label": "Email", "secret": false },
        { "name": "password", "label": "Password", "secret": true }
      ],
      "scopes": ["poppy:read", "poppy:write"]
    }
  },
  "agent": {
    "protocols": [
      { "type": "poppy", "endpoint": "https://api.laurelfiber.example/poppy/conversations" }
    ]
  },
  "web": {
    "browser_session_endpoint": "https://laurelfiber.example/poppy/browser-session"
  }
}

// Atlas checks Laurel's OAuth server metadata and starts
// a signed-out session, as in the jacket example.`,
                    },
                    {
                        dir: "Atlas ↔ auth.laurelfiber.example",
                        kind: "Mediated Sign-In",
                        body: `POST https://auth.laurelfiber.example/poppy/sign-in
Authorization: DPoP ${TOKENS.laurelSignedOut}
DPoP: ${DPOP}
Content-Type: application/json

{
  "scope": "poppy:read poppy:write",
  "credentials": { "email": "…", "password": "…" }
}

HTTP/1.1 200 OK
Content-Type: application/json

{
  "status": "code_required",
  "sign_in_id": "sgn_8Qm2",
  "code": { "sent_to": "Text to the phone number ending in 71" },
  "expires_at": "2026-10-06T13:32:00-05:00"
}

// Atlas asks the user for the code and sends only the code:

POST https://auth.laurelfiber.example/poppy/sign-in/sgn_8Qm2
Authorization: DPoP ${TOKENS.laurelSignedOut}
DPoP: ${DPOP}
Content-Type: application/json

{ "code": "482913" }

HTTP/1.1 200 OK
Content-Type: application/json

{
  "status": "complete",
  "access_token": "${TOKENS.laurel}",
  "token_type": "DPoP",
  "expires_in": 3600,
  "refresh_token": "pat_L5wd…Hn8",
  "scope": "poppy:read poppy:write",
  "session_id": "ses_L2v9"
}`,
                    },
                ],
            },
            {
                time: "Tue 1:23 PM",
                title: "Checking the support page",
                caption:
                    "Atlas opens Laurel's support page in its own browser. The browser joins the same signed-in session, so the page shows this user's connection: no outage nearby, but 14 dropouts today.",
                chat: [
                    {
                        t: "agent",
                        text: "There's no outage in your area, but your connection has dropped 14 times today. I'm asking Laurel to fix it.",
                    },
                ],
                company: {
                    co: LAUREL,
                    rows: [
                        ["Page", "Support diagnostics"],
                        ["Visitor", "Atlas, signed in for the user"],
                        ["Result", "No outage, 14 dropouts today"],
                    ],
                },
                wire: [
                    {
                        dir: "Atlas's browser ↔ laurelfiber.example",
                        kind: "browser joins",
                        body: `POST https://laurelfiber.example/poppy/browser-session
Content-Type: application/x-www-form-urlencoded

assertion=eyJ0eXAiOiJwb3BweS1icm93c2VyK2p3dCIs…

// The browser assertion, signed by Atlas:
{
  "iss": "https://atlas.example/agent.json",
  "sub": "usr_L7r2xW",
  "aud": "https://laurelfiber.example/poppy/browser-session",
  "session_id": "ses_L2v9",
  "return_to": "https://laurelfiber.example/support/diagnostics",
  "iat": 1791311000,
  "exp": 1791311060,
  "jti": "Hk29vQ0sPZ1mXa7cR4tLwA"
}

HTTP/1.1 303 See Other
Location: https://laurelfiber.example/support/diagnostics
Set-Cookie: lf_session=Pz81kQ…; Path=/; Secure; HttpOnly; SameSite=Lax`,
                    },
                    {
                        dir: "Atlas's browser ↔ laurelfiber.example",
                        kind: "page view",
                        body: `GET https://laurelfiber.example/support/diagnostics
Cookie: lf_session=Pz81kQ…

HTTP/1.1 200 OK
Content-Type: text/html

<!-- Illustrative content from Laurel's support page. -->
<h1>Connection diagnostics</h1>
<p>Modem mdm_92K is online. No outage in your area.</p>
<p>Your connection has dropped 14 times today.</p>`,
                    },
                ],
            },
            {
                time: "Tue 1:25 PM",
                title: "A technician joins",
                caption:
                    "Atlas explains the problem to Laurel's company agent and asks for a person. A technician joins and asks to talk with the user, because someone at home needs to look at the modem.",
                chat: [
                    {
                        t: "agent",
                        text: "A Laurel technician has joined and wants to talk with you directly about your modem. Okay to connect you?",
                    },
                    { t: "user", text: "Sure." },
                ],
                company: {
                    co: LAUREL,
                    messages: [
                        [
                            "agent",
                            "The user's connection keeps dropping, 14 times today, and they have a call at 2. Please fix it from your end.",
                        ],
                        [
                            "company",
                            "I'm a Laurel technician. I can see the dropouts. I need someone at home to check the modem lights with me.",
                        ],
                    ],
                    rows: [
                        ["Status", "Waited for a person, then one joined"],
                        ["Handled by", "A technician"],
                        ["Request", "Talk with the user"],
                    ],
                },
                wire: [
                    {
                        dir: "Atlas ↔ api.laurelfiber.example",
                        kind: "new conversation",
                        body: `POST https://api.laurelfiber.example/poppy/conversations
Authorization: DPoP ${TOKENS.laurel}
DPoP: ${DPOP}
Content-Type: application/json

{
  "message": {
    "id": "msg_Rb5yN2qH8vLc4ZsE",
    "sender": "agent",
    "text": "The user's connection keeps dropping, 14 times today, and they have a call at 2. Please fix it from your end.",
    "data": { "modem_id": "mdm_92K", "dropouts_today": 14 },
    "context": { "time_zone": "America/Chicago", "user_available": true }
  }
}

HTTP/1.1 201 Created
Content-Type: application/json

{ "conversation_id": "cnv_2Lm0", "status": "working", "responder": "agent" }`,
                    },
                    {
                        dir: "Atlas ↔ api.laurelfiber.example",
                        kind: "ask for a person",
                        body: `POST https://api.laurelfiber.example/poppy/conversations/cnv_2Lm0/handoff
Authorization: DPoP ${TOKENS.laurel}
DPoP: ${DPOP}
Content-Type: application/json

{}

HTTP/1.1 202 Accepted
Content-Type: application/json

{ "status": "queued", "responder": "agent" }`,
                    },
                    {
                        dir: "Atlas ↔ api.laurelfiber.example",
                        kind: "read events",
                        body: `GET https://api.laurelfiber.example/poppy/conversations/cnv_2Lm0/events?wait=30
Authorization: DPoP ${TOKENS.laurel}
DPoP: ${DPOP}

HTTP/1.1 200 OK
Content-Type: application/json

{
  "conversation_id": "cnv_2Lm0",
  "events": [
    {
      "id": "evt_l1",
      "type": "message",
      "created_at": "2026-10-06T13:24:00-05:00",
      "message": {
        "id": "msg_Rb5yN2qH8vLc4ZsE",
        "role": "user",
        "sender": "agent",
        "text": "The user's connection keeps dropping, 14 times today, and they have a call at 2. Please fix it from your end.",
        "data": { "modem_id": "mdm_92K", "dropouts_today": 14 },
        "context": { "time_zone": "America/Chicago", "user_available": true }
      }
    },
    {
      "id": "evt_l2",
      "type": "state",
      "created_at": "2026-10-06T13:24:02-05:00",
      "status": "queued",
      "responder": "agent"
    },
    {
      "id": "evt_l3",
      "type": "state",
      "created_at": "2026-10-06T13:24:51-05:00",
      "status": "idle",
      "responder": "human"
    },
    {
      "id": "evt_l4",
      "type": "message",
      "created_at": "2026-10-06T13:25:10-05:00",
      "message": {
        "id": "msg_t8Vn",
        "role": "company",
        "sender": "human",
        "text": "I'm a Laurel technician. I can see the dropouts. I need someone at home to check the modem lights with me."
      }
    },
    {
      "id": "evt_l5",
      "type": "user_requested",
      "created_at": "2026-10-06T13:25:12-05:00",
      "reason": "A technician needs to check the modem with the customer."
    }
  ],
  "cursor": "evt_l5",
  "has_more": false,
  "status": "idle",
  "responder": "human"
}

// Without a cursor, the read starts at the beginning, so it
// includes Atlas's own first message.`,
                    },
                ],
            },
            {
                time: "Tue 1:27 PM",
                title: "The user talks with the technician",
                caption:
                    "Atlas opens a Direct Conversation: a new conversation, linked to the first, where the user talks with the technician in Atlas's chat. The technician resets the connection, and the internet is back.",
                chat: [
                    { t: "user", text: "Hi, I'm here. What should I check?" },
                    {
                        t: "company",
                        from: "Laurel technician",
                        text: "Thanks! Is the light on the front of your modem blinking orange?",
                    },
                    { t: "user", text: "Yes, it's blinking orange." },
                    {
                        t: "company",
                        from: "Laurel technician",
                        text: "That means a stuck connection on our side. I've reset it. The light should turn solid green in a minute.",
                    },
                    {
                        t: "user",
                        text: "It's green, and the internet is back. Thanks!",
                    },
                ],
                company: {
                    co: LAUREL,
                    messages: [
                        ["user", "Yes, it's blinking orange."],
                        [
                            "company",
                            "That means a stuck connection on our side. I've reset it. The light should turn solid green in a minute.",
                        ],
                    ],
                    rows: [
                        ["Conversation", "Directly with the user"],
                        ["Result", "Connection reset"],
                        ["Status", "Closed"],
                    ],
                },
                wire: [
                    {
                        dir: "Atlas ↔ api.laurelfiber.example",
                        kind: "Direct Conversation",
                        body: `POST https://api.laurelfiber.example/poppy/conversations
Authorization: DPoP ${TOKENS.laurel}
DPoP: ${DPOP}
Content-Type: application/json

{
  "parent_conversation_id": "cnv_2Lm0",
  "message": {
    "id": "msg_Pe6jWm3Kd0RtXc8V",
    "sender": "human",
    "text": "Hi, I'm here. What should I check?"
  }
}

HTTP/1.1 201 Created
Content-Type: application/json

{ "conversation_id": "cnv_9Dq4", "status": "idle", "responder": "human" }

// sender "human" tells Laurel these are the user's own words.
// The user's later messages go to cnv_9Dq4/messages the same way.`,
                    },
                    {
                        dir: "Atlas ↔ api.laurelfiber.example",
                        kind: "close",
                        body: `// Closing the first conversation also closes the Direct Conversation.
POST https://api.laurelfiber.example/poppy/conversations/cnv_2Lm0/close
Authorization: DPoP ${TOKENS.laurel}
DPoP: ${DPOP}
Content-Type: application/json

{}

HTTP/1.1 200 OK
Content-Type: application/json

{ "status": "closed", "responder": "human" }

GET https://api.laurelfiber.example/poppy/conversations/cnv_2Lm0/events?cursor=evt_l5
Authorization: DPoP ${TOKENS.laurel}
DPoP: ${DPOP}

HTTP/1.1 200 OK
Content-Type: application/json

{
  "conversation_id": "cnv_2Lm0",
  "events": [
    {
      "id": "evt_l6",
      "type": "direct_opened",
      "created_at": "2026-10-06T13:25:40-05:00",
      "conversation_id": "cnv_9Dq4"
    },
    {
      "id": "evt_l7",
      "type": "direct_closed",
      "created_at": "2026-10-06T13:27:58-05:00",
      "conversation_id": "cnv_9Dq4"
    },
    {
      "id": "evt_l8",
      "type": "state",
      "created_at": "2026-10-06T13:27:58-05:00",
      "status": "closed",
      "responder": "human"
    }
  ],
  "cursor": "evt_l8",
  "has_more": false,
  "status": "closed",
  "responder": "human"
}`,
                    },
                ],
            },
        ],
    },
    {
        id: "delay",
        title: "Flight delayed overnight",
        shows: "APIs · Company agent · Website",
        summary:
            "A flight delay changes four plans. Atlas uses whatever each company offers: an API, a company agent, or a website. The user signed in to each company before, so Atlas doesn't need to ask again.",
        steps: [
            {
                time: "Tue 11:02 AM",
                title: "Checking the flight",
                caption:
                    "Atlas kept the user's Pacifica sign-in from before, as an Account Token, so it starts a signed-in session without asking. It only needs to read the booking, so it asks for read access alone.",
                chat: [
                    {
                        t: "user",
                        text: "My flight to Boston looks delayed. Can you check it and sort out my ride and hotels?",
                    },
                    {
                        t: "agent",
                        text: "Pacifica moved your flight to tomorrow at 7:30 AM. I'll move your Boston ride, ask the Madrone Inn about your stay, and check for another night at the Chaparral here in Chicago.",
                    },
                ],
                company: {
                    co: PACIFICA,
                    rows: [
                        ["Session", "Signed in, read only"],
                        ["Requested", "Booking PX2L7D"],
                        ["Result", "Departs tomorrow at 7:30 AM"],
                    ],
                },
                wire: [
                    {
                        dir: "Atlas ↔ auth.pacificaair.example",
                        kind: "saved sign-in",
                        body: `POST https://auth.pacificaair.example/oauth/token
Content-Type: application/x-www-form-urlencoded
DPoP: ${DPOP}

grant_type=refresh_token
&refresh_token=pat_P3kq…Vb7
&scope=poppy%3Aread
${CLIENT_AUTH}

HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: no-store

{
  "access_token": "${TOKENS.pacifica}",
  "token_type": "DPoP",
  "expires_in": 3600,
  "scope": "poppy:read",
  "session_id": "ses_P8t1"
}`,
                    },
                    {
                        dir: "Atlas ↔ api.pacificaair.example",
                        kind: "company API",
                        body: `// Pacifica lists this API in its poppy.json as type "openapi".
GET https://api.pacificaair.example/v1/bookings/PX2L7D
Authorization: DPoP ${TOKENS.pacifica}
DPoP: ${DPOP}

HTTP/1.1 200 OK
Content-Type: application/json

{
  "confirmation": "PX2L7D",
  "flight": "PA 518",
  "status": "delayed",
  "departs_at": "2026-10-14T07:30:00-05:00",
  "arrives_at": "2026-10-14T09:55:00-04:00",
  "reason": "crew"
}`,
                    },
                ],
            },
            {
                time: "Tue 11:03 AM",
                title: "Moving the ride",
                caption:
                    "Arroyo offers an API for ride changes. Atlas starts a signed-in Arroyo session the same way and moves the pickup.",
                chat: [
                    {
                        t: "agent",
                        text: "Your Arroyo pickup is now tomorrow at 10:05 AM, at Boston Logan Terminal B. The fare estimate is still $48.",
                    },
                ],
                company: {
                    co: ARROYO,
                    rows: [
                        ["Session", "Signed in, read and write"],
                        ["Action", "Change pickup time"],
                        ["Result", "Pickup moved to Wed 10:05 AM"],
                    ],
                },
                wire: [
                    {
                        dir: "Atlas ↔ api.arroyorides.example",
                        kind: "company API",
                        body: `// Atlas got a signed-in Arroyo Session Token from its
// Arroyo Account Token, as with Pacifica.
// The request format is Arroyo's own.

PATCH https://api.arroyorides.example/v1/rides/ride_7Pz3
Authorization: DPoP ${TOKENS.arroyo}
DPoP: ${DPOP}
Content-Type: application/json

{ "pickup": { "place": "BOS Terminal B arrivals", "at": "2026-10-14T10:05:00-04:00" } }

HTTP/1.1 200 OK
Content-Type: application/json

{
  "ride_id": "ride_7Pz3",
  "status": "scheduled",
  "fare_estimate": { "amount": 48, "currency": "USD" }
}`,
                    },
                ],
            },
            {
                time: "Tue 11:04 AM",
                title: "Asking the Boston hotel",
                caption:
                    "Madrone handles booking changes through its own agent. Atlas explains the delay and asks to move the stay by a day.",
                chat: [
                    {
                        t: "agent",
                        text: "Madrone moved your stay to start tomorrow, waived tonight's charge, and set up an 11 AM check-in.",
                    },
                ],
                company: {
                    co: MADRONE,
                    messages: [
                        [
                            "agent",
                            "The guest's flight moved to tomorrow morning. Could you move their stay by a day and waive tonight's charge?",
                        ],
                        [
                            "company",
                            "Of course, given the flight delay. The stay now starts tomorrow, with check-in at 11.",
                        ],
                    ],
                    rows: [
                        ["Result", "Stay moved, tonight waived"],
                        ["Status", "Idle"],
                    ],
                },
                wire: [
                    {
                        dir: "Atlas ↔ api.madroneinn.example",
                        kind: "new conversation",
                        body: `POST https://api.madroneinn.example/poppy/conversations?wait=30
Authorization: DPoP ${TOKENS.madrone}
DPoP: ${DPOP}
Content-Type: application/json

{
  "message": {
    "id": "msg_Gt7rE1xM6kQa9WnD",
    "sender": "agent",
    "text": "The guest's flight moved to tomorrow morning. Could you move their stay by a day and waive tonight's charge?",
    "data": { "flight": "PA 518", "reason": "crew", "new_start": "2026-10-14" }
  }
}

HTTP/1.1 201 Created
Content-Type: application/json

{
  "conversation_id": "cnv_H4vB1n",
  "events": [
    {
      "id": "evt_h1",
      "type": "message",
      "created_at": "2026-10-13T11:04:05-05:00",
      "message": {
        "id": "msg_Gt7rE1xM6kQa9WnD",
        "role": "user",
        "sender": "agent",
        "text": "The guest's flight moved to tomorrow morning. Could you move their stay by a day and waive tonight's charge?",
        "data": { "flight": "PA 518", "reason": "crew", "new_start": "2026-10-14" }
      }
    },
    {
      "id": "evt_h2",
      "type": "message",
      "created_at": "2026-10-13T11:04:12-05:00",
      "message": {
        "id": "msg_d4Hs",
        "role": "company",
        "sender": "agent",
        "text": "Of course, given the flight delay. The stay now starts tomorrow, with check-in at 11.",
        "data": { "start": "2026-10-14", "check_in": "11:00", "change_fee": 0 }
      }
    }
  ],
  "cursor": "evt_h2",
  "has_more": false,
  "status": "idle",
  "responder": "agent"
}`,
                    },
                ],
            },
            {
                time: "Tue 11:06 AM",
                title: "Checking Chaparral's website",
                caption:
                    "Chaparral offers its website. Atlas's browser joins a signed-in Chaparral session, opens the user's current stay, and finds a room for one more night.",
                chat: [
                    {
                        t: "agent",
                        text: "The Chaparral has a king room for tonight at $219. You'd need to switch rooms. Shall I book it?",
                    },
                ],
                company: {
                    co: CHAPARRAL,
                    rows: [
                        ["Page", "Current stay"],
                        ["Visitor", "Atlas, signed in for the user"],
                        ["Available", "King room tonight, $219"],
                    ],
                },
                wire: [
                    {
                        dir: "Atlas's browser ↔ chaparralhotel.example",
                        kind: "browser joins",
                        body: `POST https://chaparralhotel.example/poppy/browser-session
Content-Type: application/x-www-form-urlencoded

assertion=eyJ0eXAiOiJwb3BweS1icm93c2VyK2p3dCIs…

// Signed by Atlas, with session_id for its signed-in
// Chaparral session and return_to set to the stay page.

HTTP/1.1 303 See Other
Location: https://chaparralhotel.example/stays/stay_9Kp4
Set-Cookie: ch_session=Wq52nT…; Path=/; Secure; HttpOnly; SameSite=Lax`,
                    },
                    {
                        dir: "Atlas's browser ↔ chaparralhotel.example",
                        kind: "page view",
                        body: `GET https://chaparralhotel.example/stays/stay_9Kp4
Cookie: ch_session=Wq52nT…

HTTP/1.1 200 OK
Content-Type: text/html

<!-- Illustrative content from Chaparral's current-stay page. -->
<h1>Extend your stay</h1>
<p>A king room is available tonight for $219.</p>
<form action="/stays/stay_9Kp4/extend" method="post">
  <input type="hidden" name="offer_id" value="room_offer_912">
  <label>Checkout <input name="checkout" type="datetime-local"></label>
  <button type="submit">Book the extra night</button>
</form>`,
                    },
                ],
            },
            {
                time: "Tue 11:09 AM",
                title: "Everything lines up",
                caption:
                    "The user says yes. Atlas fills in Chaparral's booking form and sums up what all four companies did.",
                chat: [
                    { t: "user", text: "Yes, book it. And I'll need a 5:30 AM checkout." },
                    {
                        t: "agent",
                        text: "All set. Tonight you're in room 912 at the Chaparral, with a 5:30 AM checkout. You fly at 7:30, your Boston ride is at 10:05, and the Madrone has your room ready at 11.",
                        reaction: { emoji: "👍", label: "Liked by you" },
                    },
                ],
                company: {
                    co: CHAPARRAL,
                    rows: [
                        ["Action", "Book the extra night"],
                        ["Result", "Room 912 booked"],
                        ["Checkout", "Wed 5:30 AM"],
                    ],
                },
                wire: [
                    {
                        dir: "Atlas's browser ↔ chaparralhotel.example",
                        kind: "form submission",
                        body: `// Atlas submits Chaparral's form after the user says yes.
POST https://chaparralhotel.example/stays/stay_9Kp4/extend
Cookie: ch_session=Wq52nT…
Content-Type: application/x-www-form-urlencoded

offer_id=room_offer_912&checkout=2026-10-14T05%3A30

HTTP/1.1 200 OK
Content-Type: text/html

<h1>Your extra night is booked</h1>
<p>Room 912 · Checkout October 14 at 5:30 AM</p>`,
                    },
                ],
            },
        ],
    },
];
