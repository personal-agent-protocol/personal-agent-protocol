"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { counterpart, OLDER_VERSIONS, VERSIONS, type DocsVersion } from "../content/docs";
import { sectionIds, type OutlinePage } from "../lib/docs-outline";
import { useDocsVersion } from "./docs-version";

// The docs version: a button showing the current page's version, such as "Draft 0.2" or "Version 0.1", or
// on a page that isn't versioned, the version last opened. It opens a list of the versions that
// aren't archived, and the current one, then a link to the archived versions page. Picking one goes
// to the same page in that version, at the same section when it has one, or to the version's first
// page. `outline` is the outline of every docs page. `inline` opens the list in place, pushing what's
// below it down, as in the outline menu on phones.
export function VersionMenu({
    current,
    outline,
    inline,
}: {
    current: string;
    outline: OutlinePage[];
    inline?: boolean;
}) {
    const version = useDocsVersion(current);
    const [open, setOpen] = useState(false);
    const [hash, setHash] = useState("");
    const ref = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);

    // Close on Escape or a click outside the menu.
    useEffect(() => {
        if (!open) {
            return;
        }
        setHash(decodeURIComponent(window.location.hash.slice(1)));
        function onKey(e: KeyboardEvent) {
            if (e.key === "Escape") {
                setOpen(false);
                buttonRef.current?.focus();
            }
        }
        function onDown(e: MouseEvent) {
            if (!ref.current?.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener("keydown", onKey);
        document.addEventListener("mousedown", onDown);
        return () => {
            document.removeEventListener("keydown", onKey);
            document.removeEventListener("mousedown", onDown);
        };
    }, [open]);

    function hrefIn(id: string): string {
        const target = VERSIONS.find((v) => v.id === id)!;
        const href = counterpart(current, target);
        return hash && sectionIds(outline, href).includes(hash) ? `${href}#${hash}` : href;
    }

    const item = (v: DocsVersion) => (
        <li key={v.id}>
            <a
                href={hrefIn(v.id)}
                aria-current={v === version ? "page" : undefined}
                data-cta={`version_${v.id}`}
            >
                <span className="version-label">
                    {v.label}
                    {v === version ? <Check size={14} aria-hidden="true" /> : null}
                </span>
                <span className="version-note">
                    {v.published ? `Published ${v.published}` : "Latest, in progress"}
                </span>
            </a>
        </li>
    );

    const list = (
        <nav
            className={`version-list${inline ? " version-list-inline" : ""}`}
            id={inline ? "version-list-inline" : "version-list"}
            aria-label="Docs versions"
        >
            <ul>
                {VERSIONS.filter((v) => !OLDER_VERSIONS.includes(v) || v === version).map(item)}
            </ul>
            <a
                className="version-archive-link"
                href="/docs/changelog/archive"
                data-cta="version_archive"
            >
                Archived versions
            </a>
        </nav>
    );
    return (
        <div className="version-menu" ref={ref}>
            <button
                type="button"
                className="version-button"
                ref={buttonRef}
                aria-expanded={open}
                aria-controls={inline ? "version-list-inline" : "version-list"}
                onClick={() => setOpen(!open)}
            >
                <span className="sr-only">Docs version: </span>
                {version.label}
                <ChevronDown size={14} aria-hidden="true" />
            </button>
            {open ? list : null}
        </div>
    );
}
