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
