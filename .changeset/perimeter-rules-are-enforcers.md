---
'specwarden': minor
---

A perimeter rule counts as an enforcer without a config line. The engine reads `.specwarden/perimeter.mjs` (or `perimeter/perimeter.mjs`) the way the hook reads it, and `enforcement-resolves` resolves a rule naming one of its ids. Until now every repository with a perimeter repeated its ids by hand — `harness: { otherEnforcerIds: () => perimeterRules.map((r) => r.id) }` — or the rule naming `no-force-push` was red. A hand-written `otherEnforcerIds` still works and adds to the perimeter's. A perimeter that does not load fails `enforcement-resolves`, naming the file — never the whole run; the hook still fails open on it.
