// Milestone 1: starting and renewing Sessions (spec 4.2) and DPoP at the token endpoint (4.3).

import {
    dpopKey,
    heldToken,
    sessionAssertion,
    sessionParams,
    tokenEndpoint,
    tokenRequest,
} from "../agent.ts";
import { errorCode, header, type Exchange } from "../http.ts";
import { formatSchemaErrors } from "../schema.ts";
import { check } from "../schemas.ts";
import { generateKey, randomId, thumbprint } from "../jose.ts";
import { skipRest, type Context, type Recorder } from "./types.ts";

export const SESSION_IDS = [
    "session.start",
    "session.response-schema",
    "session.token-type",
    "session.expires-in",
    "session.token-lifetime",
    "session.signed-out",
    "session.no-store",
    "session.renew",
    "session.key-other-user",
    "session.assertion-replay",
    "session.client-assertion-aud",
    "session.client-assertion-unknown-key",
    "session.assertion-unknown-key",
    "dpop.nonce",
    "dpop.token-replay",
    "dpop.token-htu",
];

function said(ex: Exchange): string {
    const d = (ex.json as { error_description?: unknown } | undefined)?.error_description;
    return typeof d === "string" ? ` The Company said: "${d}".` : "";
}

// Records the result of a request the token endpoint should refuse with `code`.
function expectRefusal(
    r: Recorder,
    id: string,
    ex: Exchange,
    code: string,
    status: number,
    accepted: string,
    alsoOk: string[] = [],
): void {
    const got = errorCode(ex);
    if (ex.status === 200) {
        r.fail(id, {
            exchange: ex,
            got: `${`200 ${ex.statusText ?? ""}`.trim()}, a new Session Token`,
            expected: `${status} ${code}`,
            cause: accepted,
        });
    } else if (got === code || alsoOk.includes(got ?? "")) {
        r.pass(id, {
            notes:
                ex.status !== status && got === code
                    ? [`Returned ${code} with status ${ex.status}; section 4.2 lists ${status}.`]
                    : undefined,
        });
    } else if (ex.error || !ex.status || ex.status >= 500) {
        r.warn(id, {
            exchange: ex,
            expected: `${status} ${code}`,
            cause: "The request didn't get a clear answer, so this can't be decided.",
        });
    } else {
        r.warn(id, {
            exchange: ex,
            expected: `${status} ${code}`,
            cause: `The request was refused, but with ${got ?? `status ${ex.status}`} instead of ${code}, so a Personal Agent can't tell what went wrong.${said(ex)}`,
        });
    }
}

export async function checkSessions(ctx: Context, r: Recorder): Promise<void> {
    if (!ctx.discovered.metadata?.token_endpoint) {
        skipRest(r, SESSION_IDS, "No token_endpoint (see the metadata checks).");
        return;
    }
    if (!ctx.identity) {
        skipRest(
            r,
            SESSION_IDS,
            ctx.identityProblem ?? "No test Personal Agent: run keygen and host the files.",
        );
        return;
    }
    const key = await dpopKey(ctx);

    // Start a Session.
    const start = await tokenRequest(ctx, sessionParams(ctx), { note: "starting a new Session" });
    ctx.session.startExchange = start.ex;
    ctx.session.startProof = start.proof;
    checkNonce(ctx, r);
    const token = heldToken(start.ex, key);
    if (!token) {
        r.fail("session.start", {
            exchange: start.exchanges,
            expected: "200 with a signed-out DPoP Session Token",
            cause: `The token endpoint didn't issue a Session Token${errorCode(start.ex) ? ` (error ${errorCode(start.ex)})` : ""}.${said(start.ex)} See section 4.2 for the request, and the error table there for what each code means.`,
        });
        skipRest(r, SESSION_IDS, "session.start failed, so there's no Session to test with.");
        return;
    }
    ctx.session.token = token;
    r.pass("session.start");

    const json = start.ex.json as Record<string, unknown>;
    const errors = check("token-response.schema.json", json);
    if (errors.length) {
        r.fail("session.response-schema", {
            exchange: start.ex,
            got: formatSchemaErrors(errors).join("; "),
            expected:
                "The fields section 4.2 lists (kit/company/schemas/token-response.schema.json)",
            cause: "Add or fix each field listed.",
        });
    } else {
        r.pass("session.response-schema");
    }
    if (json.token_type === "DPoP") r.pass("session.token-type");
    else
        r.fail("session.token-type", {
            exchange: start.ex,
            got: `token_type ${JSON.stringify(json.token_type)}`,
            expected: 'token_type "DPoP" for a request sent with a DPoP proof',
            cause: "The token should be bound to the proof's key and reported as DPoP.",
        });
    const expires = json.expires_in;
    if (typeof expires === "number" && expires > 0) {
        r.pass("session.expires-in", { summary: `expires_in ${expires}.` });
        if (expires > 86400) {
            r.fail("session.token-lifetime", {
                exchange: start.ex,
                got: `expires_in ${expires} (${Math.round(expires / 3600)} hours)`,
                expected: "A lifetime of hours, not days",
                cause: "Shorten the Session Token lifetime; Personal Agents renew with the same Session Key.",
            });
        } else r.pass("session.token-lifetime");
    } else {
        r.fail("session.expires-in", {
            exchange: start.ex,
            got: `expires_in ${JSON.stringify(expires)}`,
            expected: "A number greater than 0",
        });
        r.skip("session.token-lifetime", "No usable expires_in.");
    }
    if (json.scope === "") {
        r.pass("session.signed-out");
    } else {
        r.fail("session.signed-out", {
            exchange: start.ex,
            got: json.scope === undefined ? "no scope" : `scope ${JSON.stringify(json.scope)}`,
            expected: 'scope ""',
            cause: "A Session started with the JWT bearer grant is signed out and has no account scopes. Include scope even when it's empty: an empty scope is how Personal Agents tell a signed-out token.",
        });
    }
    if (/\bno-store\b/i.test(header(start.ex, "cache-control") ?? "")) r.pass("session.no-store");
    else
        r.fail("session.no-store", {
            exchange: start.ex,
            got: `Cache-Control ${header(start.ex, "cache-control") ?? "missing"}`,
            expected: "Cache-Control: no-store",
            cause: "Token responses shouldn't be cached (RFC 6749 section 5.1 also requires this).",
        });

    // Renew with a proof from the same Session Key.
    if (r.wants("session.renew")) {
        const renew = await tokenRequest(ctx, sessionParams(ctx), {
            note: "renewing the Session with a proof from the same Session Key",
        });
        const renewed = heldToken(renew.ex, key);
        if (renewed && renewed.tokenType === "DPoP") {
            ctx.session.token = renewed;
            r.pass("session.renew");
        } else {
            r.fail("session.renew", {
                exchange: renew.exchanges,
                expected: "200 with a DPoP Session Token",
                got: renewed ? `token_type ${JSON.stringify(renewed.tokenType)}` : undefined,
                cause: `The renewal wasn't accepted.${said(renew.ex)}`,
            });
        }
    }

    if (r.wants("session.key-other-user")) {
        const other = `usr_validator${randomId(12)}`;
        const assertion = await sessionAssertion(ctx, { sub: other });
        const ex = (
            await tokenRequest(ctx, sessionParams(ctx, {}, assertion), {
                note: `with the Session Key of another User ID's Session, and sub ${other}`,
            })
        ).ex;
        expectRefusal(
            r,
            "session.key-other-user",
            ex,
            "invalid_grant",
            400,
            "The Company issued a token for a Session Key that already names another User ID's Session. Find each Session by its key's thumbprint, and check its User ID.",
        );
    }

    if (r.wants("session.assertion-replay")) {
        const assertion = await sessionAssertion(ctx);
        const first = await tokenRequest(ctx, sessionParams(ctx, {}, assertion), {
            note: "starting a Session with a new assertion",
        });
        if (first.ex.status !== 200) {
            r.warn("session.assertion-replay", {
                exchange: first.ex,
                expected: "200 for the first use",
                cause: "The first use of the assertion wasn't accepted, so the replay can't be tested.",
            });
        } else {
            const again = await tokenRequest(ctx, sessionParams(ctx, {}, assertion), {
                note: "with the same Session assertion again (same jti)",
            });
            expectRefusal(
                r,
                "session.assertion-replay",
                again.ex,
                "invalid_grant",
                400,
                "The Company accepted an assertion whose jti it had already seen. Keep a record of jti values until each assertion expires.",
            );
        }
    }

    if (r.wants("session.client-assertion-aud")) {
        const ex = (
            await tokenRequest(ctx, sessionParams(ctx), {
                clientAud: tokenEndpoint(ctx),
                note: "with a client assertion whose aud is the token endpoint URL, not auth.issuer",
            })
        ).ex;
        expectRefusal(
            r,
            "session.client-assertion-aud",
            ex,
            "invalid_client",
            401,
            "The Company accepted a client assertion addressed to its token endpoint. It must accept only its auth.issuer as aud, so an assertion collected by another Company can't be replayed here.",
        );
    }

    if (r.wants("session.client-assertion-unknown-key")) {
        const rogue = await generateKey(false);
        rogue.publicJwk.kid = ctx.identity.key.publicJwk.kid;
        const ex = (
            await tokenRequest(ctx, sessionParams(ctx), {
                clientKey: rogue,
                note: "with a client assertion signed by a key that isn't in jwks_uri",
            })
        ).ex;
        expectRefusal(
            r,
            "session.client-assertion-unknown-key",
            ex,
            "invalid_client",
            401,
            "The Company accepted a client assertion whose signature doesn't verify with the Personal Agent's published keys.",
        );
    }

    if (r.wants("session.assertion-unknown-key")) {
        const rogue = await generateKey(false);
        rogue.publicJwk.kid = ctx.identity.key.publicJwk.kid;
        const assertion = await sessionAssertion(ctx, { key: rogue });
        const ex = (
            await tokenRequest(ctx, sessionParams(ctx, {}, assertion), {
                note: "with a Session assertion signed by a key that isn't in jwks_uri",
            })
        ).ex;
        expectRefusal(
            r,
            "session.assertion-unknown-key",
            ex,
            "invalid_grant",
            400,
            "The Company accepted a Session assertion whose signature doesn't verify with the Personal Agent's published keys.",
            ["invalid_client"],
        );
    }

    // DPoP at the token endpoint.
    if (r.wants("dpop.token-replay")) {
        const fresh = await tokenRequest(ctx, sessionParams(ctx), { note: "starting a Session" });
        if (fresh.ex.status !== 200 || !fresh.proof) {
            r.warn("dpop.token-replay", {
                exchange: fresh.ex,
                expected: "200 for the first use",
                cause: "The first request wasn't accepted, so the replay can't be tested.",
            });
        } else {
            const again = await tokenRequest(ctx, sessionParams(ctx), {
                proof: { proof: fresh.proof },
                note: "with the DPoP proof from the previous request again",
            });
            expectRefusal(
                r,
                "dpop.token-replay",
                again.ex,
                "invalid_dpop_proof",
                400,
                "No replay cache for proof jti values, or one per server rather than shared by every server.",
            );
        }
    }

    if (r.wants("dpop.token-htu")) {
        const other = `${new URL(tokenEndpoint(ctx)).origin}/poppy-validator/not-the-token-endpoint`;
        const ex = (
            await tokenRequest(ctx, sessionParams(ctx), {
                proof: { url: other },
                note: `with a DPoP proof whose htu is ${other}`,
            })
        ).ex;
        expectRefusal(
            r,
            "dpop.token-htu",
            ex,
            "invalid_dpop_proof",
            400,
            "The token endpoint doesn't compare the proof's htu with its own public URL.",
            ["use_dpop_nonce"],
        );
    }
}

function checkNonce(ctx: Context, r: Recorder): void {
    const origin = new URL(tokenEndpoint(ctx)).origin;
    const asked = ctx.session.nonceRequests.filter((n) => n.origin === origin);
    if (asked.length === 0) {
        r.skip(
            "dpop.nonce",
            "The token endpoint didn't ask for a DPoP nonce (nonces are optional).",
        );
        return;
    }
    const withoutHeader = asked.find((n) => !header(n.exchange, "dpop-nonce"));
    if (withoutHeader) {
        r.fail("dpop.nonce", {
            exchange: withoutHeader.exchange,
            expected: "use_dpop_nonce with a DPoP-Nonce header",
            cause: "Without the DPoP-Nonce header the Personal Agent has no nonce to retry with.",
        });
    } else {
        r.pass("dpop.nonce", {
            notes: [
                "The token endpoint requires DPoP nonces; the validator retried with the nonce it supplied.",
            ],
        });
    }
}
