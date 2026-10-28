// ES256 keys, JWT signing and verification, Session JWTs, delegations, JWK thumbprints, and ath,
// with WebCrypto. PS384 RSA keys sign and verify delegations too (spec 5.2, 10.7).

export type EcPublicJwk = {
    kty: "EC";
    crv: "P-256";
    x: string;
    y: string;
    kid?: string;
    alg?: string;
    use?: string;
};

export type EcPrivateJwk = EcPublicJwk & { d: string };

// A signing key: the private key for signing, and its public JWK (with kid, if it has one).
export type SigningKey = { privateKey: CryptoKey; publicJwk: EcPublicJwk };

export type RsaPublicJwk = {
    kty: "RSA";
    n: string;
    e: string;
    kid?: string;
    alg?: string;
    use?: string;
};

export type RsaPrivateJwk = RsaPublicJwk & {
    d: string;
    p: string;
    q: string;
    dp: string;
    dq: string;
    qi: string;
};

// A PS384 key, which a Personal Agent can use to sign blindly (spec 10.7).
export type RsaKey = { privateKey: CryptoKey; publicJwk: RsaPublicJwk };

const RSA_ALGORITHM = { name: "RSA-PSS", hash: "SHA-384" } as const;
// PS384 uses a salt as long as the hash (RFC 7518 §3.5).
const RSA_SIGN = { name: "RSA-PSS", saltLength: 48 } as const;

const ALGORITHM = { name: "ECDSA", namedCurve: "P-256" } as const;
const SIGN = { name: "ECDSA", hash: "SHA-256" } as const;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function b64url(input: Uint8Array | ArrayBuffer | string): string {
    const bytes =
        typeof input === "string"
            ? encoder.encode(input)
            : input instanceof Uint8Array
              ? input
              : new Uint8Array(input);
    return Buffer.from(bytes).toString("base64url");
}

export function b64urlDecode(input: string): Uint8Array {
    return new Uint8Array(Buffer.from(input, "base64url"));
}

// A random base64url string with `bytes` random bytes (16 bytes = 128 bits).
export function randomId(bytes = 16): string {
    return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256(input: string): Promise<string> {
    return b64url(await crypto.subtle.digest("SHA-256", encoder.encode(input)));
}

// The `ath` claim of a Session JWT, as in DPoP: the base64url SHA-256 hash of the access token.
export function ath(accessToken: string): Promise<string> {
    return sha256(accessToken);
}

function publicPart(jwk: JsonWebKey): EcPublicJwk {
    return { kty: "EC", crv: "P-256", x: jwk.x as string, y: jwk.y as string };
}

// RFC 7638 JWK thumbprint of an EC public key.
export function thumbprint(jwk: EcPublicJwk): Promise<string> {
    return sha256(JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y }));
}

// Generates an ES256 key pair. With `extractable`, the private JWK is returned too, for keygen.
export async function generateKey(
    extractable = false,
): Promise<SigningKey & { privateJwk?: EcPrivateJwk }> {
    const pair = (await crypto.subtle.generateKey(ALGORITHM, extractable, [
        "sign",
        "verify",
    ])) as CryptoKeyPair;
    const publicJwk = publicPart(await crypto.subtle.exportKey("jwk", pair.publicKey));
    if (!extractable) return { privateKey: pair.privateKey, publicJwk };
    const exported = await crypto.subtle.exportKey("jwk", pair.privateKey);
    return {
        privateKey: pair.privateKey,
        publicJwk,
        privateJwk: { ...publicJwk, d: exported.d as string },
    };
}

export async function importPrivateJwk(jwk: EcPrivateJwk): Promise<SigningKey> {
    if (jwk.kty !== "EC" || jwk.crv !== "P-256" || typeof jwk.d !== "string") {
        throw new Error("The private key must be an EC P-256 JWK with a d value.");
    }
    const privateKey = await crypto.subtle.importKey(
        "jwk",
        { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y, d: jwk.d },
        ALGORITHM,
        false,
        ["sign"],
    );
    const publicJwk: EcPublicJwk = { ...publicPart(jwk), ...(jwk.kid ? { kid: jwk.kid } : {}) };
    return { privateKey, publicJwk };
}

export async function signJwt(
    header: Record<string, unknown>,
    payload: Record<string, unknown>,
    key: CryptoKey,
): Promise<string> {
    const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
    // WebCrypto ECDSA signatures are r || s, which is the JWS form for ES256.
    const signature = await crypto.subtle.sign(SIGN, key, encoder.encode(input));
    return `${input}.${b64url(signature)}`;
}

export type DecodedJwt = {
    header: Record<string, unknown>;
    payload: Record<string, unknown>;
};

export function decodeJwt(jwt: string): DecodedJwt {
    const [h, p] = jwt.split(".");
    return {
        header: JSON.parse(decoder.decode(b64urlDecode(h))) as Record<string, unknown>,
        payload: JSON.parse(decoder.decode(b64urlDecode(p))) as Record<string, unknown>,
    };
}

// Verifies an ES256 JWT's signature with a public JWK. Returns the decoded JWT, or null.
export async function verifyJwt(jwt: string, jwk: EcPublicJwk): Promise<DecodedJwt | null> {
    const parts = jwt.split(".");
    if (parts.length !== 3) return null;
    const key = await crypto.subtle.importKey(
        "jwk",
        { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y },
        ALGORITHM,
        false,
        ["verify"],
    );
    const ok = await crypto.subtle.verify(
        SIGN,
        key,
        b64urlDecode(parts[2]) as Uint8Array<ArrayBuffer>,
        encoder.encode(`${parts[0]}.${parts[1]}`),
    );
    return ok ? decodeJwt(jwt) : null;
}

export function nowSeconds(): number {
    return Math.floor(Date.now() / 1000);
}

// The URL without its query and fragment, as a Session JWT's `htu` (spec 5.2) and DPoP's require.
export function htuOf(url: string): string {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
}

export type SessionJwtOptions = {
    // The delegated key that signs the JWT. Its kid is its JWK thumbprint (spec 5.2).
    key: SigningKey;
    // The delegation that vouches for `key`, sent in the pap_dlg header. Null sends none.
    delegation: string | null;
    iss: string;
    aud: string;
    sid: string;
    sub: string;
    agentId?: string;
    method: string;
    url: string;
    // The access token the request carries, which ath covers.
    accessToken?: string;
    typ?: string;
    // A kid other than the key's thumbprint.
    kid?: string;
    iat?: number;
    // Claims to add or replace. A claim set to undefined is left out.
    extra?: Record<string, unknown>;
};

// A Session JWT for one request, for the Poppy-Session header (spec 5.2).
export async function signSessionJwt(options: SessionJwtOptions): Promise<string> {
    const header: Record<string, unknown> = {
        typ: options.typ ?? "poppy-session+jwt",
        alg: "ES256",
        kid: options.kid ?? options.key.publicJwk.kid ?? (await thumbprint(options.key.publicJwk)),
    };
    if (options.delegation) header.pap_dlg = options.delegation;
    const payload: Record<string, unknown> = {
        iss: options.iss,
        aud: options.aud,
        sid: options.sid,
        sub: options.sub,
        ...(options.agentId !== undefined ? { agent_id: options.agentId } : {}),
        htm: options.method.toUpperCase(),
        htu: htuOf(options.url),
        iat: options.iat ?? nowSeconds(),
        jti: randomId(16),
    };
    if (options.accessToken !== undefined) payload.ath = await ath(options.accessToken);
    return signJwt(header, { ...payload, ...options.extra }, options.key.privateKey);
}

// The longest lifetime a delegation may have (spec 5.2).
export const MAX_DELEGATION_LIFETIME = 24 * 60 * 60;

// Generates a 2048-bit PS384 key pair, with its private JWK, for keygen.
export async function generateRsaKey(): Promise<RsaKey & { privateJwk: RsaPrivateJwk }> {
    const pair = (await crypto.subtle.generateKey(
        { ...RSA_ALGORITHM, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) },
        true,
        ["sign", "verify"],
    )) as CryptoKeyPair;
    const exported = await crypto.subtle.exportKey("jwk", pair.privateKey);
    const { d, p, q, dp, dq, qi } = exported as Record<string, string>;
    const publicJwk: RsaPublicJwk = { kty: "RSA", n: exported.n!, e: exported.e! };
    return {
        privateKey: pair.privateKey,
        publicJwk,
        privateJwk: { ...publicJwk, d, p, q, dp, dq, qi },
    };
}

export async function importRsaPrivateJwk(jwk: RsaPrivateJwk): Promise<RsaKey> {
    if (jwk.kty !== "RSA" || typeof jwk.d !== "string") {
        throw new Error("The RSA private key must be an RSA JWK with a d value.");
    }
    const { kty, n, e, d, p, q, dp, dq, qi } = jwk;
    const privateKey = await crypto.subtle.importKey(
        "jwk",
        { kty, n, e, d, p, q, dp, dq, qi },
        RSA_ALGORITHM,
        false,
        ["sign"],
    );
    const publicJwk: RsaPublicJwk = { kty, n, e, ...(jwk.kid ? { kid: jwk.kid } : {}) };
    return { privateKey, publicJwk };
}

// Verifies a PS384 JWT's signature with an RSA public JWK. Returns the decoded JWT, or null.
export async function verifyPs384(jwt: string, jwk: RsaPublicJwk): Promise<DecodedJwt | null> {
    const parts = jwt.split(".");
    if (parts.length !== 3) return null;
    const key = await crypto.subtle.importKey(
        "jwk",
        { kty: "RSA", n: jwk.n, e: jwk.e },
        RSA_ALGORITHM,
        false,
        ["verify"],
    );
    const ok = await crypto.subtle.verify(
        RSA_SIGN,
        key,
        b64urlDecode(parts[2]) as Uint8Array<ArrayBuffer>,
        encoder.encode(`${parts[0]}.${parts[1]}`),
    );
    return ok ? decodeJwt(jwt) : null;
}

// A delegation (spec 5.2): `root`, a key in jwks_uri, vouches for `delegated` until it expires. An
// RSA root signs with PS384, as a blind signature would come out (spec 10.7). `iat` is rounded down
// to the hour unless given.
export async function signDelegation(options: {
    root: SigningKey | RsaKey;
    delegated: EcPublicJwk;
    iss: string;
    iat?: number;
    lifetime?: number;
    typ?: string;
    kid?: string;
}): Promise<string> {
    const iat = options.iat ?? nowSeconds() - (nowSeconds() % 3600);
    const { kty, crv, x, y } = options.delegated;
    const rsa = options.root.publicJwk.kty === "RSA";
    const header: Record<string, unknown> = {
        alg: rsa ? "PS384" : "ES256",
        typ: options.typ ?? "pap-delegation+jwt",
    };
    const kid = options.kid ?? options.root.publicJwk.kid;
    if (kid) header.kid = kid;
    const payload = {
        iss: options.iss,
        cnf: { jwk: { kty, crv, x, y } },
        iat,
        exp: iat + (options.lifetime ?? 2 * 60 * 60),
        jti: randomId(16),
    };
    if (!rsa) return signJwt(header, payload, options.root.privateKey);
    return signPs384(header, payload, options.root.privateKey);
}

// Signs a JWT with PS384 and an RSA private key.
export async function signPs384(
    header: Record<string, unknown>,
    payload: Record<string, unknown>,
    privateKey: CryptoKey,
): Promise<string> {
    const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
    const signature = await crypto.subtle.sign(RSA_SIGN, privateKey, encoder.encode(input));
    return `${input}.${b64url(signature)}`;
}
