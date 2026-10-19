import Script from "next/script";

declare module "react" {
    namespace JSX {
        interface IntrinsicElements {
            "wistia-player": React.DetailedHTMLProps<
                React.HTMLAttributes<HTMLElement>,
                HTMLElement
            > & { "media-id": string; aspect?: string; autoplay?: string };
        }
    }
}

// Turns on Wistia's Privacy Mode (https://docs.wistia.com/docs/player-privacy-mode), so the player
// sets no tracking cookies and doesn't tie plays to a visitor. It runs before the player script
// loads, so the player never starts in tracking mode.
const PRIVACY_MODE =
    "window._wq = window._wq || []; window._wq.push(function (W) { W.consent(false); });";

// A Wistia video.
export function WistiaVideo({ mediaId, autoplay }: { mediaId: string; autoplay?: boolean }) {
    return (
        <>
            <Script id="wistia-privacy-mode" strategy="afterInteractive">
                {PRIVACY_MODE}
            </Script>
            <Script src="https://fast.wistia.com/player.js" strategy="afterInteractive" />
            <Script
                src={`https://fast.wistia.com/embed/${mediaId}.js`}
                type="module"
                strategy="afterInteractive"
            />
            <wistia-player
                media-id={mediaId}
                aspect="1.7777777777777777"
                autoplay={autoplay ? "" : undefined}
            />
        </>
    );
}
