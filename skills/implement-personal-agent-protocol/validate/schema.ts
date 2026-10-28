// A small JSON Schema 2020-12 validator for the subset the Poppy schemas use: type, properties,
// required, additionalProperties, items, enum, const, pattern, minLength, maxLength, minimum,
// maximum, exclusiveMinimum, minItems, maxItems, anyOf, oneOf, allOf, not, if/then/else, format
// ("date-time" and "uri", checked rather than only annotated), and $ref to
// "#/$defs/..." or to another schema by file name ("message.schema.json" or
// "message.schema.json#/$defs/id"), resolved through `refs`.
//
// Pure: no file system access and no side effects, so the site build can import it.

export type SchemaError = { path: string; message: string };

type Schema = boolean | { [keyword: string]: unknown };

type Scope = { root: Schema; refs: Record<string, object>; depth: number };

// Messages for the patterns the Poppy schemas use, so errors read as plain English.
const PATTERN_MESSAGES: [RegExp, string][] = [
    [/^\^https:\/\/\[\^\?#\]\+\$$/, "must be an HTTPS URL without a query or fragment"],
    [/^\^https:\/\//, "must be an HTTPS URL"],
    [/^\^\[A-Za-z0-9_-\]\{1,256\}\$$/, "must be 1 to 256 characters, each a letter, digit, - or _"],
    [/^\^\[0-9\]\+\\\.\[0-9\]\+\$$/, 'must be "major.minor", such as "0.1"'],
    [/^\^\[0-9\]\{4\}-/, "must be an RFC 3339 date and time, such as 2026-10-02T17:15:00-07:00"],
    [/^\^\[A-Za-z0-9\]\(/, "must be a domain name, such as example.com, without a scheme or path"],
    [/^\^\[\\x21/, "must be a scope name without spaces or quotes"],
    [/^\^\[A-Z\]\+\$$/, "must be an HTTP method in capitals, such as POST"],
    [/^\^\[A-Za-z0-9_-\]\{43\}\$$/, "must be a base64url SHA-256 hash (43 characters)"],
];

export function validateSchema(
    schema: object,
    value: unknown,
    refs: Record<string, object> = {},
): SchemaError[] {
    return validate(schema as Schema, value, "", { root: schema as Schema, refs, depth: 0 });
}

function pointerSegment(key: string | number): string {
    return "/" + String(key).replace(/~/g, "~0").replace(/\//g, "~1");
}

function typeOf(value: unknown): string {
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
    return typeof value;
}

const TYPE_NAMES: Record<string, string> = {
    string: "a string",
    integer: "a whole number",
    number: "a number",
    boolean: "true or false",
    object: "an object",
    array: "an array",
    null: "null",
};

function matchesType(value: unknown, type: string): boolean {
    const actual = typeOf(value);
    if (type === "number") return actual === "number" || actual === "integer";
    return actual === type;
}

function describe(value: unknown): string {
    if (typeof value === "string") return value;
    return JSON.stringify(value);
}

function equal(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a) && Array.isArray(b)) {
        return a.length === b.length && a.every((item, i) => equal(item, b[i]));
    }
    const ka = Object.keys(a as object);
    const kb = Object.keys(b as object);
    return (
        ka.length === kb.length &&
        ka.every((k) => equal((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
    );
}

function resolvePointer(root: unknown, pointer: string): unknown {
    if (pointer === "" || pointer === "/") return root;
    let node: unknown = root;
    for (const raw of pointer.replace(/^\//, "").split("/")) {
        const key = decodeURIComponent(raw).replace(/~1/g, "/").replace(/~0/g, "~");
        if (node === null || typeof node !== "object") return undefined;
        node = (node as Record<string, unknown>)[key];
    }
    return node;
}

function resolveRef(ref: string, scope: Scope): { schema: Schema; root: Schema } | string {
    const hash = ref.indexOf("#");
    const file = hash === -1 ? ref : ref.slice(0, hash);
    const fragment = hash === -1 ? "" : ref.slice(hash + 1);
    let root = scope.root;
    if (file !== "") {
        const target = scope.refs[file];
        if (!target) return `refers to ${ref}, which isn't loaded`;
        root = target as Schema;
    }
    const schema = resolvePointer(root, fragment);
    if (schema === undefined || (typeof schema !== "object" && typeof schema !== "boolean")) {
        return `refers to ${ref}, which doesn't exist`;
    }
    return { schema: schema as Schema, root };
}

function onlyRequired(schema: unknown): string[] | undefined {
    if (typeof schema !== "object" || schema === null) return undefined;
    const keys = Object.keys(schema);
    const required = (schema as { required?: unknown }).required;
    if (keys.length === 1 && Array.isArray(required) && required.length === 1) {
        return required as string[];
    }
    return undefined;
}

function validate(schema: Schema, value: unknown, path: string, scope: Scope): SchemaError[] {
    if (schema === true) return [];
    if (schema === false) {
        return [{ path, message: "must not be present" }];
    }
    if (scope.depth > 64) return [{ path, message: "is nested too deeply to check" }];
    const s = schema;
    const errors: SchemaError[] = [];
    const inner: Scope = { ...scope, depth: scope.depth + 1 };

    if (typeof s.$ref === "string") {
        const resolved = resolveRef(s.$ref, scope);
        if (typeof resolved === "string") {
            errors.push({ path, message: `can't be checked: the schema ${resolved}` });
        } else {
            errors.push(
                ...validate(resolved.schema, value, path, { ...inner, root: resolved.root }),
            );
        }
    }

    if (s.type !== undefined) {
        const types = Array.isArray(s.type) ? (s.type as string[]) : [s.type as string];
        if (!types.some((t) => matchesType(value, t))) {
            const expected = types.map((t) => TYPE_NAMES[t] ?? t).join(" or ");
            const actual = TYPE_NAMES[typeOf(value)] ?? typeOf(value);
            errors.push({ path, message: `must be ${expected}, not ${actual}` });
            return errors;
        }
    }

    if (Array.isArray(s.enum) && !s.enum.some((option) => equal(option, value))) {
        const options = (s.enum as unknown[]).map(describe).join(", ");
        errors.push({
            path,
            message:
                s.enum.length === 1
                    ? `must be ${options}`
                    : `must be one of: ${options}` +
                      (value === undefined ? "" : ` (got ${describe(value)})`),
        });
    }

    if ("const" in s && !equal(s.const, value)) {
        errors.push({
            path,
            message: `must be ${JSON.stringify(s.const)}` + ` (got ${JSON.stringify(value)})`,
        });
    }

    if (typeof value === "string") {
        const length = [...value].length;
        if (typeof s.minLength === "number" && length < s.minLength) {
            errors.push({
                path,
                message:
                    s.minLength === 1
                        ? "must not be empty"
                        : `must be at least ${s.minLength} characters (got ${length})`,
            });
        }
        if (typeof s.maxLength === "number" && length > s.maxLength) {
            errors.push({
                path,
                message: `must be at most ${s.maxLength} characters (got ${length})`,
            });
        }
        if (typeof s.pattern === "string" && !new RegExp(s.pattern, "u").test(value)) {
            const known = PATTERN_MESSAGES.find(([p]) => p.test(s.pattern as string));
            errors.push({
                path,
                message:
                    (known ? known[1] : `must match the pattern ${s.pattern}`) +
                    ` (got ${JSON.stringify(value)})`,
            });
        }
    }

    if (typeof value === "string" && typeof s.format === "string") {
        const problem = formatProblem(s.format, value);
        if (problem) errors.push({ path, message: `${problem} (got ${JSON.stringify(value)})` });
    }

    if (typeof value === "number") {
        if (typeof s.minimum === "number" && value < s.minimum) {
            errors.push({ path, message: `must be ${s.minimum} or more (got ${value})` });
        }
        if (typeof s.maximum === "number" && value > s.maximum) {
            errors.push({ path, message: `must be ${s.maximum} or less (got ${value})` });
        }
        if (typeof s.exclusiveMinimum === "number" && value <= s.exclusiveMinimum) {
            errors.push({
                path,
                message: `must be more than ${s.exclusiveMinimum} (got ${value})`,
            });
        }
    }

    if (Array.isArray(value)) {
        if (typeof s.minItems === "number" && value.length < s.minItems) {
            errors.push({
                path,
                message:
                    s.minItems === 1
                        ? "must not be empty"
                        : `must have at least ${s.minItems} items (got ${value.length})`,
            });
        }
        if (typeof s.maxItems === "number" && value.length > s.maxItems) {
            errors.push({
                path,
                message: `must have at most ${s.maxItems} items (got ${value.length})`,
            });
        }
        if (s.items !== undefined && typeof s.items !== "undefined") {
            value.forEach((item, i) => {
                errors.push(...validate(s.items as Schema, item, path + pointerSegment(i), inner));
            });
        }
    }

    if (typeOf(value) === "object") {
        const object = value as Record<string, unknown>;
        if (Array.isArray(s.required)) {
            for (const key of s.required as string[]) {
                if (!(key in object)) {
                    errors.push({ path: path + pointerSegment(key), message: "is required" });
                }
            }
        }
        const properties = (s.properties ?? {}) as Record<string, Schema>;
        for (const [key, sub] of Object.entries(properties)) {
            if (key in object) {
                errors.push(...validate(sub, object[key], path + pointerSegment(key), inner));
            }
        }
        if (s.additionalProperties !== undefined) {
            for (const key of Object.keys(object)) {
                if (key in properties) continue;
                if (s.additionalProperties === false) {
                    errors.push({ path: path + pointerSegment(key), message: "is not allowed" });
                } else {
                    errors.push(
                        ...validate(
                            s.additionalProperties as Schema,
                            object[key],
                            path + pointerSegment(key),
                            inner,
                        ),
                    );
                }
            }
        }
    }

    if (Array.isArray(s.allOf)) {
        for (const sub of s.allOf as Schema[]) errors.push(...validate(sub, value, path, inner));
    }

    if (Array.isArray(s.anyOf)) {
        const branches = (s.anyOf as Schema[]).map((sub) => validate(sub, value, path, inner));
        if (!branches.some((b) => b.length === 0)) {
            const keys = (s.anyOf as unknown[]).map(onlyRequired);
            if (keys.every((k) => k !== undefined)) {
                errors.push({
                    path,
                    message: `must include at least one of: ${keys.map((k) => k![0]).join(", ")}`,
                });
            } else {
                errors.push(...fewest(branches));
            }
        }
    }

    if (Array.isArray(s.oneOf)) {
        const branches = (s.oneOf as Schema[]).map((sub) => validate(sub, value, path, inner));
        const passing = branches.filter((b) => b.length === 0).length;
        if (passing === 0) errors.push(...fewest(branches));
        if (passing > 1)
            errors.push({ path, message: "matches more than one of the allowed forms" });
    }

    if (s.not !== undefined && validate(s.not as Schema, value, path, inner).length === 0) {
        errors.push({
            path,
            message:
                typeof s.not === "object" &&
                s.not !== null &&
                Array.isArray((s.not as Schema & { enum?: unknown[] }).enum)
                    ? `must not be ${(s.not as { enum: unknown[] }).enum.map(describe).join(" or ")}`
                    : "is not allowed in this form",
        });
    }

    if (s.if !== undefined) {
        const condition = validate(s.if as Schema, value, path, inner).length === 0;
        const branch = condition ? s.then : s.else;
        if (branch !== undefined) errors.push(...validate(branch as Schema, value, path, inner));
    }

    return dedupe(errors);
}

function fewest(branches: SchemaError[][]): SchemaError[] {
    return branches.reduce((best, b) => (b.length < best.length ? b : best), branches[0] ?? []);
}

function dedupe(errors: SchemaError[]): SchemaError[] {
    const seen = new Set<string>();
    return errors.filter((e) => {
        const key = e.path + "\u0000" + e.message;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// Formats errors as lines such as "/auth/issuer must be an HTTPS URL".
export function formatSchemaErrors(errors: SchemaError[]): string[] {
    return errors.map((e) => `${e.path || "(the document)"} ${e.message}`);
}

// RFC 3339 date-times, checked against the calendar: 2026-02-30T00:00:00Z matches the pattern but
// isn't a date.
export function isDateTime(value: string): boolean {
    const m =
        /^([0-9]{4})-([0-9]{2})-([0-9]{2})[Tt]([0-9]{2}):([0-9]{2}):([0-9]{2})(\.[0-9]+)?([Zz]|([+-])([0-9]{2}):([0-9]{2}))$/.exec(
            value,
        );
    if (!m) return false;
    const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number);
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
    if (!days || day < 1 || day > days) return false;
    if (hour > 23 || minute > 59 || second > 60) return false;
    if (m[9] && (Number(m[10]) > 23 || Number(m[11]) > 59)) return false;
    return true;
}

// Absolute URLs: parsed by the URL standard, with a host, and without spaces, control characters,
// or a user name or password.
export function isUri(value: string): boolean {
    if (/[\s\x00-\x1f\x7f]/.test(value)) return false;
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        return false;
    }
    if ((url.protocol === "https:" || url.protocol === "http:") && !url.hostname) return false;
    return !url.username && !url.password;
}

function formatProblem(format: string, value: string): string | undefined {
    if (format === "date-time" && !isDateTime(value))
        return "must be an RFC 3339 date and time that exists, such as 2026-10-02T17:15:00-07:00";
    if (format === "uri" && !isUri(value))
        return "must be a URL with a valid host, and no spaces, user name, or password";
    return undefined;
}
