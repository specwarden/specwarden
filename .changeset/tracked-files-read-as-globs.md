---
'specwarden': minor
'@specwarden/docs': patch
'@specwarden/plans': patch
---

A check's pathspec now means the same thing in a real run as in its tests: a glob, where `**` spans any depth including none and `*` stays inside one directory.

Before, `trackedFiles` handed the pathspec to git as written, and git's default reading differs: `**/*.md` skipped every document at the repository root — your `README.md` included — and `src/**/*.ts` skipped `src/index.ts`. The test kit read the same pathspecs as globs, so a check could pass its tests and still never read the files they described. Expect a documentation check to report problems in root documents that were always there.

If you configured a pathspec that relied on git's reading — `docs: 'docs/*.md'` meaning every document under `docs/` at any depth — write it as `docs/**/*.md`. The test kit now also filters an explicit `tracked` list by the pathspec a check asks for, instead of returning the whole list.
