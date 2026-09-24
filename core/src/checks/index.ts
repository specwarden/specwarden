/**
 * The checks the ENGINE itself needs — the self-checks, which audit the declarations rather than
 * a repository's opinions about documentation, plans, operations or credentials.
 *
 * Everything else moved to a module under `modules/`. The test is
 * simple, and it is the same one the zone boundary applies: if a check could be WRONG
 * about a repository that has never heard of it, it is an opinion and it ships
 * separately. A documentation layout, a plan lifecycle, a compose file, a vendor's
 * credential format — each of those is one repository's decision. Zones, ratchets and the
 * rule register are this engine's own mechanics, and nothing else can own them.
 */
export * from './zone-boundary/zone-boundary.check';
export * from './ratchet-direction/ratchet-direction.check';
export * from './rule-coverage/rule-coverage.check';
export * from './enforcement-resolves/enforcement-resolves.check';
