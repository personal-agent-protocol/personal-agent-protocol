"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { Play, X } from "lucide-react";
import { trackEvent } from "../lib/analytics";
import { WistiaVideo } from "./wistia-video";

// Runs a DOM change as a view transition that moves `from` into `to`, so the thumbnail grows into
// the player and back. Only the two elements, and only during the transition, have the shared name;
// with a name, an element animates on its own, above the page and the lightbox's backdrop. Where
// the browser has no view transitions or the reader prefers less motion, the change is immediate.
function morph(name: string, from: HTMLElement | null, to: HTMLElement | null, update: () => void) {
    if (
        !document.startViewTransition ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
        update();
        return;
    }
    if (from) {
        from.style.viewTransitionName = name;
    }
    const transition = document.startViewTransition(() => {
        update();
        if (from) {
            from.style.viewTransitionName = "";
        }
        if (to) {
            to.style.viewTransitionName = name;
        }
    });
    transition.finished.finally(() => {
        if (to) {
            to.style.viewTransitionName = "";
        }
    });
}

// A video's card: its thumbnail, then its heading and description. Clicking the thumbnail opens
// the video in a lightbox, which closes with Escape, the close button, or a click outside the
// video. A link to the video's id, such as /docs/videos#overview, opens the video on load.
export function VideoCard({
    mediaId,
    thumbnail,
    length,
    id,
    title,
    children,
}: {
    mediaId: string;
    thumbnail: string;
    length?: string;
    id: string;
    title: string;
    children?: ReactNode;
}) {
    const [open, setOpen] = useState(false);
    const thumbRef = useRef<HTMLButtonElement>(null);
    const frameRef = useRef<HTMLDivElement>(null);
    const dialogRef = useRef<HTMLDialogElement>(null);
    const name = `video-${mediaId}`;

    function show() {
        morph(name, thumbRef.current, frameRef.current, () => {
            flushSync(() => setOpen(true));
            dialogRef.current?.showModal();
        });
        const from = window.location.pathname === "/" ? "home" : "card";
        trackEvent("video_open", { video: id, from });
    }

    // Closing returns focus to the thumbnail and drops a link's hash, so a reload doesn't reopen
    // the video.
    function hide() {
        morph(name, frameRef.current, thumbRef.current, () => {
            dialogRef.current?.close();
            flushSync(() => setOpen(false));
            thumbRef.current?.focus();
        });
        if (decodeURIComponent(window.location.hash.slice(1)) === id) {
            history.replaceState(null, "", window.location.pathname + window.location.search);
        }
    }

    useEffect(() => {
        if (decodeURIComponent(window.location.hash.slice(1)) === id) {
            flushSync(() => setOpen(true));
            dialogRef.current?.showModal();
            trackEvent("video_open", { video: id, from: "link" });
        }
    }, [id]);

    return (
        <div className="video-card">
            <button
                ref={thumbRef}
                type="button"
                className="video-thumb"
                aria-label={`Play “${title}”`}
                onClick={show}
            >
                <img src={thumbnail} alt="" width={960} height={540} loading="lazy" />
                <span className="video-play" aria-hidden="true">
                    <Play size={17} fill="currentColor" />
                </span>
                {length ? <span className="video-length">{length}</span> : null}
            </button>
            {children}
            <dialog
                ref={dialogRef}
                className="video-lightbox"
                aria-label={title}
                onCancel={(e) => {
                    e.preventDefault();
                    hide();
                }}
                onClose={() => setOpen(false)}
                onClick={(e) => {
                    if (e.target === e.currentTarget) {
                        hide();
                    }
                }}
            >
                <div
                    ref={frameRef}
                    className="video-lightbox-frame"
                    style={{ backgroundImage: `url('${thumbnail}')` }}
                >
                    {open ? <WistiaVideo mediaId={mediaId} autoplay /> : null}
                </div>
                <button
                    type="button"
                    className="video-lightbox-close"
                    aria-label="Close video"
                    onClick={hide}
                >
                    <X size={20} />
                </button>
            </dialog>
        </div>
    );
}
