# Rotate a credential

**Symptom:** a service reports `401` against a dependency, or a token appeared somewhere
it must not be.

1. Issue the replacement first. A revoked token with nothing to replace it is an outage.
2. Deploy the replacement, then revoke the old one.
3. If the token leaked, record where in the incident, and delete it from there second —
   rotating comes first, because a deleted secret is still a known one.
