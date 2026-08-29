# Pindou Frontend Audit Report

**Root audited:** `E:\pindou\pindou-front\src` (plus `vite.config.js`, `package.json`, `index.html` for context)
**Scope:** Document technologies/features for a README **and** flag inconsistent / non-enterprise-grade code.

---

## 1. Project / Tech Stack Overview

**Framework:** Vue 3.5 (`<script setup>` Composition API throughout).
**Build tool:** Vite 5.4.
**State:** Pinia 3 (`createPinia()` in `main.js`).
**Routing:** Vue Router 4 (`createWebHistory`).
**UI library:** Element Plus 2.13, globally installed (`app.use(ElementPlus)`) **and** all Element Plus icons globally registered (`ElementPlusIconsVue`). Element Plus is **also** wired through `unplugin-auto-import` / `unplugin-vue-components` (`ElementPlusResolver`) in `vite.config.js`.
**HTTP:** Axios 1.15 (custom instance in `utils/request.js`), plus **raw `fetch`** calls for AI-SSE endpoints.
**Image processing:** `browser-image-compression` (publish page), Canvas 2D API (pindou pattern algorithm).
**Styling:** SCSS (scoped), CSS custom gradients; `vite.config.js` sets `scss.api = "modern-compiler"`.
**Build footprint:** `vite.config.js` uses `rollupOptions.output.manualChunks` to split `element-plus` and `vue/vue-router/pinia/axios` vendor chunks.
**Dev proxy:** `server.proxy['/api'] -> http://localhost:3000` (Vite dev only).
**Alias:** `@` -> `src`.

Package.json dependencies: `axios`, `browser-image-compression`, `element-plus`, `pinia`, `vue`, `vue-router`. Dev: `@vitejs/plugin-vue`, `eslint`, `prettier`, `sass`, `unplugin-auto-import`, `unplugin-vue-components`, `vite`, `vite-plugin-vue-devtools`.

### Route map (`router/index.js`)
All routes nest under a `Layout` component (`components/Layout.vue`) at `/`:
`/` Home (public), `/notice`, `/message`, `/user` (UserCenter), `/publish`, `/draft`, `/designer` (PindouDesigner, public), `/pine-xiaodou` (AI chat, public), `/user/:id` (UserProfile, public), `/designs` (MyDesigns). Catch-all `/:pathMatch(.*)*` redirects to `/`.

---

## 2. File-by-File Analysis

### `src/api/index.js`
**Purpose:** Single module aggregating all REST endpoint wrappers. Exposes named objects: `userApi`, `noteApi`, `actionApi`, `commentApi`, `draftApi`, `noticeApi`, `collectionApi`, `followApi`, `messageApi`, `aiApi`, `designApi`.
**Feature logic:** Thin wrappers over the axios instance from `@/utils/request.js`. Notable endpoints:
- `userApi.login` (auto-register on missing user), `getUserInfo`, `getOtherUserInfo`, `updateUserInfo`, `changePassword`, `updateAvatar` (multipart), `updateSignature`.
- `noteApi.getNotesList` — **"cursor pagination: `?pageSize=&cursor=`"** (comment line 46). `publishNote` (FormData), `uploadVideo`, `updateNote` (PUT), `getMyNotes`, `getAuthorNotes`, `deleteNote` (POST), `getNotesByCategory` (declared but unused elsewhere).
- `actionApi.toggleAction` — single toggle endpoint used for both like & collect (payload `{ noteId, type }`).
- `followApi.toggleFollow` — normalizes `followeeId` from an object or scalar.
- `designApi.saveDesign / getDesignList / getDesignDetail / deleteDesign`.
**Technologies:** Axios instance delegation, RESTful naming.
**Issues:** — `api/index.js` omits the AI chat/SSE endpoints (`/ai/chat`, `/ai/chat-with-image`, `/ai/upload-image`, `/ai/convert`) — those are hardcoded as `fetch` calls directly in `PineXiaoDouView.vue`, **bypassing** `request.js` interceptors. `collectionApi.getCollections`/`getLikes` use the action controller (`/action/...`) which is fine, just a naming mismatch. `noteApi.getNotesByCategory` is defined but never called.

---

### `src/utils/request.js` (Axios instance)
**Purpose:** Central axios configuration + interceptors.
**Feature logic:** `baseURL: '/api'`, `timeout: 120000`, `maxBodyLength`/`maxContentLength = Infinity`. Request interceptor injects the token as a **custom header `token`** (not `Authorization: Bearer`); deletes `Content-Type` when body is `FormData` (lets the browser set the boundary). Response interceptor unwraps `data.code === 200` → returns `data`; on `401` (excluding `/users/login`) clears `token`/`userInfo`, dispatches `showLoginModal`; other non-200 codes toast an error; honors `config.silent` to suppress toasts.
**Issues:** Non-enterprise patterns:
- Token sent via a **custom `token` header** instead of the standard `Authorization: Bearer` — fragile and more likely to trip CORS preflight on non-same-origin deployments.
- Magic numbers inlined: `200`, `401`, `120000`. Success code `200` and error codes are duplicated across every component/API module (a constant like `HTTP_OK = 200` is absent).
- The `showToast` helper duplicates `ElMessage` for success/error with nearly identical bodies.
- `config.url?.includes('/users/login')` — string matching to skip 401 handling, brittle.
- Hardcoded `baseURL: '/api'`; relies on Vite proxy in dev and nginx in prod (see §3).

---

### `src/utils/media.js`
**Purpose:** Media URL resolution + image JSON parsing + avatar fallback.
**Feature logic:** `resolveMediaUrl` returns `data:`/`http*` unchanged; prefixes `/`-paths with `API_BASE` (`import.meta.env.VITE_API_BASE || 'http://localhost:3000'`). `parseImagesJson` tolerates arrays/JSON strings. `DEFAULT_AVATAR` = elemecdn PNG; `formatAvatar` = `resolveMediaUrl(...) || DEFAULT_AVATAR`.
**Issues:** Uses env var name **`VITE_API_BASE`** — inconsistent with **`VITE_API_BASE_URL`** used in `PineXiaoDouView.vue` and `MyDesignsView.vue` (§3). No `.env*` file is committed in `pindou-front` (only `.vscode/.prettierrc/.editorconfig/...`), so this falls back to `http://localhost:3000` — which would be **wrong in production** if env vars aren't injected at build time.

---

### `src/utils/pindou.js` (Canvas pattern algorithm) — see §4
**Purpose:** Shared pindou (perler-bead) conversion engine used by `PindouDesigner.vue` and `PineXiaoDouView.vue`. Header comments describe a CIE-Lab ΔE color match, Floyd–Steinberg dithering, Gaussian denoise, Laplacian sharpen, and frequency×brightness×saturation color quantization, mirroring a backend `jimp` implementation.
**Relevant exports:** `PINDOU_COLORS` (Perler palette), `rgbToLab`, `findNearestColor`, `getBrightness`, `applyGaussianBlur`, `applyEdgeEnhance`, `applyDithering`, `quantizeColors`, `calculateSimilarity`, `convertImageToPindou`, `drawPatternToCanvas`, `downloadDesign`, `downloadPattern`, `serializePixels`, `deserializePixels`, plus a default export object listing them all.

---

### `src/store/auth.js` (LEGACY, MODULE-STYLE) vs `src/stores/user.js` (PINIA) — see §5
Both files exist. The analysis in §5 establishes that `store/auth.js` is **dead code**.

---

### `src/stores/user.js` (Pinia)
**Purpose:** Central auth store (setup-style Pinia store). Holds `token`, `userInfo`, `showLoginModal`, `isLoggedIn` computed, and actions `login/logout/setUserInfo/openLogin/closeLogin/requireLogin`.
**Feature logic:** `login()` calls `userApi.login`, checks `res.code !== 200`, persists token+user to `localStorage`, dispatches `loginSuccess`/`userInfoUpdated` window events. `setUserInfo` refreshes & broadcasts `userInfoUpdated`. `logout` clears storage and dispatches `logoutSuccess`. `requireLogin` opens the modal if not logged in.
**Technologies:** Pinia setup-store, `ref`/`computed`, broadcast events for legacy components.
**Issues:** `isLoggedIn = computed(() => Boolean(token && userInfo))` — the store is **mostly unused**: only `router/index.js` calls `useUserStore()` (to `openLogin()` and read `isLoggedIn`). No view/component uses the store's user data or actions directly; they instead re-read `localStorage` (`SideBar`, `HomeView`, `NoteDetailCard`, `ChatWindow`, etc.). So the store is half-adopted.

---

### `src/composables/useUnreadBadges.js`
**Purpose:** Shared, `Module`-scope reactive unread counters + a listeners helper for the sidebar badges.
**Feature logic:** `unreadNoticeCount` / `unreadMessageCount` are module-level `ref`s (not per-component). `refreshUnreadBadges()` reads `localStorage.token`; if present, `Promise.all` of `noticeApi.getUnreadCount` + `messageApi.getUnreadCount` with `{ silent: true }`, defaulting to 0 on failure. `setupUnreadBadgeListeners()` subscribes to `loginSuccess` + `refreshUnreadBadges` window events and returns a cleanup.
**Issues:** Module-level mutable singleton state (works but not idiomatic; components mutate these refs directly e.g. `SideBar` sets them to 0). Not a Pinia store despite being app-wide state. Two `refreshUnreadBadges` "events" share the same string as the function name, which is confusing.

---

### `src/constants/auth.js`
**Purpose:** Route login whitelist/blacklist helpers.
**Feature logic:** `PUBLIC_ROUTES = ['/', '/designer']`, `NEED_LOGIN_ROUTES = ['/user','/publish','/notice','/message','/draft','/collection','/pine-xiaodou']`, `routeNeedsLogin(path)` returns whether a path needs login by prefix matching.
**Issues:** This is a **second, independent login-gating system** that conflicts with the router's `meta.needLogin`. Only `SideBar.vue` consumes it. Conflicts:
- `NEED_LOGIN_ROUTES` lists `/draft` as needing login, but the router's `meta.needLogin` for `/draft` is `false`.
- `NEED_LOGIN_ROUTES` lists `/pine-xiaodou`, but the router marks it `needLogin: false` (public).
- `NEED_LOGIN_ROUTES` lists `/collection`, but **no such route exists**.
- `PUBLIC_ROUTES` only lists `/` and `/designer`, so paths like `/user/:id` (public in router) and `/designs` etc. would be treated as needing login by `routeNeedsLogin` unless prefixed differently.

---

### `src/router/index.js`
**Purpose:** Routes + global navigation guard.
**Feature logic:** 10 routes under `Layout`. `beforeEach`: `useUserStore()` login check against `to.matched.some(record => record.meta?.needLogin)`; sets `document.title` = `${to.meta.title} · 拼豆`; if login required and not authenticated, `store.openLogin()`, sets `localStorage.redirectAfterLogin = to.fullPath`, redirects to `/`.
**Issues:** Mixes concerns with the `constants/auth.js` gating (two systems). `redirectAfterLogin` is a global localStorage key that several components write/read (SideBar, HomeView, NoteDetailCard, LoginCard) — easy to collide. Uses `next()` callback style rather than returning values (works, but modern Vue Router prefers returning values).

---

### `src/main.js`
**Purpose:** App bootstrap.
**Feature logic:** Creates app, installs Pinia, router, ElementPlus; globally registers every Element Plus icon via `Object.entries(ElementPlusIconsVue)`; mounts `#app`; imports `./style.css`.
**Issues:** Double-registration of Element Plus components — `app.use(ElementPlus)` (full import, all CSS already `import 'element-plus/dist/index.css'`) AND `unplugin-auto-import`/`unplugin-vue-components` (`ElementPlusResolver`) in `vite.config.js`. This is redundant and slightly undermines the claimed tree-shaking of the resolver. (Not a runtime bug, just messy.)

---

### `src/App.vue`
**Purpose:** Root component.
**Feature logic:** Renders only `<RouterView />`.
**Issues:** None (minimal). Note: the login modal card (`LoginCard`) and pattern dialogs are `Teleport`ed from children, not mounted here.

---

### `src/components/Header.vue` — ORPHAN / STUB
**Purpose:** Intended top header; only renders static `<el-header>Header</el-header>`.
**Issues:** **Never imported** anywhere. It is dead/stub code. Its `<style>` selector `.layout-container` references a class that does not exist in its template. The actual header/sidebar is implemented in `Layout.vue` + `SideBar.vue`.

---

### `src/components/Layout.vue`
**Purpose:** App shell: fixed `SideBar` + header (search box) + content area (router-view).
**Feature logic:** Search history stored under `localStorage['pindou-search-history']` (max 8, deduped). `showSearch` only on `/`. `handleSearch` pushes `/ ?q=keyword` and saves history. Enter triggers search; history panel shows on focus; transparent dropdown. `header` and `main` are Element Plus components. Content transition `page-fade`.
**Issues:** Non-enterprise: search is only a **visual filter** — `HomeView` re-fetches the *full* list and filters **client-side** by keyword, rather than a server search. History store is ad-hoc. Hardcoded breakpoints `max-width:900px / 700px`. Magic layout `margin-left:210px` tightly coupled to `SideBar` width.

---

### `src/components/SideBar.vue`
**Purpose:** Left nav with brand, menu items, login/avatar, unread badges, logout, and the `LoginCard` teleport.
**Feature logic:** Builds menu from `router.options.routes[0].children`, filtering `path !== 'user' && meta.icon`. Uses `routeNeedsLogin` (constants/auth) to gate clicks — opens login if needed. Reads login state from `localStorage` directly (not the Pinia store). Unread badge dot is shown via `hasBadge` (notice/message counts from `useUnreadBadges`). On `/message` click it clears the message badge. Login-success redirects to `redirectAfterLogin` or `/`. Logout clears local state and unread counts. Badge refresh on focus/visibility + 30s interval; also listens to `showLoginModal`, `userInfoUpdated`, `loginSuccess`.
**Issues:** Manages its own login state from `localStorage` instead of the Pinia store. Duplicated `selectMenu` and `handleMenuSelect` functions with identical logic. Both `menuItems` (path !== 'user') and meta-based filters can include/exclude routes inconsistently. `@mousedown.prevent` on history items in `Layout`, but here `@click`. The menu is derived from router children, so `UserProfile` (`user/:id`) and `designs` are auto-included/excluded by the `meta.icon` filter, which is implicit/fragile.

---

### `src/components/LoginCard.vue`
**Purpose:** Login modal card (username+password, agreement checkbox, QR placeholder).
**Feature logic:** Validates username/password + agreement; calls `userApi.login`, writes `token`/`userInfo` to `localStorage`, shows a toast, emits `login-success` and `close`. Broadcasts nothing itself (the parent `SideBar.handleLoginSuccess` dispatches `loginSuccess`).
**Issues:** Duplicates the auth logic that also lives in `stores/user.js.login()` (which writes storage + `formatAvatar` + dispatches events). The store's login is effectively bypassed here. Includes an inline toast overlay **and** ElMessage (redundant). Notice this writes `user.avatar` via `formatAvatar` but does **not** dispatch `userInfoUpdated` (only the parent sets state). Placeholder QR is a styled empty div (decorative). The "user agreement / privacy" links are `href="#"` (no handlers).

---

### `src/components/AuthorCard.vue`
**Purpose:** Pop-up author profile card (Teleport), with stats + works grid + follow toggle.
**Feature logic:** On `show`/`authorId` change, `Promise.all([getAuthorInfo, getAuthorNotes])`. `pindouId` is computed as `(10000000 + id).toString()` (8-digit display). Follow uses **optimistic update** then reconciles with `followApi.toggleFollow({ followeeId })`. Emits `follow-change` for parent to sync. `openDetailModal` emits `openNote`.
**Issues:** **Large dead code blocks**: two fully commented-out functions (`getAuthorInfo`, `getAuthorNotes`, `toggleFollow`) are left in file (lines ~50-174). `DEFAULT_COVER` = hardcoded unsplash URL. The comment says "品豆号为8位数" but `10000000 + id` yields values like `10000001` (bug note: user 1 → "10000001" which is 8 digits but starting with 1; a 2-digit id like 42 → "10000042"). Multiple `console.log` debug statements left in. It uses `Teleport` + custom overlay rather than an Element Plus `el-dialog`.

---

### `src/components/ChatWindow.vue`
**Purpose:** One-on-one chat window (message list + input).
**Feature logic:** Fetches chat via `messageApi.getChat`, groups messages by day (`messageGroups`), optimistic-sends (temp id `temp-${Date.now()}`, `sending` flag), replaces the temp message on success, rolls back on failure. Polls every 30s (`silent` incremental merge using `existingIds` Set) when `document.visibilityState === 'visible'`. Auto-scrolls to bottom. Emits `read` / `conversation-read` to update unread state; dispatches `refreshUnreadBadges`/`refreshConversations`. Clicking the other user's avatar navigates to `/user/:id`.
**Issues:** Header shows a permanent "online" dot that is not backed by any presence data (static). Reads current user id/avatar from `localStorage` directly. Uses `@keyup.enter` on an `<input>` (no textarea / shift-enter). Server time comparisons rely on `new Date(...)` coherence. No message length limit, no websocket (pure 30s polling — a scalability concern).

---

### `src/components/ConversationList.vue`
**Purpose:** Conversation sidebar list.
**Feature logic:** Fetches conversations, formats time (today HH:mm / 昨天 / M-D / YYYY-M-D), shows unread badges (99+ cap). Emits `select` and `unread-change`. Listener for `refreshConversations` event.
**Issues:** **Its `formatAvatar` is a hardcoded `'http://localhost:3000'`** (line 55) — duplicates media URL logic and ignores the env-driven base used by `utils/media.js`. This is the exact kind of inconsistency flagged. No empty-state error retry.

---

### `src/components/NoteDetailCard.vue` (largest component, ~2160 lines)
**Purpose:** Note detail modal (image/video carousel, comments with replies, @ mentions, like/collect, edit/delete, save-image context menu).
**Feature logic:**
- Fetches `noteApi.getNotesDetail`, merges detail with passed `noteData` via `applyNoteDetail` (partial merge so it doesn't wipe fields).
- Comment tree: fetches comments, builds `byId` map, nests replies, then **flattens** all reply levels under the root (xhs-style), sorted by time. `totalCommentCount` = root + all replies.
- Reply collapse: `MAX_VISIBLE_REPLIES = 2`; `visibleReplies` and `toggleReplies`.
- `@` mention: opens a picker of "mutual follow" (intersection of follows & fans) with fallback to follows; inserts `@name` and stores mention id.
- Like/collect: **optimistic** update with rollback on success-vs-failure; emits `note-state-change` with a large payload to sync the parent card.
- Comment like: optimistic toggle via `commentApi.likeComment`.
- Delete note via `ElMessageBox.confirm`.
- Edit note: writes `localStorage.editingNote`, emits `edited`, closes (PublishView picks it up).
- Image right-click context menu → `downloadCurrentImage` (fetch-as-blob then download; fallback opens URL).
- `currentUserId` decoded from the **JWT payload** via `atob(token.split('.')[1]...)` (manual JWT decode).
**Issues:** Very large mixed-style file. Lots of `console.log` debug statements (lines ~180-215 in `fetchNoteDetail`). `formatTime`, `normalizeBoolean` redefined here (duplicated in UserCenter/HomeView/UserProfile). Manual JWT base64 decode in the front end is frague and not a real auth mechanism. The `note-state-change` emit payload is a very long object literal, rebuilt identically in multiple places (like & collect). `resolveMediaUrl`/`formatAvatar` pulled from media.js (good). `images` computed maps through `resolveMediaUrl`. The `noteVideoUrl` logic duplicates between components. The `thumbnails`, `comment-input-section`, `action-bar`, `follow-btn`, `.more-btn` CSS are dead/unused selectors. Duplicated `.send-btn`/`.comment-input` rules.

---

### `src/components/PindouPatternViewer.vue`
**Purpose:** Renders a generated pindou design: original image, thumbnail canvas, zoomable/pannable grid canvas, color palette, stats, and action buttons (download / save / publish / regenerate).
**Feature logic:** Two canvases: `updateThumbnail` (1px-per-cell) and `drawGrid` via `drawPatternToCanvas`. Zoom in/out (0.3–3, step .25) and mouse-wheel zoom centered at cursor; drag-to-pan; fullscreen via Fullscreen API. Downstream `handleDownloadDesign`→`downloadDesign`, `handleDownloadPattern`→`downloadPattern(result, gridWidth)`. Emits `save/publish/regenerate`.
**Issues:** `defineExpose({ drawGrid, updateThumbnail })` but telemetry not used by parents. `handleWheel` uses `@wheel.prevent` on the wrapper — makes browser page scroll impossible over the grid (UX choice). `image-rendering: pixelated; crisp-edges` (the `crisp-edges` is a non-standard alias). Canvas scaling is done via CSS transform on `.canvas-container`, not DPR-aware.

---

### `src/components/XhsIcon.vue`
**Purpose:** Reusable inline SVG icons (like/collect/comment/share) mirroring the xhs aesthetics.
**Feature logic:** `name` prop switches between `<path>` variants; `filled`/`size` props.
**Issues:** Intentionally used in `HomeView` **without an explicit import** (relies on `unplugin-vue-components` auto-import), while `UserCenter.vue` imports it explicitly — inconsistent registration pattern.

---

### `src/views/HomeView.vue` — see §6
**Purpose:** Home feed (#) (waterfall notes + search + infinite scroll).
**Feature logic:** Cursor pagination, client-side search filter, skeleton loading, like/collect optimistic updates, waterfall with video first-frame cover, NoteDetailCard integration.
**Issues:** detailed in §6.

---

### `src/views/PublishView.vue`
**Purpose:** Publish a note (title/content/topics/images/video) and save-as-draft.
**Feature logic:**
- Image upload: `browser-image-compression` (max 0.3MB / 1200px, web worker, JPEG q0.8) when file >200KB, then a Canvas "grid overlay" pass (re-encodes to JPEG 0.92) and `FileReader`→dataURL. Max 9 images, skip >10MB.
- Video upload: validates type (mp4/webm/ogg/mov) and ≤200MB, posts via FormData to `noteApi.uploadVideo`, stores returned URL.
- Topics: comma-joined into `category` and shown as `#tag`.
- Draft/publish: builds a single `FormData` mixing `existingImagePaths` (strings) + `fileList` (File objects) for the `images` field. `saveDraft` posts to `/draft/save`; `publishNote` posts to `/notes/publish` (or `PUT /notes/:id` change for an `editingNote`). On publish it deletes an associated draft (`publishingDraftId`).
- On mount: loads `localStorage.editingDraft` / `editingNote` to prefill; if `pindouPublishImage` dataURL exists (from the designer/AI "publish as note" flow), converts dataURL→Blob→File and prefills title/content.
**Issues:** `drawGridOverlay` is named misleadingly (it only does a small canvas re-encode / no actual grid). Extensive `console.log`. The `fileList`/`existingImagePaths` duality is brittle (order matters; a removed image splices both arrays by index and can misalign). `canPublish` relies on `form`/`images`/`videoUrl` but no server-side validation. On publish/edit errors it only `console.error`s and does **not** show a message to the user. `MAX_VIDEO_SIZE_MB` and `10MB` image limit are inline magic numbers. `editingNote` and `editingDraft` and `pindouPublishImage` are global localStorage convention keys shared with other views.

---

### `src/views/PindouDesigner.vue`
**Purpose:** Standalone local pindou-pattern generator (upload image → convert → view/save/publish).
**Feature logic:** Upload via click/dragdrop (dataURL), choose grid size (16/24/32/48/52/64/86/128) and color count (4/6/8/12/24/32/58/88/131/292), advanced toggles (edgeEnhance/denoise/dithering/brightnessBoost defaults: true/true/false/true). `generatePindou` calls `convertImageToPindou`, switches to `result` tab. `saveDesign` and `publishDesign` serialize pixels and render a PNG preview; publish stores it under `pindouPublishImage` and routes to `/publish`.
**Issues:** Uses an Element Plus `<select>` (native select, not `el-select`). The `colorOptions` and `gridOptions` duplicate the arrays in `PineXiaoDouView.vue` and the `PINDOU_COLORS` length (~292), i.e., a magic `292` option which is the palette size. No image dimension cap before conversion (a huge image may prove heavy). `renderPatternImage` uses hardcoded `pixelSize:18, labelSize:28` (duplicated in PindouPatternViewer defaults and PineXiaoDouView).

---

### `src/views/PineXiaoDouView.vue` (AI chat) — see §7
**Purpose:** "拼小豆" AI chat (analyze / text-to-image / image-to-image), with SSE streaming, image upload, and a one-click "convert to pindou" dialog that routes to either the local Canvas engine or the server `jimp` engine.
**Feature logic:** See §7.

---

### `src/views/MessageView.vue`
**Purpose:** Message page: conversation list + chat window.
**Feature logic:** Renders `ConversationList` (left) + `ChatWindow` (right, when a conversation is selected). `clearAllUnread` posts `/messages/unread/clear`. On mount/unmount toggles `document.body.classList` `message-view-active`. Refreshes unread state.
**Issues:** `selectConversation` only sets `selectedId`; the `ConversationList.selectConversation` also fetches conversations and refreshes badges (some redundant work). Managing a body class for layout is a global side effect.

---

### `src/views/NoticeView.vue`
**Purpose:** Notifications page with tabs (评论和@ / 赞和收藏 / 新增关注).
**Feature logic:** `fetchNotices` → `getNoticeList`, then `applyFollowState` marks follow notices with current follow status. Tabs filter by `type` (`comment`/`mention`, `like`/`collect`, `follow`). Inline reply (`startReply`/`sendReply` → `commentApi.addComment` with `replyTo`). Like a notice's comment (`commentApi.likeComment`) with optimistic toggle. Follow/unfollow inline. Clicking a notice marks it read; if it's a follow it navigates to `/user/:id`; if it has a `note_id` it opens the `NoteDetailCard` with `initialCommentId`. `markAllAsRead` posts `/notice/readall`.
**Issues:** `unreadCount` computed counts unread in the **currently loaded** list (server may paginate). No server pagination (single fetch of `res.list`). `notice.followed` only set for follow-type notices. `from_user_id` / `from_avatar` naming assumes server shape. `selectedCommentId = Number(notice.comment_id || 0) || null` — ambiguous 0/null handling; if comment_id is a valid falsy case it drops to null.

---

### `src/views/DraftView.vue`
**Purpose:** "My drafts" listing (edit / publish / delete).
**Feature logic:** `getDraftList`, shows cover (video first-frame or first image), title/content preview, topics. `editDraft` writes `localStorage.editingDraft` and routes to `/publish`. `publishDraft` calls `/draft/publish/:id`; `deleteDraft` confirms via `ElMessageBox`.
**Issues:** Full of `console.log` debug statements (lines 86-92). `formatTime` only shows date (no time). `publishingDraftId` is a cross-component storage key with no producer here (set in PublishView). No pagination. `DEFAULT_COVER` hardcoded unsplash.

---

### `src/views/MyDesignsView.vue`
**Purpose:** Saved pindou designs grid with detail dialog and publish/delete.
**Feature logic:** Paginated `getDesignList({ page, pageSize:12 })`, `hasMore = page < totalPages`. `openDetail` deserializes pixels (`deserializePixels` with palette) and opens a `PindouPatternViewer`. `publishDesign` renders the pattern to PNG, stores `pindouPublishImage`, routes to `/publish`. `deleteDesign` confirms.
**Issues:** **Defines its own local `resolveMediaUrl` (lines 95-103) that hardcodes `'http://localhost:3000'`** and reads `VITE_API_BASE_URL` — same duplication/inconsistency as ConversationList and PineXiaoDouView, and it does **not** use `utils/media.js`. `detailResult` relies on the design fields being present; missing `palette` → `[]`, and `deserializePixels` with an empty palette falls back to the global `colorCodeMap` only for known codes, so unknown codes render white. The pagination assumes `res.data.pagination.totalPages` (server shape specific).

---

### `src/views/UserCenter.vue`
**Purpose:** "My" personal center (profile, avatar, signature, edit profile, notes/collections/likes/follows/fans tabs).
**Feature logic:** Loads user info, stats, notes/collections/likes/follows/fans in parallel. `syncNoteStates` merges like/collect status across the three lists. `refreshStats` recomputes works + likes from notes. Avatar upload (`/users/avatar`), signature editing (`/users/signature`), edit-profile modal (`/users/edit` + `/users/changepwd`). Tabs switch content; list reload on tab change. Detail modal via `NoteDetailCard`.
**Issues:** `toggleCollect` uses `type:'collection'` (line 454) whereas `HomeView` uses `type:'collect'` — **an inconsistent action type string for the same endpoint** (likely a real bug: one of them mismatches the backend enum). `goToDetail` pushes `/note/:id` which **does not exist** in the router (would hit the catch-all redirect to `/`); broken/dead. `console.log` debug statements (lines 105/113). `mapNoteItem`, `normalizeBoolean`, `formatNumber` duplicated from HomeView/NoteDetailCard. The "赞过" tab shows an unread-message badge (`unreadMessageCount`) which is odd/wrong (message count on the likes tab). `stats.likes` = sum of likes+collects of my notes (naming: "获赞与收藏"). No pagination on any tab list.

---

### `src/views/UserProfile.vue`
**Purpose:** Another user's public profile + their notes.
**Feature logic:** `getOtherUserInfo(userId)`, stats (`works/following/followers/likes`), follow toggle (`followApi.toggleFollow(userId)`). `fetchNotes` via `getAuthorNotes`. Note waterfall with video first-frame covers.
**Issues:** Simpler/cleaner than AuthorCard, but duplicates `mapNote`, `normalizeBoolean`, `formatNumber`, `holdFirstFrame`, cover fallback, and `formatAvatar` logic. The tab bar is static (only "笔记" tab). No pagination on notes. `stats.fans` mutated directly on follow toggle (client-side, may drift). `isSelf` computed from localStorage each call.

---

## 3. API Base URL + Auth Token Injection

There are **three independent mechanisms** for resolving the backend base, plus a proxy:

| Location | Base resolution | Env var | Token |
|---|---|---|---|
| `utils/request.js` | `baseURL: '/api'` | none | custom `token` header |
| Vite dev proxy | `/api` → `http://localhost:3000` | — | — |
| `utils/media.js` | `import.meta.env.VITE_API_BASE || 'http://localhost:3000'` | **`VITE_API_BASE`** | — |
| `PineXiaoDouView.vue` | `VITE_API_BASE_URL`, stripped trailing `/`, fallback `http://localhost:3000` | **`VITE_API_BASE_URL`** | **`token`** custom header (raw `fetch`) |
| `MyDesignsView.vue` | `VITE_API_BASE_URL || 'http://localhost:3000'` | **`VITE_API_BASE_URL`** | — |
| `ConversationList.vue` (local `formatAvatar`) | **hardcoded `http://localhost:3000`** | none | — |
| `AuthorCard.vue` | legacy `formatAvatar`/`resolveMediaUrl` from media.js | `VITE_API_BASE` | — |

**Findings:**
- **Env var name inconsistency:** `media.js` uses `VITE_API_BASE`; `PineXiaoDouView.vue` and `MyDesignsView.vue` use `VITE_API_BASE_URL`. No `.env*` file is checked in, so both fall back to `http://localhost:3000`. In production this default breaks relative media URLs and server-based AI pattern conversion unless env vars are injected at build time.
- **Hardcoded localhost duplication:** `ConversationList.vue:55` and `MyDesignsView.vue:95-103` hardcode `http://localhost:3000` for avatar/cover URL resolution instead of using `utils/media.js`.
- **Token header not `Authorization`:** All API calls (axios via request.js and raw `fetch` in PineXiaoDouView) send the token as a custom header named `token`. This is consistent internally but non-standard and preflights CORS on cross-origin deployments. The AI raw `fetch` calls add `token` manually; `request.js` adds it via interceptor. Note the AI `fetch` calls to `/api/ai/...` **bypass** the axios `401` handling and error toasting.
- **Two proxies/URLs coexist:** axios uses `/api` + Vite proxy; raw fetch also uses `/api`. So they align in dev. But `media.js`/`ConversationList`/`MyDesignsView` construct absolute `http://localhost:3000/uploads/...` URLs — meaning media is loaded **directly** from the backend origin, bypassing the `/api` proxy, which in production must be reachable at the same host.

---

## 4. Pindou Pattern Algorithm (`utils/pindou.js`)

Header describes (interview-ready) semantics: CIE-Lab ΔE color matching, Floyd–Steinberg dithering, 3×3 Gaussian denoise, Laplacian sharpen, and frequency×brightness×saturation color quantization. The engine is pure-browser with the Canvas API and is documented as mirroring a backend `jimp` implementation.

**Functions & their logic:**
- **`PINDOU_COLORS`** — Perler-style palette array of `{ name, code, rgb }` (namespaces A1..A26, B1..B32, C1..C29, D1..D26, E1..E24, F1..F25, G1..G21, H1..H23, M1..M15, P1..P23, Q1..Q5, R1..R28, T1, Y1..Y5, ZG1..ZG8) ≈ 292 entries.
- **`rgbToLab(rgb)`** — standard sRGB→linear→XYZ→LAB transform (D65, ref X/Y/Z 95.047/100/108.883).
- **`findNearestColor(rgb)`** — iterates the palette, computes CIE-Lab ΔE (`sqrt(ΔL²+Δa²+Δb²)`), applies brightness-based distance penalties (avoids mapping bright pixels to very dark/very light beads), returns `{ ...color, distance }`.
- **`getBrightness(hexColor)`** — perceptual luminance `(299r+587g+114b)/1000`.
- **`applyGaussianBlur(ctx,w,h)`** — separable-less 3×3 kernel `[1,2,1,2,4,2,1,2,1]/16`, fills non-edge pixels on `ImageData`.
- **`applyEdgeEnhance(ctx,w,h)`** — Laplacian kernel `[0,-1,0,-1,5,-1,0,-1,0]`, clamps to 0..255.
- **`applyDithering(ctx,w,h)`** — Floyd–Steinberg on `ImageData`, using `findNearestColor`, distributing error `7/16,3/16,5/16,1/16`.
- **`quantizeColors(pixels, maxColors, preferBright)`** — counts each code, scores `count × (1 + brightness/255*0.8) × (1 + saturation/255*0.5)`, keeps top `maxColors`, then remaps **every** palette color to the nearest kept color (Lab distance, with a brightness bias). Returns remapped pixels.
- **`calculateSimilarity(originalPixels, pindouPixels)`** — average ΔE then `max(0,min(100, round(100 - avgΔE/12*100)))`.
- **`convertImageToPindou(imageSrc, size, options)`** — loads image (crossOrigin Anonymous), computes `gridWidth/gridHeight` preserving aspect (min 8), processes at ≥128 for smoothing, applies brightnessBoost (×1.08), optional denoise/edgeEnhance, then downsamples to the grid, optional dithering, builds `pixels` (nearest color; alpha<128 → white T1), optional quantization, computes palette + similarity, resolves `{ pixels, colorPalette, totalPixels, colorCount, estimatedTime:'${round(pixels/400)}小时', originalImage, similarity, gridWidth, gridHeight }`.
- **`drawPatternToCanvas(canvas, result, {pixelSize=18,labelSize=28})`** — draws each bead as a filled square + color-code label (label text color by brightness), adds grid lines and row/col numbers.
- **`downloadDesign(result, {...})`** — draws the full design plus a color-palette swatch grid and stats, then downloads as PNG via `canvas.toDataURL`.
- **`downloadPattern(result, gridSize=24)`** — draws a "sticker" grid of filled circles with coordinates, downloads PNG.
- **`serializePixels` / `deserializePixels`** — flatten pixels to a comma-joined code string and reconstruct (with palette, falling back to `colorCodeMap`).

**Issues / non-enterprise-grade in this module:**
- Magical dimensionless constants: `size` default 24/48/52, `.8`/`.95`/`.5` biases, `estimatedTime` divisor `400` ("小时" always — claims a 64×64 grid is ~10 hours, which is plainly wrong for real-time estimates), `12` in similarity divisor.
- Memory: `applyDithering` copies the whole `ImageData` into `tempData` and runs `findNearestColor` per pixel inside a double loop — O(gridW×gridH×palette) with repeated `rgbToLab` calls; for a 128 grid × 292 palette this is heavy but bounded.
- `quantizeColors` builds a full-palette→palette `mapping` and yields remapped codes; the `.8` weighting on the L* channel is an unexplained magic factor.
- `convertImageToPindou` uses `Math.round(size/imgRatio)` — can produce `gridHeight` that is ratio-broken; min-clamps to 8.
- `downloadDesign`/`downloadPattern` construct an `<a>` and `.click()` without appending then removing it, and never revoke object URLs (for dataURL it's fine).
- `PINDOU_COLORS` is a large static array — the `292` color option in PindouDesigner/PineXiaoDou hardcodes the length as a magic number.

---

## 5. Duplicate Auth Stores: `store/auth.js` (legacy) vs `stores/user.js` (Pinia)

**`src/store/auth.js`** (module-style, 62 lines): exports `isLoggedIn`, `userInfo`, `showLoginModal`, `needLoginRoutes`, `checkLogin`, `loginSuccess`, `logout`, `openLoginModal`, `closeLoginModal`, `requireLogin`.

**`src/stores/user.js`** (Pinia setup store): `useUserStore` with `token`, `userInfo`, `showLoginModal`, `isLoggedIn`, `login`, `logout`, `setUserInfo`, `openLogin`, `closeLogin`, `requireLogin`.

**References:**
- **`store/auth.js` is not imported anywhere.** A grep for `store/auth`, `@/store/auth`, `../store/auth`, and for its unique export names (`needLoginRoutes`, `openLoginModal`, `closeLoginModal`, and the legacy `checkLogin` binding) found **zero importers**. Its `showLoginModal`/`checkLogin`/`userInfo` names appear in many files, but all of those are **locals defined inside each file** (e.g., `HomeView.checkLogin`, `NoteDetailCard.checkLogin`, `SideBar`'s own `loginStatus`), or the Pinia store. **Conclusion: `store/auth.js` is dead code** and should be removed.
- **`stores/user.js`** is imported by `router/index.js` (`useUserStore()`) — the only consumer. No component/view reads user data from the store; they read `localStorage` directly.
- There is therefore a **three-way** auth pattern: (a) dead legacy module, (b) a mostly-idle Pinia store, (c) direct `localStorage` reads + window-event broadcasting (`showLoginModal`, `loginSuccess`, `userInfoUpdated`, `logoutSuccess`) used by SideBar/HomeView/NoteDetailCard/ChatWindow/LoginCard/etc.

**Recommendation:** Remove `store/auth.js`. Either fully adopt the Pinia store across components or drop it and centralize on `localStorage` + a composable.

---

## 6. Home Feed: Cursor Pagination, Infinite Scroll, Lazy Load, Optimistic Updates

**Cursor pagination (`HomeView.fetchNotes`):** `page`, `pageSize(15)`, `cursor` refs. Request params `{ pageSize: 15, ...(cursor ? { cursor } : {}) }`. On response, `cursor.value = notesRes.nextCursor`; `hasMore = isSearchMode ? false : Boolean(notesRes.hasMore)`. `page` is still incremented on `loadMore` even though pagination is cursor-based (the page counter is vestigial). `notes` de-duped on append via `existingIds`. Note: `notesRes.hasMore` (not `hasMore` from a next_cursor presence) — depends on backend contract.

**Infinite scroll throttling:** `onWindowScroll` scroll listener (passive) with a **200ms** `setTimeout` throttle; triggers when `scrollTop + innerHeight >= scrollHeight - 600`. Guarded by `!isSearchMode`. There's also an explicit "加载更多" button.

**Image lazy load:** `<img loading="lazy">` on card covers; video covers use an `autoplay`/`muted`/`playsinline` `<video>` with `@loadeddata` → `holdFirstFrame` (pause + set `currentTime = 0.01`) to freeze the first frame, and `preload="auto"`. Fallback cover = hardcoded unsplash URL; `handleImageError` swaps to the same unsplash URL.

**Like/collect optimistic updates:** `toggleLike`/`toggleCollect` set local `liked`/`collected` + counts immediately, push `.animatingLike/.animatingCollect`, then on `actionApi.toggleAction` success reconcile with `isActive`/`count`; on failure/exception roll back. Also sets `localStorage.pendingAction` if not logged in, then the `loginSuccess` handler replays it.

**Search:** `searchKeyword` from `route.query.q`. When searching, `fetchNotes` still fetches the **full list** with pagination disabled (`hasMore=false`), and `filteredNotes` does a **client-side** substring match on title/description/authorName; `highlightText` wraps matches (`<mark class="search-highlight">`). This is a local filter, not a server search.

**Other:** `columnCount` ref is only used for the skeleton; real layout uses CSS `columns` in `.waterfall`. Five column breakpoints. `mapNoteItem` includes a **random `height: 280 + Math.random()*100`** that is never used by the CSS-columns layout (dead field). `pageSize` ref default 15 is hardcoded in two places (ref and `listParams`).

**Issues:** Cursor pagination mixed with a stale `page` counter. Duplicate `watch(() => route.query.authorId, ...)` blocks (two identical watchers). Random `height` field is unused/dead. Search is client-side (won't scale). No debounce on the search input (search re-runs `fetchNotes` on every keyword change, i.e., every keystroke). `handleLoginSuccess` replays `pendingAction` but doesn't await a refresh cleanly. `followedAuthorIds` re-fetched on every page load without caching.

---

## 7. AI Chat (`PineXiaoDouView.vue` + `ChatWindow.vue`)

**Note:** `PineXiaoDouView.vue` is the AI chat ("拼小豆"). `ChatWindow.vue` is the **human–human** messaging chat (different feature; already covered in §2).

**SSE streaming (`readSSEStream`):** Reads `response.body.getReader()`, decodes with `TextDecoder('utf-8',{stream:true})`, buffers lines, splits on `\n`, groups consecutive `data:` lines into a payload, JSON.parses it. Handles message types:
- `type==='image'` → set `assistantMessage.content`/`imageUrl`, clear `imageUrls`, trigger typing.
- `type==='content'` → append `extractAssistantContent(data.content)` (string / array-of-{text,content} / object .content/.text) to `content`.
- `type==='error'` → throw.
- `[DONE]` payloads are ignored.
Uses `fetch('/api/ai/chat')` (text) or `fetch('/api/ai/chat-with-image')` (with `images`, `prompt`, `mode`). Both set `Content-Type: application/json` and a custom `token` header when auth exists. Error handling: non-OK → try `response.json()?.msg`, else generic.

**Typing effect (typewriter):** `ensureTyping` copies `msg.content` into `msg.displayContent` one char at a time at `charDelay=24ms`, calling `scrollToBottom` per tick; `flushCurrentTyping` force-completes the last assistant message before a new send; `stopTypeTimer` clears the timer.

**Task modes:** `analyze` (图/像分析), `generate` (文生图), `edit` (图生图). `edit` requires ≥1 uploaded image; content capped at 500 chars.

**Image upload:** `handleImageUpload` validates ≤5 files, allowed types (jpg/png/gif/webp), ≤10MB; posts `FormData` to `/api/ai/upload-image`; on success sets `pendingImageUrls`. There's also an unused `sendMessageWithImages` (dead code) that duplicates the send logic.

**Local + server history:** History persisted in `localStorage['pinexiaodou_chat_history_${userId}']` (guest when no user). `loadHistoryFromServer` fetches `/api/ai/history` and `mergeServerHistory` maps/normalizes. `persistHistoryToServer` POSTs `/api/ai/history/sync` with the serialized messages (only if token). `clearChatHistory` POSTs `/api/ai/history/clear` (token header) then clears local.

**Convert-to-pattern integration:**
- `sendMessage` / SSE produce assistant messages with `imageUrl` (AI-generated) or user uploaded `imageUrls`.
- Each user image / AI image has a "转图纸"/"转拼豆图纸" button → `openPatternDialog(imgUrl)`.
- `convertForPattern` decides engine: `isRemoteSource(url)` = remote non-same-origin (`https?` and not starting with `getApiBaseUrl()`) → calls **server** `/api/ai/convert` (jimp); otherwise → local `convertImageToPindou` (Canvas). Server result pixels get `label`/`name` backfilled so both engines look the same.
- The dialog (`patternDialogVisible`) hosts `PindouPatternViewer` with grid/color selects that re-run `convertForPattern` on change; shows "服务端引擎/本地引擎" badge.
- `savePatternDesign` → `designApi.saveDesign` (requires login, else shows login modal). `publishPatternDesign` renders to PNG → `pindouPublishImage` → `/publish`.

**Issues / non-enterprise patterns:**
- **Raw `fetch` everywhere for `/api/ai/*`** — bypasses the axios instance/interceptors (no unified 401 handling, no silent-toast logic). Token attached ad hoc.
- **Hardcoded `/api` prefix + `localhost:3000` fallback** in `getApiBaseUrl`, and a **local `resolveMediaUrl`** that only prefixes `/uploads/` (differs from `utils/media.js`).
- **Dead code:** `sendMessageWithImages` defined but never referenced. `normalizeMessage` handles `image_urls` as string/array but `serializeMessage` drops the mode field.
- **Method naming mismatch:** Image upload `fetch` returns `result.code===200 && result.data.images.length` — but `aiApi.uploadImage` (in api/index.js) is never used (dead wrapper).
- Magic numbers: `500` char cap, `24`ms delay, `5` images, `10`MB, `320`ms scroll fallback, `48` gridSize, `14` labelSize for the grid-overlay download (`downloadImage`).
- `downloadImage` draws a manual grid overlay with a `footerHeight=0` (dead var). No DPR accounting.
- The AI page manages layout via its own full-height Flex + `position: sticky` composer, separate from `Layout`'s shell — potential scroll conflicts with `messageContainer` and `document.scrollingElement` double-scrolling in `scrollToBottom` (scrolls both the chat container and the page).
- `handleHistory` relies on `userInfoUpdated` event to reload history; if the user avatar edits trigger `userInfoUpdated`, history is re-fetched unnecessarily.

---

## 8. Cross-Cutting / Non-Enterprise-Grade Patterns (Summary)

1. **Dead code everywhere:** `store/auth.js` (unused legacy store), `components/Header.vue` (unused stub), `noteApi.getNotesByCategory` (unused), `aiApi.uploadImage` (unused), `sendMessageWithImages` (unused), large commented-out blocks in `AuthorCard.vue`, redefined-but-unused `columnCount` (HomeView) and `height` field, `MyDesignsView.publishDesign` fallback path, `goToDetail` (pushes nonextant `/note/` route).
2. **Two login-gating systems** that disagree (`router meta.needLogin` vs `constants/auth.js routeNeedsLogin`; `/draft` and `/pine-xiaodou` differ).
3. **Three auth state approaches** at once (dead module store, half-used Pinia store, direct `localStorage` + window events).
4. **Media URL resolution duplicated ~5 ways** with divergent logic/env names (`media.js` `VITE_API_BASE`, `PineXiaoDou`/`MyDesigns` `VITE_API_BASE_URL`, hardcoded `http://localhost:3000` in `ConversationList` and `MyDesignsView`).
5. **Inconsistent action `type` values:** `toggleCollection` uses `type:'collection'` (UserCenter) vs `type:'collect'` (HomeView/NoteDetailCard) for the same `actionApi.toggleAction` endpoint — likely a real backend-mismatch bug.
6. **No `.env*` committed; rely on build-time injection** for `VITE_API_BASE`/`VITE_API_BASE_URL`, with `localhost:3000` fallbacks that are wrong for production.
7. **Custom `token` header instead of `Authorization: Bearer`** everywhere.
8. **Raw `fetch` calls (AI chat) bypass Axios interceptors** → no centralized 401/error handling.
9. **Magic numbers everywhere:** `200`/`401` success/error codes, `120000` timeout, `15`/`12` page sizes, `200`/`120`ms throttles, `600`-px scroll trigger, `0.3`/`1200`/`200KB`/`10MB`/`0.8` compression params, `500`-char AI cap, `292`/`128`/`48` etc. No shared constants module for these.
10. **Element Plus double registration** (`app.use(ElementPlus)` + full icon loop + unplugin auto-import/Components resolver); components are sometimes auto-imported (HomeView uses `XhsIcon` without import) and sometimes imported explicitly (e.g., `PindouPatternViewer`, `NoteDetailCard`) — inconsistent.
11. **Heavy `console.log`/`console.error`** left in `UserCenter`, `DraftView`, `NoteDetailCard`, `PublishView`, `AuthorCard`, `HomeView`, `LoginCard`, `LoginCard`.
12. **Manual JWT decode** (`atob(token.split('.')[1]...)`) in `NoteDetailCard` to get `currentUserId` — fragile; no verification.
13. **Cross-files coupling via global `localStorage` keys** (`token`, `userInfo`, `redirectAfterLogin`, `pendingAction`, `editingNote`, `editingDraft`, `publishingDraftId`, `pindouPublishImage`, `pindou-search-history`, `pinexiaodou_chat_history_*`).
14. **No server-side pagination** on `NoticeView`, `DraftView`, `UserCenter` tabs, `UserProfile`; **client-side** keyword search on HomeView (won't scale).
15. **Optimistic updates with good rollback** (HomeView, NoteDetailCard, AuthorCard, NoticeView) but some drift risks (UserCenter toggles mutate counts without rolling back properly; `UserProfile` mutates `stats.fans` locally).
16. **Multiple page-level modals** implemented as bespoke overlays (`Teleport` + custom CSS) rather than `el-dialog`/`el-drawer`, each reinventing close/backdrop/escape behavior and with inconsistent z-indexes (`1000`, `2000`, `3000`, `99999`).
17. **Repeated helper duplication** (`formatNumber`, `normalizeBoolean`, `formatTime`, `resolveMediaUrl`, `holdFirstFrame`, `mapNoteItem`, `pindouId`) across many files — a strong candidate for shared composables/utilities.

---

## 9. Technology README Summary (for documentation)

- **Framework:** Vue 3 (Composition API, `<script setup>`).
- **Build:** Vite 5; `@` → `src` alias; SCSS (`modern-compiler`); vendor chunk splitting.
- **Routing:** Vue Router 4 (`createWebHistory`, lazy route components, `meta.needLogin`, `beforeEach` guard).
- **State:** Pinia 3 (`stores/user.js`; note: legacy module store `store/auth.js` is dead code).
- **UI:** Element Plus 2.13 (global registration + on-demand via unplugin resolvers); all Element Plus icons registered globally.
- **HTTP:** Axios 1.15 instance with request/response interceptors (`/api` base, custom `token` header, 401 handling, silent mode), plus raw `fetch` for SSE AI endpoints.
- **Image/media:** Canvas 2D API (pindou pattern engine, thumbnails, downloads, grid overlays), `browser-image-compression` (publish image compression), `FileReader`/`Blob`/`URL.createObjectURL`, video first-frame freeze.
- **Composables:** `composables/useUnreadBadges.js` (module-scope unread counters + event listeners).
- **SSE streaming:** manual `fetch` + `ReadableStream.getReader()` + `TextDecoder` for AI chat; streamed `data:` events (types `content|image|error`).
- **Key features:** home waterfall feed (cursor pagination, infinite scroll, lazy images, like/collect optimistic updates, video covers), note publish/draft (image compression + video upload + topics), pindou designer (Canvas conversion), AI chat "拼小豆" (analyze/text-to-image/image-to-image + server/local pattern conversion), one-to-one messaging (`ChatWindow`/`ConversationList` with 30s polling), notifications (`NoticeView`), user center/profile, saved designs (`MyDesignsView`), search history sidebar.

---

## 10. Notable Bugs / P0-P1 Candidates (quick reference)

- **`UserCenter.toggleCollection` uses `type:'collection'` while everything else uses `type:'collect'`** — verify which the backend accepts; likely a functional bug.
- **`store/auth.js` is dead** — has no importers (remove).
- **`Header.vue` is an unused stub** (remove).
- **`UserCenter.goToDetail` → `/note/:id` route doesn't exist** → degrades to the catch-all redirect to `/`.
- **`@/layouts` media URL fallback `http://localhost:3000`** breaks in production for `ConversationList`/`MyDesignsView`.
- **Env var naming mismatch** (`VITE_API_BASE` vs `VITE_API_BASE_URL`) + no committed `.env*`.
- **AI raw `fetch` bypasses interceptors** → unhandled 401/expiry and no unified error toasts.
- **`constants/auth.js` route gating conflicts with router meta** (`/draft`, `/pine-xiaodou`, `/collection`).
- **`HomeView` search is purely client-side**, and **`filteredNotes` still relies on the full server list**.
- **`PineXiaoDouView.sendMessageWithImages` is dead code.**
- **`NoteDetailCard` manually decodes a JWT payload** in the browser to derive the current user id.
