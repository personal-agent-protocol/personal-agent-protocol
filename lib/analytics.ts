import { track } from "@vercel/analytics";

// Custom events for Vercel Web Analytics. The Pro plan allows 2 properties per event, so each event
// has at most 2. Properties are fixed ids and numbers, never text from the page.
type Events = {
    home_section_view: { section: string };
    example_select: { example: string; control: "tab" | "next_example" };
    example_step: { example: string; step: number };
    example_details_open: { example: string; step: number };
    example_sign_in: { example: string; step: number };
    spec_section_click: { section: string; from: string };
    cta_click: { cta: string; location: string };
    video_open: { video: string; from: "card" | "home" | "link" };
};

export function trackEvent<Name extends keyof Events>(name: Name, properties: Events[Name]) {
    try {
        // `track` drops events sent before the analytics script sets up `window.va`, such as the
        // first sections on load. Queue them the same way the script does; it sends the queue
        // once it loads.
        window.va ??= (...params) => (window.vaq ??= []).push(params);
        track(name, properties);
    } catch {
        // Analytics must never break the page.
    }
}
