import { docsHref, VERSIONS } from "../content/docs";
import { ButtonLink } from "./button";

// A button to a version's spec, at the right end of the heading it's in.
export function ViewVersion({ id }: { id: string }) {
    const version = VERSIONS.find((v) => v.id === id);
    const href = version && docsHref("spec", version);
    if (!href) {
        throw new Error(`<ViewVersion> names version ${id}, which doesn't exist`);
    }
    return (
        <ButtonLink
            variant="secondary"
            size="sm"
            className="heading-action"
            href={href}
            data-cta={`archive_view_${id}`}
        >
            View spec
        </ButtonLink>
    );
}
