"use client";

import { useEffect, useState } from "react";
import { isShared, LATEST, VERSIONS, versionOf, type DocsVersion } from "../content/docs";

// The docs version the reader last opened in this tab, kept in the browser's sessionStorage, so the
// pages that aren't versioned, such as the introduction, link to that version's specification,
// extensions, and guides. A new tab or browser session starts at the latest
// published version.
const KEY = "poppy-docs-version";

// sessionStorage throws where the browser blocks storage, for example in a sandboxed frame. Then the
// version isn't remembered.
function read(): string | null {
    try {
        return sessionStorage.getItem(KEY);
    } catch {
        return null;
    }
}

function write(id: string) {
    try {
        sessionStorage.setItem(KEY, id);
    } catch {
        // Not remembered.
    }
}

// The version a docs page shows: its own on a versioned page, which is remembered, and the
// remembered one on other pages. The first render shows the latest published version on other pages, as the
// static HTML does, and switches once the stored version is read.
export function useDocsVersion(pathname: string): DocsVersion {
    const shared = isShared(pathname);
    const own = versionOf(pathname) ?? LATEST;
    const [remembered, setRemembered] = useState<DocsVersion>();
    useEffect(() => {
        if (shared) {
            const id = read();
            setRemembered(VERSIONS.find((v) => v.id === id));
        } else if (versionOf(pathname)) {
            write(own.id);
        }
    }, [pathname, shared, own]);
    return shared ? (remembered ?? LATEST) : own;
}
