# @texaryn/docs

Sources for the [Texaryn documentation site](https://texaryn.github.io/texaryn/),
built with [Astro Starlight](https://starlight.astro.build/). This application is
private to the workspace.

## Preview and check

Run from the repository root:

```bash
pnpm install
pnpm build
pnpm --filter @texaryn/docs dev
```

To build the deployed artifact, including the playground:

```bash
pnpm site:build
pnpm --filter @texaryn/docs preview
```

Open the local server's `/texaryn/` path. The build validates internal links,
playground links, bundle size and the shared theme contract.

## Content and assets

- **Product docs:** `src/content/docs` contains the homepage, setup pages,
  concepts and guides. `src/components/Example.astro` links to executable
  catalog examples and rejects unknown IDs during the build.
- **Roadmap:** edit the root [`ROADMAP.md`](../../ROADMAP.md).
  The docs build generates `src/content/docs/roadmap.md` from that source.
- **API reference:** the site generates it through `starlight-typedoc`.
  The coverage overview lives in `src/api-overview.md`. The separate root
  `docs/api` output is checked by `pnpm docs:check`.
- **Metadata and navigation:** `astro.config.mjs` owns the site description,
  sidebar, social image tags and coding-agent documentation configuration.
  Individual page descriptions live in their frontmatter.
- **Brand assets:** `public/favicon.svg` and `public/apple-touch-icon.png`
  mirror the repository's root `public` assets. Update both copies when the
  brand changes. `public/social-card.png` is a 1200 × 630 export of
  [`assets/social-card.svg`](../../assets/social-card.svg).

## Deployment

[`site.config.mjs`](../../site.config.mjs) owns the site base and playground
mount. The docs own `/texaryn/`; the playground owns `/texaryn/playground/`.
The site also provides the API reference, search index, sitemap, `llms.txt`
and `llms-full.txt`.

The [Pages workflow](https://github.com/texaryn/texaryn/blob/main/.github/workflows/pages.yml)
runs `pnpm site:build` and deploys `apps/docs/dist`. Pull request checks run the
same build without deploying. Starlight validates docs links; the composed
artifact check validates links across the docs and playground boundary.

Maintainer procedures and design records live in [`docs/`](../../docs/README.md).
