
import { db } from './index';
import { sql } from 'drizzle-orm';

async function dropTables() {
  try {
    await db.execute(sql`
      DROP TABLE IF EXISTS "PinnedMessages" CASCADE;
      DROP TABLE IF EXISTS "UserChannels" CASCADE;
      DROP TABLE IF EXISTS "UserWorkspaces" CASCADE;
      DROP TABLE IF EXISTS "MessageReactions" CASCADE;
      DROP TABLE IF EXISTS "Files" CASCADE;
      DROP TABLE IF EXISTS "Messages" CASCADE;
      DROP TABLE IF EXISTS "Emojis" CASCADE;
      DROP TABLE IF EXISTS "Channels" CASCADE;
      DROP TABLE IF EXISTS "Workspaces" CASCADE;
      DROP TABLE IF EXISTS "Users" CASCADE;
      DROP TYPE IF EXISTS "user_presence_enum" CASCADE;
      DROP TYPE IF EXISTS "workspace_role_enum" CASCADE;
      DROP TYPE IF EXISTS "channel_type_enum" CASCADE;
    `);
    console.log('All tables dropped successfully');
  } catch (error) {
    console.error('Error dropping tables:', error);
  }
  process.exit(0);
}

dropTables();
