# Which hosted notification vendor fits Cadence?

This is research for [#2](https://github.com/dmascarenhas/cohort-005-project/issues/2), which feeds the vendor choice in #3. Every claim comes from vendor docs and pricing pages read on 2026-11-10. The older comparison in commit `65cf7d2` was used only as a list of leads, and each of its claims was checked again. Prices change, so re-check them before signing up.

Cadence needs to send a Notification to every role (Student, Team Admin, Instructor, Platform Admin) on two Channels: the in-app Notification Feed and email. The browser feed must follow whichever user the DevUI switcher has selected. In practice, the server signs a token for the current session user, and the feed provider re-authenticates when that user changes.

## Ranked recommendation

1. **Knock.** It meets every criterion on its free plan. It has a prebuilt feed and headless hooks. Its signed user tokens are RS256 with an expiry, and its Node SDK includes a `signUserToken` helper. It also has the widest mobile SDK set. The costs: web push works only through FCM, and the first paid tier is $250/mo.
2. **SuprSend.** It also meets every criterion, and it has the best push path: native VAPID web push plus Expo, React Native and Flutter SDKs. Its ES256 user JWT comes with a `refreshUserToken` callback. The costs: the free tier shows SuprSend branding, and each channel counts toward the quota separately. You also bring your own email vendor in the staging and production workspaces.
3. **Courier.** It meets every criterion, and pay-as-you-go at $0.005 per send is the gentlest pricing curve. The costs: each browser token is minted with a call to Courier's API rather than signed locally. A token never expires unless you set `expires_in`. There is no native web push.
4. **Novu Cloud.** It has a good React story (a prebuilt `<Inbox />` plus `useNotifications` and `useCounts`) and the cheapest paid tier ($30/mo). It is weak on the token criterion: browser auth is a static HMAC-SHA256 of the subscriber id, with no expiry or scope. The free plan also limits you to 5 workflows and 24 hours of activity retention.
5. **MagicBell.** It has native VAPID web push and an HS256 user JWT. It **fails the headless hooks criterion**: the current `@magicbell/react` SDK documents components only, and the old `react-headless` docs URL now redirects to that page. Its free tier is 1,000 deliveries a month.

## Comparison

| | Knock | SuprSend | Courier | Novu Cloud | MagicBell |
|---|---|---|---|---|---|
| React prebuilt feed | `NotificationFeedPopover`, `NotificationFeed`, `NotificationIconButton` [K2] | `<Inbox />` in `@suprsend/react` [S3] | `<CourierInbox />`, `<CourierInboxPopupMenu />`, `<CourierToast />` [C3] | `<Inbox />` in `@novu/react` [N4] | `Inbox`, `FloatingInbox` in `@magicbell/react` [M4] |
| React headless hooks | `useNotifications`, `useNotificationStore`, `useAuthenticatedKnockClient` [K3][K4] | `useFeedData`, `useFeedClient` in `@suprsend/react-core` [S3] | `useCourier()` gives `inbox.feeds`, `totalUnreadCount` and message actions [C3] | `useNotifications`, `useCounts`, `useNovu` [N3] | **None documented** [M4] |
| Email from the same trigger | Yes, one workflow holds several channel steps [K6] | Yes, a trigger sends to every channel in the workflow's delivery node [S5] | Yes, `routing: { method: "all", channels: ["email","inbox"] }` [C5] | Yes, a workflow chains email and in-app steps [N6] | Not verified. Broadcasts fan out per channel; check before choosing |
| Free tier | 10K messages/mo [K1] | 10K notifications/mo, with branding [S1] | 10K sends/mo [C1] | 10K workflow runs/mo, 5 workflows, 24h retention [N1] | **1K deliveries/mo** [M1] |
| First paid step | Starter $250/mo for 50K, then $0.005 each [K1] | Essentials $100/mo billed annually for 50K, then $0.002 each [S1] | Pay as you go at $0.005/send [C1] | Pro from $30/mo for 30K, then $1.20 per 1K [N1] | Startup $249/mo for 50K, then $0.0025 each [M1] |
| Node server SDK | `@knocklabs/node`, `workflows.trigger(key, {recipients, data})` [K7] | `@suprsend/node-sdk`, `workflows.trigger` [S5] | `@trycourier/courier`, `client.send.message` [C5] | `@novu/api`, `novu.trigger({ workflowId, to })` [N5] | `magicbell-js` ProjectClient, `broadcasts.createBroadcast` [M5] |
| Browser user auth | RS256 JWT with `sub` and `exp`, signed locally; enhanced security mode rejects unsigned calls [K5] | ES256 JWT with `entity_id` and `exp`, signed locally; `refreshUserToken` callback [S2] | JWT minted by `POST /auth/issue-token`, scoped to `user_id`; never expires unless `expires_in` is set [C2] | **HMAC-SHA256(secret, subscriberId)**: static, with no expiry or scope [N2] | HS256 JWT with `user_external_id`, signed locally with the project secret [M2] |
| Web push | **FCM only**; no first-party web push channel [K8] | **Native**, with a VAPID key and service worker [S4] | Through providers (FCM, OneSignal, Pusher Beams and others); no native channel listed [C4] | Through FCM, OneSignal, Pusher Beams, Pushpad or a webhook [N7] | **Native VAPID** channel, plus a `WebPushButton` component [M3][M4] |
| Mobile push | APNs, FCM, Expo, OneSignal, SNS; SDKs for Swift, Kotlin, Flutter, React Native and Expo [K8][K9] | FCM and APNs through the Expo and React Native SDKs; a Flutter inbox SDK [S6] | APNs, FCM, Expo, OneSignal and more; mobile SDKs register APNs and FCM tokens [C4] | FCM, APNs, Expo, OneSignal [N7] | APNs, FCM, Expo [M3] |

## Notes per vendor

### Knock

- **DevUI fit.** The session loader calls `signUserToken(userId)` from `@knocklabs/node`. The default expiry is 3,600 seconds, and the key comes from `KNOCK_SIGNING_KEY`. The loader passes the result as `userToken` to `KnockProvider` [K4][K5].
- **Enhanced security.** The mode is off by default, and Knock says to turn it on before going to production, because "Without enhanced security mode, a request with your public key can act as any user." Neither the security page nor the pricing page says enhanced security is plan-gated [K1][K5].
- **What counts toward the quota.** Knock defines a message as a notification to one recipient on one channel. An in-app item plus an email to the same user is therefore probably 2 messages [K10]. The old claim that preference-suppressed messages are not billed could not be confirmed on current pages.
- **Free plan limits.** It has Knock branding, no email client previews, no per-tenant branding or preferences, and 30-day logs [K1].

### SuprSend

- **Package migration.** `@suprsend/react-inbox` has reached end of support. The replacement, `@suprsend/react`, moved auth from HMAC to JWT [S3].
- **Free plan limits.** There are no vendor-stored user preferences until the Business plan. That is not one of this ticket's criteria, but it matters if Cadence wants per-user Channel settings later [S1].
- **Email setup.** You bring your own email vendor in the staging and production workspaces. The sandbox has sample vendors preconfigured [S5].

### Courier

- **Token minting.** A token costs a server-to-Courier round trip, `POST /auth/issue-token` with a scope such as `user_id:<id> inbox:read:messages inbox:write:events`. Always set `expires_in`. The SDKs do not refresh tokens, so the app calls `signIn` again with a new token [C2].
- **Switching users.** When the DevUI user changes, the app calls `courier.shared.signIn({ userId, jwt })` with a token minted for the new user [C2].

### Novu Cloud

- **Inbox security.** If HMAC is enabled and `subscriberHash` is missing, the Inbox will not load [N2]. The hash works as a fixed per-user password: anyone who has seen it can use it forever. There is no expiry, and you cannot revoke it without rotating the secret key.

### MagicBell

- **Example token lifetime.** The User JWT example in the docs signs tokens with `expiresIn: '1y'` [M2].
- **Headless use.** Without hooks, a headless feed would have to call the REST API or JS client directly.

### Other candidates

- **Pingram (formerly NotificationAPI).** `notificationapi.com/pricing` now redirects here. The pricing page lists only email and SMS, with no in-app, web push or mobile push. Secure mode is a hashed user id, similar to Novu's [P1][P2]. Not pursued.
- **Engagespot.** `engagespot.co/pricing` returned 404, as it did in the earlier run. Not evaluated.

## Sources

Knock
- [K1] Pricing: https://knock.app/pricing
- [K2] React overview: https://docs.knock.app/in-app-ui/react/overview
- [K3] Headless feed: https://docs.knock.app/in-app-ui/react/headless/feed
- [K4] `@knocklabs/react` README: https://github.com/knocklabs/javascript/blob/main/packages/react/README.md
- [K5] Security and authentication: https://docs.knock.app/in-app-ui/security-and-authentication
- [K6] Workflows: https://docs.knock.app/concepts/workflows
- [K7] Node SDK README: https://github.com/knocklabs/knock-node ; Triggering workflows: https://docs.knock.app/send-notifications/triggering-workflows
- [K8] Push overview: https://docs.knock.app/integrations/push/overview ; Web push with FCM: https://docs.knock.app/tutorials/sending-web-push-notifications-with-fcm
- [K9] Mobile SDKs: https://knock.app/changelog/2024-04-18 ; Expo SDK: https://docs.knock.app/sdks/expo/overview ; React Native SDK: https://docs.knock.app/sdks/react-native/overview
- [K10] Messages: https://docs.knock.app/concepts/messages

SuprSend
- [S1] Pricing: https://www.suprsend.com/pricing
- [S2] Client authentication: https://docs.suprsend.com/docs/client-authentication
- [S3] React SDK and headless feed: https://docs.suprsend.com/docs/react-sdk ; https://docs.suprsend.com/docs/react-sdk-headless-feed ; https://docs.suprsend.com/docs/inbox-overview
- [S4] Web push (JS): https://docs.suprsend.com/docs/js-webpush
- [S5] Node trigger workflow: https://docs.suprsend.com/docs/node-trigger-workflow-from-api ; Email: https://docs.suprsend.com/docs/email-1
- [S6] Expo push: https://docs.suprsend.com/docs/expo-push-notifications ; Mobile push quick start: https://docs.suprsend.com/docs/mobile-push-quick-start

Courier
- [C1] Pricing: https://www.courier.com/pricing
- [C2] Inbox authentication: https://www.courier.com/docs/platform/inbox/authentication
- [C3] React SDK: https://www.courier.com/docs/platform/inbox/web/react-sdk
- [C4] Push providers: https://www.courier.com/docs/integrations/push/overview
- [C5] Node SDK: https://www.courier.com/docs/sdk-libraries/node ; Agent quickstart (email plus inbox routing): https://courier.com/docs/tools/agent-quickstart

Novu
- [N1] Pricing: https://novu.co/pricing
- [N2] Prepare Inbox for production: https://docs.novu.co/platform/inbox/prepare-for-production
- [N3] Headless API reference: https://docs.novu.co/platform/inbox/headless/api-reference
- [N4] Inbox overview: https://docs.novu.co/platform/inbox/overview
- [N5] Trigger workflow: https://docs.novu.co/platform/workflow/trigger-workflow
- [N6] Workflows concept: https://docs.novu.co/platform/concepts/workflows
- [N7] Push integrations: https://docs.novu.co/platform/integrations/push

MagicBell
- [M1] Pricing: https://www.magicbell.com/pricing
- [M2] User JWT auth: https://www.magicbell.com/docs/api/authentication/user
- [M3] Web push channel: https://www.magicbell.com/docs/channels/web_push
- [M4] React SDK: https://www.magicbell.com/docs/libraries/react (also the redirect target of https://magicbell.com/docs/libraries/react-headless)
- [M5] JS/Node client: https://www.magicbell.com/docs/libraries/magicbell-js

Other
- [P1] Pingram pricing: https://www.pingram.io/pricing
- [P2] NotificationAPI secure mode: https://docs.notificationapi.com/guides/secure-mode
