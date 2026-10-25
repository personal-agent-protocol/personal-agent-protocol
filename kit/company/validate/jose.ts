// ES256 keys, JWT signing and verification, DPoP Proofs, JWK thumbprints, and ath, with WebCrypto.

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

// The DPoP `ath` claim: the base64url SHA-256 hash of the access token.
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

// The URL without its query and fragment, as DPoP `htu` requires.
export function htuOf(url: string): string {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
}

export type DpopOptions = {
    key: SigningKey;
    method: string;
    url: string;
    accessToken?: string;
    nonce?: string;
    iat?: number;
    jti?: string;
};

// A DPoP Proof for one request (RFC 9449 and spec 4.3).
export async function dpopProof(options: DpopOptions): Promise<string> {
    const payload: Record<string, unknown> = {
        jti: options.jti ?? randomId(16),
        htm: options.method.toUpperCase(),
        htu: htuOf(options.url),
        iat: options.iat ?? nowSeconds(),
    };
    if (options.accessToken !== undefined) payload.ath = await ath(options.accessToken);
    if (options.nonce !== undefined) payload.nonce = options.nonce;
    const { kty, crv, x, y } = options.key.publicJwk;
    return signJwt(
        { typ: "dpop+jwt", alg: "ES256", jwk: { kty, crv, x, y } },
        payload,
        options.key.privateKey,
    );
}

export type AssertionOptions = {
    key: SigningKey;
    iss: string;
    sub: string;
    aud: string;
    typ?: string;
    lifetime?: number;
    jti?: string;
    extra?: Record<string, unknown>;
};

// A short-lived signed assertion: the client assertion (RFC 7523, sub = client_id) or the Session
// assertion (spec 4.2, sub = User ID).
export function signAssertion(options: AssertionOptions): Promise<string> {
    const iat = nowSeconds();
    const header: Record<string, unknown> = { alg: "ES256", typ: options.typ ?? "JWT" };
    if (options.key.publicJwk.kid) header.kid = options.key.publicJwk.kid;
    return signJwt(
        header,
        {
            iss: options.iss,
            sub: options.sub,
            aud: options.aud,
            iat,
            exp: iat + (options.lifetime ?? 60),
            jti: options.jti ?? randomId(16),
            ...options.extra,
        },
        options.key.privateKey,
    );
}
