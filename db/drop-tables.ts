import 'dotenv/config';

import { db } from './index';
import { sql } from 'drizzle-orm';

async function dropTables() {
  try {
    // Drop tables
    await db.execute(sql`DROP TABLE IF EXISTS "PinnedMessages" CASCADE`);
    await db.execute(sql`DROP TABLE IF EXISTS "UserChannels" CASCADE`);
    await db.execute(sql`DROP TABLE IF EXISTS "UserWorkspaces" CASCADE`);
    await db.execute(sql`DROP TABLE IF EXISTS "MessageReactions" CASCADE`);
    await db.execute(sql`DROP TABLE IF EXISTS "Files" CASCADE`);
    await db.execute(sql`DROP TABLE IF EXISTS "Messages" CASCADE`);
    await db.execute(sql`DROP TABLE IF EXISTS "Emojis" CASCADE`);
    await db.execute(sql`DROP TABLE IF EXISTS "Channels" CASCADE`);
    await db.execute(sql`DROP TABLE IF EXISTS "Workspaces" CASCADE`);
    await db.execute(sql`DROP TABLE IF EXISTS "Users" CASCADE`);

    // Drop enums
    await db.execute(sql`DROP TYPE IF EXISTS "user_presence_enum" CASCADE`);
    await db.execute(sql`DROP TYPE IF EXISTS "workspace_role_enum" CASCADE`);
    await db.execute(sql`DROP TYPE IF EXISTS "channel_type_enum" CASCADE`);
    
    console.log('All tables dropped successfully');
  } catch (error) {
    console.error('Error dropping tables:', error);
  }
  process.exit(0);
}

dropTables();
