# Can Knock's prebuilt feed match the bell dropdown, or do we build it headless?

This is research for [#8](https://github.com/dmascarenhas/cohort-005-project/issues/8). The target is `BellDropdown` in `app/components/notification-feed-prototype.tsx` on the `prototype/notification-feed` branch. Every claim below comes from one of three primary sources, all read on 2026-11-12:

- Knock's docs at docs.knock.app.
- The `knocklabs/javascript` monorepo source at commit [`07c61ac`](https://github.com/knocklabs/javascript/tree/07c61ac3ef1c968731ea9b83d81193f254ed1761), which matches the published `@knocklabs/react@0.15.1`, `@knocklabs/react-core@0.17.1` and `@knocklabs/client@0.23.1`.
- npm metadata, plus a local esbuild bundle of each option.

Where the docs say nothing, the source decides, and the claim links to the file. "Inferred from source, not run" marks behaviour I read in the code but did not exercise in this app.

Source links use the prefix `KJ/` for `https://github.com/knocklabs/javascript/blob/07c61ac3ef1c968731ea9b83d81193f254ed1761/packages/`.

## Recommendation

**Build it headless.** Use `@knocklabs/react-core` (`KnockProvider`, `KnockFeedProvider`, `useKnockFeed`) with Cadence's own Tailwind/shadcn markup. Build each sentence on the client from structured `data` fields, and take the click-through path from `data` too.

The prebuilt components could be bent close to the design. To get there, though, we would replace the header (`renderHeader`), the row (`renderItem`), the empty state (`EmptyComponent`) and the click handler (`onNotificationClick`), override the badge and popover with CSS variables, and fight an unlayered stylesheet. The only parts we would keep are a bell button, a popper.js popover, and the infinite-scroll hook. In exchange, `@knocklabs/react` adds about 600 KB minified (200 KB gzip) to the client bundle. Headless react-core adds about 124 KB (37 KB gzip). The prototype is already the headless component, minus the data source.

## 1. How far can the prebuilt components be themed?

| Design requirement | Prebuilt support | Source |
|---|---|---|
| Red badge, unread count, "9+", hidden at 0 | **Yes.** `formatBadgeCount` returns `count > 9 ? "9+" : count`, and the badge returns `null` at 0. The default count is **unseen**, so pass `badgeCountType="unread"`. The colour comes from `--rnf-unseen-badge-bg-color`. | [`KJ/react-core/src/modules/core/utils.ts`](https://github.com/knocklabs/javascript/blob/07c61ac3ef1c968731ea9b83d81193f254ed1761/packages/react-core/src/modules/core/utils.ts), [`KJ/react/.../UnseenBadge/UnseenBadge.tsx`](https://github.com/knocklabs/javascript/blob/07c61ac3ef1c968731ea9b83d81193f254ed1761/packages/react/src/modules/feed/components/UnseenBadge/UnseenBadge.tsx), [docs: feed](https://docs.knock.app/in-app-ui/react/feed) |
| Bell icon and button styling | **Partly.** `NotificationIconButton` renders Knock's own `BellIcon` and takes only `onClick` and `badgeCountType`. There is no `className`, `children` or icon slot, so a lucide `Bell` with Tailwind classes means CSS overrides or our own button. | [`KJ/react/.../NotificationIconButton.tsx`](https://github.com/knocklabs/javascript/blob/07c61ac3ef1c968731ea9b83d81193f254ed1761/packages/react/src/modules/feed/components/NotificationIconButton/NotificationIconButton.tsx) |
| 384px dropdown anchored under the bell, click outside closes | **Mostly.** The popover is positioned by popper.js (`strategy: "fixed"`, `placement` prop, default `bottom-end`; we want `bottom-start`). `closeOnClickOutside` defaults to true. The width comes from `--rnf-notification-feed-popover-max-w` (default 400px) and `-min-w` (280px). The height is a **fixed** `--rnf-notification-feed-popover-height: 400px`, not a max-height, so a short or empty list still shows a 400px box unless we override it. The popover is always mounted and hidden with `visibility`, and we hold the open state ourselves (`isVisible`, `onClose`, `buttonRef`). | [`KJ/react/.../NotificationFeedPopover.tsx`](https://github.com/knocklabs/javascript/blob/07c61ac3ef1c968731ea9b83d81193f254ed1761/packages/react/src/modules/feed/components/NotificationFeedPopover/NotificationFeedPopover.tsx), [its `styles.css`](https://github.com/knocklabs/javascript/blob/07c61ac3ef1c968731ea9b83d81193f254ed1761/packages/react/src/modules/feed/components/NotificationFeedPopover/styles.css) |
| Header "Notifications" plus "Mark all as read" shown only while unread | **Needs `renderHeader`.** The default header has an All/Unread/Read `<select>` filter, and the "Mark all as read" button is always rendered: it is `disabled` at 0 unread, not hidden, and has a checkmark icon. `renderHeader` receives `{filterStatus, setFilterStatus, onMarkAllAsReadClick}`, so we would write the header ourselves. | [`KJ/react/.../NotificationFeedHeader.tsx`](https://github.com/knocklabs/javascript/blob/07c61ac3ef1c968731ea9b83d81193f254ed1761/packages/react/src/modules/feed/components/NotificationFeed/NotificationFeedHeader.tsx), [`MarkAsRead.tsx`](https://github.com/knocklabs/javascript/blob/07c61ac3ef1c968731ea9b83d81193f254ed1761/packages/react/src/modules/feed/components/NotificationFeed/MarkAsRead.tsx) |
| Row: kind icon, sentence with bold names, "12m ago", tinted unread background, dot on the right | **Needs `renderItem`.** The default `NotificationCell` puts the unread dot on the **left**, shows the first actor's initials avatar rather than a kind icon, has no unread background, injects `blocks.body.rendered` with `dangerouslySetInnerHTML`, and adds an **archive (X) button** on every row. The timestamp is `Intl` `intlFormatDistance` ("12 minutes ago"); `formatTimestamp` can replace it. `renderItem` receives `{item, onItemClick, onButtonClick, formatTimestamp}` and returns any node. | [`KJ/react/.../NotificationCell.tsx`](https://github.com/knocklabs/javascript/blob/07c61ac3ef1c968731ea9b83d81193f254ed1761/packages/react/src/modules/feed/components/NotificationCell/NotificationCell.tsx), [`NotificationFeed.tsx`](https://github.com/knocklabs/javascript/blob/07c61ac3ef1c968731ea9b83d81193f254ed1761/packages/react/src/modules/feed/components/NotificationFeed/NotificationFeed.tsx) |
| One list, newest first, scrolls, loads more | **Yes.** The feed fetches on mount and calls `fetchNextPage()` within 70px of the bottom. | `NotificationFeed.tsx` above |
| Empty state "You're all caught up." | **Yes.** Through the `EmptyComponent` prop, or the `i18n` strings `emptyFeedTitle`/`emptyFeedBody` (defaults "No notifications yet" / "We'll let you know…"). | `NotificationFeed.tsx`, [`KJ/react-core/src/modules/i18n/languages/en.ts`](https://github.com/knocklabs/javascript/blob/07c61ac3ef1c968731ea9b83d81193f254ed1761/packages/react-core/src/modules/i18n/languages/en.ts) |
| Click marks read, closes, navigates with React Router | **Yes, with `onNotificationClick`.** The cell always calls `feedClient.markAsInteracted(item)`, which optimistically sets `read_at` and `interacted_at` and decrements `unread_count`. With `onNotificationClick` set, it calls that instead of its default `setTimeout(() => window.location.assign(action_url), 200)` full-page load. Our handler would close the popover and `navigate()`. | `NotificationCell.tsx`; [`KJ/client/src/clients/feed/feed.ts`](https://github.com/knocklabs/javascript/blob/07c61ac3ef1c968731ea9b83d81193f254ed1761/packages/client/src/clients/feed/feed.ts) |
| No per-row read/unread toggle | Default rows have an archive button instead. Hiding it means `renderItem` or CSS. | `NotificationCell.tsx` |
| Opening marks Notifications seen | The popover's default `onOpen` calls `markAllAsSeen()`. That is harmless for an unread badge, and a headless build should do the same so `unseen_count` stays meaningful ([docs: headless feed](https://docs.knock.app/in-app-ui/react/headless/feed)). | `NotificationFeedPopover.tsx` |
| "Powered by Knock" | Shown when the feed settings endpoint returns `features.branding_required`; the free plan has Knock branding (see [vendor research](https://github.com/dmascarenhas/cohort-005-project/blob/research/notification-vendors/docs/research/notification-vendors.md)). The headless build has no such footer. | `NotificationFeed.tsx`, [`useFeedSettings.ts`](https://github.com/knocklabs/javascript/blob/07c61ac3ef1c968731ea9b83d81193f254ed1761/packages/react-core/src/modules/feed/hooks/useFeedSettings.ts) |

**Styling mechanics.**

- Theming is CSS variables prefixed `--rnf-` plus `rnf-` classes. You can also replace Knock's CSS entirely ([docs: styling](https://docs.knock.app/in-app-ui/feeds/styling), [theme.css](https://github.com/knocklabs/javascript/blob/07c61ac3ef1c968731ea9b83d81193f254ed1761/packages/react/src/theme.css)).
- The CSS is **not** auto-imported. The ESM build has `/* empty css */` where the imports were, so you must `import "@knocklabs/react/dist/index.css"` ([docs: feed](https://docs.knock.app/in-app-ui/react/feed)).
- The file is 67 KB. It also carries Telegraph, guide and Slack/Teams styles, and **none of it is in a CSS `@layer`**. Tailwind v4 puts utilities in `@layer utilities`, and unlayered rules beat layered ones whatever their specificity. So the `rnf-` rules win over Tailwind classes on the same element, unless we import the file into a layer (`@import "@knocklabs/react/dist/index.css" layer(components);`). That last point is inferred from the CSS cascade rules and the file contents; I did not try it here.

**Dark mode.**

- The components take `colorMode: "light" | "dark"` as a **prop** on `KnockFeedProvider`. They add `rnf-…--dark` modifier classes, and newer parts use `[data-knock-color-mode]` attributes ([`KnockFeedProvider.tsx`](https://github.com/knocklabs/javascript/blob/07c61ac3ef1c968731ea9b83d81193f254ed1761/packages/react-core/src/modules/feed/context/KnockFeedProvider.tsx), [`constants.ts`](https://github.com/knocklabs/javascript/blob/07c61ac3ef1c968731ea9b83d81193f254ed1761/packages/react-core/src/modules/core/constants.ts)). It is not class-based on `<html>`.
- Cadence toggles a `.dark` class on `<html>` from `localStorage` in an inline script (`app/root.tsx`), and `app/app.css` declares `@custom-variant dark (&:is(.dark *))`.
- To follow our theme, either mirror `.dark` into React state and pass `colorMode`, or leave `colorMode="light"` and remap every `--rnf-*` colour to our shadcn variables (`--popover`, `--muted`, `--primary`…) so `.dark` switches them for free.
- The `colorMode` route has a catch: the server cannot know the theme, so the first render is "light". The remap route means writing a few dozen variable overrides.

**Verdict on question 1:** matching the design is realistic only with `renderHeader`, `renderItem`, `EmptyComponent`, `onNotificationClick`, `badgeCountType="unread"`, `placement="bottom-start"` and CSS overrides for the bell, badge, popover height and colours. At that point Knock contributes the button shell, popper positioning and bottom-scroll paging, and the rest is ours.

## 2. What the headless pieces give us

All of the following are in `@knocklabs/react-core` (React peer `^17 || ^18 || ^19`, `sideEffects: false`) and `@knocklabs/client`:

- **`KnockProvider`** takes `apiKey`, `user` (or the deprecated `userId`), `userToken`, `onUserTokenExpiring`, `timeBeforeExpirationInMs`, `enabled`, `i18n` and `host`. It creates and tears down the `Knock` client ([`KnockProvider.tsx`](https://github.com/knocklabs/javascript/blob/07c61ac3ef1c968731ea9b83d81193f254ed1761/packages/react-core/src/modules/core/context/KnockProvider.tsx), [`useAuthenticatedKnockClient.ts`](https://github.com/knocklabs/javascript/blob/07c61ac3ef1c968731ea9b83d81193f254ed1761/packages/react-core/src/modules/core/hooks/useAuthenticatedKnockClient.ts)).
- **`KnockFeedProvider`** takes `feedId` (the in-app channel UUID), `defaultFeedOptions` and `colorMode`. It runs `useNotifications`, which calls `knock.feeds.initialize(feedId, options)` and `feedClient.listenForUpdates()`, so real-time updates over Phoenix websockets come with it. Its context key is `[userId, feedId, source, tenant, has_tenant, archived]`, so the feed subtree remounts when the user changes ([`KnockFeedProvider.tsx`](https://github.com/knocklabs/javascript/blob/07c61ac3ef1c968731ea9b83d81193f254ed1761/packages/react-core/src/modules/feed/context/KnockFeedProvider.tsx), [`useNotifications.ts`](https://github.com/knocklabs/javascript/blob/07c61ac3ef1c968731ea9b83d81193f254ed1761/packages/react-core/src/modules/feed/hooks/useNotifications.ts), [`utils.ts`](https://github.com/knocklabs/javascript/blob/07c61ac3ef1c968731ea9b83d81193f254ed1761/packages/react-core/src/modules/core/utils.ts)).
- **`useKnockFeed()`** returns `{ knock, feedClient, useFeedStore, colorMode }`. `useFeedStore(selector?)` is a TanStack Store hook over `feedClient.store` holding `{ items, metadata: { total_count, unread_count, unseen_count }, pageInfo, networkStatus }`. Outside the provider, use `useNotificationStore(feedClient, selector?)` ([`useNotificationStore.ts`](https://github.com/knocklabs/javascript/blob/07c61ac3ef1c968731ea9b83d81193f254ed1761/packages/react-core/src/modules/feed/hooks/useNotificationStore.ts), [`interfaces.ts`](https://github.com/knocklabs/javascript/blob/07c61ac3ef1c968731ea9b83d81193f254ed1761/packages/client/src/clients/feed/interfaces.ts)).
- **Feed client methods:** `fetch({status})`, `fetchNextPage()` (cursor `pageInfo.after`), `markAsSeen`, `markAllAsSeen`, `markAsRead`, `markAllAsRead`, `markAsUnread`, `markAsInteracted(item, metadata)`, `markAsArchived` and more. They update the store optimistically and skip silently when nobody is authenticated (`canMutate`) ([`feed.ts`](https://github.com/knocklabs/javascript/blob/07c61ac3ef1c968731ea9b83d81193f254ed1761/packages/client/src/clients/feed/feed.ts)). The docs page for headless use shows `markAllAsSeen` and `markAsSeen`, and warns that "`unseen_count` never decreases" unless items are marked seen ([docs: headless feed](https://docs.knock.app/in-app-ui/react/headless/feed)).
- **Helpers:** `formatBadgeCount` (the same "9+" rule), `formatTimestamp`, `getBadgeAriaLabel`, `useTranslations`.
- **`useFeedSettings`** only fetches `features.branding_required`. We would not need it.
- **Defaults:** `mode: "compact"` and `archived: "exclude"` on the client. Compact mode drops nested arrays and objects from `data` and keeps only one actor (`feed.ts`; [API: list feed items](https://docs.knock.app/api-reference/users/feeds/list_items), where the HTTP API itself defaults to `rich`). The page size defaults to 50.

**Minimal component shape (sketch):**

```tsx
// root or _layout: user, token, apiKey, feedId come from the loader
<KnockProvider
  key={user?.id ?? "anon"}
  apiKey={knockPublicKey}
  user={{ id: String(user.id) }}
  userToken={knockToken}
  enabled={hydrated && Boolean(user && knockToken)}
  onUserTokenExpiring={refreshKnockToken} // stable identity: module-level or useCallback, see section 4
>
  <KnockFeedProvider feedId={knockFeedId}>…sidebar…</KnockFeedProvider>
</KnockProvider>

// app/components/notification-bell.tsx  (Radix Popover from radix-ui, Tailwind tokens)
function NotificationBell() {
  const { feedClient, useFeedStore } = useKnockFeed();
  const { items, metadata, pageInfo, networkStatus } = useFeedStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  useEffect(() => { feedClient.fetch(); }, [feedClient]);
  useEffect(() => { if (open && metadata.unseen_count > 0) feedClient.markAllAsSeen(); }, [open]);
  const unread = metadata.unread_count;
  // <Popover.Root open onOpenChange> → trigger: lucide Bell + {unread > 0 && formatBadgeCount(unread)}
  // content (w-96, align="start"): header "Notifications" + {unread > 0 && <button onClick={() => feedClient.markAllAsRead()}>}
  // list: items.map(item => <NotificationRow item onClick={() => { feedClient.markAsInteracted(item); setOpen(false); navigate(item.data.url); }} />)
  // bottom: {pageInfo.after && onScrollEnd → feedClient.fetchNextPage()}; empty: "You're all caught up."
}
```

`NotificationRow` is the prototype's row markup. It switches on a `data.kind` field to pick the icon and build the sentence (see section 3). Everything else in `BellDropdown` carries over unchanged.

## 3. Bold names: blocks vs. data, and the click-through URL

**How content arrives.**

- Each `FeedItem` has `blocks: ContentBlock[]`. A block is `{name, type: "markdown" | "text" | "button_set", content, rendered}`. It also has `data` (the workflow trigger data), `actors`, `read_at`, `seen_at`, `interacted_at`, `archived_at` and `inserted_at` ([`interfaces.ts`](https://github.com/knocklabs/javascript/blob/07c61ac3ef1c968731ea9b83d81193f254ed1761/packages/client/src/clients/feed/interfaces.ts)).
- The in-app template's markdown body arrives as the block named **`body`** (type `markdown`), and `rendered` is the HTML. The template's Action URL arrives as the block named **`action_url`** (type `text`). Knock's own cell reads exactly those two names ([`NotificationCell.tsx`](https://github.com/knocklabs/javascript/blob/07c61ac3ef1c968731ea9b83d81193f254ed1761/packages/react/src/modules/feed/components/NotificationCell/NotificationCell.tsx)).
- The docs describe the Action URL as "the URL that will be opened when a user clicks on the notification cell" ([docs: Knock in-app channel](https://docs.knock.app/integrations/in-app/knock)), and show headless rendering as `<div dangerouslySetInnerHTML={{ __html: item.blocks[0].rendered }} />` with no word on sanitisation ([docs: headless feed](https://docs.knock.app/in-app-ui/react/headless/feed)).

**Option A: render Knock's HTML.** The template would be `**{{ data.actor_name }}** asked a question on **{{ data.lesson_title }}**`.

- Pros: copy lives in Knock next to the email template, and non-developers can edit it.
- Cons:
  - We need `dangerouslySetInnerHTML`, and several values are user-written: names, and Refund Request reasons quoted into the sentence. The docs do not say whether Knock escapes HTML inside Liquid variables before markdown rendering, so we should run DOMPurify on every row. DOMPurify is only in the tree as a transitive dependency of monaco (pinned by `overrides`), so we would add it directly.
  - The HTML would also need its `<strong>` and `<p>` styled through a wrapper (`[&_strong]:font-semibold [&_strong]:text-foreground`).
  - The sentence is invisible to our type checker and tests.

**Option B: build the sentence on the client from `data`.** The trigger sends `{ kind: "discussion_question", actor_name, lesson_title, course_title, url }`, and a typed `switch (data.kind)` returns the prototype's `parts`.

- Pros:
  - No raw HTML, so no injection risk.
  - Icons and sentences live in one tested, typed module.
  - It matches the prototype's `parts` model exactly.
- Cons:
  - The in-app copy lives in Cadence while the email copy lives in Knock.
  - The in-app template's body becomes a plain-text fallback that Cadence never shows.
  - Compact mode strips nested objects from `data`, so the payload must be flat, or we use `mode: "rich"`.

**Click-through URL.** Either the template's `action_url` block (`blocks.find(b => b.name === "action_url").rendered`) or a `data.url` field. `data.url` keeps routing in Cadence code and is typed. It also sidesteps whether Knock accepts a relative path in the Action URL field, which none of the pages I read settle. Either way, call `navigate(url)` (React Router), not `window.location`. One limit from the docs: Action URLs "are not wrapped in a trackable link and will not issue a `link_clicked` event". The click is still recorded through `markAsInteracted` ([docs: Knock in-app channel](https://docs.knock.app/integrations/in-app/knock)).

## 4. KnockProvider keyed on the user id, `enabled`, user token, refresh, SSR

- **Keyed on user id / user switch:** this is supported without a `key`. If only `userId` or `userToken` changes on an authenticated client, the client re-authenticates in place, and the feed subtree remounts because `feedProviderKey` includes the `userId`. A `key={userId}` on `KnockProvider` also works; it just builds a new client and socket ([`useAuthenticatedKnockClient.ts`](https://github.com/knocklabs/javascript/blob/07c61ac3ef1c968731ea9b83d81193f254ed1761/packages/react-core/src/modules/core/hooks/useAuthenticatedKnockClient.ts)). Prebuilt and headless behave the same here, because both sit on the same providers.
- **`enabled={false}` with no user:** documented on the prop ("render children but keep the Knock client idle: no identify call, no API requests, and no websocket"). Going `false → true` acts like a login and the reverse like a logout, each with a fresh client and empty store. Mutations and `useFeedSettings` skip while unauthenticated (`canMutate`, `isAuthenticated()` guards) ([`KnockProvider.tsx`](https://github.com/knocklabs/javascript/blob/07c61ac3ef1c968731ea9b83d81193f254ed1761/packages/react-core/src/modules/core/context/KnockProvider.tsx), [`feed.ts`](https://github.com/knocklabs/javascript/blob/07c61ac3ef1c968731ea9b83d81193f254ed1761/packages/client/src/clients/feed/feed.ts)).
- **User token from the loader, and `onUserTokenExpiring`:**
  - The client decodes the JWT `exp` and schedules the callback `timeBeforeExpirationInMs` (default 30 s) ahead of it.
  - The callback returns a new token, and the client re-authenticates.
  - A token already inside the window is floored rather than refreshed in a tight loop ([`KJ/client/src/knock.ts`](https://github.com/knocklabs/javascript/blob/07c61ac3ef1c968731ea9b83d81193f254ed1761/packages/client/src/knock.ts)).
  - Cadence needs a small resource route that signs a fresh token for the session user, following ADR 0014.
  - **Gotcha: the callback must have a stable identity** (`useCallback` or a module-level function). `KnockProvider` memoises its options on `onUserTokenExpiring` by reference, and `useStableOptions`/`deepEqual` compares functions with `===`. When the options change but the user and token do not, `useAuthenticatedKnockClient` skips the in-place re-auth branch, tears the client down and builds a new one. So an inline arrow would rebuild the client and socket on every render. This is inferred from source, not run ([`useStableOptions.ts`](https://github.com/knocklabs/javascript/blob/07c61ac3ef1c968731ea9b83d81193f254ed1761/packages/react-core/src/modules/core/hooks/useStableOptions.ts), [`deepEqual`](https://github.com/knocklabs/javascript/blob/07c61ac3ef1c968731ea9b83d81193f254ed1761/packages/react-core/src/modules/core/deepEqual/index.ts)).
- **SSR (React Router framework mode; this repo is on `react-router@8.3.0`).** Inferred from source, not run:
  - `KnockProvider` builds the `Knock` client inside `useMemo`, so it **runs during the server render**. `authenticate()` with a `user` object does an inline `identify` call (an HTTP request to Knock) and, when a token is present, schedules a `setTimeout`. Neither is cleaned up on the server, because the teardown effect only runs in the browser.
  - The websocket and `BroadcastChannel` are guarded by `typeof window`/`self`, and the feed `fetch` runs in an effect, so neither happens on the server.
  - **Mitigation:** gate `enabled` on hydration (`enabled={hydrated && Boolean(user && token)}`), or pass `identificationStrategy="skip"`. Gating on hydration also stops the badge count from causing a hydration mismatch: the server renders no badge, and the client fills it after the first fetch.
- **`"use client"`:** `@knocklabs/react`'s ESM entry starts with `"use client"`, which React Router ignores.
- **CSS import:** only the prebuilt package needs it, through `import "@knocklabs/react/dist/index.css"` in `root.tsx` or `@import` in `app.css`. Mind the unlayered-cascade point in section 1. Headless needs no Knock CSS at all.
- **Strict mode:** `useNotifications` has a known FIXME. Under StrictMode, the `useState` initialiser creates one extra feed client that is never disposed (dev only) ([`useNotifications.ts`](https://github.com/knocklabs/javascript/blob/07c61ac3ef1c968731ea9b83d81193f254ed1761/packages/react-core/src/modules/feed/hooks/useNotifications.ts)).

## 5. Bundle and dependency cost; React compatibility

Measured with esbuild 0.25 (`--bundle --minify --format=esm`, with React, react-dom, `next` and `@tanstack/react-router` external and CSS emptied). The entries imported only the four prebuilt feed components (A) or only `KnockProvider`, `KnockFeedProvider` and `useKnockFeed` (B).

| | Minified | Gzip | Biggest contributors |
|---|---|---|---|
| A: `@knocklabs/react@0.15.1` | 606 KB | 200 KB | `@base-ui/react` 165 KB, `motion-dom`/`framer-motion` 79 KB, `@knocklabs/client` 37 KB, `@telegraph/combobox` 30 KB, `@knocklabs/react` 29 KB, phoenix 22 KB, `@popperjs/core` 21 KB |
| B: `@knocklabs/react-core@0.17.1` | 124 KB | 37 KB | `@knocklabs/client` 37 KB, phoenix 22 KB, eventemitter2 18 KB, urlpattern-polyfill 18 KB, date-fns 11 KB, react-core 8 KB |

- **Why A is so large:** `@knocklabs/react`'s `package.json` has no `sideEffects: false`, so even named imports of feed components keep its guide, Slack and Teams modules and their Telegraph/Base UI/motion dependencies. `@knocklabs/react-core` declares `sideEffects: false`. Vite's production build (Rollup) follows the same `sideEffects` rules, so expect a similar gap. I did not build it in this app.
- **Dependencies (npm):** `@knocklabs/react` depends on 12 `@telegraph/*` packages, `@radix-ui/react-dialog`, `@radix-ui/react-hover-card`, `@popperjs/core` and `lucide-react@^0.544.0`. Cadence has `lucide-react@^0.563.0`, and on 0.x a caret range does not cross minors, so a second lucide copy would be installed. Its peers also include `next` and `@tanstack/react-router`; both are only used by optional subpath exports. `@knocklabs/react-core` depends on `@knocklabs/client`, `swr`, `date-fns@^4` and `@tanstack/react-store` (`npm view`, 2026-11-12).
- **React:** both packages declare `react`/`react-dom` peers `^17.0.0 || ^18.0.0 || ^19.0.0`, which fits this repo's `react@^19.2.7`.

## Open questions for a later decision ticket

1. **Where the in-app sentence copy lives.** Knock template markdown (option A) or Cadence code from structured `data` (option B, recommended). If B, define the trigger `data` contract per Notification kind (`kind`, display names, `url`), keep it flat for compact mode, and decide what the in-app template body says as a fallback.
2. **Does Knock escape HTML in Liquid variables** in in-app markdown bodies? This only matters if we ever render `blocks.body.rendered`. Test it with a user name like `<img src=x onerror=alert(1)>`.
3. **Click-through field:** `data.url` vs. the template Action URL. If it is the Action URL, can it be a relative path, and how is the base URL set per environment?
4. **Token refresh endpoint:** the route, its auth check (the DevUI session user), and the token lifetime passed to `signUserToken`.
5. **Hydration gating:** confirm in this app that gating `enabled` on hydration avoids the server-side `identify` call and timer, and that the badge appears without a flash.
6. **Badge semantics:** the design counts **unread**. Confirm we still call `markAllAsSeen` on open, which keeps Knock's `unseen` state accurate for any future digest or email-suppression logic.
