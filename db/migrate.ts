import { sql } from "drizzle-orm";
import { db } from "./index";

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
    await db.execute(sql`
      CREATE TRIGGER set_timestamp
      BEFORE UPDATE ON "${table}"
      FOR EACH ROW
      EXECUTE PROCEDURE trigger_update_timestamp();
    `);
  }
}

// Function to create message partitions
async function createMessagePartitions() {
  await db.execute(sql`
    CREATE TABLE "Messages_default" PARTITION OF "Messages" DEFAULT;
  `);
}

// Function to create partial indexes
async function createPartialIndexes() {
  // Users partial index for non-deactivated users
  await db.execute(sql`
    CREATE INDEX idx_users_not_deactivated ON "Users" (email) WHERE deactivated = false;
  `);

  // Workspaces partial index for non-archived workspaces
  await db.execute(sql`
    CREATE INDEX idx_workspaces_not_archived ON "Workspaces" (name) WHERE archived = false;
  `);

  // Channels partial index for non-archived channels
  await db.execute(sql`
    CREATE INDEX idx_channels_not_archived ON "Channels" ("workspaceId", name) WHERE archived = false;
  `);

  // Messages partial index for non-deleted messages
  await db.execute(sql`
    CREATE INDEX idx_messages_not_deleted ON "Messages" ("channelId", "postedAt") WHERE deleted = false;
  `);

  // Emojis partial index for non-deleted emojis
  await db.execute(sql`
    CREATE INDEX idx_emojis_not_deleted ON "Emojis" (code) WHERE deleted = false;
  `);
}

// Main migration function
export async function migrate() {
  try {
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
if (require.main === module) {
  migrate().catch(console.error);
}
