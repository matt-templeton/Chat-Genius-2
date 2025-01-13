# Frontend Plan (v4)

This plan outlines a React + TypeScript frontend within a **monorepo** (alongside the backend) with:
- **Naming consistency** (`userId`, channelId, workspaceId, etc.) matching the backend
- **Storybook** with MDX-based stories
- **Redux** for state management (via @reduxjs/toolkit or RTK Query)
- **Centralized enumerations** (e.g., PUBLIC, PRIVATE, DM, presence states) in types.ts or consts.ts
- **JSDoc**-style comments in components and Redux slices
- **Soft-deletion awareness** (archived channels, deleted messages/emojis, deactivated users, etc.)
- **User reactivation** flow, calling the /v1/users/{userId}/reactivate endpoint
- **Monorepo** note: The frontend and backend share code and enumerations for minimal duplication.

---

## Checkpoint 1: Project Bootstrap

1. **Initialize**
   - React + TS using Create React App, Vite, or Next.js.
   - Install Redux (`@reduxjs/toolkit`), React Router, UI libs.
   - Setup **Storybook** with MDX.
   - Create types.ts or consts.ts for enumerations shared with the backend (monorepo approach).

2. **Global Types & Theming**
   - Use the same presence states and soft-deletion fields as the backend.
   - A user's theme is stored as 'light' or 'dark'; reflect that in a theme provider.

---

## Checkpoint 2: BaseOverlay
- A shared modal overlay.
- **JSDoc** example:
```ts
/** 
 * BaseOverlayProps: common modal overlay props.
 */
export interface BaseOverlayProps {
    visible: boolean;
    onClose: () => void;
}
```
- **Storybook (MDX)** with usage examples.

## Checkpoint 3: WorkspaceNavigation
- Props reflect `workspaceId`, `archived`, etc.
- **onCreateWorkspace** calls the backend with `archived=false` by default.
- MDX stories show usage.

## Checkpoint 4: ChannelList
- Shows channels that are not `archived=true` by default.
- If the user wants archived channels, they can request them.
- **Storybook** example with `archived` channels.

## Checkpoint 5: DirectMessagesList
- Each DM is a channel with `channelType='DM'`.
- **JSDoc** specifying `onNewDm`, etc.

## Checkpoint 6: ChatArea
- Display messages, some may have `deleted=true`.
- A deleted message can show "This message was removed."
- Threading, pinning, reactions.

## Checkpoint 7: MessageInputBox
- Hooks for `onSendMessage`, `onUploadFile`, `onEmojiInsert`.
- Possibly handle file attachments to display in the ChatArea.

## Checkpoint 8: FileSharingOverlay
- Extends `BaseOverlayProps`.
- Upload multiple files, choose recipients.

## Checkpoint 9: SearchBar
- For searching messages, channels, or users.
- Can add a filter for `includeArchived` or `includeDeleted` if necessary.

## Checkpoint 10: UserPresenceIndicator
- Reflects `'ONLINE' | 'AWAY' | 'DND' | 'OFFLINE'` from the backend.
- Updated by a timer or subscription to presence events.

## Checkpoint 11: UserStatusUpdateOverlay
- Extends `BaseOverlayProps`.
- Let user set a status message and optional emoji.

## Checkpoint 12: EmojiReactionPicker
- Lists emojis (omitting `deleted=true` unless you show them in a separate admin list).
- Insert emoji into a message or a reaction.

## Checkpoint 13: PreferencesOverlay
- For changing theme, notification settings, etc.
- Could also contain reactivation logic if an admin reactivates a user, or that might be separate.

## Checkpoint 14: NewChannelGroupCreationOverlay
- Create a new channel or multi-party DM.
- `archived=false` by default.

## Checkpoint 15: Final Integration & Monorepo Polishing

1. **Wire Everything with Redux**
   - Use the OpenAPI spec or a custom client.
   - Reuse enumerations in both front and back via a shared package.

2. **Styling & Responsiveness**
   - Light/dark themes, responsive layouts.

3. **Storybook Review**
   - Use `.mdx` for each component with real usage examples.

4. **User Reactivation**
   - Possibly a UI flow for reactivating a user via `POST /v1/users/{userId}/reactivate`.

5. **Deployment**
   - Single monorepo build pipeline.
   - Code generation for TypeScript from the OpenAPI file if desired.