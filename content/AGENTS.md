# The docs

Read this before changing anything in `content/`. It says where each docs page lives, what you have
to update with it, and how a version is published.

## Where pages live

Each page is one MDX file, in one place:

- `versions/<version>/<slug>.mdx`: the pages that are part of the protocol, the specification,
  extensions, and guides. Each version has its own copy, served at `/docs/<version>/<slug>`, such
  as `versions/0.2/extensions/operations.mdx` at `/docs/0.2/extensions/operations`.
- `shared/<slug>.mdx`: the introduction, which has the roadmap, the changelog, which starts with
  the current status, and `changelog/archive`, which has the changelog of the versions in
  `OLDER_VERSIONS` in `docs.ts`. The version menu leaves those versions out and links to the
  archive. They have one copy, which describes the latest published version, served at `/docs/<slug>`.
- `versions/versions.json`: the versions, newest first. Only the first can be a draft, which lists
  its pages. A published version also has the date it was published and each page's SHA-256.
- `docs.ts`: the tabs and pages in site order, with each page's title, description, and outline
  settings. A tab marked `versioned` has a copy in each version that lists its pages.

A URL without a version, such as `/docs/spec`, redirects to the latest published version, not the
draft. Only the latest published version and the shared pages are indexed.

## Editing pages

Change the draft, the first version in `versions.json`. The kit follows the latest published
version, so the draft doesn't change it. A validator check for a requirement the draft adds or
changes can only be updated when the draft is published. A published version is frozen: the build
fails if its files change. When there's no draft, start one with `pnpm docs:draft <version>`.

Write plain Markdown. On top of it:

- `## Principles {#principles}` gives a heading an id. Headings without one get none, and only
  headings with ids appear in the outline, down to the page's `outlineDepth`. Ids can change
  between versions.
- `## 3. Discovery {#discovery}` numbers a section, and `### 3.1 Fields {#fields}` a subsection. The
  build fails if the numbers don't count up.
- Requirement words such as MUST and SHOULD NOT, in capitals, are styled automatically.
- Tables stack on phones. A row like `| **Parties** | |` starts a group of rows.
- A code block names its language and can have a label:
  ` ```http label="Request: Personal Agent → Company" `.
- Links to other sites open in a new tab.
- Write links between docs pages without a version, such as `/docs/spec#sessions`. The build
  points them at the page's own version, and on a shared page at the latest published version. A link can
  name a version on purpose, such as `/docs/0.1/spec` in the changelog, or `/docs/1.1/spec#x` for a
  section only the draft has. A published version can
  link only to its own pages, the shared pages, and other published versions.

`outlineLabels` in `docs.ts` gives an outline label that differs from its heading.

## The changelog

Every change to the draft that a reader could notice goes in `shared/changelog.mdx`, in the
draft's section, in the same change: requirements, fields, errors, examples, and sections added,
removed, or moved. Only edits that change no meaning, such as typos and rewording, can leave it
out. When reviewing a change to the draft, check that the changelog has it.

The draft's section has three groups, each in spec section order, then extensions: Major changes
(`### Major changes {#v0-2-major}`), Minor changes (`{#v0-2-minor}`), and Guides
(`{#v0-2-guides}`), with the draft's version in the ids. A change is major when it's a design decision
a reasonable implementer could disagree with, such as a new requirement that trades one goal for
another or a new section. It's minor when it fills a gap, makes the text consistent with itself or
its examples, or follows an RFC, even when it breaks implementations. Leave out a group that has no
entries.

Each entry is a `<Change>`:

```mdx
<Change title="DPoP at MCP servers" breaking sections="4.3, 6" issue="6">

An MCP server supports DPoP by listing…

</Change>
```

- `title` is short and can put code in backticks. It becomes the entry's heading and id, such as
  `v0-2-dpop-at-mcp-servers`, so titles in a version are unique.
- `breaking` marks a change that can require an implementation of the last published version to
  change.
- `sections` lists what it changed: spec section numbers such as `4.3`, an extension's name and
  section such as `Operations 3.2`, `Guides`, or a guide heading by id, such as
  `guides#both-key-rotation`. The build fails when the version doesn't have one.
- `issue` is the number of a public issue on
  [personal-agent-protocol](https://github.com/personal-agent-protocol/personal-agent-protocol),
  when there is one, or several separated by commas, such as `issue="89, 83"`. Don't link to pull
  requests or other private repositories.

The text says what changed without repeating the tags. `lib/changelog.ts` turns the attributes into
the heading and tags.

## The version number

The folder name is the version. The spec states it too ("This is draft version 0.2.", "This draft
is `0.2`", and `protocol_version` in its examples), and the build fails when they don't match the
folder. The home page walkthroughs, the kit, and the site read the latest published version from
`versions.json`, never the draft, except
`PROTOCOL_VERSION` in `kit/company/validate/catalog.ts`, which the build checks against the latest
published version and `pnpm docs:publish` changes.

## Publishing

- `pnpm docs:publish [YYYY-MM-DD]` publishes the draft, on today's date by default. It records the
  date and each page's SHA-256 in `versions.json`, which freezes them, removes the draft notice
  from the spec, renames the draft's changelog section, and sets `PROTOCOL_VERSION` in
  `catalog.ts` to it, so the kit follows it. Then write the date in that section's first paragraph. The published version is now the
  latest. There's no draft until you start one.
- `pnpm docs:draft <version>`, such as `pnpm docs:draft 0.3`, starts a draft as a copy of the
  latest published version. It changes the version in the new spec, adds the draft notice after
  it, and adds a section for it to the changelog. The draft notice is the paragraph that tells
  readers not to implement the draft (`draftNotice` in `lib/docs-checks.ts`), and the build fails
  when a draft's spec doesn't have it.

Both run `pnpm docs:sync` and `pnpm kit`. Review and commit what they change.

## Generated files

`pnpm docs:sync` writes the files that follow from `docs.ts` and `versions.json`: each page's `.md`
route under `app/docs/`, and the docs redirects and `noindex` headers in `vercel.json`. Don't edit
those by hand. Run it after adding, removing, or moving a page. When a shared page moves or is
merged into another, add its old slug to `MOVED_PAGES` in `docs.ts`, so its old URL redirects and
links to it, including from frozen versions, still pass the build's link check. The build fails
when they're out of date.

## Checks

After editing, run `npx prettier --write`, `npx tsc --noEmit`, and `pnpm kit`. `pnpm build` checks
`versions.json` against the folders, frozen files, the version number in each spec, section
numbering, links and heading ids, and the generated files (`lib/docs-checks.ts`).
