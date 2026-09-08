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

Only the three dialects Texaryn claims, `tests/draft7`, `tests/draft2019-09`
and `tests/draft2020-12`. Draft 3, 4 and 6 are not vendored because no adapter
claims them.

`remotes/` is deliberately not vendored, because neither adapter factory
exposes a resolver hook, so there is no way to register those documents and
every test reaching for one fails identically whether or not the files are
present. This is not a claim that they need an HTTP server: upstream is
explicit that they can be loaded from disk and registered under their
`http://localhost:1234/...` retrieval URI. The moment a resolver is part of
the adapter surface, vendor them. Until then the failures are recorded and
classified in `../json-schema-suite/baseline.json`.

## Updating

```bash
git clone --depth 1 https://github.com/json-schema-org/JSON-Schema-Test-Suite /tmp/jsts
```

Copy `tests/draft7`, `tests/draft2019-09`, `tests/draft2020-12` and `LICENSE`
over this directory, write the new commit SHA into `UPSTREAM_REVISION`, then
rewrite the digests and regenerate the baseline:

```bash
pnpm json-schema-suite:manifest && pnpm json-schema-suite:baseline
```

Rewrite the manifest only as part of an import. Running it to silence a digest
failure would erase the only evidence that a vendored file was edited.

The resulting diff is the point: it shows which upstream cases were added and
what they say about the adapters. Review it rather than committing it blind.
