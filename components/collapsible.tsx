"use client";

import {
    Children,
    cloneElement,
    isValidElement,
    useEffect,
    useId,
    useRef,
    useState,
    type MouseEvent,
    type ReactElement,
    type ReactNode,
} from "react";
import { ChevronRight } from "lucide-react";

type HeadingProps = { id?: string; children?: ReactNode };

// A heading and the text under it, which shows when the heading is clicked. It starts closed, and
// opens when the URL's #id is the heading or in the text, or the browser's find in page matches
// hidden text.
export function Collapsible({ children }: { children?: ReactNode }) {
    const [heading, ...body] = Children.toArray(children);
    const [open, setOpen] = useState(false);
    const bodyId = useId();
    const bodyRef = useRef<HTMLDivElement>(null);
    // The element the URL's #id names, to scroll to once it shows.
    const scrollTarget = useRef<HTMLElement | null>(null);
    const id = isValidElement<HeadingProps>(heading) ? heading.props.id : undefined;

    useEffect(() => {
        const body = bodyRef.current;
        const openIfTarget = () => {
            const hash = decodeURIComponent(window.location.hash.slice(1));
            const target = hash ? document.getElementById(hash) : null;
            if (target && (hash === id || body?.contains(target))) {
                scrollTarget.current = target;
                setOpen(true);
            }
        };
        const show = () => setOpen(true);
        openIfTarget();
        window.addEventListener("hashchange", openIfTarget);
        body?.addEventListener("beforematch", show);
        return () => {
            window.removeEventListener("hashchange", openIfTarget);
            body?.removeEventListener("beforematch", show);
        };
    }, [id]);

    // Closed text is hidden "until found", so find in page can show it. React writes `hidden` only
    // as a boolean.
    useEffect(() => {
        if (!open) {
            bodyRef.current?.setAttribute("hidden", "until-found");
        } else if (scrollTarget.current) {
            // The target had no place on the page while it was hidden.
            scrollTarget.current.scrollIntoView();
            scrollTarget.current = null;
        }
    }, [open]);

    // A click anywhere on the heading toggles it, except on its other buttons and links, or when it
    // ends a text selection.
    function onHeadingClick(e: MouseEvent) {
        const target = e.target as Element;
        if (target.closest("a, button:not(.collapse-toggle)")) {
            return;
        }
        if (!window.getSelection()?.isCollapsed) {
            return;
        }
        setOpen(!open);
    }

    const toggle = (
        <button
            type="button"
            className="collapse-toggle"
            aria-expanded={open}
            aria-controls={bodyId}
            aria-label={open ? "Hide details" : "Show details"}
        >
            <ChevronRight size={16} />
        </button>
    );
    const head = isValidElement<HeadingProps>(heading)
        ? cloneElement(heading as ReactElement<HeadingProps>, {}, heading.props.children, toggle)
        : heading;

    return (
        <div className={open ? "collapsible open" : "collapsible"}>
            <div className="collapsible-head" onClick={onHeadingClick}>
                {head}
            </div>
            <div id={bodyId} ref={bodyRef} className="collapsible-body" hidden={!open}>
                {body}
            </div>
        </div>
    );
}
