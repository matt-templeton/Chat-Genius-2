import { sql } from "drizzle-orm";
import { db } from "./index";

// Function to convert SERIAL to BIGSERIAL
async function convertToBigSerial() {
  try {
    // Convert Users table
    await db.execute(sql`
      ALTER TABLE "Users" ALTER COLUMN "userId" TYPE BIGINT;
      ALTER SEQUENCE IF EXISTS "Users_userId_seq" AS BIGINT;
    `);

    // Convert Workspaces table
    await db.execute(sql`
      ALTER TABLE "Workspaces" ALTER COLUMN "workspaceId" TYPE BIGINT;
      ALTER SEQUENCE IF EXISTS "Workspaces_workspaceId_seq" AS BIGINT;
    `);

    // Convert Channels table
    await db.execute(sql`
      ALTER TABLE "Channels" ALTER COLUMN "channelId" TYPE BIGINT;
      ALTER SEQUENCE IF EXISTS "Channels_channelId_seq" AS BIGINT;
    `);

    // Convert Messages table
    await db.execute(sql`
      ALTER TABLE "Messages" ALTER COLUMN "messageId" TYPE BIGINT;
      ALTER SEQUENCE IF EXISTS "Messages_messageId_seq" AS BIGINT;
    `);

    // Convert Files table
    await db.execute(sql`
      ALTER TABLE "Files" ALTER COLUMN "fileId" TYPE BIGINT;
      ALTER SEQUENCE IF EXISTS "Files_fileId_seq" AS BIGINT;
    `);

    // Convert Emojis table
    await db.execute(sql`
      ALTER TABLE "Emojis" ALTER COLUMN "emojiId" TYPE BIGINT;
      ALTER SEQUENCE IF EXISTS "Emojis_emojiId_seq" AS BIGINT;
    `);

    // Convert MessageReactions table
    await db.execute(sql`
      ALTER TABLE "MessageReactions" ALTER COLUMN "reactionId" TYPE BIGINT;
      ALTER SEQUENCE IF EXISTS "MessageReactions_reactionId_seq" AS BIGINT;
    `);

    // Convert PinnedMessages table
    await db.execute(sql`
      ALTER TABLE "PinnedMessages" ALTER COLUMN "pinnedId" TYPE BIGINT;
      ALTER SEQUENCE IF EXISTS "PinnedMessages_pinnedId_seq" AS BIGINT;
    `);

    console.log('Successfully converted ID columns to BIGSERIAL');
  } catch (error) {
    console.error('Error converting to BIGSERIAL:', error);
    throw error;
  }
}

// Function to create updatedAt trigger
async function createUpdatedAtTrigger() {
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION trigger_update_timestamp()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW."updatedAt" = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
}

// Function to create triggers for all tables
async function createTableTriggers() {
  const tables = [
    'Users', 'Workspaces', 'Channels', 'Messages',
    'Files', 'Emojis', 'MessageReactions', 'UserWorkspaces',
    'UserChannels', 'PinnedMessages'
  ];

  for (const table of tables) {
    // Use template literals to properly escape table names
    const dropTriggerSQL = `DROP TRIGGER IF EXISTS set_timestamp ON "${table}"`;
    const createTriggerSQL = `
      CREATE TRIGGER set_timestamp
      BEFORE UPDATE ON "${table}"
      FOR EACH ROW
      EXECUTE PROCEDURE trigger_update_timestamp()
    `;

    await db.execute(sql.raw(dropTriggerSQL));
    await db.execute(sql.raw(createTriggerSQL));
  }
}

// Function to create message partitions
async function createMessagePartitions() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "Messages_default" PARTITION OF "Messages" DEFAULT;
  `);
}

// Function to create partial indexes
async function createPartialIndexes() {
  // Users partial index for non-deactivated users
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_users_not_deactivated ON "Users" (email) WHERE deactivated = false;
  `);

  // Workspaces partial index for non-archived workspaces
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_workspaces_not_archived ON "Workspaces" (name) WHERE archived = false;
  `);

  // Channels partial index for non-archived channels
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_channels_not_archived ON "Channels" ("workspaceId", name) WHERE archived = false;
  `);

  // Messages partial index for non-deleted messages
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_messages_not_deleted ON "Messages" ("channelId", "postedAt") WHERE deleted = false;
  `);

  // Emojis partial index for non-deleted emojis
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_emojis_not_deleted ON "Emojis" (code) WHERE deleted = false;
  `);
}

// Main migration function
export async function migrate() {
  try {
    // Convert all ID columns to BIGSERIAL
    await convertToBigSerial();

    // Create triggers
    await createUpdatedAtTrigger();
    await createTableTriggers();

    // Create message partitions
    await createMessagePartitions();

    // Create partial indexes
    await createPartialIndexes();

    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

// Run migration if this file is executed directly
if (import.meta.url === new URL(import.meta.url).href) {
  migrate().catch(console.error);
}