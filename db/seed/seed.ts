import 'dotenv/config';
import { db } from '../index';
import { users, workspaces, channels, userWorkspaces } from '../schema';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs/promises';
import * as path from 'path';

// Import seed data
import usersSeedData from './users.json';

const STANDARD_PASSWORD = 'h5Ft12g$NBCjs990';

async function createUserWithWorkspace(userData: { email: string, displayName: string, password: string, profilePicture?: string }) {
  // Create user
  const hashedPassword = await bcrypt.hash(userData.password, 10);
  const [user] = await db.insert(users).values({
    email: userData.email,
    passwordHash: hashedPassword,
    displayName: userData.displayName,
    profilePicture: userData.profilePicture,
  })
  .returning()
  .onConflictDoNothing();

  if (!user) return null;

  // Create default workspace
  const [workspace] = await db.insert(workspaces).values({
    name: `${userData.displayName}'s Workspace`,
    description: `Default workspace for ${userData.displayName}`,
  })
  .returning();

  // Create general channel
  await db.insert(channels).values({
    workspaceId: workspace.workspaceId,
    name: 'general',
    topic: 'General discussions',
    channelType: 'PUBLIC',
  });

  // Add user to workspace as owner
  await db.insert(userWorkspaces).values({
    userId: user.userId,
    workspaceId: workspace.workspaceId,
    role: 'OWNER',
  });

  return user;
}

async function createPDFBot() {
  console.log('Creating PDF Bot user...');
  const hashedPassword = await bcrypt.hash(STANDARD_PASSWORD, 10);
  const [pdfBot] = await db.insert(users).values({
    email: 'pdf.bot@chatgenius.com',
    passwordHash: hashedPassword,
    displayName: 'PDFBot',
  })
  .returning()
  .onConflictDoNothing();

  if (!pdfBot) return null;

  // Add PDF Bot to all workspaces
  const allWorkspaces = await db.select().from(workspaces);
  for (const workspace of allWorkspaces) {
    // Get all channels in the workspace
    const workspaceChannels = await db.select().from(channels).where(eq(channels.workspaceId, workspace.workspaceId));
    
    // Add to workspace
    await db.insert(userWorkspaces).values({
      userId: pdfBot.userId,
      workspaceId: workspace.workspaceId,
      role: 'MEMBER',
    }).onConflictDoNothing();
  }

  return pdfBot;
}

async function createTestWorkspace() {
  console.log('Creating test workspace...');
  // Create test workspace
  const [testWorkspace] = await db.insert(workspaces).values({
    name: 'test',
    description: 'Test workspace for development',
  })
  .returning();

  // Create general channel
  await db.insert(channels).values({
    workspaceId: testWorkspace.workspaceId,
    name: 'general',
    topic: 'General discussions',
    channelType: 'PUBLIC',
  });

  // Add all users to the test workspace
  const allUsers = await db.select().from(users);
  for (const user of allUsers) {
    await db.insert(userWorkspaces).values({
      userId: user.userId,
      workspaceId: testWorkspace.workspaceId,
      role: 'MEMBER',
    }).onConflictDoNothing();
  }

  return testWorkspace;
}

async function createGlobalWorkspace() {
  console.log('Creating global workspace...');
  // Create global workspace
  const [globalWorkspace] = await db.insert(workspaces).values({
    name: 'global',
    description: 'Global workspace for all users',
  })
  .returning();

  // Create general channel
  await db.insert(channels).values({
    workspaceId: globalWorkspace.workspaceId,
    name: 'general',
    topic: 'General discussions',
    channelType: 'PUBLIC',
  });

  // Add all users to the global workspace
  const allUsers = await db.select().from(users);
  for (const user of allUsers) {
    await db.insert(userWorkspaces).values({
      userId: user.userId,
      workspaceId: globalWorkspace.workspaceId,
      role: 'MEMBER',
    }).onConflictDoNothing();
  }

  return globalWorkspace;
}

async function seedDatabase() {
  try {
    // Step 1: Create users from users.json
    console.log('Creating users from users.json...');
    for (const userData of usersSeedData) {
      await createUserWithWorkspace({
        email: userData.email,
        displayName: userData.displayName,
        password: userData.password,
      });
    }

    // Step 2: Create PDF Bot and add to all workspaces
    await createPDFBot();

    // Step 3: Create test workspace and add all users
    await createTestWorkspace();

    // Step 4: Create global workspace and add all users
    await createGlobalWorkspace();

  } catch (error) {
    console.error('Error seeding database:', error);
    throw error;
  }
}

// Run seeding if this file is executed directly
if (import.meta.url === new URL(import.meta.url).href) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}