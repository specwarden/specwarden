# Restart the queue

**Symptom:** consumer lag above ten thousand and rising for more than five minutes.

1. Confirm the lag on the dashboard, not from a single alert.
2. Drain the consumer group, then restart it.
3. Watch the lag fall for ten minutes before closing the incident.

If the lag does not fall, the consumer is not the problem — escalate as described in
[rotating a credential](./rotate-a-credential.md) when the cause is an expired token.
