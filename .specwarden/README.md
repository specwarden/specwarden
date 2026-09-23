# .specwarden — this repository, checked by the engine it publishes

The consumer zone. Everything the engine knows about specwarden-the-repository lives
here; nothing about it lives in `core/`.

| File                | What                                                           |
| ------------------- | -------------------------------------------------------------- |
| `warden.config.mjs` | tiers, shared build inputs, the zone barrier over `core/src`   |
| `rules.mjs`         | the rules no single check owns, and the ones nothing can check |
| `checks/`           | one file per gate; a file here IS a gate                       |

## Why the harness is its own first consumer

Every argument specwarden makes is about somebody else's repository: one list, a check
that cannot fail is a defect, a rule without an enforcer is a wish. Making those arguments
while keeping our own guards as loose scripts in a shell chain would be making them from a
position we had not tested.

## Where the logic lives

The pure logic stays in `scripts/`, where a person can run it directly and where it has
its own test. The files here **wrap** it. A gate whose logic is inline is a gate whose
logic cannot be unit-tested.

`skills/gates/SKILL.md` owns the rest.
