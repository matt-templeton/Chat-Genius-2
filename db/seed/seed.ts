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

    // Step 2: Create users from directories
    console.log('Creating users from directories...');
    const usersDir = path.join(process.cwd(), 'db', 'seed', 'users');
    const userDirs = await fs.readdir(usersDir);

    for (const dir of userDirs) {
      const displayName = dir;
      const email = `${displayName.toLowerCase().replace(/\s+/g, '.')}@philosophers.org`;
      
      // Check for profile image
      const jpegPath = path.join(usersDir, dir, 'profile.jpg');
      const pngPath = path.join(usersDir, dir, 'profile.png');
      
      let profilePicture;
      try {
        if (await fs.access(jpegPath).then(() => true).catch(() => false)) {
          // Copy file to uploads directory
          const fileName = `${displayName.toLowerCase().replace(/\s+/g, '_')}.jpg`;
          const uploadPath = path.join(process.cwd(), 'uploads', fileName);
          await fs.mkdir(path.join(process.cwd(), 'uploads'), { recursive: true });
          await fs.copyFile(jpegPath, uploadPath);
          profilePicture = `/uploads/${fileName}`;
        } else if (await fs.access(pngPath).then(() => true).catch(() => false)) {
          const fileName = `${displayName.toLowerCase().replace(/\s+/g, '_')}.png`;
          const uploadPath = path.join(process.cwd(), 'uploads', fileName);
          await fs.mkdir(path.join(process.cwd(), 'uploads'), { recursive: true });
          await fs.copyFile(pngPath, uploadPath);
          profilePicture = `/uploads/${fileName}`;
        }
      } catch (error) {
        console.error(`Error handling profile picture for ${displayName}:`, error);
      }

      await createUserWithWorkspace({
        email,
        displayName,
        password: STANDARD_PASSWORD,
        profilePicture,
      });
    }

    // Step 3 & 4: Create Thunderdome workspace and add all users
    console.log('Creating Thunderdome workspace...');
    const [thunderdome] = await db.insert(workspaces).values({
      name: 'Thunderdome',
      description: 'Welcome to Thunderdome!',
    })
    .returning();

    // Add all users to Thunderdome
    const allUsers = await db.select().from(users);
    for (const user of allUsers) {
      await db.insert(userWorkspaces).values({
        userId: user.userId,
        workspaceId: thunderdome.workspaceId,
        role: 'MEMBER',
      })
      .onConflictDoNothing();
    }

    // Step 5: Create general channel in Thunderdome
    console.log('Creating Thunderdome general channel...');
    await db.insert(channels).values({
      workspaceId: thunderdome.workspaceId,
      name: 'general',
      topic: 'General discussions',
      channelType: 'PUBLIC',
    });

    console.log('Database seeding completed successfully!');
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