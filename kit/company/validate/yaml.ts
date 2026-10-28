// A small YAML 1.2 parser for the subset OpenAPI descriptions use: block mappings and sequences,
// plain, single-quoted, and double-quoted scalars (on one line or several), literal and folded block
// scalars, flow collections, comments, and the core schema's null, booleans, and numbers. It throws
// a YamlError for anything else. Anchors, aliases, tags, complex keys, and several documents in one
// file throw a YamlError with `unsupported` set, so a caller can report "couldn't read" rather than
// "invalid".
//
// No dependencies, so the validator stays a plain TypeScript program.

export class YamlError extends Error {
    readonly line: number;
    readonly unsupported: boolean;
    constructor(message: string, line: number, unsupported = false) {
        super(`${message} (line ${line + 1})`);
        this.line = line;
        this.unsupported = unsupported;
    }
}

export function parseYaml(text: string): unknown {
    return new Parser(text).parseDocument();
}

const ESCAPES: Record<string, string> = {
    "0": "\0",
    a: "\x07",
    b: "\b",
    t: "\t",
    "\t": "\t",
    n: "\n",
    v: "\v",
    f: "\f",
    r: "\r",
    e: "\x1b",
    " ": " ",
    '"': '"',
    "/": "/",
    "\\": "\\",
    N: "\x85",
    _: "\xa0",
    L: "\u2028",
    P: "\u2029",
};

// The core schema: null, booleans, integers, and floats. Everything else is a string.
export function resolvePlain(s: string): unknown {
    if (/^(~|null|Null|NULL|)$/.test(s)) return null;
    if (/^(true|True|TRUE)$/.test(s)) return true;
    if (/^(false|False|FALSE)$/.test(s)) return false;
    if (/^[-+]?[0-9]+$/.test(s)) return Number(s);
    if (/^0o[0-7]+$/.test(s)) return parseInt(s.slice(2), 8);
    if (/^0x[0-9a-fA-F]+$/.test(s)) return parseInt(s.slice(2), 16);
    if (/^[-+]?(\.[0-9]+|[0-9]+(\.[0-9]*)?)([eE][-+]?[0-9]+)?$/.test(s)) return Number(s);
    if (/^[-+]?\.(inf|Inf|INF)$/.test(s)) return s.startsWith("-") ? -Infinity : Infinity;
    if (/^\.(nan|NaN|NAN)$/.test(s)) return NaN;
    return s;
}

// A line without its comment. A # starts a comment at the start of a line or after whitespace,
// outside quotes. Quotes only start a token, so the apostrophe in "don't" isn't one.
export function stripComment(s: string): string {
    let quote: string | undefined;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (quote === "'") {
            if (c === "'" && s[i + 1] === "'") i++;
            else if (c === "'") quote = undefined;
        } else if (quote === '"') {
            if (c === "\\") i++;
            else if (c === '"') quote = undefined;
        } else if ((c === '"' || c === "'") && (i === 0 || /[\s[{,:]/.test(s[i - 1]))) quote = c;
        else if (c === "#" && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i).trimEnd();
    }
    return s.trimEnd();
}

// Reads a quoted scalar starting at src[pos], which is the quote. Line breaks inside fold: one
// becomes a space, and each empty line a newline.
function scanQuoted(src: string, pos: number, line: number): { value: string; end: number } {
    const q = src[pos];
    let out = "";
    let i = pos + 1;
    for (;;) {
        if (i >= src.length) throw new YamlError("A quoted string isn't closed", line);
        const c = src[i];
        if (q === "'" && c === "'") {
            if (src[i + 1] === "'") {
                out += "'";
                i += 2;
                continue;
            }
            return { value: out, end: i + 1 };
        }
        if (q === '"' && c === '"') return { value: out, end: i + 1 };
        if (q === '"' && c === "\\") {
            const e = src[i + 1];
            if (e === "\n") {
                // An escaped line break joins the lines without a space.
                i += 2;
                while (src[i] === " " || src[i] === "\t") i++;
                continue;
            }
            const hex = e === "x" ? 2 : e === "u" ? 4 : e === "U" ? 8 : 0;
            if (hex) {
                const digits = src.slice(i + 2, i + 2 + hex);
                if (!new RegExp(`^[0-9a-fA-F]{${hex}}$`).test(digits))
                    throw new YamlError(`Bad escape \\${e}${digits}`, line);
                out += String.fromCodePoint(parseInt(digits, 16));
                i += 2 + hex;
                continue;
            }
            if (!(e in ESCAPES)) throw new YamlError(`Unknown escape \\${e}`, line);
            out += ESCAPES[e];
            i += 2;
            continue;
        }
        if (c === "\n") {
            out = out.replace(/[ \t]+$/, "");
            let breaks = 0;
            i++;
            for (;;) {
                while (src[i] === " " || src[i] === "\t") i++;
                if (src[i] === "\n") {
                    breaks++;
                    i++;
                } else break;
            }
            out += breaks ? "\n".repeat(breaks) : " ";
            continue;
        }
        out += c;
        i++;
    }
}

// Folds the lines of a multi-line plain scalar: one line break becomes a space, and each empty
// line a newline.
function foldPlain(lines: string[]): string {
    let out = "";
    let breaks = 0;
    let first = true;
    for (const raw of lines) {
        const l = raw.trim();
        if (l === "") {
            breaks++;
            continue;
        }
        if (!first) out += breaks ? "\n".repeat(breaks) : " ";
        out += l;
        breaks = 0;
        first = false;
    }
    return out;
}

class FlowParser {
    pos: number;
    readonly src: string;
    readonly line: number;
    constructor(src: string, start: number, line: number) {
        this.src = src;
        this.pos = start;
        this.line = line;
    }

    ws(): void {
        while (this.pos < this.src.length && /\s/.test(this.src[this.pos])) this.pos++;
    }

    node(): unknown {
        this.ws();
        const c = this.src[this.pos];
        if (c === "[") return this.sequence();
        if (c === "{") return this.mapping();
        if (c === '"' || c === "'") {
            const { value, end } = scanQuoted(this.src, this.pos, this.line);
            this.pos = end;
            return value;
        }
        if (c === "&" || c === "*" || c === "!")
            throw new YamlError("Anchors, aliases, and tags aren't supported", this.line, true);
        return resolvePlain(this.plain());
    }

    plain(): string {
        const start = this.pos;
        while (this.pos < this.src.length) {
            const c = this.src[this.pos];
            if (",[]{}".includes(c)) break;
            if (c === ":" && /[\s,[\]{}]|^$/.test(this.src[this.pos + 1] ?? "")) break;
            this.pos++;
        }
        return foldPlain(this.src.slice(start, this.pos).split("\n"));
    }

    sequence(): unknown[] {
        this.pos++;
        const out: unknown[] = [];
        for (;;) {
            this.ws();
            if (this.src[this.pos] === "]") {
                this.pos++;
                return out;
            }
            if (this.pos >= this.src.length) throw new YamlError("A [ isn't closed", this.line);
            let item = this.node();
            this.ws();
            if (this.src[this.pos] === ":") {
                // A single-pair mapping, such as [a: 1].
                this.pos++;
                item = { [String(item)]: this.node() };
                this.ws();
            }
            out.push(item);
            if (this.src[this.pos] === ",") this.pos++;
            else if (this.src[this.pos] !== "]")
                throw new YamlError("Expected , or ] in a flow sequence", this.line);
        }
    }

    mapping(): Record<string, unknown> {
        this.pos++;
        const out: Record<string, unknown> = {};
        for (;;) {
            this.ws();
            if (this.src[this.pos] === "}") {
                this.pos++;
                return out;
            }
            if (this.pos >= this.src.length) throw new YamlError("A { isn't closed", this.line);
            const c = this.src[this.pos];
            let key: string;
            if (c === '"' || c === "'") {
                const q = scanQuoted(this.src, this.pos, this.line);
                key = q.value;
                this.pos = q.end;
            } else if (c === "[" || c === "{" || c === "?")
                throw new YamlError("Complex keys aren't supported", this.line, true);
            else key = this.plain();
            this.ws();
            let value: unknown = null;
            if (this.src[this.pos] === ":") {
                this.pos++;
                this.ws();
                if (this.src[this.pos] !== "," && this.src[this.pos] !== "}") value = this.node();
                this.ws();
            }
            if (Object.prototype.hasOwnProperty.call(out, key))
                throw new YamlError(`Duplicate key ${key}`, this.line);
            out[key] = value;
            if (this.src[this.pos] === ",") this.pos++;
            else if (this.src[this.pos] !== "}")
                throw new YamlError("Expected , or } in a flow mapping", this.line);
        }
    }
}

class Parser {
    lines: string[];
    i = 0;

    constructor(text: string) {
        this.lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
    }

    isMarker(line: string): boolean {
        return /^(---|\.\.\.)(\s|$)/.test(line);
    }

    // The index of the next line with content, if it's in this document.
    peek(): number | undefined {
        for (let j = this.i; j < this.lines.length; j++) {
            const l = this.lines[j];
            const t = l.trim();
            if (t === "" || t.startsWith("#")) continue;
            if (this.isMarker(l)) return undefined;
            return j;
        }
        return undefined;
    }

    indent(j: number): number {
        const l = this.lines[j];
        const n = l.length - l.trimStart().length;
        if (l.slice(0, n).includes("\t")) throw new YamlError("Tabs can't indent YAML", j);
        return n;
    }

    content(j: number): string {
        return stripComment(this.lines[j].slice(this.indent(j)));
    }

    parseDocument(): unknown {
        while (this.i < this.lines.length) {
            const t = this.lines[this.i].trim();
            if (t === "" || t.startsWith("#") || t.startsWith("%")) this.i++;
            else break;
        }
        if (this.i < this.lines.length && /^---(\s|$)/.test(this.lines[this.i])) {
            const rest = this.lines[this.i].slice(3);
            if (stripComment(rest).trim()) this.lines[this.i] = "   " + rest;
            else this.i++;
        }
        const value = this.node(-1);
        for (; this.i < this.lines.length; this.i++) {
            const l = this.lines[this.i];
            const t = l.trim();
            if (t === "" || t.startsWith("#")) continue;
            if (/^\.\.\.(\s|$)/.test(l)) break;
            if (/^---(\s|$)/.test(l))
                throw new YamlError("Several documents in one file aren't supported", this.i, true);
            throw new YamlError("Unexpected content", this.i);
        }
        return value;
    }

    // A node more indented than its parent, or null if there's none.
    node(parent: number): unknown {
        const j = this.peek();
        if (j === undefined) return null;
        const ind = this.indent(j);
        if (ind <= parent) return null;
        const content = this.content(j);
        if (isSeqItem(content)) return this.sequence(ind);
        if (this.key(content, j)) return this.mapping(ind);
        return this.inline(j, ind, parent);
    }

    sequence(ind: number): unknown[] {
        const out: unknown[] = [];
        for (;;) {
            const j = this.peek();
            if (j === undefined) break;
            const li = this.indent(j);
            if (li < ind) break;
            const content = this.content(j);
            if (li > ind) throw new YamlError("Bad indentation in a sequence", j);
            if (!isSeqItem(content)) break;
            const line = this.lines[j];
            const after = line.slice(ind + 1);
            if (stripComment(after).trim() === "") {
                this.i = j + 1;
                out.push(this.node(ind));
            } else {
                // Parse the item as if the dash were a space, so "- a: 1" is a mapping at the
                // column of "a".
                const k = ind + 1 + (after.length - after.trimStart().length);
                this.lines[j] = " ".repeat(k) + line.slice(k);
                this.i = j;
                out.push(this.node(ind));
            }
        }
        return out;
    }

    mapping(ind: number): Record<string, unknown> {
        const out: Record<string, unknown> = {};
        for (;;) {
            const j = this.peek();
            if (j === undefined) break;
            const li = this.indent(j);
            if (li < ind) break;
            if (li > ind) throw new YamlError("Bad indentation in a mapping", j);
            const content = this.content(j);
            if (isSeqItem(content)) break;
            const key = this.key(content, j);
            if (!key) throw new YamlError("Expected a key", j);
            if (Object.prototype.hasOwnProperty.call(out, key.key))
                throw new YamlError(`Duplicate key ${key.key}`, j);
            this.i = j + 1;
            let value: unknown;
            if (key.rest === undefined) {
                const next = this.peek();
                value =
                    next !== undefined && this.indent(next) === ind && isSeqItem(this.content(next))
                        ? this.sequence(ind)
                        : this.node(ind);
            } else value = this.inline(j, ind + key.rest, ind);
            out[key.key] = value;
        }
        return out;
    }

    // The key at the start of a line's content, and the offset of its inline value, if any.
    key(content: string, j: number): { key: string; rest?: number } | undefined {
        let end: number;
        let key: string;
        const c = content[0];
        if (c === "?" && (content.length === 1 || content[1] === " "))
            throw new YamlError("Complex keys aren't supported", j, true);
        if (c === '"' || c === "'") {
            let q: { value: string; end: number };
            try {
                q = scanQuoted(content, 0, j);
            } catch {
                return undefined;
            }
            let k = q.end;
            while (content[k] === " ") k++;
            if (content[k] !== ":" || !/^(\s|$)/.test(content.slice(k + 1, k + 2)))
                return undefined;
            key = q.value;
            end = k + 1;
        } else {
            if (c === "[" || c === "{") return undefined;
            const m = /:(\s|$)/.exec(content);
            if (!m) return undefined;
            if (c === "&" || c === "*" || c === "!")
                throw new YamlError("Anchors, aliases, and tags aren't supported", j, true);
            key = content.slice(0, m.index).trim();
            end = m.index + 1;
        }
        while (content[end] === " ") end++;
        return { key, rest: end < content.length ? end : undefined };
    }

    // A scalar or flow collection starting at a column of line j.
    inline(j: number, col: number, parent: number): unknown {
        const raw = this.lines[j].slice(col);
        const c = raw[0];
        if (c === "&" || c === "*" || c === "!")
            throw new YamlError("Anchors, aliases, and tags aren't supported", j, true);
        if (c === "|" || c === ">") return this.block(j, raw, parent);
        if (c === '"' || c === "'") {
            const src = [raw, ...this.lines.slice(j + 1)].join("\n");
            const { value, end } = scanQuoted(src, 0, j);
            const before = src.slice(0, end);
            const endLine = j + (before.match(/\n/g)?.length ?? 0);
            const lineEnd = src.indexOf("\n", end);
            const trailing = src.slice(end, lineEnd === -1 ? undefined : lineEnd);
            if (stripComment(trailing).trim())
                throw new YamlError("Unexpected text after a quoted string", endLine);
            this.i = endLine + 1;
            return value;
        }
        if (c === "[" || c === "{") {
            const src = [raw, ...this.lines.slice(j + 1)].map(stripComment).join("\n");
            const flow = new FlowParser(src, 0, j);
            const value = flow.node();
            const before = src.slice(0, flow.pos);
            const endLine = j + (before.match(/\n/g)?.length ?? 0);
            const lineEnd = src.indexOf("\n", flow.pos);
            if (src.slice(flow.pos, lineEnd === -1 ? undefined : lineEnd).trim())
                throw new YamlError("Unexpected text after a flow collection", endLine);
            this.i = endLine + 1;
            return value;
        }
        // A plain scalar, continued on more indented lines.
        const parts = [stripComment(raw)];
        for (let k = j + 1; k < this.lines.length; k++) {
            const l = this.lines[k];
            const t = l.trim();
            if (t === "") {
                parts.push("");
                continue;
            }
            if (t.startsWith("#") || this.isMarker(l) || this.indent(k) <= parent) break;
            parts.push(stripComment(l));
        }
        while (parts.length > 1 && parts[parts.length - 1] === "") parts.pop();
        this.i = j + parts.length;
        return resolvePlain(foldPlain(parts));
    }

    // A literal (|) or folded (>) block scalar.
    block(j: number, header: string, parent: number): string {
        const m = /^([|>])([1-9]?)([+-]?)([1-9]?)\s*(#.*)?$/.exec(header);
        if (!m) throw new YamlError("Bad block scalar header", j);
        const folded = m[1] === ">";
        const explicit = Number(m[2] || m[4] || 0);
        const chomp = m[3];
        let k = j + 1;
        let blockIndent = explicit ? Math.max(parent, 0) + explicit : 0;
        if (!blockIndent) {
            for (let t = k; t < this.lines.length; t++) {
                if (this.lines[t].trim() === "") continue;
                blockIndent = this.lines[t].length - this.lines[t].trimStart().length;
                break;
            }
        }
        const body: string[] = [];
        if (blockIndent > parent) {
            for (; k < this.lines.length; k++) {
                const l = this.lines[k];
                if (l.trim() === "") {
                    body.push("");
                    continue;
                }
                const n = l.length - l.trimStart().length;
                if (n < blockIndent) break;
                body.push(l.slice(blockIndent));
            }
        }
        let trailing = 0;
        while (body.length && body[body.length - 1] === "") {
            body.pop();
            trailing++;
        }
        this.i = j + 1 + body.length;
        let text: string;
        if (!folded) text = body.join("\n");
        else {
            text = "";
            let breaks = 0;
            let prevMore = false;
            let first = true;
            for (const l of body) {
                if (l === "") {
                    breaks++;
                    continue;
                }
                const more = l.startsWith(" ") || l.startsWith("\t");
                if (first) text += "\n".repeat(breaks);
                else if (!more && !prevMore) text += breaks ? "\n".repeat(breaks) : " ";
                else text += "\n".repeat(breaks + 1);
                text += l;
                breaks = 0;
                prevMore = more;
                first = false;
            }
        }
        if (body.length === 0) return chomp === "+" ? "\n".repeat(trailing) : "";
        if (chomp === "-") return text;
        if (chomp === "+") return text + "\n" + "\n".repeat(trailing);
        return text + "\n";
    }
}

function isSeqItem(content: string): boolean {
    return content === "-" || content.startsWith("- ") || content.startsWith("-\t");
}
