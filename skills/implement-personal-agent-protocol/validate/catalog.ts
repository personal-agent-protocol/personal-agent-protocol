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
    // "<page>#<heading id>", such as "spec#session-header".
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
    "spec#intro": "1",
    "spec#terms": "2",
    "spec#discovery": "3",
    "spec#fields": "3.1",
    "spec#oauth-server": "3.2",
    "spec#extensions": "3.3",
    "spec#oauth": "4",
    "spec#agent-identity": "4.1",
    "spec#direct-sign-in": "4.2",
    "spec#device-sign-in": "4.3",
    "spec#refresh-tokens": "4.4",
    "spec#access-tokens": "4.5",
    "spec#revocation": "4.6",
    "spec#scopes": "4.7",
    "spec#oauth-additions": "4.8",
    "spec#sessions": "5",
    "spec#user-ids": "5.1",
    "spec#session-header": "5.2",
    "spec#delegated-keys": "5.2",
    "spec#session-verification": "5.3",
    "spec#sign-in": "5.4",
    "spec#ending-sessions": "5.5",
    "spec#sending-requests": "5.6",
    "spec#web-browsing": "6",
    "spec#apis": "7",
    "spec#conversations": "8",
    "spec#conversation-protocols": "8.1",
    "spec#conversation-requests": "8.2",
    "spec#sending-messages": "8.3",
    "spec#message-fields": "8.4",
    "spec#reading-events": "8.5",
    "spec#streaming": "8.6",
    "spec#status": "8.7",
    "spec#human-or-ai": "8.8",
    "spec#handoff": "8.9",
    "spec#direct-conversations": "8.10",
    "spec#conversation-sign-in": "8.11",
    "spec#closing": "8.12",
    "spec#conversation-errors": "8.13",
    "spec#task-coverage": "9",
    "spec#excluded-tasks": "9.1",
    "spec#alternatives": "9.2",
    "spec#feedback": "9.3",
    "spec#security": "10",
    "spec#untrusted-content": "10.1",
    "spec#secrets": "10.2",
    "spec#trust": "10.3",
    "spec#assertion-audience": "10.4",
    "spec#credentials": "10.5",
    "spec#browser-join": "10.6",
    "spec#delegated-key-security": "10.7",
    "spec#references": "11",
    "operations#intro": "1",
    "operations#support": "2",
    "operations#operation-object": "3",
    "operations#approval-required": "4",
    "operations#approval": "5",
    "operations#sending-approval": "6",
    "operations#at-most-once": "7",
    "operations#security": "8",
    "operations#approval-proof": "8.1",
    "operations#references": "9",
    "mediated-sign-in#intro": "1",
    "mediated-sign-in#support": "2",
    "mediated-sign-in#signing-in": "3",
    "mediated-sign-in#one-time-codes": "4",
    "mediated-sign-in#errors": "5",
    "mediated-sign-in#security": "6",
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

function signIn(
    id: string,
    title: string,
    section: string,
    quote: string,
    level: "MUST" | "SHOULD" = "MUST",
): CheckInfo {
    return { id, title, milestone: "sign-in", level, section, quote };
}

function extensions(
    id: string,
    title: string,
    section: string,
    quote: string,
    level: "MUST" | "SHOULD" = "MUST",
): CheckInfo {
    return { id, title, milestone: "extensions", level, section, quote };
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
        "discovery.redirects-well-known",
        "Redirects of the well-known URL end at /.well-known/poppy.json, with no query",
        "spec#discovery",
        "Personal Agents MUST use the document only when the last URL's path is exactly /.well-known/poppy.json and it has no query",
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
        "spec#terms",
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
        "discovery.interface-present",
        "poppy.json lists at least one of agent, apis, or web",
        "spec#fields",
        "One of agent, apis, or web",
    ),
    foundation(
        "discovery.extension-names",
        "Extension names are ones the protocol defines, or start with a domain",
        "spec#extensions",
        "Anyone else MUST start an extension's name with a domain they control, such as example.com/gift-wrap.",
    ),
    foundation(
        "discovery.excluded-tasks",
        "The excluded-tasks document loads and has the fields in 9.1",
        "spec#excluded-tasks",
        "The Personal Agent fetches it with a GET and no token",
    ),
    foundation(
        "discovery.alternative-references",
        "Each openapi or mcp reference in an alternative names an API listed in poppy.json",
        "spec#alternatives",
        "An openapi or mcp reference MUST name an API listed in the Company's poppy.json.",
    ),

    // Milestone 1: the issuer and its OAuth server metadata (3.2).
    foundation(
        "metadata.issuer-required",
        "The Company has an issuer when it offers account access",
        "spec#oauth-server",
        "A Company that offers sign-in MUST have an OAuth issuer.",
    ),
    foundation(
        "metadata.resource-metadata",
        "The domain's protected resource metadata is for https://{organization.domain} and names authorization servers",
        "spec#oauth-server",
        "its resource MUST be exactly https://{organization.domain}",
    ),
    foundation(
        "metadata.issuer-chosen",
        "auth.issuer is one of authorization_servers, and is present when there are several",
        "spec#fields",
        "The Company's OAuth issuer identifier, naming the one Personal Agents use (3.2). It MUST be in that list.",
    ),
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
        "The metadata's issuer exactly matches the issuer the protected resource metadata names",
        "spec#oauth-server",
        "MUST check that its issuer exactly matches the issuer it found, character for character.",
    ),
    foundation(
        "metadata.protected-resources",
        "protected_resources includes https://{organization.domain}",
        "spec#oauth-server",
        "MUST list https://{domain} for every domain whose issuer it is, with no path, port, or trailing slash.",
    ),
    foundation(
        "metadata.token-endpoint",
        "The metadata has a token_endpoint",
        "spec#oauth-server",
        "token_endpoint issues access and refresh tokens (4.4). Required.",
    ),
    foundation(
        "metadata.revocation-endpoint",
        "The metadata has a revocation_endpoint",
        "spec#oauth-server",
        "revocation_endpoint revokes refresh tokens (4.6). Required.",
    ),
    foundation(
        "metadata.grant-types",
        "grant_types_supported includes refresh_token",
        "spec#oauth-server",
        "Required, and it MUST include refresh_token (4.4).",
    ),
    foundation(
        "metadata.authorization-endpoint",
        "The metadata has an authorization_endpoint when it offers Direct Sign-In",
        "spec#oauth-server",
        "authorization_endpoint starts Direct Sign-In (4.2). Required if grant_types_supported includes authorization_code.",
    ),
    foundation(
        "metadata.device-authorization-endpoint",
        "The metadata has a device_authorization_endpoint when it offers Device Sign-In",
        "spec#oauth-server",
        "device_authorization_endpoint starts Device Sign-In (4.3). Required if grant_types_supported includes urn:ietf:params:oauth:grant-type:device_code.",
    ),
    foundation(
        "metadata.scopes-supported",
        "scopes_supported lists every scope a sign-in can grant",
        "spec#oauth-server",
        "A Company that offers sign-in SHOULD publish it and include every scope a Personal Agent can request (4.7).",
        "SHOULD",
    ),
    foundation(
        "metadata.scopes-described",
        "Every scope in scopes_supported has a description",
        "spec#scopes",
        "The Company SHOULD describe each scope it offers Personal Agents, so the Personal Agent can choose the ones a task needs: in the scopes of an OAuth 2.0 security scheme in an OpenAPI description it lists (section 7), or otherwise in auth.scopes.",
        "SHOULD",
    ),
    foundation(
        "metadata.same-issuer",
        "Other Company domains select the same issuer",
        "spec#oauth-server",
        "The Company MUST select that same issuer on each domain (above).",
    ),
    foundation(
        "metadata.same-auth",
        "Other domains with the same issuer have matching scope descriptions and hints",
        "spec#oauth-server",
        "Company SHOULD publish the same scope descriptions and hints across these domains",
        "SHOULD",
    ),
    signIn(
        "metadata.mediated-grant",
        "With Mediated Sign-In listed, the issuer's metadata lists its grant type",
        "mediated-sign-in#support",
        "and lists the grant type https://personalagentprotocol.org/grant/mediated-sign-in in its issuer's grant_types_supported",
    ),
    signIn(
        "mediated.unknown-sign-in",
        "A Mediated Sign-In code for an unknown sign_in_id gets invalid_grant",
        "mediated-sign-in#errors",
        "or sign_in_id is unknown or belongs to another client",
    ),

    // Milestone 1: starting and continuing Sessions with the Session header (5.2, 5.3).
    foundation(
        "session.start",
        "A resource accepts a signed-out request with a valid Session header",
        "spec#session-verification",
        "An unknown sid starts a signed-out Session with the verified client_id, User ID, and optional Agent ID.",
    ),
    foundation(
        "session.continue",
        "A fresh Session JWT with the same sid continues the Session",
        "spec#session-verification",
        "A known sid continues its Session, and the JWT MUST have that Session's User ID and Agent ID.",
    ),
    foundation(
        "session.new-key",
        "A Session JWT signed with a new delegated key continues the Session",
        "spec#delegated-keys",
        "So a Company MUST NOT expect a User's delegated key to stay the same between requests or Sessions, or treat a new one as a reason to reject a request.",
    ),
    foundation(
        "session.new-session",
        "A new sid for the same User starts another Session",
        "spec#session-verification",
        "An unknown sid starts a signed-out Session with the verified client_id, User ID, and optional Agent ID.",
    ),
    foundation(
        "session.delegation-ps384",
        "A resource accepts a Session JWT whose delegation is signed with PS384",
        "spec#delegated-keys",
        "SHOULD accept delegations signed with PS384.",
        "SHOULD",
    ),
    foundation(
        "session.other-user",
        "A resource rejects a Session JWT that changes its Session's User ID",
        "spec#session-verification",
        "A known sid continues its Session, and the JWT MUST have that Session's User ID and Agent ID.",
    ),
    foundation(
        "session.other-agent",
        "A resource rejects a Session JWT that changes its Session's Agent ID",
        "spec#session-verification",
        "A known sid continues its Session, and the JWT MUST have that Session's User ID and Agent ID.",
    ),

    // Milestone 1: client assertions at the token endpoint (4.1).
    foundation(
        "assertion.ps384",
        "The token endpoint accepts a client assertion signed with PS384",
        "spec#agent-identity",
        "SHOULD accept ones signed with PS384.",
        "SHOULD",
    ),
    foundation(
        "assertion.signature",
        "The token endpoint refuses a client assertion whose signature doesn't verify",
        "spec#agent-identity",
        "Client assertions follow RFC 7523 §3.",
    ),
    foundation(
        "assertion.expired",
        "The token endpoint refuses an expired client assertion",
        "spec#agent-identity",
        "Client assertions follow RFC 7523 §3.",
    ),
    foundation(
        "assertion.claims",
        "The token endpoint refuses a client assertion without exp or sub",
        "spec#agent-identity",
        "Client assertions follow RFC 7523 §3.",
    ),
    foundation(
        "assertion.aud-array",
        "The token endpoint refuses a client assertion whose aud is an array",
        "spec#agent-identity",
        "Companies MUST reject a client assertion with any other aud, compared character for character, including their token endpoint URL.",
    ),
    foundation(
        "assertion.aud-endpoint",
        "The token endpoint refuses a client assertion whose aud is its own URL",
        "spec#agent-identity",
        "Companies MUST reject a client assertion with any other aud, compared character for character, including their token endpoint URL.",
    ),
    foundation(
        "assertion.jti-reuse",
        "The token endpoint refuses a client assertion whose jti it has already seen",
        "guides#both-signing",
        "Companies: reject a reused client assertion jti from the same client_id until it expires, as RFC 7523 §3 allows.",
        "SHOULD",
    ),

    // Milestone 1: rejecting bad Session headers with invalid_session (5.2, 5.3).
    foundation(
        "session.missing",
        "A request without the Session header gets 400 invalid_session",
        "spec#apis",
        "A required Session header is missing or Session verification fails (5.3)",
    ),
    foundation(
        "session.typ",
        "A resource rejects a Session JWT whose typ isn't poppy-session+jwt",
        "spec#session-header",
        "typ MUST be poppy-session+jwt, so the JWT can't be mistaken for a client assertion, delegation, or any other JWT",
    ),
    foundation(
        "session.unknown-key",
        "A resource rejects a Session JWT signed by a key its delegation doesn't name",
        "spec#delegated-keys",
        "Verify the Session JWT's signature with the key in the delegation's cnf.jwk, and check that its kid is that key's thumbprint.",
    ),
    foundation(
        "session.kid-thumbprint",
        "A resource rejects a Session JWT whose kid isn't its key's thumbprint",
        "spec#delegated-keys",
        "Verify the Session JWT's signature with the key in the delegation's cnf.jwk, and check that its kid is that key's thumbprint.",
    ),
    foundation(
        "session.without-delegation",
        "A resource rejects a Session JWT signed directly with a key from jwks_uri",
        "spec#delegated-keys",
        "the Company MUST reject, with invalid_session, a Session JWT without a delegation, including one signed directly with a key from jwks_uri",
    ),
    foundation(
        "session.delegation-signature",
        "A resource rejects a delegation that the key its kid names didn't sign",
        "spec#delegated-keys",
        "Find the key in the Personal Agent's jwks_uri named by the delegation's kid, and verify the delegation's signature with it.",
    ),
    foundation(
        "session.delegation-expired",
        "A resource rejects a Session JWT whose delegation has expired",
        "spec#delegated-keys",
        "Check that the delegation's typ is pap-delegation+jwt, its iss is the token's iss, it hasn't expired, and its exp is at most 24 hours after its iat.",
    ),
    foundation(
        "session.delegation-lifetime",
        "A resource rejects a Session JWT whose delegation lasts more than 24 hours",
        "spec#delegated-keys",
        "Check that the delegation's typ is pap-delegation+jwt, its iss is the token's iss, it hasn't expired, and its exp is at most 24 hours after its iat.",
    ),
    foundation(
        "session.delegation-typ",
        "A resource rejects a Session JWT whose delegation's typ isn't pap-delegation+jwt",
        "spec#delegated-keys",
        "Check that the delegation's typ is pap-delegation+jwt, its iss is the token's iss, it hasn't expired, and its exp is at most 24 hours after its iat.",
    ),
    foundation(
        "session.delegation-iss",
        "A resource rejects a Session JWT whose delegation's iss isn't the JWT's iss",
        "spec#delegated-keys",
        "Check that the delegation's typ is pap-delegation+jwt, its iss is the token's iss, it hasn't expired, and its exp is at most 24 hours after its iat.",
    ),
    foundation(
        "session.delegation-kid",
        "A resource rejects a Session JWT whose delegation's kid names no key in jwks_uri",
        "spec#delegated-keys",
        "Find the key in the Personal Agent's jwks_uri named by the delegation's kid, and verify the delegation's signature with it.",
    ),
    foundation(
        "session.iat-after-delegation",
        "A resource rejects a Session JWT signed after its delegation's exp",
        "spec#delegated-keys",
        "Check that the Session JWT's iat is no later than the delegation's exp.",
    ),
    foundation(
        "session.claims",
        "A resource rejects a Session JWT without sub",
        "spec#session-verification",
        "Verifies the JWT's delegation and signature, as Delegated keys (5.2) describes, then typ and the claims above",
    ),
    foundation(
        "session.aud",
        "A resource rejects a Session JWT for a different Company identifier",
        "spec#session-verification",
        "aud is its Company's identifier, compared character for character",
    ),
    foundation(
        "session.htm",
        "A resource rejects a Session JWT signed for a different method",
        "spec#session-verification",
        "htm and htu match the request as RFC 9449 §4.3 describes for DPoP proofs",
    ),
    foundation(
        "session.htu",
        "A resource rejects a Session JWT signed for a different URL",
        "spec#session-verification",
        "htm and htu match the request as RFC 9449 §4.3 describes for DPoP proofs",
    ),
    foundation(
        "session.iat",
        "A resource rejects a Session JWT signed an hour ago",
        "spec#session-verification",
        "iat is within an acceptance window it chooses, such as one minute.",
    ),
    foundation(
        "session.ath-without-token",
        "A resource rejects a Session JWT with ath on a request without an access token",
        "spec#session-verification",
        "Without an access token, ath MUST be absent.",
    ),
    foundation(
        "session.invalid-everywhere",
        "Protocol endpoints reject a bad Session header before checking an empty body",
        "spec#session-verification",
        "Companies SHOULD verify the Session header on every request that carries it.",
        "SHOULD",
    ),
    foundation(
        "token.invented",
        "An access token the Company never issued gets 401 invalid_token in WWW-Authenticate",
        "spec#apis",
        "Access token errors follow OAuth: they are in the WWW-Authenticate header",
    ),
    foundation(
        "token.in-url",
        "An access token in the URL isn't checked as a token",
        "spec#sending-requests",
        "Personal Agents MUST NOT send tokens or Session JWTs in a URL, and Companies MUST NOT accept them from one.",
    ),

    // Milestone 2: OpenAPI (section 7).
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

    // Milestone 2: MCP (section 7).
    interfaces(
        "mcp.metadata",
        "The MCP server publishes protected resource metadata",
        "spec#apis",
        "the server's protected resource metadata tells MCP clients where to get a token.",
    ),
    interfaces(
        "mcp.authorization-servers",
        "The protected resource metadata's authorization_servers includes the Company's issuer",
        "spec#apis",
        "an MCP server that offers account access MUST include the Company's issuer in its authorization_servers.",
    ),
    interfaces(
        "mcp.no-token",
        "The MCP server answers discovery without a token, or refuses it with a challenge that points to its metadata",
        "spec#apis",
        "An MCP server's challenges include resource_metadata with the server's protected resource metadata URL",
    ),
    interfaces(
        "mcp.invalid-token",
        "The MCP server refuses an invented access token with invalid_token and points to its metadata",
        "spec#apis",
        "An MCP server's challenges include resource_metadata with the server's protected resource metadata URL",
    ),

    // Milestone 2: feedback (section 9.3).
    interfaces(
        "feedback.no-session",
        "The feedback endpoint rejects a report without the Session header",
        "spec#feedback",
        "A Company SHOULD verify the Session header on a report, signed in or signed out, and needs no scope for it.",
        "SHOULD",
    ),
    interfaces(
        "feedback.accepted",
        "The feedback endpoint accepts a report with a signed-out Session header",
        "spec#feedback",
        "The Company responds with HTTP 202 and no body.",
    ),
    interfaces(
        "feedback.alternative-references",
        "An alternative returned for a report names only APIs poppy.json lists",
        "spec#alternatives",
        "An openapi or mcp reference MUST name an API listed in the Company's poppy.json.",
    ),
    interfaces(
        "feedback.invalid",
        "A malformed or overlong report returns invalid_request",
        "spec#feedback",
        "invalid_request (400) for a report that is malformed or too long",
    ),

    // Milestone 2: joining a browser to a Session (section 6).
    interfaces(
        "web.page-headers",
        "The browser-session page can't be cached, framed, or kept as a reference",
        "spec#web-browsing",
        "The page MUST NOT be stored by caches, framed by other pages, or kept as a window reference by the page that opened it.",
    ),
    interfaces(
        "web.page-headers-suggested",
        "The browser-session page sends the headers the guides suggest",
        "guides#company-browsing",
        "Send the page with Cache-Control: no-store, Content-Security-Policy: frame-ancestors 'none', and Cross-Origin-Opener-Policy: same-origin",
        "SHOULD",
    ),
    interfaces(
        "web.join-cookie",
        "The browser-session page sets a cookie that forms on other sites don't send",
        "spec#web-browsing",
        "The cookie MUST NOT be sent with a form submitted from another site, and other hosts on the Company's domain MUST NOT be able to set it.",
    ),
    interfaces(
        "web.join-cookie-suggested",
        "The join cookie is a __Host- cookie that is Secure, HttpOnly, and SameSite=Strict",
        "guides#company-browsing",
        "The __Host- prefix keeps other hosts on your domain from setting it, and SameSite=Strict keeps a form on another site from sending it",
        "SHOULD",
    ),
    interfaces(
        "web.authorize",
        "Authorizing the page's code with the Session header returns 204",
        "spec#web-browsing",
        "It then records the code as authorized for that Session and, if signed in, for the token's account and scopes, and responds with HTTP 204.",
    ),
    interfaces(
        "web.authorize-reused",
        "Authorizing the same code again returns 400 invalid_request",
        "spec#web-browsing",
        'A code that fails these checks gets HTTP 400 with {"error": "invalid_request"}.',
    ),

    interfaces(
        "web.authorize-unknown",
        "Authorizing a code the endpoint never issued returns 400 invalid_request",
        "spec#web-browsing",
        'A code that fails these checks gets HTTP 400 with {"error": "invalid_request"}.',
    ),
    interfaces(
        "web.form-without-cookie",
        "Submitting the form without the join cookie gets an error and sets no cookie",
        "spec#web-browsing",
        "If not, it sets no cookie and returns an error page with an error status.",
    ),
    interfaces(
        "web.form-code-used",
        "Submitting a code a second time gets an error, even when the first attempt failed",
        "spec#web-browsing",
        "A code is used by the first request that submits it, whatever the result.",
    ),
    interfaces(
        "web.cookie-code-pairing",
        "Submitting a code with the cookie from another page load gets an error",
        "spec#web-browsing",
        "The request has the cookie from step 1, and it matches code.",
    ),
    interfaces(
        "web.authorize-session",
        "Authorizing a code without a valid Session header returns invalid_session",
        "spec#session-verification",
        "The Company MUST reject a request without the Session header when handling it depends on Session claims.",
    ),
    interfaces(
        "web.page-cookies",
        "Loading the page doesn't change the browser's other cookies",
        "spec#web-browsing",
        "Loading the page MUST NOT start, end, or change any Session, or change the browser's other cookies.",
    ),

    // Milestone 2: conversations (section 8), signed out.
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
        "conversations.retry-follow-up",
        "Retrying a later message returns the original response",
        "spec#sending-messages",
        "If the Company has already accepted a message with that ID and the same content, it returns the original response and doesn't add the message again.",
    ),
    interfaces(
        "conversations.other-user",
        "Reading another User's conversation returns conversation_not_found",
        "spec#conversation-requests",
        "The Company MUST reject requests from any other client_id, User, or account.",
    ),
    interfaces(
        "conversations.empty-message",
        "A message without content returns invalid_request",
        "spec#message-fields",
        "A message MUST have at least one of text, data, or context, unless an extension both sides support defines another content field.",
    ),
    interfaces(
        "conversations.invalid-message-id",
        "A message ID with characters not allowed returns invalid_request",
        "spec#conversation-requests",
        "Conversation IDs, message IDs, and event IDs are strings of 1 to 256 characters from the URL-safe base64 alphabet",
    ),
    interfaces(
        "conversations.message-id-boundaries",
        "A 256-character message ID is accepted and a 257-character one isn't",
        "spec#conversation-requests",
        "Conversation IDs, message IDs, and event IDs are strings of 1 to 256 characters from the URL-safe base64 alphabet",
    ),
    interfaces(
        "conversations.data-only",
        "A message with only data is accepted",
        "spec#message-fields",
        "A message MUST have at least one of text, data, or context, unless an extension both sides support defines another content field.",
    ),
    interfaces(
        "conversations.context-only",
        "A message with only context is accepted and recorded",
        "spec#reading-events",
        "Every message the Company accepts is recorded, including one with only context.",
    ),
    interfaces(
        "conversations.events-read",
        "Reading events returns conversation_id, events, cursor, has_more, status, and responder",
        "spec#reading-events",
        "Every successful read MUST include conversation_id, events, cursor, has_more, status, and responder, with events empty when there are none.",
    ),
    interfaces(
        "conversations.events-schema",
        "Events have the fields section 8.5 describes",
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
        "conversations.message-preserved",
        "A message is recorded as it was sent, with its author, text, data, and context",
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
        "conversations.event-order",
        "Events have unique IDs, and messages are in the order they were sent",
        "spec#reading-events",
        "The Company records each conversation as an ordered list of events",
    ),
    interfaces(
        "conversations.state-events",
        "Every change to status or responder has a state event",
        "spec#status",
        "Every change to either one adds a state event with both, even if there is no new text.",
    ),
    interfaces(
        "conversations.cursor",
        "A read from a cursor returns only later events, and the right cursor",
        "spec#reading-events",
        "cursor is the last event returned, or the request's cursor if there were none.",
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
        "conversations.cursor-other-conversation",
        "A cursor from another conversation returns invalid_cursor",
        "spec#conversation-errors",
        "The cursor is unknown or doesn't belong to this conversation.",
    ),
    interfaces(
        "conversations.message-id-other-conversation",
        "A message ID from another conversation, with different content, returns message_id_conflict",
        "spec#sending-messages",
        "Because the ID is unique for the User rather than for one conversation",
    ),
    interfaces(
        "conversations.sse",
        "A read that asks for a stream gets SSE events with their IDs, or JSON as usual",
        "spec#streaming",
        "In a stream, each event has its event ID as the SSE id and the same event JSON as data",
    ),
    interfaces(
        "conversations.sse-last-event-id",
        "A stream with both cursor and Last-Event-ID starts after Last-Event-ID",
        "spec#streaming",
        "If a request has both, Last-Event-ID wins",
    ),
    interfaces(
        "conversations.not-found",
        "An unknown Conversation ID returns conversation_not_found",
        "spec#conversation-errors",
        "The Conversation ID is unknown or belongs to a different Personal Agent, User, or account (8.2).",
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
    interfaces(
        "conversations.direct-closed-parent",
        "A Direct Conversation whose parent is closed returns conversation_closed",
        "spec#direct-conversations",
        "The parent conversation MUST be open, belong to the same owner (8.2), and not be a Direct Conversation itself.",
    ),
    interfaces(
        "conversations.direct-unknown-parent",
        "A Direct Conversation whose parent doesn't exist returns conversation_not_found",
        "spec#direct-conversations",
        "The parent conversation MUST be open, belong to the same owner (8.2), and not be a Direct Conversation itself.",
    ),

    // Milestone 4: the Operations extension, as far as a signed-out run sees it.
    extensions(
        "operations.not-returned",
        "No operations are returned to a Personal Agent that doesn't list the Operations extension",
        "operations#support",
        "A Company MUST NOT return operations to a Personal Agent that doesn't list that version.",
    ),
];

export function checkInfo(id: string): CheckInfo {
    const info = CATALOG.find((c) => c.id === id);
    if (!info) throw new Error(`Unknown check id: ${id}`);
    return info;
}
