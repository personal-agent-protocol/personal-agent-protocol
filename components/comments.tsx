"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
    Check,
    ChevronDown,
    ChevronUp,
    CircleAlert,
    FileUp,
    MessageSquare,
    MessageSquarePlus,
    MoreHorizontal,
    Pencil,
    RotateCcw,
    Trash2,
} from "lucide-react";
import { Button } from "./button";
import { captureAnchor, locateAnchors, type Anchor, type Located } from "../lib/comment-anchors";
import { ALL_DOCS_PAGES, LATEST, resolveDocsLink, versionOf } from "../content/docs";
import { allSections, type OutlinePage } from "../lib/docs-outline";
import {
    FeedbackError,
    MAX_FILE_BYTES,
    parseFeedback,
    serializeFeedback,
    type Thread,
} from "../lib/feedback-format";
import { downloadBlob } from "./docs-download";

// Private review comments on any page. Hidden by default: the first Cmd+. (Ctrl+. off a Mac) turns
// them on and shows the switch in the bottom-right corner, which stays from then on. The switch or
// the shortcut turns them on and off, on every page at once. Select text to comment on it. Comments are kept in this
// browser's localStorage only. The menu on the comment count lists the pages with comments, shows
// resolved ones, and clears them all. The "…" menu copies them as Markdown, and exports and imports
// them as a file. It shows even while comments are off. While they're on, dragging a file onto the page shows a box to drop it
// in and import it.
// Nothing on the page moves: when there's room to the right of the text, each comment floats there
// level with the text it's on. Otherwise the selected comment opens in a panel at the bottom of
// the window.

type Draft = { anchor: Anchor; range: Range; body: string };
type Pending = { anchor: Anchor; range: Range; top: number; left: number };

const THREADS_KEY = "pap-comments:v1";
const ENABLED_KEY = "pap-comments:enabled";
// "1" once comments have been turned on, so the switch shows on later visits. "0" when the reader
// has disabled site commenting, until they turn comments on again.
const REVEALED_KEY = "pap-comments:revealed";
// Set once the reader has seen the note that comments are private to them.
const INTRO_KEY = "pap-comments:intro-seen";
// The floating comment column: its gap from the text, its gap from the window edge, and the
// narrowest and widest it can be.
const COLUMN_GAP = 20;
const COLUMN_EDGE = 12;
const COLUMN_MIN = 180;
const COLUMN_MAX = 300;
const DRAFT_ID = "draft";
const PENDING_ID = "pending";
const CARD_GAP = 8;
const ADD_SIZE = 30;
// The toolbar's height and its gap from the bottom of the window on phones.
const BAR_SPACE = 76;

// Kept here rather than in globals.css because the CSS build doesn't parse ::highlight().
const HIGHLIGHT_CSS = `
::highlight(pap-comment) { background-color: rgba(250, 204, 21, 0.26); }
::highlight(pap-comment-active) { background-color: rgba(250, 204, 21, 0.62); }
`;

// localStorage throws where the browser blocks storage, for example in a sandboxed frame. Then
// comments last only until the page reloads, and the toolbar says so.
const memory = new Map<string, string>();
let persistent = true;

function load(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        persistent = false;
        return memory.get(key) ?? null;
    }
}

function store(key: string, value: string | null) {
    try {
        if (value === null) {
            localStorage.removeItem(key);
        } else {
            localStorage.setItem(key, value);
        }
    } catch {
        persistent = false;
        if (value === null) {
            memory.delete(key);
        } else {
            memory.set(key, value);
        }
    }
}

type Result = { ok: boolean; text: string };

const HIDE_TIP = "Hides this bar. Your comments are kept, and turning comments on brings it back.";

function plural(n: number, word: string) {
    return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// Comments saved before versioned pages had the version in their URL, such as on /docs/spec, move
// to the latest version's page, which they were about.
function readThreads(): Thread[] {
    try {
        const parsed = JSON.parse(load(THREADS_KEY) ?? "[]");
        return Array.isArray(parsed)
            ? parsed.map((t: Thread) =>
                  typeof t?.page === "string" ? { ...t, page: resolveDocsLink(t.page) } : t,
              )
            : [];
    } catch {
        return [];
    }
}

// A page's name in the comments list. Pages of earlier drafts say which, such as
// "Specification (0.1)".
function pageTitle(href: string): string {
    if (href === "/") {
        return "Home";
    }
    const title = ALL_DOCS_PAGES.find((p) => p.href === href)?.navTitle ?? href;
    const version = versionOf(href);
    return version && version !== LATEST ? `${title} (${version.id})` : title;
}

function pageRank(href: string): number {
    const at = ALL_DOCS_PAGES.findIndex((p) => p.href === href);
    return href === "/" ? -1 : at < 0 ? ALL_DOCS_PAGES.length : at;
}

// Where a section falls on its page, from the docs outline. Pages without an outline sort by time.
function sectionRank(outline: OutlinePage[], href: string, sectionId: string): number {
    const sections = allSections(outline, href);
    const at = sections.findIndex((s) => s.id === sectionId);
    return at < 0 ? sections.length : at;
}

// The page's main text: the article on docs pages, otherwise everything between the header and
// footer.
function contentRoot(): HTMLElement | null {
    return (
        document.querySelector<HTMLElement>(".docs-layout > article.doc") ??
        document.querySelector<HTMLElement>("body > main")
    );
}

// The right edge of the page's text, in window coordinates. Pages other than the docs span the
// full width but keep their text in centered .wrap containers.
function rightEdge(root: HTMLElement): number {
    const wraps = root.matches("article") ? [] : [...root.querySelectorAll(".wrap")];
    const boxes = (wraps.length ? wraps : [root]).map((el) => el.getBoundingClientRect().right);
    return Math.max(...boxes);
}

type Column = { left: number; width: number };

// Where the comment column fits to the right of the text, in page coordinates, or null when the
// window is too narrow.
function measureColumn(): Column | null {
    const root = contentRoot();
    if (!root) {
        return null;
    }
    const left = rightEdge(root) + COLUMN_GAP;
    const width = Math.min(COLUMN_MAX, document.documentElement.clientWidth - left - COLUMN_EDGE);
    return width >= COLUMN_MIN ? { left: left + window.scrollX, width } : null;
}

// The first line of a range that has any width.
function firstLine(range: Range): DOMRect {
    return [...range.getClientRects()].find((r) => r.width > 0) ?? range.getBoundingClientRect();
}

// The last line of a range that has any width.
function lastLine(range: Range): DOMRect {
    return (
        [...range.getClientRects()].findLast((r) => r.width > 0) ?? range.getBoundingClientRect()
    );
}

// The range a comment points at, or for one whose text is gone, the start of its old section.
function startOf(located: Located | undefined): Range | null {
    if (!located) {
        return null;
    }
    if (located.kind !== "outdated") {
        return located.range;
    }
    if (!located.heading) {
        return null;
    }
    const range = document.createRange();
    range.selectNodeContents(located.heading);
    return range;
}

function topOf(range: Range | null): number | null {
    const rect = range?.getClientRects()[0] ?? range?.getBoundingClientRect();
    return rect ? rect.top : null;
}

// The text position under a point. Safari only has the older caretRangeFromPoint.
function caretAt(x: number, y: number): { node: Node; offset: number } | null {
    if (document.caretPositionFromPoint) {
        const pos = document.caretPositionFromPoint(x, y);
        return pos ? { node: pos.offsetNode, offset: pos.offset } : null;
    }
    const range = document.caretRangeFromPoint?.(x, y);
    return range ? { node: range.startContainer, offset: range.startOffset } : null;
}

function isModifiedEnter(e: React.KeyboardEvent) {
    return e.key === "Enter" && (e.metaKey || e.ctrlKey);
}

// `outline` is the outline of every docs page.
export function Comments({ outline }: { outline: OutlinePage[] }) {
    const page = usePathname().replace(/\/$/, "") || "/";
    const [enabled, setEnabled] = useState(false);
    const [revealed, setRevealed] = useState(false);
    const [all, setAll] = useState<Thread[]>([]);
    const [located, setLocated] = useState<Map<string, Located>>(new Map());
    const [order, setOrder] = useState<string[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
    const [pending, setPending] = useState<Pending | null>(null);
    const [showResolved, setShowResolved] = useState(false);
    const [column, setColumn] = useState<Column | null>(null);
    const [mac, setMac] = useState(true);
    const [copied, setCopied] = useState(false);
    // The result of the last action in the "…" menu, shown at its foot.
    const [note, setNoteState] = useState<Result | null>(null);
    const setNote = useCallback((next: Result | null) => {
        setNoteState(next);
        setCopied(false);
    }, []);
    const fileInput = useRef<HTMLInputElement>(null);
    // Whether a file is being dragged over the page, and over the drop box.
    const [fileDrag, setFileDrag] = useState(false);
    const [overDrop, setOverDrop] = useState(false);
    // The toolbar stays hidden until the saved on/off state has loaded, so it doesn't show "Off"
    // for a moment on every page, and doesn't animate until after that.
    const [loaded, setLoaded] = useState(false);
    const [animate, setAnimate] = useState(false);
    // The popover above the toolbar: the note shown the first time comments are on, the list of
    // pages, the confirmation for clearing them all, or the "…" menu.
    const [popover, setPopover] = useState<"intro" | "pages" | "confirm" | "more" | null>(null);
    const asideRef = useRef<HTMLElement>(null);
    const toolsRef = useRef<HTMLDivElement>(null);
    // Set when a comment box opens, so it gets focus once its card is in place.
    const focusPending = useRef(false);
    // Set when the pages list turns comments on for this page, so the first comment opens once
    // the comments are found on the page.
    const jumpPending = useRef(false);

    const threads = useMemo(() => all.filter((t) => t.page === page), [all, page]);
    const open = threads.filter((t) => !t.resolvedAt);
    const openAll = all.filter((t) => !t.resolvedAt);
    const pagesWithComments = useMemo(() => {
        const counts = new Map<string, number>();
        for (const t of all) {
            if (!t.resolvedAt) {
                counts.set(t.page, (counts.get(t.page) ?? 0) + 1);
            }
        }
        return [...counts]
            .map(([href, count]) => ({ href, count, title: pageTitle(href) }))
            .sort((a, b) => pageRank(a.href) - pageRank(b.href));
    }, [all]);
    const visible = useMemo(() => {
        const byId = new Map(threads.map((t) => [t.id, t]));
        return order
            .map((id) => byId.get(id))
            .filter((t): t is Thread => !!t && (showResolved || !t.resolvedAt));
    }, [threads, order, showResolved]);

    const save = useCallback((next: Thread[]) => {
        setAll(next);
        store(THREADS_KEY, JSON.stringify(next));
    }, []);

    const turnOn = useCallback((on: boolean) => {
        setEnabled(on);
        setPending(null);
        setDraft(null);
        setActiveId(null);
        store(ENABLED_KEY, on ? "1" : null);
        if (on) {
            setRevealed(true);
            store(REVEALED_KEY, "1");
        }
    }, []);

    const startDraft = useCallback((from: { anchor: Anchor; range: Range }) => {
        setDraft({ anchor: from.anchor, range: from.range, body: "" });
        setActiveId(DRAFT_ID);
        focusPending.current = true;
        setPending(null);
        setEditing(null);
        window.getSelection()?.removeAllRanges();
    }, []);

    // Stay on from a previous visit. Readers who already have comments keep the switch.
    useEffect(() => {
        const on = load(ENABLED_KEY) === "1";
        setEnabled(on);
        const revealedSetting = load(REVEALED_KEY);
        setRevealed(
            on || revealedSetting === "1" || (revealedSetting !== "0" && readThreads().length > 0),
        );
        setLoaded(true);
        setMac(/Mac|iPhone|iPad/.test(navigator.platform));
        const frame = requestAnimationFrame(() => requestAnimationFrame(() => setAnimate(true)));
        return () => cancelAnimationFrame(frame);
    }, []);

    // Hides the bar on every page until comments are turned on again. Comments are kept.
    function hideBar() {
        turnOn(false);
        setRevealed(false);
        store(REVEALED_KEY, "0");
        setPopover(null);
    }

    // Start fresh on each page.
    useEffect(() => {
        setDraft(null);
        setEditing(null);
        setActiveId(null);
        setPending(null);
        setPopover(null);
    }, [page]);

    // The first time comments are on, explain that they're private and how to share them. It counts
    // as seen once closed, so leaving the page before reading it shows it again on the next. It
    // doesn't replace the menu, for example when importing turned comments on.
    useEffect(() => {
        if (enabled && load(INTRO_KEY) !== "1") {
            setPopover((cur) => cur ?? "intro");
        }
        if (!enabled) {
            setPopover((cur) => (cur === "intro" ? null : cur));
        }
    }, [enabled]);
    const introShown = useRef(false);
    useEffect(() => {
        if (popover === "intro") {
            introShown.current = true;
        } else if (introShown.current) {
            introShown.current = false;
            store(INTRO_KEY, "1");
        }
    }, [popover]);

    // Keyboard: Cmd+. (Ctrl+. off a Mac) toggles comments. With comments on and text selected, C
    // or Mod+Alt+M (the Google Docs shortcut) comments on the selection. Escape closes the open
    // comment.
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key === ".") {
                e.preventDefault();
                turnOn(!enabled);
                return;
            }
            if (!enabled) {
                return;
            }
            const plainC =
                e.key.toLowerCase() === "c" &&
                !e.altKey &&
                !e.metaKey &&
                !e.ctrlKey &&
                !(e.target as Element).closest?.("input, textarea, select, [contenteditable]");
            const googleDocs = e.altKey && (e.metaKey || e.ctrlKey) && e.code === "KeyM";
            if (pending && (plainC || googleDocs)) {
                // Prevent the key so the "c" isn't typed into the new comment box.
                e.preventDefault();
                startDraft(pending);
                return;
            }
            if (e.key === "Escape") {
                setPopover(null);
                setDraft(null);
                setEditing(null);
                setActiveId(null);
            }
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [enabled, pending, startDraft, turnOn]);

    // Load comments, and pick up changes made in other tabs. The toolbar counts them even while
    // they're off.
    useEffect(() => {
        setAll(readThreads());
        function onStorage(e: StorageEvent) {
            if (e.key === THREADS_KEY) {
                setAll(readThreads());
            }
        }
        window.addEventListener("storage", onStorage);
        return () => window.removeEventListener("storage", onStorage);
    }, []);

    // Find each comment's text on the page, and sort comments in page order.
    useEffect(() => {
        const root = contentRoot();
        if (!enabled || !root) {
            return;
        }
        const results = locateAnchors(
            root,
            threads.map((t) => t.anchor),
        );
        const map = new Map(threads.map((t, i) => [t.id, results[i]]));
        const starts = new Map(threads.map((t) => [t.id, startOf(map.get(t.id))]));
        const sorted = threads
            .map((t) => t.id)
            .sort((a, b) => {
                const ra = starts.get(a);
                const rb = starts.get(b);
                if (!ra || !rb) {
                    return ra ? -1 : rb ? 1 : 0;
                }
                return ra.compareBoundaryPoints(Range.START_TO_START, rb);
            });
        setLocated(map);
        setOrder(sorted);
    }, [enabled, threads]);

    // Paint highlights with the CSS Custom Highlight API, which doesn't change the page's DOM.
    useEffect(() => {
        if (!enabled || typeof CSS === "undefined" || !("highlights" in CSS)) {
            return;
        }
        const plain: Range[] = [];
        const active: Range[] = [];
        for (const t of threads) {
            const loc = located.get(t.id);
            if (t.resolvedAt || !loc || loc.kind === "outdated") {
                continue;
            }
            (t.id === activeId ? active : plain).push(loc.range);
        }
        if (draft) {
            active.push(draft.range);
        }
        CSS.highlights.set("pap-comment", new Highlight(...plain));
        CSS.highlights.set("pap-comment-active", new Highlight(...active));
        return () => {
            CSS.highlights.delete("pap-comment");
            CSS.highlights.delete("pap-comment-active");
        };
    }, [enabled, threads, located, activeId, draft]);

    // Offer a Comment button when the reader selects text in the article.
    useEffect(() => {
        if (!enabled) {
            return;
        }
        function check() {
            const root = contentRoot();
            const selection = window.getSelection();
            if (!root || !selection || selection.isCollapsed || selection.rangeCount === 0) {
                setPending(null);
                return;
            }
            const range = selection.getRangeAt(0);
            if (!root.contains(range.commonAncestorContainer)) {
                setPending(null);
                return;
            }
            const captured = captureAnchor(root, range);
            if (!captured) {
                setPending(null);
                return;
            }
            // Level with the middle of the selection's first line: in the comment column when
            // there is one, otherwise just right of the text. On phones, centered below the
            // selection, since the phone's own copy and paste menu shows above it, and between the
            // selection handles, which hang below its ends. Above it when below would be under the
            // toolbar.
            const line = firstLine(range);
            const last = lastLine(range);
            const width = document.documentElement.clientWidth;
            const middle = line.top + line.height / 2 + window.scrollY - ADD_SIZE / 2;
            const room = measureColumn();
            const textRight = rightEdge(root);
            const free = width - textRight;
            setPending({
                ...captured,
                ...(room
                    ? { top: middle, left: room.left }
                    : free >= ADD_SIZE + 12
                      ? { top: middle, left: textRight + 6 + window.scrollX }
                      : {
                            top:
                                last.bottom + 14 + ADD_SIZE < window.innerHeight - BAR_SPACE
                                    ? last.bottom + window.scrollY + 14
                                    : line.top + window.scrollY - ADD_SIZE - 8,
                            left:
                                Math.min(
                                    Math.max(last.left + last.width / 2 - ADD_SIZE / 2, 12),
                                    width - ADD_SIZE - 12,
                                ) + window.scrollX,
                        }),
            });
        }
        // Touch screens select text without mouse or key events, so also check once the
        // selection settles. While the mouse is down, wait for mouseup instead.
        let mouseDown = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        function onDown() {
            mouseDown = true;
        }
        function onUp() {
            mouseDown = false;
            clearTimeout(timer);
            timer = setTimeout(check, 0);
        }
        function onSelectionChange() {
            clearTimeout(timer);
            if (window.getSelection()?.isCollapsed) {
                setPending(null);
            } else if (!mouseDown) {
                timer = setTimeout(check, 300);
            }
        }
        document.addEventListener("mousedown", onDown);
        document.addEventListener("mouseup", onUp);
        document.addEventListener("keyup", onUp);
        document.addEventListener("selectionchange", onSelectionChange);
        return () => {
            clearTimeout(timer);
            document.removeEventListener("mousedown", onDown);
            document.removeEventListener("mouseup", onUp);
            document.removeEventListener("keyup", onUp);
            document.removeEventListener("selectionchange", onSelectionChange);
        };
    }, [enabled]);

    useEffect(() => {
        if (popover !== "more") {
            setNote(null);
        }
    }, [popover, setNote]);

    // While comments are on, dragging a file onto the page shows the drop box. A file dropped
    // anywhere else is ignored rather than opened in place of the page.
    useEffect(() => {
        if (!enabled) {
            return;
        }
        let depth = 0;
        const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files");
        function onEnter(e: DragEvent) {
            if (hasFiles(e)) {
                depth++;
                setFileDrag(true);
            }
        }
        function onLeave(e: DragEvent) {
            if (hasFiles(e)) {
                depth = Math.max(0, depth - 1);
                if (!depth) {
                    setFileDrag(false);
                }
            }
        }
        function onOver(e: DragEvent) {
            if (hasFiles(e)) {
                e.preventDefault();
            }
        }
        function onDrop(e: DragEvent) {
            if (hasFiles(e)) {
                e.preventDefault();
                depth = 0;
                setFileDrag(false);
                setOverDrop(false);
            }
        }
        window.addEventListener("dragenter", onEnter);
        window.addEventListener("dragleave", onLeave);
        window.addEventListener("dragover", onOver);
        window.addEventListener("drop", onDrop);
        return () => {
            window.removeEventListener("dragenter", onEnter);
            window.removeEventListener("dragleave", onLeave);
            window.removeEventListener("dragover", onOver);
            window.removeEventListener("drop", onDrop);
            setFileDrag(false);
        };
    }, [enabled]);

    // Clicking anywhere outside the toolbar closes its popover.
    useEffect(() => {
        if (!popover) {
            return;
        }
        function onDown(e: MouseEvent) {
            if (!(e.target as Element).closest?.(".cm-pop, .cm-bar")) {
                setPopover(null);
            }
        }
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
    }, [popover]);

    // Clicking highlighted text opens its comment. Clicking elsewhere in the article closes it.
    useEffect(() => {
        if (!enabled) {
            return;
        }
        function onClick(e: MouseEvent) {
            const root = contentRoot();
            const target = e.target as Node;
            if (!root?.contains(target) || !window.getSelection()?.isCollapsed) {
                return;
            }
            const caret = caretAt(e.clientX, e.clientY);
            const hit =
                caret &&
                visible.find((t) => {
                    const loc = located.get(t.id);
                    return (
                        !t.resolvedAt &&
                        loc &&
                        loc.kind !== "outdated" &&
                        loc.range.isPointInRange(caret.node, caret.offset)
                    );
                });
            if (hit) {
                setActiveId(hit.id);
            } else if (activeId !== DRAFT_ID) {
                setActiveId(null);
            }
        }
        document.addEventListener("click", onClick);
        return () => document.removeEventListener("click", onClick);
    }, [enabled, visible, located, activeId]);

    // When there's a column, line each card up with its text. The open card sits exactly level with its
    // text, and the others move up or down to make room.
    const layout = useCallback(() => {
        const aside = asideRef.current;
        if (!aside) {
            return;
        }
        const cards = [...aside.querySelectorAll<HTMLElement>("[data-card]")];
        if (!column) {
            cards.forEach((card) => (card.style.transform = ""));
            return;
        }
        const base = aside.getBoundingClientRect().top;
        const items: { card: HTMLElement | null; id: string; target: number; height: number }[] =
            cards.map((card) => {
                const id = card.dataset.card!;
                const range = id === DRAFT_ID ? (draft?.range ?? null) : startOf(located.get(id));
                const target = (topOf(range) ?? base) - base;
                return { card, id, target, height: card.offsetHeight };
            });
        // The Comment button for a selection takes a slot in the column too, so cards move out of
        // its way instead of sitting under it.
        if (pending && !draft) {
            const target = pending.top - (base + window.scrollY);
            items.push({ card: null, id: PENDING_ID, target, height: ADD_SIZE });
        }
        items.sort((a, b) => a.target - b.target);
        const tops = items.map((item) => item.target);
        const pivotId = pending && !draft ? PENDING_ID : activeId;
        const pivot = Math.max(
            0,
            items.findIndex((item) => item.id === pivotId),
        );
        for (let i = pivot + 1; i < items.length; i++) {
            tops[i] = Math.max(items[i].target, tops[i - 1] + items[i - 1].height + CARD_GAP);
        }
        for (let i = pivot - 1; i >= 0; i--) {
            tops[i] = Math.min(items[i].target, tops[i + 1] - items[i].height - CARD_GAP);
        }
        for (const [i, { card }] of items.entries()) {
            if (!card) {
                continue;
            }
            // A new card appears in place instead of sliding down from the top of the page.
            const placed = !!card.style.transform;
            card.style.transition = placed ? "" : "none";
            card.style.transform = `translateY(${tops[i]}px)`;
            if (!placed) {
                void card.offsetHeight;
                card.style.transition = "";
            }
        }
    }, [activeId, column, draft, located, pending]);

    // The tools slide by animating their width, which CSS can't do to or from auto, so set it to
    // the buttons' width when on.
    useLayoutEffect(() => {
        const tools = toolsRef.current;
        const inner = tools?.firstElementChild as HTMLElement | null;
        if (tools && inner) {
            tools.style.width = enabled ? `${inner.offsetWidth}px` : "0px";
        }
    });

    // The tools clip while sliding, then stop once open so their tooltips can reach past them.
    useEffect(() => {
        const tools = toolsRef.current;
        if (!tools) {
            return;
        }
        tools.toggleAttribute("data-settled", false);
        if (!enabled) {
            return;
        }
        const timer = setTimeout(
            () => tools.toggleAttribute("data-settled", true),
            animate ? 260 : 0,
        );
        return () => clearTimeout(timer);
    }, [enabled, animate]);

    // Focusing a box before its card is in place would scroll the window to the top of the page,
    // where new cards start, so focus after placing cards and without scrolling.
    useLayoutEffect(() => {
        layout();
        if (focusPending.current) {
            focusPending.current = false;
            asideRef.current
                ?.querySelector<HTMLTextAreaElement>(".cm-active textarea")
                ?.focus({ preventScroll: true });
        }
    });

    // Measure the column when the window or the text changes size, then line the cards up again.
    useEffect(() => {
        const root = contentRoot();
        if (!enabled || !root) {
            return;
        }
        const update = () => {
            setColumn((cur) => {
                const next = measureColumn();
                return cur?.left === next?.left && cur?.width === next?.width ? cur : next;
            });
            layout();
        };
        update();
        const observer = new ResizeObserver(update);
        observer.observe(root);
        window.addEventListener("resize", update);
        document.fonts?.ready.then(update);
        return () => {
            observer.disconnect();
            window.removeEventListener("resize", update);
        };
    }, [enabled, layout, page]);

    function step(direction: 1 | -1) {
        if (!visible.length) {
            return;
        }
        const at = visible.findIndex((t) => t.id === activeId);
        const next =
            visible[
                at < 0
                    ? direction > 0
                        ? 0
                        : visible.length - 1
                    : (at + direction + visible.length) % visible.length
            ];
        setActiveId(next.id);
        const top = topOf(startOf(located.get(next.id)));
        if (top !== null) {
            window.scrollTo({ top: top + window.scrollY - window.innerHeight / 3 });
        }
    }

    // Open the first comment once turning comments on from the pages list has found them.
    useEffect(() => {
        if (jumpPending.current && enabled && threads.length && order.length === threads.length) {
            jumpPending.current = false;
            step(1);
        }
    });

    function submitDraft() {
        if (!draft || !draft.body.trim()) {
            return;
        }
        const thread: Thread = {
            id: crypto.randomUUID(),
            page,
            anchor: draft.anchor,
            body: draft.body.trim(),
            createdAt: new Date().toISOString(),
        };
        save([...readThreads(), thread]);
        setDraft(null);
        setActiveId(thread.id);
    }

    function update(id: string, change: (t: Thread) => Thread | null) {
        save(
            readThreads().flatMap((t) => {
                if (t.id !== id) {
                    return [t];
                }
                const next = change(t);
                return next ? [next] : [];
            }),
        );
    }

    // The open comments from every page as Markdown, in site order. Comments on this page follow
    // the page; on other pages they follow the outline, then the time they were left.
    function commentsMarkdown(): string {
        const key = (t: Thread) =>
            t.page === page
                ? [pageRank(t.page), order.indexOf(t.id), 0]
                : [
                      pageRank(t.page),
                      sectionRank(outline, t.page, t.anchor.sectionId),
                      Date.parse(t.createdAt),
                  ];
        const sorted = [...openAll].sort((a, b) => {
            const ka = key(a);
            const kb = key(b);
            return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2];
        });
        const lines = ["# Comments", ""];
        let current: string | null = null;
        let section: string | null = null;
        for (const t of sorted) {
            if (t.page !== current) {
                current = t.page;
                section = null;
                lines.push(`## ${pageTitle(t.page)} (${t.page})`, "");
            }
            if (t.anchor.sectionLabel && t.anchor.sectionLabel !== section) {
                section = t.anchor.sectionLabel;
                lines.push(`### ${section}`, "");
            }
            const quote = t.anchor.quote.replace(/\s+/g, " ").trim();
            const note =
                t.page === page && located.get(t.id)?.kind === "outdated"
                    ? " (text since changed)"
                    : "";
            lines.push(`> ${quote}${note}`, "", t.body, "");
        }
        return lines.join("\n");
    }

    async function copyMarkdown() {
        try {
            await navigator.clipboard.writeText(commentsMarkdown());
            setNoteState(null);
            setCopied(true);
        } catch {
            setNote({ ok: false, text: "This browser didn't allow copying." });
        }
    }

    // Downloads every comment, resolved ones too, as a comment file. They import as resolved, so
    // they stay hidden unless the reader shows them.
    function exportFile() {
        const text = serializeFeedback(all);
        const now = new Date();
        const date = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
            .map((n) => String(n).padStart(2, "0"))
            .join("-");
        const fileName = `pap-comments-${date}.json`;
        downloadBlob(new Blob([text], { type: "application/json" }), fileName);
        setNote({ ok: true, text: `Saved ${fileName}. Others can import it from this menu.` });
    }

    // Imports a file, then shows the result in the "…" menu.
    async function importAndShow(file: File | undefined) {
        if (file) {
            setNote(await importFile(file));
            setPopover("more");
        }
    }

    // Adds a comment file's comments, skipping ones already here: the same id, or the same page,
    // quote, and text.
    async function importFile(file: File): Promise<Result> {
        try {
            if (file.size > MAX_FILE_BYTES) {
                throw new FeedbackError("This file is larger than 1 MB.");
            }
            const parsed = parseFeedback(await file.text(), outline);
            const current = readThreads();
            const key = (t: Thread) => `${t.page}\n${t.anchor.quote}\n${t.body}`;
            const ids = new Set(current.map((t) => t.id));
            const keys = new Set(current.map(key));
            const fresh = parsed.threads.filter((t) => {
                if (ids.has(t.id) || keys.has(key(t))) {
                    return false;
                }
                ids.add(t.id);
                keys.add(key(t));
                return true;
            });
            if (fresh.length) {
                save([...current, ...fresh]);
                if (!enabled) {
                    turnOn(true);
                }
            }
            const duplicates = parsed.threads.length - fresh.length;
            return {
                ok: true,
                text: [
                    `Added ${plural(fresh.length, "comment")}.`,
                    duplicates ? `Skipped ${duplicates} already here.` : "",
                    parsed.skipped
                        ? `Left out ${parsed.skipped} with a missing field or an unknown page.`
                        : "",
                ]
                    .filter(Boolean)
                    .join(" "),
            };
        } catch (err) {
            return {
                ok: false,
                text: err instanceof FeedbackError ? err.message : "This file couldn't be read.",
            };
        }
    }

    const shortcut = mac ? "⌘." : "Ctrl+.";
    const submitKey = mac ? "⌘↵" : "Ctrl+Enter";

    function renderCard(t: Thread) {
        const loc = located.get(t.id);
        const isActive = t.id === activeId;
        const isEditing = editing?.id === t.id;
        const classes = [
            "cm-card",
            isActive && "cm-active",
            t.resolvedAt && "cm-resolved",
            loc?.kind === "outdated" && "cm-outdated",
        ];
        return (
            <div
                key={t.id}
                data-card={t.id}
                className={classes.filter(Boolean).join(" ")}
                onClick={() => setActiveId(t.id)}
            >
                {t.anchor.sectionLabel ? (
                    <div className="cm-head">
                        <span className="cm-section">{t.anchor.sectionLabel}</span>
                    </div>
                ) : null}
                {loc?.kind === "changed" ? (
                    <p className="cm-note">The text changed since this comment.</p>
                ) : null}
                {loc?.kind === "outdated" ? (
                    <p className="cm-note">This text is no longer on the page.</p>
                ) : null}
                <blockquote className="cm-quote">{t.anchor.quote}</blockquote>
                {isEditing ? (
                    <div className="cm-form" onClick={(e) => e.stopPropagation()}>
                        <textarea
                            rows={3}
                            value={editing.body}
                            aria-label="Edit comment"
                            onChange={(e) => setEditing({ id: t.id, body: e.target.value })}
                            onKeyDown={(e) => {
                                if (isModifiedEnter(e) && editing.body.trim()) {
                                    update(t.id, (cur) => ({
                                        ...cur,
                                        body: editing.body.trim(),
                                        editedAt: new Date().toISOString(),
                                    }));
                                    setEditing(null);
                                }
                            }}
                        />
                        <div className="cm-buttons">
                            <button type="button" onClick={() => setEditing(null)}>
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="cm-primary"
                                disabled={!editing.body.trim()}
                                onClick={() => {
                                    update(t.id, (cur) => ({
                                        ...cur,
                                        body: editing.body.trim(),
                                        editedAt: new Date().toISOString(),
                                    }));
                                    setEditing(null);
                                }}
                            >
                                Save
                            </button>
                        </div>
                    </div>
                ) : (
                    <p className="cm-body">{t.body}</p>
                )}
                {isActive && !isEditing ? (
                    <div className="cm-actions">
                        <button
                            type="button"
                            data-tip={t.resolvedAt ? "Reopen" : "Resolve"}
                            aria-label={t.resolvedAt ? "Reopen" : "Resolve"}
                            onClick={(e) => {
                                e.stopPropagation();
                                update(t.id, (cur) => ({
                                    ...cur,
                                    resolvedAt: cur.resolvedAt
                                        ? undefined
                                        : new Date().toISOString(),
                                }));
                                setActiveId(null);
                            }}
                        >
                            {t.resolvedAt ? <RotateCcw size={14} /> : <Check size={14} />}
                        </button>
                        <button
                            type="button"
                            data-tip="Edit"
                            aria-label="Edit"
                            onClick={(e) => {
                                e.stopPropagation();
                                setActiveId(t.id);
                                setEditing({ id: t.id, body: t.body });
                                focusPending.current = true;
                            }}
                        >
                            <Pencil size={14} />
                        </button>
                        <button
                            type="button"
                            data-tip="Delete"
                            aria-label="Delete"
                            onClick={(e) => {
                                e.stopPropagation();
                                update(t.id, () => null);
                                setActiveId(null);
                            }}
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                ) : null}
            </div>
        );
    }

    const draftCard = draft ? (
        <div key={DRAFT_ID} data-card={DRAFT_ID} className="cm-card cm-active cm-draft">
            {draft.anchor.sectionLabel ? (
                <div className="cm-head">
                    <span className="cm-section">{draft.anchor.sectionLabel}</span>
                </div>
            ) : null}
            <blockquote className="cm-quote">{draft.anchor.quote}</blockquote>
            <div className="cm-form">
                <textarea
                    rows={3}
                    placeholder="Add a comment"
                    aria-label="Comment"
                    value={draft.body}
                    onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                    onKeyDown={(e) => {
                        if (isModifiedEnter(e)) {
                            submitDraft();
                        }
                    }}
                />
                <div className="cm-buttons">
                    <button
                        type="button"
                        onClick={() => {
                            setDraft(null);
                            setActiveId(null);
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="cm-primary"
                        disabled={!draft.body.trim()}
                        onClick={submitDraft}
                        data-tip={`Comment (${submitKey})`}
                    >
                        Comment
                    </button>
                </div>
            </div>
        </div>
    ) : null;

    // Without a column, only the open card shows, in a panel at the bottom of the window.
    const cards = column
        ? [...visible.map(renderCard), draftCard]
        : draft
          ? [draftCard]
          : visible.filter((t) => t.id === activeId).map(renderCard);

    const countLabel = `${openAll.length} comment${openAll.length === 1 ? "" : "s"}${
        pagesWithComments.length > 1 ? ` on ${pagesWithComments.length} pages` : ""
    }`;

    return (
        <>
            {enabled ? (
                <>
                    <style>{HIGHLIGHT_CSS}</style>
                    <aside
                        className={`comments-margin${column ? "" : " cm-sheet"}`}
                        style={column ? { left: column.left, width: column.width } : undefined}
                        ref={asideRef}
                        aria-label="Comments"
                        hidden={!column && cards.length === 0}
                    >
                        {cards}
                    </aside>
                </>
            ) : null}
            {enabled && pending && !draft ? (
                <button
                    type="button"
                    className="cm-add"
                    style={{ top: pending.top, left: pending.left }}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => startDraft(pending)}
                    data-tip="Comment (C)"
                    aria-label="Comment"
                >
                    <MessageSquarePlus size={16} />
                </button>
            ) : null}
            {popover === "pages" ? (
                <div className="cm-pop cm-pages" aria-label="Pages with comments">
                    {pagesWithComments.length ? (
                        <>
                            <div className="cm-pages-head">Pages with comments</div>
                            {pagesWithComments.map((p) => (
                                <a
                                    key={p.href}
                                    href={p.href}
                                    className={p.href === page ? "cm-current" : undefined}
                                    aria-current={p.href === page ? "page" : undefined}
                                    onClick={(e) => {
                                        if (!enabled) {
                                            turnOn(true);
                                        }
                                        if (p.href === page) {
                                            e.preventDefault();
                                            setPopover(null);
                                            if (enabled) {
                                                step(1);
                                            } else {
                                                jumpPending.current = true;
                                            }
                                        }
                                    }}
                                >
                                    <span>{p.title}</span>
                                    <span className="cm-pages-count">{p.count}</span>
                                </a>
                            ))}
                        </>
                    ) : (
                        <p className="cm-pages-empty">
                            <strong>No comments yet.</strong>
                            <br />
                            Turn comments on, then select text to comment on it.
                        </p>
                    )}
                    <div className="cm-pages-foot">
                        <button
                            type="button"
                            aria-pressed={showResolved}
                            onClick={() => {
                                if (!enabled) {
                                    turnOn(true);
                                }
                                setShowResolved(!showResolved);
                            }}
                        >
                            Show resolved on this page
                            {showResolved ? (
                                <Check
                                    className="cm-check"
                                    size={14}
                                    strokeWidth={2}
                                    aria-hidden="true"
                                />
                            ) : null}
                        </button>
                    </div>
                    <div className="cm-pages-foot">
                        <button
                            type="button"
                            className="cm-danger"
                            disabled={all.length === 0}
                            onClick={() => setPopover("confirm")}
                        >
                            Clear all comments
                        </button>
                    </div>
                </div>
            ) : null}
            {popover === "confirm" ? (
                <div
                    className="cm-pop cm-confirm"
                    role="alertdialog"
                    aria-label="Clear all comments"
                >
                    <p className="cm-confirm-title">Clear all comments?</p>
                    <p>
                        This deletes all {plural(all.length, "comment")} on every page, including
                        resolved ones. You can't undo this.
                    </p>
                    <div className="cm-buttons">
                        <button type="button" onClick={() => setPopover(null)}>
                            Cancel
                        </button>
                        <button
                            type="button"
                            className="cm-primary cm-danger"
                            onClick={() => {
                                save([]);
                                setActiveId(null);
                                setEditing(null);
                                setPopover(null);
                            }}
                        >
                            Clear all
                        </button>
                    </div>
                </div>
            ) : null}
            {popover === "more" ? (
                <div className="cm-pop cm-pages" aria-label="Share comments">
                    <div className="cm-pages-foot cm-more">
                        <button type="button" disabled={!openAll.length} onClick={copyMarkdown}>
                            {copied ? "Copied" : "Copy as Markdown"}
                            {copied ? (
                                <Check
                                    className="cm-check"
                                    size={14}
                                    strokeWidth={2}
                                    aria-hidden="true"
                                />
                            ) : null}
                        </button>
                        <button type="button" disabled={!all.length} onClick={exportFile}>
                            Export comments
                        </button>
                        <button type="button" onClick={() => fileInput.current?.click()}>
                            Import comments…
                        </button>
                    </div>
                    <div className="cm-pages-foot">
                        <button
                            type="button"
                            className="cm-tip-wide"
                            data-tip={HIDE_TIP}
                            aria-description={HIDE_TIP}
                            onClick={hideBar}
                        >
                            Disable site commenting
                        </button>
                    </div>
                    {note ? (
                        <p className={`cm-pop-note${note.ok ? "" : " cm-pop-error"}`} role="status">
                            {note.text}
                        </p>
                    ) : null}
                </div>
            ) : null}
            <input
                ref={fileInput}
                type="file"
                accept=".json,application/json"
                hidden
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    importAndShow(file);
                }}
            />
            {fileDrag ? (
                <div
                    className={`cm-drop${overDrop ? " cm-drop-active" : ""}`}
                    onDragEnter={() => setOverDrop(true)}
                    onDragLeave={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                            setOverDrop(false);
                        }
                    }}
                    onDrop={(e) => importAndShow(e.dataTransfer.files[0])}
                >
                    <FileUp size={18} aria-hidden="true" />
                    Drop a comment file to import it
                </div>
            ) : null}
            {popover === "intro" ? (
                <div className="cm-pop cm-confirm" role="dialog" aria-label="About comments">
                    <p className="cm-confirm-title">Your comments are private</p>
                    <p>
                        They're saved in this browser only, and nobody else can see them. To share
                        them, use the … button in this bar to copy them as Markdown or export them
                        to a file.
                    </p>
                    <div className="cm-buttons">
                        <button
                            type="button"
                            className="cm-primary"
                            onClick={() => setPopover(null)}
                        >
                            Got it
                        </button>
                    </div>
                </div>
            ) : null}
            {/* The switch stays in the corner. Turning comments on adds their tools to its left. */}
            <div
                className={`cm-bar${animate ? " cm-animate" : ""}`}
                hidden={!loaded || !revealed}
                role="group"
                aria-label="Comments"
            >
                {/* Stays rendered while off so the tools can slide away. */}
                <div className="cm-tools" ref={toolsRef} data-open={enabled} inert={!enabled}>
                    <div className="cm-tools-inner">
                        {!persistent ? (
                            <span className="cm-warn" data-tip="This browser isn't saving comments">
                                <CircleAlert size={15} aria-label="Comments aren't being saved" />
                            </span>
                        ) : null}
                        {open.length ? (
                            <>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    iconOnly
                                    data-tip="Previous comment"
                                    aria-label="Previous comment"
                                    onClick={() => step(-1)}
                                >
                                    <ChevronUp size={15} strokeWidth={1.75} />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    iconOnly
                                    data-tip="Next comment"
                                    aria-label="Next comment"
                                    onClick={() => step(1)}
                                >
                                    <ChevronDown size={15} strokeWidth={1.75} />
                                </Button>
                            </>
                        ) : null}
                        {!persistent || open.length ? (
                            <span className="cm-sep" aria-hidden="true" />
                        ) : null}
                    </div>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    iconOnly
                    data-tip="Copy, export, import"
                    aria-label="Copy, export, or import comments"
                    aria-expanded={popover === "more"}
                    onClick={() => setPopover(popover === "more" ? null : "more")}
                >
                    <MoreHorizontal size={15} strokeWidth={1.75} />
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    className="cm-count"
                    aria-expanded={popover === "pages" || popover === "confirm"}
                    aria-label={`${countLabel}. Show pages with comments.`}
                    data-tip={countLabel}
                    onClick={() => setPopover(popover === "pages" ? null : "pages")}
                >
                    <MessageSquare size={14} strokeWidth={1.75} aria-hidden="true" />
                    {openAll.length}
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    className="cm-switch"
                    aria-pressed={enabled}
                    data-tip={`${enabled ? "Turn comments off" : "Turn comments on"} (${shortcut})`}
                    data-tip-end
                    onClick={() => turnOn(!enabled)}
                >
                    Comments
                    <span className="cm-chip" aria-hidden="true">
                        <span className="cm-chip-on">On</span>
                        <span className="cm-chip-off">Off</span>
                    </span>
                </Button>
            </div>
        </>
    );
}
