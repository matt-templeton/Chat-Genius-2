import 'dotenv/config';

import { db } from '../index';
import { users, workspaces, channels, messages, userWorkspaces } from '../schema';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcrypt';

// Import seed data
import usersSeedData from './users.json';
import socratesQuotes from '../../client/src/ai/phil/socrates.json';

async function seedPhilosophy() {
  try {
    // 1. Create users
    console.log('Creating users...');
    for (const userData of usersSeedData) {
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      await db.insert(users).values({
        email: userData.email,
        passwordHash: hashedPassword,
        displayName: userData.displayName,
      }).onConflictDoNothing();
    }

    // 2. Create Bullshit workspace
    console.log('Creating Bullshit workspace...');
    const [workspace] = await db.insert(workspaces).values({
      name: 'Bullshit',
      description: 'A place for philosophical discussions',
    })
    .returning();

    // 3. Add all users to the workspace
    console.log('Adding users to workspace...');
    const allUsers = await db.select().from(users);
    for (const user of allUsers) {
      await db.insert(userWorkspaces).values({
        userId: user.userId,
        workspaceId: workspace.workspaceId,
        role: 'MEMBER',
      }).onConflictDoNothing();
    }

    // 4. Create Hmmmm channel
    console.log('Creating Hmmmm channel...');
    const [channel] = await db.insert(channels).values({
      workspaceId: workspace.workspaceId,
      name: 'Hmmmm',
      channelType: 'PUBLIC',
    })
    .returning();

    // 5. Add Socrates' quotes as messages
    console.log('Adding Socrates quotes...');
    const socrates = await db.select().from(users).where(eq(users.displayName, 'Socrates')).limit(1);
    
    if (socrates.length > 0) {
      for (const quote of socratesQuotes) {
        await db.insert(messages).values({
          userId: socrates[0].userId,
          channelId: channel.channelId,
          workspaceId: workspace.workspaceId,
          content: quote,
        });
      }
    }

    console.log('Philosophy seed completed successfully!');
  } catch (error) {
    console.error('Error seeding philosophy data:', error);
    throw error;
  }
}

// Run seeding if this file is executed directly
if (import.meta.url === new URL(import.meta.url).href) {
  seedPhilosophy()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}