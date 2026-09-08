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

## What is here

Only the three dialects Texaryn claims, `tests/draft7`, `tests/draft2019-09`
and `tests/draft2020-12`. Draft 3, 4 and 6 are not vendored because no adapter
claims them.

`remotes/` is deliberately not vendored. Those documents exist to be served
over HTTP at `http://localhost:1234`, and neither adapter factory exposes a
resolver hook, so every test that reaches for one fails identically whether or
not the files are present. Vendoring them would suggest remote resolution is
exercised. The failures are recorded and classified instead, in
`../json-schema-suite/baseline.json`.

## Updating

```bash
git clone --depth 1 https://github.com/json-schema-org/JSON-Schema-Test-Suite /tmp/jsts
```

Copy `tests/draft7`, `tests/draft2019-09`, `tests/draft2020-12` and `LICENSE`
over this directory, write the new commit SHA into `UPSTREAM_REVISION`, then
regenerate the baseline:

```bash
pnpm json-schema-suite:baseline
```

The resulting diff is the point: it shows which upstream cases were added and
what they say about the adapters. Review it rather than committing it blind.
