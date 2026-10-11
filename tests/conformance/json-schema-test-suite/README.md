# JSON Schema Test Suite (vendored)

Third-party test data from
[json-schema-org/JSON-Schema-Test-Suite](https://github.com/json-schema-org/JSON-Schema-Test-Suite),
copied here rather than pulled at test time so a run is reproducible offline
and a change to the suite arrives as a reviewable diff. MIT licensed, see
`LICENSE`. Do not edit these files: a local change would make the pinned
revision a lie.

`UPSTREAM_REVISION` holds the commit this copy came from. The conformance
runner reads it and fails if it stops matching the recorded baseline, so the
suite and the baseline cannot move independently.

`SHA256SUMS.json` records a digest per vendored file, checked on every run.
That catches a local edit, a truncated copy or a half-finished update, so the
revision above cannot quietly stop describing the files. It proves integrity
since import, not provenance: only re-importing shows the files came from that
upstream commit.

## What is here

The four dialects Texaryn claims, `tests/draft4`, `tests/draft7`,
`tests/draft2019-09` and `tests/draft2020-12`. Draft 3 and 6 are not vendored
because no adapter claims them.

`remotes/` contains the upstream fixture tree. The suite runner resolves its
`http://localhost:1234/...` URIs from disk and passes that callback through each
adapter's public resolver option, so the conformance run needs no network.

## Updating

```bash
git clone --depth 1 https://github.com/json-schema-org/JSON-Schema-Test-Suite /tmp/jsts
```

Copy `tests/draft4`, `tests/draft7`, `tests/draft2019-09`,
`tests/draft2020-12`, `remotes` and `LICENSE`
over this directory, write the new commit SHA into `UPSTREAM_REVISION`, then
rewrite the digests and regenerate the baseline:

```bash
pnpm json-schema-suite:manifest && pnpm json-schema-suite:baseline
```

Rewrite the manifest only as part of an import. Running it to silence a digest
failure would erase the only evidence that a vendored file was edited.

The resulting diff is the point: it shows which upstream cases were added and
what they say about the adapters. Review it rather than committing it blind.
