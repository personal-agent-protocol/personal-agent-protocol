import type { ReactNode } from "react";
import { VideoCard } from "./video-card";

// A grid of videos, each a <Video>.
export function VideoGallery({ children }: { children?: ReactNode }) {
    return <div className="video-gallery">{children}</div>;
}

type OEmbed = { thumbnail_url?: string; duration?: number };

// A Wistia video's thumbnail and length, from Wistia's oEmbed endpoint at build time. If Wistia
// can't be reached, the card uses the video's small swatch image and shows no length.
async function videoDetails(mediaId: string): Promise<{ thumbnail: string; length?: string }> {
    const media = `https://home.wistia.com/medias/${mediaId}`;
    try {
        const response = await fetch(
            `https://fast.wistia.com/oembed?url=${encodeURIComponent(media)}`,
            { cache: "force-cache" },
        );
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const { thumbnail_url, duration } = (await response.json()) as OEmbed;
        if (!thumbnail_url) {
            throw new Error("no thumbnail");
        }
        const seconds = Math.round(duration ?? 0);
        const length = seconds
            ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
            : undefined;
        return { thumbnail: thumbnail_url, length };
    } catch (error) {
        console.warn(`Wistia video ${mediaId}: no oEmbed details (${error})`);
        return { thumbnail: `https://fast.wistia.com/embed/medias/${mediaId}/swatch` };
    }
}

// A Wistia video in a <VideoGallery>: a thumbnail that opens the video, then its heading and
// description, which are the children. In the docs, remarkVideoNames sets `id` and `title` from
// the heading; elsewhere, such as the home page, they're set by hand.
export async function Video({
    mediaId,
    id,
    title,
    children,
}: {
    mediaId: string;
    id: string;
    title: string;
    children?: ReactNode;
}) {
    const { thumbnail, length } = await videoDetails(mediaId);
    return (
        <VideoCard mediaId={mediaId} thumbnail={thumbnail} length={length} id={id} title={title}>
            {children}
        </VideoCard>
    );
}
