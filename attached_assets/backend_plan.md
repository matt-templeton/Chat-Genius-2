# Slack Clone Backend: Comprehensive Technical Plan (v4)

## Introduction

This plan implements a Slack-like real-time platform in a **monorepo** (recommended) with:

- **Consistent soft deletion** across all resources:
  - Users → `deactivated = TRUE`
  - Channels → `archived = TRUE`
  - Messages → `deleted = TRUE`
  - Workspaces → `archived = TRUE` (instead of physical removal)
  - Emojis → `deleted = TRUE`
- **Selective message partitioning** by `workspaceId`
- **Email-based user verification**
- **Consolidated enumerations** in a single source for `'PUBLIC' | 'PRIVATE' | 'DM'`, presence states, etc.
- **Trigger-based `updatedAt`** using Postgres triggers
- **API versioning** under `/v1`
- **Comprehensive JSDoc** for backend controllers/services
- **Clear handling of soft-deletes** in API docs and responses
- **ON DELETE SET NULL** used for foreign keys to avoid confusion
- **Error code enumeration** for consistent error handling
- **Real-time presence** tracked in Redis, with `lastKnownPresence` updated by a timer
- **User reactivation endpoint** for bringing deactivated users back

### Key Points

1. **Soft Deletion**  
   - `Users` table: `deactivated = TRUE` means the user is inactive but not removed.  
   - `Channels` table: `archived = TRUE` means the channel is hidden.  
   - `Messages` table: `deleted = TRUE` means the message is hidden, replaced by a placeholder.  
   - `Workspaces` table: `archived = TRUE` means the workspace is soft-deleted rather than physically removed.  
   - `Emojis` table: `deleted = TRUE` means the emoji is unavailable but remains in the table.

2. **Handling Soft-Deletes in the API**  
   - Endpoints that perform a `DELETE` set the appropriate soft-delete flag.  
   - Clients may include query params like `?includeArchived=true` or `?includeDeleted=true` to retrieve soft-deleted items.  
   - We remain consistent in JSDoc and OpenAPI about these flags.

3. **Partitioning (Avoid Partition Explosion)**  
   - The `Messages` table is `PARTITION BY LIST ("workspaceId")`.  
   - A default partition for smaller/new workspaces.  
   - When a workspace’s traffic justifies it, create a dedicated partition.

4. **Real-Time Presence & Typing**  
   - Redis used for ephemeral presence.  
   - `lastKnownPresence` is updated by a timer on the backend to reflect user activity/inactivity transitions.

5. **Enumerations & Shared Code**  
   - Shared enum definitions (e.g., `'PUBLIC' | 'PRIVATE' | 'DM'`) live in a single “enums.js” or “consts.ts.”  
   - The same strings appear in DB enums and OpenAPI.  
   - Hosting everything in a **monorepo** is recommended, so front and back can share these constants.

6. **Trigger-based `updatedAt`**  
   - Each table includes an `updatedAt` column maintained by a Postgres trigger.  
   - Frees application code from needing to set it manually.

7. **API Versioning**  
   - All endpoints are under `/v1`.  
   - Breaking changes go to `/v2`.

8. **JSDoc for Controllers & Services**  
   - Example:

     ```ts
     /**
      * Archives (soft-deletes) a channel by setting archived=true.
      * @param channelId the channel's ID
      * @returns updated channel or error if not found
      */
     async function archiveChannel(channelId: number) {
       // ...
     }
     ```

   - This level of documentation helps LLMs parse the code’s intent.

9. **Error Handling with Enumerated Codes**  
   - Standard JSON error shape:

     ```json
     {
       "error": "Error Title",
       "details": {
         "code": "USER_NOT_FOUND",
         "message": "Descriptive message"
       }
     }
     ```

   - `code` is an enum such as `USER_NOT_FOUND`, `WORKSPACE_NOT_FOUND`, `CHANNEL_NOT_FOUND`, `INVALID_CREDENTIALS`, etc.

10. **Reactivating a Deactivated User**  
    - If an admin wants to bring back a user who is `deactivated=true`, we have an endpoint:  
      `POST /v1/users/{userId}/reactivate` → sets `deactivated=false`.

11. **Testing, Observability & Deployment**  
    - Docker-based local development (Postgres/Redis).  
    - Migrations with Drizzle or similar.  
    - Logging with Pino/Winston, optional tracing with OpenTelemetry.  
    - Code-level JSDoc and an OpenAPI spec ease LLM-based code generation in a monorepo.

## Step-by-Step Implementation Outline

1. **Set Up Database & Migrations**  
   - Apply `db.sql` with triggers.  
   - Ensure partial indexes for soft-delete queries where needed.

2. **Auth with Email Verification**  
   - `POST /v1/auth/register` → create new user, send verification link.  
   - `POST /v1/auth/verify-email` → sets `emailVerified = TRUE`.

3. **Soft-Delete for Channels & Workspaces**  
   - `DELETE /v1/channels/{channelId}` → sets `archived = TRUE`.  
   - `DELETE /v1/workspaces/{workspaceId}` → sets `archived = TRUE`.

4. **Messages & Threads**  
   - Insert new messages with `deleted = false`.  
   - `DELETE /v1/messages/{messageId}` → sets `deleted = true`.  
   - Broadcast changes in real time via Socket.io.

5. **Reactions & Pins**  
   - `MessageReactions` table with unique constraints.  
   - `PinnedMessages` table for pinned items, sets fields accordingly.

6. **Search**  
   - Possibly Postgres full-text search or external indexing.  
   - By default, omit items that are soft-deleted. Queries can include them if requested.

7. **Real-Time WebSocket**  
   - Presence, typing indicators, new messages with Socket.io.  
   - Use Redis as a presence data store.  
   - `lastKnownPresence` updated via a background timer for offline detection.

8. **User Reactivation**  
   - `POST /v1/users/{userId}/reactivate` → sets `deactivated = false`.  
   - Returns the updated user record.

9. **Observability & Deployment**  
   - Containerized with Docker.  
   - One monorepo for backend, frontend, and shared code for enumerations.  
   - Logging & metrics integration as needed.

By following this approach, you get a thoroughly documented Slack clone backend with soft-deletion everywhere, enumerated error codes, consistent presence logic, and a reactivation endpoint—all conducive to future enhancements and LLM-based development.
