---
'@specwarden/agents': minor
---

`agentsDir` defaults to `.claude/agents`, and an agents folder that does not exist now FAILS naming it — it passed as "nothing to verify", and so did an `agentsDir` pointing at a roster that moved. A repository without a roster should not install this module; a folder that exists and holds no definition yet still passes. The `orchestrators` default, `['lead']`, is now stated in the GUIDE and the skill.
