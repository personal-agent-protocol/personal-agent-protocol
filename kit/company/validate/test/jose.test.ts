import assert from "node:assert/strict";
import { test } from "node:test";
import { check } from "../schemas.ts";
import {
    ath,
    b64url,
    b64urlDecode,
    decodeJwt,
    generateKey,
    htuOf,
    MAX_DELEGATION_LIFETIME,
    sha256,
    signDelegation,
    signJwt,
    signSessionJwt,
    thumbprint,
    verifyJwt,
} from "../jose.ts";

test("base64url round trip without padding", () => {
    const bytes = new Uint8Array([0, 250, 251, 252, 253, 254, 255]);
    const encoded = b64url(bytes);
    assert.doesNotMatch(encoded, /[+/=]/);
    assert.deepEqual([...b64urlDecode(encoded)], [...bytes]);
});

test("sign and verify an ES256 JWT", async () => {
    const key = await generateKey(false);
    const jwt = await signJwt({ alg: "ES256", typ: "JWT" }, { sub: "u" }, key.privateKey);
    assert.equal(b64urlDecode(jwt.split(".")[2]).length, 64, "r || s signature");
    assert.deepEqual((await verifyJwt(jwt, key.publicJwk))?.payload, { sub: "u" });
    const other = await generateKey(false);
    assert.equal(await verifyJwt(jwt, other.publicJwk), null);
    const [h, , s] = jwt.split(".");
    assert.equal(
        await verifyJwt(`${h}.${b64url(JSON.stringify({ sub: "v" }))}.${s}`, key.publicJwk),
        null,
    );
});

test("RFC 7638 thumbprint matches the RFC's EC example shape", async () => {
    const key = await generateKey(false);
    const t = await thumbprint(key.publicJwk);
    assert.match(t, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(await thumbprint({ ...key.publicJwk, kid: "ignored", alg: "ES256" }), t);
});

test("ath is the base64url SHA-256 of the token", async () => {
    // SHA-256("abc"), base64url.
    assert.equal(await sha256("abc"), "ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0");
    assert.equal(await ath("abc"), await sha256("abc"));
});

test("Session JWTs carry the fields spec 5.2 requires", async () => {
    const root = await generateKey(false);
    root.publicJwk.kid = "root";
    const key = await generateKey(false);
    const delegation = await signDelegation({
        root,
        delegated: key.publicJwk,
        iss: "https://agent.example/agent.json",
    });
    const jwt = await signSessionJwt({
        key,
        delegation,
        iss: "https://agent.example/agent.json",
        aud: "https://auth.example",
        sid: "abcdefghijklmnopqrstuv",
        sub: "usr_1",
        method: "get",
        url: "https://a.example/x?y=1#z",
        accessToken: "tok",
    });
    const { header, payload } = decodeJwt(jwt);
    assert.equal(header.typ, "poppy-session+jwt");
    assert.equal(header.alg, "ES256");
    assert.equal(header.kid, await thumbprint(key.publicJwk));
    assert.equal(header.pap_dlg, delegation);
    assert.equal(payload.htm, "GET");
    assert.equal(payload.htu, "https://a.example/x");
    assert.equal(payload.ath, await ath("tok"));
    assert.deepEqual(check("session-jwt.schema.json#/$defs/header", header), []);
    assert.deepEqual(check("session-jwt.schema.json#/$defs/payload", payload), []);
    assert.ok(await verifyJwt(jwt, key.publicJwk));

    const dlg = decodeJwt(delegation);
    assert.equal(dlg.header.typ, "pap-delegation+jwt");
    assert.equal(dlg.header.kid, "root");
    assert.ok((dlg.payload.exp as number) - (dlg.payload.iat as number) <= MAX_DELEGATION_LIFETIME);
    assert.ok(await verifyJwt(delegation, root.publicJwk));

    const second = decodeJwt(
        await signSessionJwt({
            key,
            delegation,
            iss: "https://agent.example/agent.json",
            aud: "https://auth.example",
            sid: "abcdefghijklmnopqrstuv",
            sub: "usr_1",
            method: "GET",
            url: "https://a.example/x",
        }),
    );
    assert.notEqual(second.payload.jti, payload.jti, "a fresh jti per JWT");
    assert.equal(second.payload.ath, undefined, "no ath without an access token");
});

test("htuOf strips query and fragment", () => {
    assert.equal(htuOf("https://a.example:8443/p/q?x#y"), "https://a.example:8443/p/q");
});
