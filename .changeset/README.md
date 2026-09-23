# Changesets

Every package here versions on its own, and holding those numbers by hand is not
possible: a package whose bump was forgotten goes to npm with the old number and the new
contents, and a consumer receives a change disguised as the release they already have.

## How this is used

- `pnpm changeset` — describe the change: which packages it touches, and by how much
  (patch / minor / major). The file is committed **with the edit**, because the author of
  the edit is the only person who knows whether it breaks anything.
- `pnpm version:packages` — fold the descriptions into versions and into every
  `CHANGELOG.md`.

Publishing is a separate step and a manual one. `skills/publishing/SKILL.md` owns it and
is not repeated here.

A changeset is written for whoever **installs** the package, not for whoever reads this
repository. The commit explains the change to a contributor; this file explains it to
somebody deciding whether to upgrade. Neither substitutes for the other.

## What counts as a major

This is a quality-gate engine, so a consumer depends on two things, and either can break:

- **their code** — a name removed from a barrel, an option renamed or made required, a
  default changed, a CLI flag or exit code that means something else;
- **their verdict** — a check that starts refusing a tree it accepted yesterday, with
  nothing changed on the consumer's side.

The first is a major, always. The second is a major **unless** the tree it now refuses
has the defect the check is named for, and the check was simply blind to one shape of
it. That is a fix — a patch — and the changeset says so in its first line, because a CI
turning red over a real defect is the product working, and the consumer needs to know it
is the check and not their code that moved.

Moving a file inside a package is not a major: the barrel hides it. Removing a name
**from** the barrel is.

## What is not versioned here

The playgrounds under `_playgrounds/` are private workspace packages. They are proofs,
not products, and `privatePackages.version` is off so a changeset can never bump one.

`pnpm gate --id changesets` refuses a changeset naming a package the registry does not
have — the rename that `changeset version` would otherwise discover on release day.
