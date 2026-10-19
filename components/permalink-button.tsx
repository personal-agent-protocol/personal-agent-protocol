"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Link } from "lucide-react";
import { Button } from "./button";

// Copies the URL of the heading with this id. It shows to the heading's left while the heading is
// hovered.
export function PermalinkButton({ id }: { id: string }) {
    const [copyState, setCopyState] = useState<"ready" | "copied" | "failed">("ready");
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(
        () => () => {
            if (timer.current !== null) {
                clearTimeout(timer.current);
            }
        },
        [],
    );

    async function copy() {
        const url = new URL(window.location.href);
        url.hash = id;
        try {
            await navigator.clipboard.writeText(url.toString());
            setCopyState("copied");
        } catch {
            setCopyState("failed");
        }
        if (timer.current !== null) {
            clearTimeout(timer.current);
        }
        timer.current = setTimeout(() => setCopyState("ready"), 1200);
    }

    const label =
        copyState === "copied"
            ? "Copied link"
            : copyState === "failed"
              ? "Copy failed, try again"
              : "Copy link";
    return (
        <>
            <Button
                variant="ghost"
                size="sm"
                iconOnly
                className="permalink-btn"
                onClick={copy}
                aria-label={label}
                title={label}
            >
                {copyState === "copied" ? <Check size={14} /> : <Link size={14} />}
            </Button>
            <span className="sr-only" role="status">
                {copyState === "copied"
                    ? "Copied link"
                    : copyState === "failed"
                      ? "Copy failed"
                      : ""}
            </span>
        </>
    );
}
