# Contract suites

One contract, every implementation of it.

A port is only worth having if its implementations answer identically — the in-memory
file source earns its keep solely because it answers exactly as the Node one, and the
moment it does not, every test written against it measures a fiction, including the
ones that prove the engine works on a differently-shaped repository.

So these suites are parameterised over the implementations rather than living beside
any one of them. A suite here belongs to the PORT, and a new adapter is expected to be
added to the list it runs against — that is what makes an adapter finished.

The underscore marks this as not a peer of the adapters beside it.

`glob/` is the one suite here held to something outside the adapters: what Node 24.21's
own `fs.globSync` answered, recorded pattern by pattern in `glob.golden.json`. Both file
sources walk trees with the engine's own glob, and the recording is what keeps that glob
answering as Node's does — on every Node the engine runs on, including the ones with no
`globSync` at all. `skills/testing/SKILL.md` §3a owns how it is recorded.
