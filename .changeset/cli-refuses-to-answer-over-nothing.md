---
'specwarden': patch
---

Two CLI commands no longer report success over nothing. `specwarden check --list --id <id>` exits 2 and names the id when it matches no check, as `specwarden check --id <id>` already did; it printed an empty list and exited 0. `specwarden plan status <file> --verify` exits 1 on a plan with no acceptance command to run; it verified nothing and exited 0. If a script relied on either exit 0, the id or the plan it pointed at was wrong.
