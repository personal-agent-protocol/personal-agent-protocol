// Reads the ```json poppy-design block in plan/design.md, and reports progress against it.

import {
    apisOf,
    extensionsOf,
    fieldOf,
    offersGrant,
    protocolsOf,
    SIGN_IN_GRANTS,
    type CheckResult,
    type Metadata,
    type Poppy,
} from "./checks/types.ts";

export type Design = {
    domain?: string;
    milestones?: string[];
    interfaces?: string[];
    sign_in?: string[];
    extensions?: string[];
};

export function parseDesign(markdown: string): Design {
    const match = /^```json[ \t]+poppy-design[ \t]*\n([\s\S]*?)^```/m.exec(markdown);
    if (!match)
        throw new Error(
            "No ```json poppy-design block found. Add one at the top of the design (see design.md in the kit).",
        );
    let value: unknown;
    try {
        value = JSON.parse(match[1]);
    } catch (error) {
        throw new Error(
            `The poppy-design block isn't valid JSON: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("The poppy-design block must be a JSON object.");
    const design = value as Design;
    for (const key of ["milestones", "interfaces", "sign_in", "extensions"] as const) {
        if (
            design[key] !== undefined &&
            !(Array.isArray(design[key]) && design[key]!.every((v) => typeof v === "string"))
        ) {
            throw new Error(`In the poppy-design block, ${key} must be a list of strings.`);
        }
    }
    return design;
}

export type ProgressItem = {
    kind: "interface" | "sign-in" | "extension";
    name: string;
    planned: boolean;
    live: boolean;
    state:
        | "live and passing"
        | "live with failures"
        | "live, not checked in this run"
        | "live, not checked by this version"
        | "not live yet"
        | "live, not in the design";
    failing: string[];
};

const PREFIX: Record<string, string> = {
    openapi: "openapi.",
    mcp: "mcp.",
    conversations: "conversations.",
    web: "web.",
};

export function progress(
    design: Design,
    poppy: Poppy | undefined,
    results: CheckResult[],
    metadata?: Metadata,
): ProgressItem[] {
    const live = {
        interface: {
            openapi: apisOf(poppy).some((a) => a.type === "openapi"),
            mcp: apisOf(poppy).some((a) => a.type === "mcp"),
            conversations: protocolsOf(poppy).some((p) => p.type === "poppy"),
            web: fieldOf(poppy, "web", "browser_session_endpoint") !== undefined,
        } as Record<string, boolean>,
        "sign-in": {
            direct: offersGrant(metadata, SIGN_IN_GRANTS.direct),
            device: offersGrant(metadata, SIGN_IN_GRANTS.device),
        } as Record<string, boolean>,
        extension: Object.fromEntries(
            Object.keys(extensionsOf(poppy)).map((k) => [k, true]),
        ) as Record<string, boolean>,
    };
    const planned = {
        interface: design.interfaces ?? [],
        "sign-in": design.sign_in ?? [],
        extension: design.extensions ?? [],
    };
    const items: ProgressItem[] = [];
    for (const kind of ["interface", "sign-in", "extension"] as const) {
        const names = new Set([
            ...planned[kind],
            ...Object.keys(live[kind]).filter((k) => live[kind][k]),
        ]);
        for (const name of names) {
            const isPlanned = planned[kind].includes(name);
            const isLive = Boolean(live[kind][name]);
            const prefix =
                kind === "interface"
                    ? PREFIX[name]
                    : kind === "sign-in"
                      ? `metadata.${name === "direct" ? "authorization" : "device-authorization"}-endpoint`
                      : undefined;
            const failing = prefix
                ? results
                      .filter(
                          (r) =>
                              r.id.startsWith(prefix) &&
                              (r.status === "fail" || r.status === "warn"),
                      )
                      .map((r) => r.id)
                : [];
            const checked = prefix
                ? results.some((r) => r.id.startsWith(prefix) && r.status !== "skip")
                : false;
            let state: ProgressItem["state"];
            if (!isLive) state = "not live yet";
            else if (!isPlanned) state = "live, not in the design";
            else if (failing.length) state = "live with failures";
            else if (checked && kind === "interface") state = "live and passing";
            else if (kind === "interface" && prefix) state = "live, not checked in this run";
            else state = "live, not checked by this version";
            items.push({ kind, name, planned: isPlanned, live: isLive, state, failing });
        }
    }
    return items;
}
