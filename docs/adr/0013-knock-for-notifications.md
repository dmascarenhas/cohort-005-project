# Knock delivers Notifications

Cadence sends every Notification, on both Channels (the Notification Feed and email), through Knock, a hosted vendor. We chose Knock because it was the only candidate that met all of these on its free plan: feed tokens signed on our own server with an expiry, so the feed can follow whichever user DevUI selects; a prebuilt feed plus headless React hooks; one trigger that fans out to both Channels; and a built-in test email channel that needs no email provider and does not expire. The comparison is in [the vendor research](https://github.com/dmascarenhas/cohort-005-project/blob/research/notification-vendors/docs/research/notification-vendors.md).

## Considered Options

- **SuprSend (runner-up).** It also meets every criterion and has the best push path (native VAPID web push). It lost because its Sandbox workspace, the only place it sends email without our own email provider, expires 30 days after signup, and the free feed carries SuprSend branding.
- **Courier (fallback if Knock proves unworkable).** It has the gentlest pricing ($0.005 per send). It lost because each feed token costs a call to Courier's API and never expires unless we set an expiry.
- **Novu Cloud.** It has the cheapest paid tier. Rejected because feed auth is a static HMAC of the user id, with no expiry and no way to revoke it short of rotating the secret.
- **MagicBell.** Rejected: its React SDK has no headless hooks, and the free tier allows only 1,000 deliveries a month.
- **A home-grown feed on SQLite.** Ruled out before the comparison: the vendor must be hosted.

## Consequences

- Web push, when it comes, goes through Firebase Cloud Messaging. Knock has no web push channel of its own.
- The first paid tier is $250/mo. An in-app Notification plus an email to the same person probably counts as two of the free plan's 10K monthly messages.
- Knock's test email channel only delivers to members of our Knock account, 100 emails a month, so dev email for DevUI seed users has to be redirected.
- Knock's enhanced security mode is off by default. Until it is on, anyone with the public key can act as any user.
