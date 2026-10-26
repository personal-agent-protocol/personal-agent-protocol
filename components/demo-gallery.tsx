import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";

// A list of community demos, each an <Demo>.
export function DemoGallery({ children }: { children?: ReactNode }) {
    return <div className="demo-gallery">{children}</div>;
}

// A community demo in an <DemoGallery>: a screenshot that links to the demo, then its heading
// and description, which are the children, then links to the demo and its source and the Poppy
// version it implements. `label` names the link to the demo, "Try <title>" by default.
// remarkCardNames sets `id` and `title` from the heading.
export function Demo({
    href,
    repo,
    image,
    version,
    label,
    title,
    children,
}: {
    href: string;
    repo?: string;
    image: string;
    version: string;
    label?: string;
    id: string;
    title: string;
    children?: ReactNode;
}) {
    return (
        <div className="demo-card">
            <a
                className="demo-shot"
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                data-cta="demo_shot"
                tabIndex={-1}
                aria-hidden="true"
            >
                <img src={image} alt="" width={1280} height={800} loading="lazy" />
            </a>
            <div className="demo-body">
                {children}
                <p className="demo-meta">
                    <a href={href} target="_blank" rel="noopener noreferrer" data-cta="demo_try">
                        {label ?? `Try ${title}`}
                        <ExternalLink size={13} aria-hidden="true" />
                    </a>
                    {repo ? (
                        <a
                            href={repo}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-cta="demo_source"
                        >
                            Source on GitHub
                            <ExternalLink size={13} aria-hidden="true" />
                        </a>
                    ) : null}
                    <span className={version === "0.2" ? "tag tag-current" : "tag"}>
                        Version {version}
                    </span>
                </p>
            </div>
        </div>
    );
}
