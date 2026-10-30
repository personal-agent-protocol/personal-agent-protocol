// Milestone 1: starting and continuing a signed-out Session at a resource with the Session header
// (spec 5.2, 5.3). The authorization server is never involved.

import { sessionRequest } from "../agent.ts";
import { isInvalidSession, noResponse } from "../http.ts";
import { generateKey, randomId, signDelegation, thumbprint } from "../jose.ts";
import { accepted, expectInvalidSession, findProbe } from "./resource.ts";
import { skipRest, type Context, type Recorder } from "./types.ts";

export const SESSION_IDS = [
    "session.start",
    "session.continue",
    "session.new-key",
    "session.new-session",
    "session.delegation-ps384",
    "session.other-user",
    "session.other-agent",
];

// Why a Company might refuse the validator itself, for inconclusive results.
export const REFUSED_BY_POLICY =
    "A Company decides which Personal Agents it accepts (spec 4.1), and a refused one gets invalid_session at a resource. If the Company accepts only approved Personal Agents, approve the test Personal Agent's client_id and run again. If it should have accepted it, check the Session verification steps (5.2, 5.3).";

export async function checkSessions(ctx: Context, r: Recorder): Promise<void> {
    if (!ctx.identity || !ctx.discovered.audience) {
        skipRest(
            r,
            SESSION_IDS,
            ctx.identityProblem ?? "No test Personal Agent or Company identity.",
        );
        return;
    }
    const identity = ctx.identity;
    const probe = findProbe(ctx);
    if (!probe) {
        skipRest(
            r,
            SESSION_IDS,
            "No conversation endpoint or --probe GET URL to test at a resource.",
        );
        return;
    }
    const start = await sessionRequest(ctx, {
        url: probe.url,
        note: "starting a signed-out Session with the Session header",
    });
    ctx.session.startExchange = start;
    if (!accepted(probe, start)) {
        const expected =
            probe.kind === "conversation"
                ? "404 conversation_not_found (the Session accepted, the conversation unknown)"
                : "2xx";
        if (isInvalidSession(start)) {
            r.inconclusive("session.start", {
                exchange: start,
                expected,
                cause: `The resource answered invalid_session to a Session JWT the validator believes is valid. ${REFUSED_BY_POLICY}`,
            });
            ctx.blocked.identity =
                "The Company refused the test Personal Agent's Session (see session.start), so checks that need a Session are skipped.";
        } else {
            r.fail("session.start", {
                exchange: start,
                expected,
                cause: "Verify the Session JWT's delegation with the key its kid names in the agent's jwks_uri, the JWT with the delegation's cnf.jwk, then typ, aud, htm, htu, and iat, before looking up or creating the Session by client_id and sid (5.2, 5.3). Build htu from the endpoint's public URL.",
            });
            ctx.blocked.identity = noResponse(start)
                ? "The resource didn't answer the first Session request (see session.start), so checks that need a Session are skipped."
                : "The resource didn't accept a valid Session header (see session.start).";
        }
        skipRest(r, SESSION_IDS, ctx.blocked.identity);
        return;
    }
    ctx.session.started = true;
    r.pass("session.start");

    // A request that should be handled as the Session's.
    const expectAccepted = (
        id: string,
        ex: Awaited<ReturnType<typeof sessionRequest>>,
        expected: string,
        cause: string,
    ) => {
        if (accepted(probe, ex)) r.pass(id);
        else r.fail(id, { exchange: ex, expected, cause });
    };

    if (r.wants("session.continue")) {
        const ex = await sessionRequest(ctx, {
            url: probe.url,
            note: "with a fresh Session JWT for the same Session",
        });
        expectAccepted(
            "session.continue",
            ex,
            "The same Session accepts a fresh Session JWT with its sid",
            "A known sid continues its Session when the JWT has the same User ID and Agent ID (5.3).",
        );
    }

    if (r.wants("session.new-key")) {
        const generated = await generateKey(false);
        const key = {
            privateKey: generated.privateKey,
            publicJwk: { ...generated.publicJwk, kid: await thumbprint(generated.publicJwk) },
        };
        const delegation = await signDelegation({
            root: identity.rootKey,
            delegated: key.publicJwk,
            iss: identity.clientId,
        });
        const ex = await sessionRequest(ctx, {
            url: probe.url,
            session: { key, delegation },
            note: "for the same Session, signed with a new delegated key and delegation",
        });
        expectAccepted(
            "session.new-key",
            ex,
            "The same Session accepts a Session JWT signed with a new delegated key",
            "Sessions are named by sid, not by a key. Personal Agents replace delegated keys whenever they like, so don't tie a Session to the key that started it (5.2).",
        );
    }

    if (r.wants("session.new-session")) {
        const ex = await sessionRequest(ctx, {
            url: probe.url,
            session: { sid: randomId(16) },
            note: "starting a second Session for the same User, with a new sid",
        });
        expectAccepted(
            "session.new-session",
            ex,
            "A new sid for the same User starts another Session",
            "A Personal Agent can run several Sessions for the same User, each with its own sid. An unknown sid starts a Session, even when the User already has one (5.3).",
        );
    }

    if (r.wants("session.delegation-ps384")) {
        const delegation = identity.rsaDelegation;
        if (!delegation)
            r.skip(
                "session.delegation-ps384",
                "The test Personal Agent has no RSA key. Run keygen --force and host the new agent.json and jwks.json.",
            );
        else {
            const ex = await sessionRequest(ctx, {
                url: probe.url,
                session: { delegation },
                note: "with a Session JWT whose delegation is signed with PS384",
            });
            expectAccepted(
                "session.delegation-ps384",
                ex,
                "The resource accepts a delegation signed with PS384",
                "Companies SHOULD accept delegations signed with PS384, which Personal Agents use to sign them blindly (5.2, 10.7). ES256 remains required. To support PS384, check the delegation with the RSA key its kid names.",
            );
        }
    }

    if (r.wants("session.other-user")) {
        const ex = await sessionRequest(ctx, {
            url: probe.url,
            session: { sub: `usr_validator${randomId(12)}` },
            note: "for the same Session, with a different User ID",
        });
        expectInvalidSession(
            r,
            "session.other-user",
            ex,
            accepted(probe, ex),
            "The resource accepted a known sid with a different User ID. Look up the Session by client_id and sid, and reject a JWT whose sub or agent_id differs from the Session's (5.3).",
        );
    }

    if (r.wants("session.other-agent")) {
        // A new Session with an Agent ID, then the same sid with another.
        const sid = randomId(16);
        const first = await sessionRequest(ctx, {
            url: probe.url,
            session: { sid, agentId: `agt_validator${randomId(9)}` },
            note: "starting a Session with an Agent ID",
        });
        if (!accepted(probe, first)) {
            r.fail("session.other-agent", {
                exchange: first,
                expected: `${probe.kind === "conversation" ? "404 conversation_not_found" : "2xx"}: a Session started with an Agent ID`,
                cause: "An unknown sid starts a Session with the verified client_id, User ID, and optional Agent ID (5.3), so a Session JWT with agent_id is accepted.",
            });
        } else {
            const ex = await sessionRequest(ctx, {
                url: probe.url,
                session: { sid, agentId: `agt_validator${randomId(9)}` },
                note: "for the same Session, with a different Agent ID",
            });
            expectInvalidSession(
                r,
                "session.other-agent",
                ex,
                accepted(probe, ex),
                "The resource accepted a known sid with a different Agent ID. A Session JWT must have its Session's User ID and Agent ID (5.3).",
            );
        }
    }
}
