# The Knock user id is the Cadence user id

Each Cadence user is the Knock user whose id is `String(users.id)`. Knock recommends an internal primary key as the user id, and a Knock user id can never change, so an email address (which a Platform Admin can edit) is ruled out. Enhanced security mode is on in every Knock environment, Development included, so the Notification Feed only connects with a user token signed on Cadence's server, and the signing path runs every day rather than first on deploy.

## Considered Options

- **Email as the Knock user id.** It's unique and survives a reseed. Rejected: Knock advises against it, and the address can change while the Knock id can't.
- **A new UUID column on `users`.** It would be stable across reseeds. Rejected: a migration for little gain.
- **Prefixing ids with a per-seed run id.** It would separate data from one seed run to the next. Rejected: seed users would then get new Knock users, with empty Feeds, after every reseed.
- **Enhanced security off in Development**, which Knock allows. Rejected: token signing and refresh would never be exercised locally.

## Consequences

- `npm run db:seed` drops `users`, so the autoincrement starts again. Seed users keep their ids only while the seed list keeps its order. Someone who signs up after a reseed can get an id an earlier user had, along with that user's Knock Feed history. We accept this in Development.
- Enhanced security only protects the Feed as far as Cadence knows who the user is. Until there is real authentication and DevUI is hidden in production, anyone can become any user and get a valid token.
