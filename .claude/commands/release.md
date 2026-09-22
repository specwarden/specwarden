---
description: Cut a release — changeset, versions, checks, publish.
---

1. `pnpm changeset` — describe the change for whoever INSTALLS the package, not for
   whoever reads this repository. Those are different readers.
2. `pnpm version:packages` — changesets writes the numbers and the changelogs.
3. Review the version diff. Nothing else in the repository should have moved.
4. `pnpm release` — it runs the whole check list, then the publish-readiness gate with
   `--releasing`, then publishes.

Stop at any red. The window to unpublish is 72 hours and exists once.
