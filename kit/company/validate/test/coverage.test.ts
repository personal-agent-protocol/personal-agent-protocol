// Runs every check against the fake Company (fake-company.ts) as it should behave and with one flaw
// at a time, and makes sure each check in the catalog was seen passing, and seen failing (or, for a
// SHOULD, warning). A check no scenario can fail isn't tested by anything.

import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { CATALOG } from "../catalog.ts";
import { newContext, type CheckResult } from "../checks/types.ts";
import { keygen } from "../identity.ts";
import { parseMilestones, runChecks } from "../run.ts";
import { fakeHttp, MCP_URL, ORIGIN, type Flaws } from "./fake-company.ts";

const cwd = mkdtempSync(join(tmpdir(), "poppy-validator-coverage-"));
await keygen("https://agent.test", { cwd });

type Scenario = {
    flaws?: Flaws;
    target?: string;
    probe?: string;
    // Checks this scenario must fail (or warn on, without being inconclusive).
    fails?: string[];
    // Checks this scenario must pass.
    passes?: string[];
    // Checks that can't tell, and say so.
    inconclusive?: string[];
};

const WWW = "https://www.shop.test";
const without =
    (...keys: string[]) =>
    (doc: Record<string, any>) => {
        for (const key of keys) delete doc[key];
    };

const SCENARIOS: Scenario[] = [
    {},
    { target: WWW },

    // Discovery
    { flaws: { poppyStatus: 404 }, fails: ["discovery.https"] },
    { target: WWW, flaws: { httpRedirect: true }, fails: ["discovery.redirects-https"] },
    { target: WWW, flaws: { redirectToUpload: true }, fails: ["discovery.redirects-well-known"] },
    { flaws: { poppyRaw: "<!doctype html><title>Shop</title>" }, fails: ["discovery.json"] },
    {
        flaws: { poppy: (d) => (d.organization = "Shop") },
        fails: ["discovery.schema", "discovery.domain-matches-host"],
    },
    {
        flaws: { poppy: (d) => (d.protocol_version = "9.9") },
        fails: ["discovery.protocol-version"],
    },
    { flaws: { domain: "other.test" }, fails: ["discovery.domain-matches-host"] },
    { flaws: { poppy: without("agent", "apis", "web") }, fails: ["discovery.interface-present"] },
    {
        flaws: { poppy: (d) => (d.extensions["gift-wrap"] = { version: "1" }) },
        fails: ["discovery.extension-names"],
    },
    { flaws: { excludedTasksInvalid: true }, fails: ["discovery.excluded-tasks"] },
    { flaws: { unlistedAlternativeApi: true }, fails: ["discovery.alternative-references"] },

    // Authorization server metadata
    { flaws: { noResourceMetadata: true }, fails: ["metadata.issuer-required"] },
    { flaws: { resourceWithSlash: true }, fails: ["metadata.resource-metadata"] },
    { flaws: { twoAuthorizationServers: true }, fails: ["metadata.issuer-chosen"] },
    { flaws: { noIssuerMetadata: true }, fails: ["metadata.published"] },
    { flaws: { metadata: (d) => (d.token_endpoint = 5) }, fails: ["metadata.schema"] },
    {
        flaws: { metadata: (d) => (d.issuer = "https://login.shop.test") },
        fails: ["metadata.issuer-matches"],
    },
    {
        flaws: { metadata: (d) => (d.protected_resources = [MCP_URL]) },
        fails: ["metadata.protected-resources"],
    },
    { flaws: { metadata: without("token_endpoint") }, fails: ["metadata.token-endpoint"] },
    {
        flaws: { metadata: without("revocation_endpoint") },
        fails: ["metadata.revocation-endpoint"],
    },
    {
        flaws: { metadata: (d) => (d.grant_types_supported = ["authorization_code"]) },
        fails: ["metadata.grant-types"],
    },
    {
        flaws: { metadata: without("authorization_endpoint") },
        fails: ["metadata.authorization-endpoint"],
    },
    {
        flaws: { metadata: without("device_authorization_endpoint") },
        fails: ["metadata.device-authorization-endpoint"],
    },
    { flaws: { metadata: without("scopes_supported") }, fails: ["metadata.scopes-supported"] },
    { flaws: { undescribedScope: true }, fails: ["metadata.scopes-described"] },
    { flaws: { otherDomainAuth: true }, fails: ["metadata.same-auth"] },
    {
        flaws: {
            metadata: (d) => (d.grant_types_supported = ["refresh_token", "authorization_code"]),
        },
        fails: ["metadata.mediated-grant"],
    },
    { flaws: { mediatedUnknownCodeRequired: true }, fails: ["mediated.unknown-sign-in"] },

    // Session header
    { flaws: { rejectKnownSid: true }, fails: ["session.continue"] },
    { flaws: { pinSessionKey: true }, fails: ["session.new-key"] },
    { flaws: { oneSessionPerUser: true }, fails: ["session.new-session"] },
    { flaws: { rejectPs384Delegation: true }, fails: ["session.delegation-ps384"] },
    { flaws: { ignoreSessionUser: true }, fails: ["session.other-user"] },
    { flaws: { ignoreAgentId: true }, fails: ["session.other-agent"] },
    { flaws: { acceptMissingSession: true }, fails: ["session.missing", "feedback.no-session"] },
    { flaws: { acceptOtherTyp: true }, fails: ["session.typ"] },
    {
        flaws: { acceptUnknownKey: true },
        fails: ["session.unknown-key", "session.invalid-everywhere"],
    },
    { flaws: { ignoreKidThumbprint: true }, fails: ["session.kid-thumbprint"] },
    { flaws: { acceptMissingDelegation: true }, fails: ["session.without-delegation"] },
    { flaws: { skipDelegationSignature: true }, fails: ["session.delegation-signature"] },
    {
        flaws: { acceptExpiredDelegation: true, acceptIatAfterDelegation: true },
        fails: ["session.delegation-expired"],
    },
    { flaws: { acceptLongDelegation: true }, fails: ["session.delegation-lifetime"] },
    { flaws: { acceptOtherDelegationTyp: true }, fails: ["session.delegation-typ"] },
    { flaws: { acceptOtherDelegationIss: true }, fails: ["session.delegation-iss"] },
    { flaws: { ignoreDelegationKid: true }, fails: ["session.delegation-kid"] },
    { flaws: { acceptIatAfterDelegation: true }, fails: ["session.iat-after-delegation"] },
    { flaws: { acceptMissingClaims: true }, fails: ["session.claims"] },
    { flaws: { acceptOtherAud: true }, fails: ["session.aud"] },
    { flaws: { ignoreHtm: true }, fails: ["session.htm"] },
    { flaws: { ignoreHtu: true }, fails: ["session.htu"] },
    { flaws: { acceptOldIat: true }, fails: ["session.iat"] },
    { flaws: { acceptAthWithoutToken: true }, fails: ["session.ath-without-token"] },
    { flaws: { sessionErrors401: true }, fails: ["session.missing", "session.typ", "session.iat"] },
    { flaws: { ignoreAccessToken: true }, fails: ["token.invented"] },
    { flaws: { acceptTokenInUrl: true }, fails: ["token.in-url"] },
    // A Company Agent-less Company, probed at an API that serves signed-out requests.
    { flaws: { noAgent: true }, probe: `${ORIGIN}/api/orders`, passes: ["session.start"] },

    // Client assertions
    { flaws: { rejectPs384Assertion: true }, fails: ["assertion.ps384"] },
    { flaws: { acceptBadAssertionSignature: true }, fails: ["assertion.signature"] },
    { flaws: { acceptExpiredAssertion: true }, fails: ["assertion.expired"] },
    { flaws: { acceptMissingAssertionClaims: true }, fails: ["assertion.claims"] },
    { flaws: { acceptAudArray: true }, fails: ["assertion.aud-array"] },
    { flaws: { acceptEndpointAud: true }, fails: ["assertion.aud-endpoint"] },
    { flaws: { acceptReusedJti: true }, fails: ["assertion.jti-reuse"] },

    // APIs
    { flaws: { openapiStatus: 404 }, fails: ["openapi.loads"] },
    { flaws: { openapiSwagger: true }, fails: ["openapi.version"] },
    { flaws: { openapiYaml: true }, passes: ["openapi.loads", "metadata.scopes-described"] },
    { flaws: { openapiYamlAnchors: true }, inconclusive: ["openapi.loads"] },
    { flaws: { mcpResourceWithSlash: true }, fails: ["mcp.metadata"] },
    { flaws: { mcpOtherAuthorizationServer: true }, fails: ["mcp.authorization-servers"] },
    { flaws: { mcpStatus404: true }, fails: ["mcp.no-token"] },
    { flaws: { mcpNoResourceMetadata: true }, fails: ["mcp.no-token"] },
    { flaws: { mcpInvalidTokenNoError: true }, fails: ["mcp.invalid-token"] },

    // Feedback
    { flaws: { feedbackWithoutSession: true }, fails: ["feedback.no-session"] },
    { flaws: { feedbackBody: true }, fails: ["feedback.accepted"] },
    {
        flaws: { feedbackAlternative: "listed" },
        passes: ["feedback.accepted", "feedback.alternative-references"],
    },
    { flaws: { feedbackAlternative: "unlisted" }, fails: ["feedback.alternative-references"] },
    { flaws: { feedbackNoValidation: true }, fails: ["feedback.invalid"] },

    // Browser sessions
    { flaws: { webNoHeaders: true }, fails: ["web.page-headers", "web.page-headers-suggested"] },
    { flaws: { webFrameSelf: true }, fails: ["web.page-headers"] },
    { flaws: { webCookieSameSiteNone: true }, fails: ["web.join-cookie"] },
    { flaws: { webCookieWithoutHostPrefix: true }, fails: ["web.join-cookie-suggested"] },
    { flaws: { webAuthorizeStatus200: true }, fails: ["web.authorize"] },
    { flaws: { webReauthorize: true }, fails: ["web.authorize-reused"] },
    { flaws: { webAuthorizeUnknownCode: true }, fails: ["web.authorize-unknown"] },
    { flaws: { webFormWithoutCookie: true }, fails: ["web.form-without-cookie"] },
    { flaws: { webCodeReusableAfterFailure: true }, fails: ["web.form-code-used"] },
    { flaws: { webAnyJoinCookie: true }, fails: ["web.cookie-code-pairing"] },
    { flaws: { webAuthorizeWithoutSession: true }, fails: ["web.authorize-session"] },
    { flaws: { webPageClearsCookies: true }, fails: ["web.page-cookies"] },

    // Conversations
    { flaws: { startReturns200: true }, fails: ["conversations.start"] },
    { flaws: { retryCreatesNewConversation: true }, fails: ["conversations.retry-same-id"] },
    { flaws: { conflictStatus400: true }, fails: ["conversations.message-id-conflict"] },
    { flaws: { followUpWithoutStatus: true }, fails: ["conversations.follow-up"] },
    { flaws: { followUpRetry200: true }, fails: ["conversations.retry-follow-up"] },
    { flaws: { ignoreConversationOwner: true }, fails: ["conversations.other-user"] },
    { flaws: { acceptEmptyMessage: true }, fails: ["conversations.empty-message"] },
    { flaws: { acceptAnyMessageId: true }, fails: ["conversations.invalid-message-id"] },
    { flaws: { maxMessageId128: true }, fails: ["conversations.message-id-boundaries"] },
    { flaws: { requireText: true }, fails: ["conversations.data-only"] },
    { flaws: { contextNotRecorded: true }, fails: ["conversations.context-only"] },
    { flaws: { eventsWithoutHasMore: true }, fails: ["conversations.events-read"] },
    { flaws: { eventBadCreatedAt: true }, fails: ["conversations.events-schema"] },
    { flaws: { wrongRole: true }, fails: ["conversations.user-message-recorded"] },
    { flaws: { dropMessageData: true }, fails: ["conversations.message-preserved"] },
    { flaws: { retryRecordedTwice: true }, fails: ["conversations.retry-not-duplicated"] },
    { flaws: { repeatFirstEvent: true }, fails: ["conversations.event-order"] },
    { flaws: { noStateEvents: true }, fails: ["conversations.state-events"] },
    { flaws: { cursorIgnored: true }, fails: ["conversations.cursor"] },
    { flaws: { waitRejected: true }, fails: ["conversations.wait"] },
    { flaws: { acceptAnyWait: true }, fails: ["conversations.invalid-wait"] },
    { flaws: { unknownCursorEmpty: true }, fails: ["conversations.unknown-cursor"] },
    { flaws: { cursorAnyConversation: true }, fails: ["conversations.cursor-other-conversation"] },
    {
        flaws: { messageIdsPerConversation: true },
        fails: ["conversations.message-id-other-conversation"],
    },
    { flaws: { noSse: true }, passes: ["conversations.sse"] },
    { flaws: { sseWrongId: true }, fails: ["conversations.sse"] },
    { flaws: { sseIgnoresLastEventId: true }, fails: ["conversations.sse-last-event-id"] },
    { flaws: { notFoundError: true }, fails: ["session.start"] },
    {
        flaws: { notFoundError: true },
        probe: `${ORIGIN}/api/orders`,
        passes: ["session.start"],
        fails: ["conversations.not-found"],
    },
    { flaws: { closeWithoutResponder: true }, fails: ["conversations.close"] },
    { flaws: { noCloseEvent: true }, fails: ["conversations.close-event"] },
    { flaws: { closeAgainAddsEvent: true }, fails: ["conversations.close-again"] },
    { flaws: { closedAcceptsMessages: true }, fails: ["conversations.closed-message"] },
    { flaws: { closedAcceptsHandoff: true }, fails: ["conversations.closed-handoff"] },
    {
        flaws: { directIgnoresParent: true },
        fails: ["conversations.direct-closed-parent", "conversations.direct-unknown-parent"],
    },

    // Extensions
    { flaws: { returnOperations: true }, fails: ["operations.not-returned"] },
];

async function runScenario(s: Scenario): Promise<CheckResult[]> {
    const http = fakeHttp(join(cwd, ".poppy"), s.flaws);
    const ctx = newContext(
        http,
        { milestones: parseMilestones("all")!, ...(s.probe ? { probe: s.probe } : {}) },
        s.target ?? ORIGIN,
    );
    return runChecks(ctx, { cwd });
}

const failing = (r: CheckResult) => r.status === "fail" || (r.status === "warn" && !r.inconclusive);

test("every check in the catalog is seen passing and failing", async () => {
    const passed = new Set<string>();
    const failed = new Set<string>();
    const problems: string[] = [];
    for (const scenario of SCENARIOS) {
        const results = await runScenario(scenario);
        const name = JSON.stringify({ ...scenario, fails: undefined, passes: undefined });
        const status = (id: string) => {
            const r = results.find((x) => x.id === id);
            return r ? `${r.status}${r.inconclusive ? " (inconclusive)" : ""}` : "missing";
        };
        for (const id of scenario.fails ?? []) {
            const r = results.find((x) => x.id === id);
            if (r && failing(r)) failed.add(id);
            else problems.push(`${name}: expected ${id} to fail, got ${status(id)}`);
        }
        for (const id of scenario.passes ?? []) {
            if (status(id) === "pass") passed.add(id);
            else problems.push(`${name}: expected ${id} to pass, got ${status(id)}`);
        }
        for (const id of scenario.inconclusive ?? [])
            if (!results.find((x) => x.id === id)?.inconclusive)
                problems.push(`${name}: expected ${id} to be inconclusive, got ${status(id)}`);
        // Without flaws, everything that ran passes.
        if (!scenario.flaws)
            for (const r of results) {
                if (r.status === "pass") passed.add(r.id);
                else if (r.status !== "skip") problems.push(`${name}: ${r.id} ${status(r.id)}`);
            }
    }
    assert.deepEqual(problems, []);
    const neverPassed = CATALOG.filter((c) => !passed.has(c.id)).map((c) => c.id);
    const neverFailed = CATALOG.filter((c) => !failed.has(c.id)).map((c) => c.id);
    assert.deepEqual(neverPassed, [], "checks no scenario passes");
    assert.deepEqual(neverFailed, [], "checks no scenario fails or warns on");
});
