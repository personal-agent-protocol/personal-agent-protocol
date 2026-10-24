// Every check the validator runs, with the requirement it tests. Pure metadata, no side effects:
// the site build imports this to check that each `section` is a heading id on its page and each
// `quote` appears word for word in that page's text.

// The version of the spec this validator checks: the latest. The site build fails when it isn't,
// and `pnpm docs:draft` changes it.
export const PROTOCOL_VERSION = "0.3";

export type Milestone = "foundation" | "interfaces" | "sign-in" | "extensions";

export type CheckInfo = {
    // A stable slug, such as "discovery.domain-matches-host".
    id: string;
    title: string;
    milestone: Milestone;
    // MUST checks fail; SHOULD checks warn.
    level: "MUST" | "SHOULD";
    // "<page>#<heading id>", such as "spec#sending-tokens".
    section: string;
    // The requirement, copied from the page's text (Markdown formatting removed).
    quote: string;
};

export const MILESTONES: { id: Milestone; number: number; title: string }[] = [
    { id: "foundation", number: 1, title: "Foundation" },
    { id: "interfaces", number: 2, title: "Interfaces" },
    { id: "sign-in", number: 3, title: "Sign-in and accounts" },
    { id: "extensions", number: 4, title: "Extensions" },
];

// Section numbers for display, such as "spec 4.3".
export const SECTION_NUMBERS: Record<string, string> = {
    "spec#terms": "2",
    "spec#discovery": "3",
    "spec#fields": "3.1",
    "spec#oauth-server": "3.2",
    "spec#extensions": "3.3",
    "spec#sessions": "4",
    "spec#agent-identity": "4.1",
    "spec#starting-sessions": "4.2",
    "spec#sending-tokens": "4.3",
    "spec#sign-in": "4.4",
    "spec#direct-sign-in": "4.5",
    "spec#device-sign-in": "4.6",
    "spec#mediated-sign-in": "4.7",
    "spec#account-tokens": "4.8",
    "spec#sign-out": "4.9",
    "spec#web-browsing": "5",
    "spec#apis": "6",
    "spec#conversations": "7",
    "spec#conversation-protocols": "7.1",
    "spec#conversation-requests": "7.2",
    "spec#sending-messages": "7.3",
    "spec#message-fields": "7.4",
    "spec#reading-events": "7.5",
    "spec#streaming": "7.6",
    "spec#status": "7.7",
    "spec#human-or-ai": "7.8",
    "spec#handoff": "7.9",
    "spec#direct-conversations": "7.10",
    "spec#conversation-sign-in": "7.11",
    "spec#closing": "7.12",
    "spec#conversation-errors": "7.13",
};

function foundation(
    id: string,
    title: string,
    section: string,
    quote: string,
    level: "MUST" | "SHOULD" = "MUST",
): CheckInfo {
    return { id, title, milestone: "foundation", level, section, quote };
}

function interfaces(
    id: string,
    title: string,
    section: string,
    quote: string,
    level: "MUST" | "SHOULD" = "MUST",
): CheckInfo {
    return { id, title, milestone: "interfaces", level, section, quote };
}

export const CATALOG: CheckInfo[] = [
    // Milestone 1: discovery (section 3).
    foundation(
        "discovery.https",
        "poppy.json is served over HTTPS at the well-known path",
        "spec#discovery",
        "A Company MUST publish its poppy.json document at https://{domain}/.well-known/poppy.json over HTTPS",
    ),
    foundation(
        "discovery.redirects-https",
        "Every redirect of the well-known URL is to an HTTPS URL",
        "spec#discovery",
        "every redirect MUST be to an HTTPS URL",
    ),
    foundation(
        "discovery.json",
        "poppy.json is a JSON object",
        "spec#terms",
        "The JSON document a Company publishes at /.well-known/poppy.json",
    ),
    foundation(
        "discovery.schema",
        "poppy.json fields have the forms section 3.1 describes",
        "spec#fields",
        "to tell Personal Agents how to start Sessions and sign in, and which APIs and Company Agent it offers",
    ),
    foundation(
        "discovery.protocol-version",
        "protocol_version is the version this validator checks",
        "spec#fields",
        "a Personal Agent MUST NOT use a document whose major.minor version it doesn't support.",
    ),
    foundation(
        "discovery.domain-matches-host",
        "organization.domain is the host that serves poppy.json, after redirects",
        "spec#fields",
        "domain MUST be the host that serves the document, after any redirects. Domains are compared ignoring case, with no other normalization.",
    ),
    foundation(
        "discovery.auth-present",
        "auth is present when agent, apis, feedback, or web.browser_session_endpoint is",
        "spec#fields",
        "Sessions need auth, so a Company without it can only be browsed as an ordinary website (section 5).",
    ),
    foundation(
        "discovery.interface-present",
        "poppy.json lists at least one of agent, apis, or web",
        "spec#fields",
        "One of agent, apis, or web",
    ),
    foundation(
        "discovery.api-types",
        "Each API's type is openapi or mcp",
        "spec#apis",
        "Each API's type MUST be one of these",
    ),

    // Milestone 1: OAuth server metadata (3.2).
    foundation(
        "metadata.published",
        "The issuer publishes OAuth Authorization Server Metadata",
        "spec#oauth-server",
        "The issuer MUST publish OAuth Authorization Server Metadata (RFC 8414)",
    ),
    foundation(
        "metadata.schema",
        "The metadata has the fields section 3.2 requires, in the right forms",
        "spec#oauth-server",
        "The Personal Agent uses these fields of the metadata",
    ),
    foundation(
        "metadata.issuer-matches",
        "The metadata's issuer exactly matches auth.issuer",
        "spec#oauth-server",
        "MUST check that its issuer exactly matches auth.issuer",
    ),
    foundation(
        "metadata.protected-resources",
        "protected_resources includes https://{organization.domain}",
        "spec#oauth-server",
        "MUST list https://{domain} for every domain whose poppy.json names the issuer",
    ),
    foundation(
        "metadata.token-endpoint",
        "The metadata has a token_endpoint",
        "spec#oauth-server",
        "token_endpoint issues Session and Account Tokens (4.2, 4.8). Required.",
    ),
    foundation(
        "metadata.revocation-endpoint",
        "The metadata has a revocation_endpoint",
        "spec#oauth-server",
        "revocation_endpoint revokes Account Tokens (4.9). Required.",
    ),
    foundation(
        "metadata.dpop-algs",
        "dpop_signing_alg_values_supported, if present, includes ES256",
        "spec#oauth-server",
        "the list MUST then include ES256.",
    ),
    foundation(
        "metadata.grant-types",
        "grant_types_supported includes the JWT bearer and refresh token grants",
        "spec#oauth-server",
        "Required, and it MUST include urn:ietf:params:oauth:grant-type:jwt-bearer (4.2) and refresh_token (4.8).",
    ),
    foundation(
        "metadata.authorization-endpoint",
        "The metadata has an authorization_endpoint when it offers Direct Sign-In",
        "spec#oauth-server",
        "authorization_endpoint starts Direct Sign-In (4.5). Required if grant_types_supported includes authorization_code.",
    ),
    foundation(
        "metadata.device-authorization-endpoint",
        "The metadata has a device_authorization_endpoint when it offers Device Sign-In",
        "spec#oauth-server",
        "device_authorization_endpoint starts Device Sign-In (4.6). Required if grant_types_supported includes urn:ietf:params:oauth:grant-type:device_code.",
    ),
    foundation(
        "metadata.scopes-supported",
        "scopes_supported lists every scope a sign-in can grant",
        "spec#oauth-server",
        "Required if the Company offers any type of sign-in, and it MUST then include every account scope a Personal Agent can request (4.4).",
    ),
    foundation(
        "metadata.scopes-described",
        "Every scope in scopes_supported has a description",
        "spec#sign-in",
        "The Company MUST describe each scope in scopes_supported, so the Personal Agent can choose the ones a task needs: in the scopes of an OAuth 2.0 security scheme in an OpenAPI description it lists (section 6), or otherwise in auth.scopes.",
    ),

    // Milestone 1: starting and renewing Sessions (4.2).
    foundation(
        "session.start",
        "Token endpoint starts a Session with the JWT bearer grant",
        "spec#starting-sessions",
        "To start a Session, the Personal Agent requests a Session Token from the Company's token_endpoint with the JWT bearer grant (RFC 7523).",
    ),
    foundation(
        "session.response-schema",
        "Session response has the fields section 4.2 lists",
        "spec#starting-sessions",
        "Personal Agents MUST NOT depend on their contents; everything they need is in the response.",
    ),
    foundation(
        "session.token-type",
        "A Session Token requested with a DPoP Proof has token_type DPoP",
        "spec#starting-sessions",
        "token_type is DPoP, or Bearer for a token for an MCP server that doesn't support DPoP (4.3).",
    ),
    foundation(
        "session.expires-in",
        "expires_in is greater than 0",
        "spec#starting-sessions",
        "The Company chooses the value, and it MUST be greater than 0.",
    ),
    foundation(
        "session.token-lifetime",
        "Session Tokens last hours, not days",
        "spec#starting-sessions",
        "Session Tokens SHOULD last hours, not days.",
        "SHOULD",
    ),
    foundation(
        "session.signed-out",
        "A new Session is signed out, with no scopes",
        "spec#starting-sessions",
        "scope is a space-separated string of the account scopes granted (4.4). It is always present. A signed-out token has none",
    ),
    foundation(
        "session.no-store",
        "Token responses send Cache-Control: no-store",
        "guides#both-secrets",
        "Send Cache-Control: no-store on every response that carries a token or code.",
        "SHOULD",
    ),
    foundation(
        "session.renew",
        "Renewing with session_id returns a token for the same Session",
        "spec#starting-sessions",
        "The Company checks that the Session belongs to the same client_id and User ID as the assertion, and returns a new signed-out Session Token for it.",
    ),
    foundation(
        "session.unknown-session",
        "An unknown session_id returns invalid_session",
        "spec#starting-sessions",
        "If it has ended, the Company returns invalid_session, and the Personal Agent starts a new Session.",
    ),
    foundation(
        "session.assertion-replay",
        "Token endpoint rejects a reused Session assertion jti",
        "spec#starting-sessions",
        "The Company MUST reject a jti it has already seen from the same client_id until the assertion expires, so a copied assertion can't be used again.",
    ),
    foundation(
        "session.client-assertion-aud",
        "Token endpoint rejects a client assertion whose aud is the token endpoint URL",
        "spec#agent-identity",
        "Companies MUST reject a client assertion with any other aud, compared character for character, including their token endpoint URL.",
    ),
    foundation(
        "session.client-assertion-unknown-key",
        "Token endpoint rejects a client assertion signed by a key not in jwks_uri",
        "spec#starting-sessions",
        "The Company verifies both assertions against the Personal Agent's jwks_uri",
    ),
    foundation(
        "session.assertion-unknown-key",
        "Token endpoint rejects a Session assertion signed by a key not in jwks_uri",
        "spec#starting-sessions",
        "The Company verifies both assertions against the Personal Agent's jwks_uri",
    ),
    foundation(
        "session.browser-assertion-rejected",
        "Token endpoint rejects a browser assertion as a Session assertion",
        "spec#web-browsing",
        "A Session assertion isn't accepted here, and a browser assertion isn't accepted at the token endpoint.",
    ),

    // Milestone 1: DPoP (4.3).
    foundation(
        "dpop.nonce",
        "DPoP nonces, if required, are issued as RFC 9449 describes",
        "spec#sending-tokens",
        "A Company MAY require proofs to include a nonce it issued, as RFC 9449 describes, so proofs can't be made in advance.",
    ),
    foundation(
        "dpop.token-replay",
        "Token endpoint rejects a reused DPoP proof",
        "spec#sending-tokens",
        "At the token endpoint, the Company MUST reject a proof whose jti it has already accepted within the acceptance window",
    ),
    foundation(
        "dpop.token-htu",
        "Token endpoint rejects a DPoP proof made for a different URL",
        "spec#sending-tokens",
        "htm and htu match the request.",
    ),
    foundation(
        "dpop.accepted",
        "A DPoP Session Token with a valid proof is accepted",
        "spec#sending-tokens",
        "API calls and conversations MUST carry the Session Token in the Authorization header with the DPoP scheme, together with a DPoP Proof",
    ),
    foundation(
        "dpop.missing-proof",
        "A request without a DPoP proof is rejected with 401 and WWW-Authenticate: DPoP",
        "spec#sending-tokens",
        "APIs and conversation endpoints return HTTP 401 with the error in the WWW-Authenticate: DPoP header",
    ),
    foundation(
        "dpop.bearer-scheme",
        "A DPoP Session Token sent with the Bearer scheme is rejected",
        "spec#sending-tokens",
        "Everywhere else, Companies MUST require DPoP, and MUST reject a DPoP Session Token sent with the Bearer scheme (RFC 9449 §7.1).",
    ),
    foundation(
        "dpop.wrong-ath",
        "A proof whose ath doesn't match the token is rejected",
        "spec#sending-tokens",
        "On requests with a Session Token, the key is the one the token is bound to, and ath matches the token.",
    ),
    foundation(
        "dpop.wrong-key",
        "A proof signed by a key the token isn't bound to is rejected",
        "spec#sending-tokens",
        "On requests with a Session Token, the key is the one the token is bound to, and ath matches the token.",
    ),
    foundation(
        "dpop.resource-htu",
        "A proof made for a different URL is rejected",
        "spec#sending-tokens",
        "htm and htu match the request.",
    ),
    foundation(
        "dpop.token-in-url",
        "A Session Token in the URL query is not accepted",
        "spec#sending-tokens",
        "Personal Agents MUST NOT send tokens in a URL, and Companies MUST NOT accept them from one.",
    ),

    // Milestone 2: OpenAPI (section 6).
    interfaces(
        "openapi.loads",
        "The OpenAPI description loads",
        "spec#apis",
        "An OpenAPI 3.0 or 3.1 description of the API.",
    ),
    interfaces(
        "openapi.version",
        "The OpenAPI description declares version 3.0 or 3.1",
        "spec#apis",
        "An OpenAPI 3.0 or 3.1 description of the API.",
    ),

    // Milestone 2: MCP (sections 4.3 and 6).
    interfaces(
        "mcp.metadata",
        "The MCP server publishes protected resource metadata",
        "spec#apis",
        "MCP clients find where to get a token from the server's protected resource metadata (RFC 9728)",
    ),
    interfaces(
        "mcp.authorization-servers",
        "The protected resource metadata's authorization_servers includes auth.issuer",
        "spec#apis",
        "its authorization_servers MUST include auth.issuer",
    ),
    interfaces(
        "mcp.no-token",
        "The MCP server rejects a request without a token and points to its metadata",
        "spec#apis",
        "MCP clients find where to get a token from the server's protected resource metadata (RFC 9728)",
    ),
    interfaces(
        "mcp.bearer-token",
        "Token endpoint issues a Bearer Session Token for an MCP server without DPoP, with or without a proof",
        "spec#sending-tokens",
        "For an MCP server that doesn't support DPoP, the Company issues a Bearer Session Token, even if the request has a proof, and never a DPoP one.",
    ),
    interfaces(
        "mcp.bearer-accepted",
        "The MCP server accepts a Bearer Session Token issued for it",
        "spec#apis",
        "A listed MCP server MUST accept Session Tokens as its access tokens and enforce their scopes.",
    ),
    interfaces(
        "mcp.dpop-token-rejected",
        "The MCP server rejects the general DPoP Session Token",
        "spec#apis",
        "It MUST accept only tokens issued for its url (4.3).",
    ),
    interfaces(
        "mcp.dpop-server-token",
        "Token endpoint issues a DPoP Session Token for an MCP server that supports DPoP",
        "spec#sending-tokens",
        "For an MCP server that supports DPoP, the Company issues a DPoP Session Token, which the Personal Agent uses with proofs, as at any other API.",
    ),
    interfaces(
        "mcp.dpop-server-no-bearer",
        "Token endpoint refuses a Bearer Session Token for an MCP server that supports DPoP",
        "spec#sending-tokens",
        "The Company MUST NOT issue a Personal Agent a Bearer Session Token for an MCP server that supports DPoP, so a request without a proof gets invalid_dpop_proof.",
    ),
    interfaces(
        "mcp.dpop-server-accepted",
        "The MCP server accepts a DPoP Session Token issued for it",
        "spec#apis",
        "A listed MCP server MUST accept Session Tokens as its access tokens and enforce their scopes.",
    ),
    interfaces(
        "mcp.other-resource-rejected",
        "The MCP server rejects a Bearer token issued for another resource",
        "spec#apis",
        "It MUST accept only tokens issued for its url (4.3).",
    ),
    interfaces(
        "mcp.bearer-elsewhere-rejected",
        "A Bearer token for the MCP server is rejected outside MCP",
        "spec#sending-tokens",
        "Companies MUST accept a Bearer Session Token only at the MCP server whose url equals its resource, and MUST reject it at every other endpoint, including other paths on the same host.",
    ),

    // Milestone 2: conversations (section 7), signed out.
    interfaces(
        "conversations.start",
        "Starting a conversation returns 201 with conversation_id, status, and responder",
        "spec#sending-messages",
        "The Company returns the new conversation's ID",
    ),
    interfaces(
        "conversations.retry-same-id",
        "Retrying the first message returns the same conversation",
        "spec#sending-messages",
        "If the Company has already accepted a message with that ID and the same content, it returns the original response and doesn't add the message again.",
    ),
    interfaces(
        "conversations.message-id-conflict",
        "Reusing a message ID with different content returns message_id_conflict",
        "spec#sending-messages",
        "If the content is different, the Company returns message_id_conflict.",
    ),
    interfaces(
        "conversations.follow-up",
        "A later message returns 202 with status and responder",
        "spec#sending-messages",
        "Later messages go to the conversation's messages URL, which returns HTTP 202 with the same fields",
    ),
    interfaces(
        "conversations.empty-message",
        "A message without text, data, or context returns invalid_request",
        "spec#message-fields",
        "A message MUST have at least one of text, data, or context.",
    ),
    interfaces(
        "conversations.invalid-message-id",
        "A message ID with characters not allowed returns invalid_request",
        "spec#conversation-requests",
        "Conversation IDs, message IDs, and event IDs are strings of 1 to 256 characters from the URL-safe base64 alphabet",
    ),
    interfaces(
        "conversations.events-read",
        "Reading events returns conversation_id, events, cursor, has_more, status, and responder",
        "spec#reading-events",
        "Every successful read MUST include conversation_id, events, cursor, has_more, status, and responder, with events empty when there are none.",
    ),
    interfaces(
        "conversations.events-schema",
        "Events have the fields section 7.5 describes",
        "spec#reading-events",
        "Every event has an id, a type, and a created_at time",
    ),
    interfaces(
        "conversations.user-message-recorded",
        "The first message is recorded as an event with role user",
        "spec#reading-events",
        "a message from either side, as it was sent, with role set by the Company to user or company for the side it came from",
    ),
    interfaces(
        "conversations.retry-not-duplicated",
        "A retried message is recorded only once",
        "spec#sending-messages",
        "If the Company has already accepted a message with that ID and the same content, it returns the original response and doesn't add the message again.",
    ),
    interfaces(
        "conversations.wait",
        "A read with wait=1 returns within about a second when there's nothing new",
        "spec#reading-events",
        "The Company holds the request for up to wait seconds until there is an event to return.",
    ),
    interfaces(
        "conversations.invalid-wait",
        "A wait that isn't a whole number returns invalid_request",
        "spec#conversation-errors",
        "a wait that isn't a whole number of seconds",
    ),
    interfaces(
        "conversations.unknown-cursor",
        "An unknown cursor returns invalid_cursor",
        "spec#conversation-errors",
        "The cursor is unknown or doesn't belong to this conversation.",
    ),
    interfaces(
        "conversations.not-found",
        "An unknown Conversation ID returns conversation_not_found",
        "spec#conversation-errors",
        "The Conversation ID is unknown or belongs to a different Personal Agent, User, or account (7.2).",
    ),
    interfaces(
        "conversations.close",
        "Closing returns 200 with status closed",
        "spec#closing",
        "returns HTTP 200 with status and responder",
    ),
    interfaces(
        "conversations.close-event",
        "Closing adds a state event with status closed",
        "spec#closing",
        'The Company adds a state event with status: "closed"',
    ),
    interfaces(
        "conversations.close-again",
        "Closing again returns 200 and adds no event",
        "spec#closing",
        "Closing a conversation that is already closed returns the same response and adds no event.",
    ),
    interfaces(
        "conversations.closed-message",
        "A message to a closed conversation returns conversation_closed",
        "spec#conversation-errors",
        "A message or handoff was sent to a closed conversation.",
    ),
    interfaces(
        "conversations.closed-handoff",
        "A handoff request to a closed conversation returns conversation_closed",
        "spec#conversation-errors",
        "A message or handoff was sent to a closed conversation.",
    ),
];

export function checkInfo(id: string): CheckInfo {
    const info = CATALOG.find((c) => c.id === id);
    if (!info) throw new Error(`Unknown check id: ${id}`);
    return info;
}
