---
description: Run this repository's own gates, and read the result the way the engine intends.
---

Run `pnpm gate:fast` first. It is everything that only reads files, so a failure there is
about this change rather than about the machine.

If it is green and the change touched a package's manifest, build, exports or a template,
run `pnpm gate` — the heavy tier builds, packs, installs and scaffolds.

Read a failure in this order:

1. the finding's own message — every check here is written to say what to do;
2. the `💡` hint under a failed gate;
3. the rule the finding names, and the document that owns it.

Never make a run green by lowering a ratchet or a threshold. That is the bar moving,
which is the failure this product is named after.
