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
      DROP TRIGGER IF EXISTS set_timestamp ON "${table}";
      CREATE TRIGGER set_timestamp
      BEFORE UPDATE ON "${table}"
      FOR EACH ROW
      EXECUTE FUNCTION trigger_update_timestamp();
    `);
  }
}

// Function to create partial indexes
async function createPartialIndexes() {
  // Users partial index for non-deactivated users
  await db.execute(sql`
    DROP INDEX IF EXISTS idx_users_not_deactivated;
    CREATE INDEX idx_users_not_deactivated ON "Users" (email) 
    WHERE deactivated = false;
  `);

  // Workspaces partial index for non-archived workspaces
  await db.execute(sql`
    DROP INDEX IF EXISTS idx_workspaces_not_archived;
    CREATE INDEX idx_workspaces_not_archived ON "Workspaces" (name) 
    WHERE archived = false;
  `);

  // Channels partial index for non-archived channels
  await db.execute(sql`
    DROP INDEX IF EXISTS idx_channels_not_archived;
    CREATE INDEX idx_channels_not_archived ON "Channels" ("workspaceId", name) 
    WHERE archived = false;
  `);

  // Messages partial index for non-deleted messages
  await db.execute(sql`
    DROP INDEX IF EXISTS idx_messages_not_deleted;
    CREATE INDEX idx_messages_not_deleted ON "Messages" ("channelId", "postedAt") 
    WHERE deleted = false;
  `);

  // Emojis partial index for non-deleted emojis
  await db.execute(sql`
    DROP INDEX IF EXISTS idx_emojis_not_deleted;
    CREATE INDEX idx_emojis_not_deleted ON "Emojis" (code) 
    WHERE deleted = false;
  `);
}

// Main migration function
export async function migrate() {
  try {
    console.log('Starting database migration...');

    // Create triggers
    await createUpdatedAtTrigger();
    console.log('Created updatedAt trigger');

    await createTableTriggers();
    console.log('Created table triggers');

    // Create partial indexes
    await createPartialIndexes();
    console.log('Created partial indexes');

    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

// Run migration if this file is executed directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
  migrate().catch(console.error);
}