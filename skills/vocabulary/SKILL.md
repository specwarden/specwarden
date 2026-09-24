---
name: vocabulary
description: One name per concept — the glossary is the contract, and code, options, output and documents inherit it.
---

# vocabulary

## 1. The glossary is the contract

`core/GLOSSARY.md` defines every term the product uses for itself, once. A type, a
factory, an option, a config key, a CLI message and a sentence in a guide all spell a
concept the way the glossary does. A consumer learns the word once and meets it
everywhere; a second word for the same thing makes them look for a second thing.

The glossary ships with the engine — beside the consumer skill as `glossary.md` — so an
agent in somebody else's repository reads the same definitions this repository writes by.

## 2. A term enters the glossary before it enters the code

A new concept is named in the glossary first, in the same change that introduces it:
what it means, and which existing words it is NOT. Then the code takes the name. A term
that appears in a type or an option and nowhere in the glossary is undefined, however
obvious it looked to the person who wrote it.

The measured defect this rule answers: before it, "check" and "gate" named one thing in
875 lines, "harness" named both the product and its self-checks, "rule" named four
different types, and one check carried three ids depending on which document was read.

## 3. How names inherit the terms

- **One concept, one word, in every layer.** A self-check is `selfChecks` in the config,
  `ISelfCheckOptions` in the types, "self-checks" in the guide.
- **A factory is named for what it builds.** A primitive reads as the rule a consumer
  states (`forbidPattern`, `siblingRequired`); a module's check is named for the subject it
  audits (`docPaths`, `envPairing`); a preset is `<module>Checks`.
- **An id is the factory's name in kebab case**, and a check file is named for its id.
- **An option names its role.** The corpus is `files` on a primitive and its role (`docs`,
  `code`) on a module check; exemptions are `except`; a directory ends in `Dir`, a file in
  `File`; a pattern is a RegExp with no `Re` suffix.
- **An option type is `I<Factory>Options`.** Never `…Spec` beside `…Options`.

## 4. Retiring a word

A retired word is listed at the end of the glossary with the word to say instead, and the
`vocabulary` gate refuses it in tracked code and documents. Retiring is one change: the
rename everywhere, the glossary row, the gate pattern — seen red on a planted use before
it is believed.

A word is not retired by being replaced in most places. The copy left in a message or a
docblock is the one a reader finds, and it teaches the old name back.

## 5. Decisions on record

- **A perimeter entry is a policy, not a rule.** Four types were called "rule" (`IRule`,
  `ICheckRule`, the perimeter's entries, the option checker's shapes), and `rules.mjs` and
  `perimeter.mjs` each exported a `rules` of a different shape. A rule is what the repository
  has decided; a policy is what an assistant may do. Rejected: keeping `commandRule` and
  qualifying it in prose — the qualifier is what readers drop.
- **A primitive reads as a rule, a module's check as a subject.** `forbidPattern({ files,
pattern })` is the rule as a consumer states it; `docPaths` and `envPairing` name what a
  module audits. Rejected: renaming the primitives to nouns — they would stop reading as the
  sentence the consumer means.
- **A retired name gets no alias.** Nothing was released when the vocabulary was made one,
  so every rename was made outright. Rejected: keeping the old name beside the new one — an
  alias is a second name kept forever, which is the defect this skill exists against.
