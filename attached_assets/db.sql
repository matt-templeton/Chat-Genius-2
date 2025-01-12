-- =====================================================================
-- SCHEMA WITH CONSISTENT SOFT DELETION, PARTITION BY WORKSPACE,
-- PARTIAL INDEXING, ETC.
--
-- All references use ON DELETE SET NULL to avoid confusion. 
-- Workspaces, Channels, Messages, Users, and Emojis all use
-- a soft-delete approach:
--   - Users:    deactivated = TRUE
--   - Channels: archived = TRUE
--   - Messages: deleted = TRUE
--   - Workspaces: archived = TRUE
--   - Emojis:   deleted = TRUE
-- =====================================================================

-- =====================================================================
-- NOTE ON updatedAt (TRIGGER APPROACH)
-- We use a Postgres trigger to automatically set "updatedAt = NOW()" on row updates.
-- Example trigger procedure (create once in your DB):
--
--   CREATE OR REPLACE FUNCTION trigger_update_timestamp()
--   RETURNS TRIGGER AS $$
--   BEGIN
--     NEW."updatedAt" = NOW();
--     RETURN NEW;
--   END;
--   $$ LANGUAGE plpgsql;
--
-- Then for each table, create a trigger:
--   CREATE TRIGGER set_timestamp
--   BEFORE UPDATE ON table_name
--   FOR EACH ROW
--   EXECUTE PROCEDURE trigger_update_timestamp();
-- =====================================================================

-- =====================================================================
-- ENUMS
-- =====================================================================
DROP TYPE IF EXISTS user_presence_enum CASCADE;
CREATE TYPE user_presence_enum AS ENUM ('ONLINE', 'AWAY', 'DND', 'OFFLINE');

DROP TYPE IF EXISTS workspace_role_enum CASCADE;
CREATE TYPE workspace_role_enum AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'GUEST');

DROP TYPE IF EXISTS channel_type_enum CASCADE;
CREATE TYPE channel_type_enum AS ENUM ('PUBLIC', 'PRIVATE', 'DM');

-- =====================================================================
-- USERS TABLE
-- Soft-delete: deactivated = TRUE
-- theme: store user's UI theme preference ("light", "dark", etc.)
-- updatedAt uses a trigger
-- lastKnownPresence is updated by a timer in the backend.
-- =====================================================================
DROP TABLE IF EXISTS "Users" CASCADE;
CREATE TABLE "Users" (
    "userId" BIGSERIAL PRIMARY KEY,
    email VARCHAR(254) NOT NULL UNIQUE,
    passwordHash VARCHAR(255),
    displayName VARCHAR(50) NOT NULL,
    profilePicture VARCHAR(255),
    statusMessage VARCHAR(150),
    lastKnownPresence user_presence_enum DEFAULT 'ONLINE',
    emailVerified BOOLEAN DEFAULT FALSE,
    lastLogin TIMESTAMP,
    deactivated BOOLEAN DEFAULT FALSE,
    theme VARCHAR(20) DEFAULT 'light',
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Optional partial index if you frequently query active users:
-- CREATE INDEX idx_users_not_deactivated ON "Users" (email) WHERE deactivated = false;

-- =====================================================================
-- WORKSPACES TABLE
-- archived = TRUE for soft-deletion of the workspace
-- updatedAt uses a trigger
-- =====================================================================
DROP TABLE IF EXISTS "Workspaces" CASCADE;
CREATE TABLE "Workspaces" (
    "workspaceId" BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    archived BOOLEAN DEFAULT FALSE,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Optional partial index for non-archived workspaces:
-- CREATE INDEX idx_workspaces_not_archived ON "Workspaces" (name) WHERE archived = false;

-- =====================================================================
-- CHANNELS TABLE
-- channelType: PUBLIC, PRIVATE, or DM
-- archived = TRUE for soft-deletion
-- updatedAt uses a trigger
-- ON DELETE SET NULL used for workspaceId reference.
-- =====================================================================
DROP TABLE IF EXISTS "Channels" CASCADE;
CREATE TABLE "Channels" (
    "channelId" BIGSERIAL PRIMARY KEY,
    "workspaceId" BIGINT 
        REFERENCES "Workspaces"("workspaceId") 
        ON DELETE SET NULL,
    name VARCHAR(100) NOT NULL,
    topic TEXT,
    channelType channel_type_enum NOT NULL DEFAULT 'PUBLIC',
    archived BOOLEAN DEFAULT FALSE,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Unique index per workspace, case-insensitive name
CREATE UNIQUE INDEX idx_channels_workspace_name 
    ON "Channels" ("workspaceId", lower(name));

-- Optional partial index for non-archived channels:
-- CREATE INDEX idx_channels_not_archived ON "Channels" ("workspaceId", name) WHERE archived = false;

-- =====================================================================
-- MESSAGES TABLE
-- Soft-deleted with "deleted=TRUE" instead of physical removal
-- "workspaceId" for partitioning. 
-- UpdatedAt uses a trigger
-- ON DELETE SET NULL for references
-- =====================================================================
DROP TABLE IF EXISTS "Messages" CASCADE;
CREATE TABLE "Messages" (
    "messageId" BIGSERIAL PRIMARY KEY,
    "userId" BIGINT 
        REFERENCES "Users"("userId") 
        ON DELETE SET NULL,
    "channelId" BIGINT 
        REFERENCES "Channels"("channelId") 
        ON DELETE SET NULL,
    "workspaceId" BIGINT 
        REFERENCES "Workspaces"("workspaceId")
        ON DELETE SET NULL,
    "parentMessageId" BIGINT 
        REFERENCES "Messages"("messageId"),
    content TEXT NOT NULL,
    deleted BOOLEAN DEFAULT FALSE,
    postedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
)
PARTITION BY LIST ("workspaceId");

-- Default partition for all messages
CREATE TABLE "Messages_default" PARTITION OF "Messages" DEFAULT;

-- Indices for performance
CREATE INDEX idx_messages_channel_id ON "Messages" ("channelId");
CREATE INDEX idx_messages_posted_at ON "Messages" (postedAt);
CREATE INDEX idx_messages_channel_posted_at ON "Messages" ("channelId", postedAt);
CREATE INDEX idx_messages_parent_id ON "Messages" ("parentMessageId");

-- Optional partial index for non-deleted messages:
-- CREATE INDEX idx_messages_not_deleted ON "Messages" ("channelId", postedAt) WHERE deleted = false;

-- =====================================================================
-- FILES TABLE
-- Linked to users/messages. If message is soft-deleted, we keep the file
-- but the app might hide it from UI.
-- updatedAt uses a trigger
-- ON DELETE SET NULL for references.
-- =====================================================================
DROP TABLE IF EXISTS "Files" CASCADE;
CREATE TABLE "Files" (
    "fileId" BIGSERIAL PRIMARY KEY,
    "userId" BIGINT 
        REFERENCES "Users"("userId") 
        ON DELETE SET NULL,
    "messageId" BIGINT 
        REFERENCES "Messages"("messageId") 
        ON DELETE SET NULL,
    filename VARCHAR(255) NOT NULL,
    fileType VARCHAR(50),
    fileUrl VARCHAR(255),
    fileSize BIGINT,
    fileHash VARCHAR(64),
    uploadTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================================
-- EMOJIS TABLE
-- Now also soft-deleted by setting deleted=TRUE
-- updatedAt uses a trigger
-- =====================================================================
DROP TABLE IF EXISTS "Emojis" CASCADE;
CREATE TABLE "Emojis" (
    "emojiId" BIGSERIAL PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    deleted BOOLEAN DEFAULT FALSE,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Optional partial index for non-deleted emojis:
-- CREATE INDEX idx_emojis_not_deleted ON "Emojis" (code) WHERE deleted = false;

-- =====================================================================
-- MESSAGE REACTIONS
-- unique index ensures a user can't react with the same emoji multiple times.
-- updatedAt uses a trigger
-- ON DELETE SET NULL for references
-- =====================================================================
DROP TABLE IF EXISTS "MessageReactions" CASCADE;
CREATE TABLE "MessageReactions" (
    "reactionId" BIGSERIAL PRIMARY KEY,
    "messageId" BIGINT 
        REFERENCES "Messages"("messageId") 
        ON DELETE SET NULL,
    "emojiId" BIGINT NOT NULL 
        REFERENCES "Emojis"("emojiId") 
        ON DELETE SET NULL,
    "userId" BIGINT 
        REFERENCES "Users"("userId") 
        ON DELETE SET NULL,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_reactions_unique_message_emoji_user 
    ON "MessageReactions" ("messageId", "emojiId", "userId");

-- =====================================================================
-- USER <-> WORKSPACE LINK
-- updatedAt uses a trigger
-- ON DELETE SET NULL for references
-- =====================================================================
DROP TABLE IF EXISTS "UserWorkspaces" CASCADE;
CREATE TABLE "UserWorkspaces" (
    "userId" BIGINT 
        REFERENCES "Users"("userId") 
        ON DELETE SET NULL,
    "workspaceId" BIGINT 
        REFERENCES "Workspaces"("workspaceId") 
        ON DELETE SET NULL,
    role workspace_role_enum DEFAULT 'MEMBER',
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("userId", "workspaceId")
);

CREATE INDEX idx_user_workspaces_ws_user 
    ON "UserWorkspaces" ("workspaceId", "userId");

-- =====================================================================
-- USER <-> CHANNEL LINK
-- updatedAt uses a trigger
-- ON DELETE SET NULL for references
-- =====================================================================
DROP TABLE IF EXISTS "UserChannels" CASCADE;
CREATE TABLE "UserChannels" (
    "userId" BIGINT 
        REFERENCES "Users"("userId") 
        ON DELETE SET NULL,
    "channelId" BIGINT 
        REFERENCES "Channels"("channelId") 
        ON DELETE SET NULL,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("userId", "channelId")
);

CREATE INDEX idx_user_channels_user_id ON "UserChannels" ("userId");
CREATE INDEX idx_user_channels_channel_id ON "UserChannels" ("channelId");
CREATE INDEX idx_user_channels_ch_user ON "UserChannels" ("channelId", "userId");

-- =====================================================================
-- PINNED MESSAGES
-- pinnedBy -> NULL if user removed
-- messageId -> set NULL if the message is removed physically (rarely done),
-- but usually we do soft-deletion for messages. 
-- updatedAt uses a trigger
-- =====================================================================
DROP TABLE IF EXISTS "PinnedMessages" CASCADE;
CREATE TABLE "PinnedMessages" (
    "pinnedId" BIGSERIAL PRIMARY KEY,
    "messageId" BIGINT 
        NOT NULL 
        REFERENCES "Messages"("messageId") 
        ON DELETE SET NULL,
    pinnedBy BIGINT 
        REFERENCES "Users"("userId") 
        ON DELETE SET NULL,
    pinnedReason TEXT,
    pinnedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================================
-- END OF SCHEMA
-- =====================================================================
