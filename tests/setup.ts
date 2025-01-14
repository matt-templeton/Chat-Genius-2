declare global {
  var server: any;
  namespace NodeJS {
    interface Global {
      server: any;
    }
  }
}

import { db } from "../db";
import { users, workspaces, channels } from "../db/schema";
import { eq, inArray } from "drizzle-orm";
import "@jest/globals";

// Increase test timeout for slower DB operations
// jest.setTimeout(3000);

// Global setup before all tests
beforeAll(async () => {
  // Database is already configured through the DATABASE_URL environment variable
  // Clean up any existing test data
  const testEmails = [
    "test@example.com",
    "login.test@example.com",
    "verify.test@example.com",
    "refresh.test@example.com",
    "logout.test@example.com",
    "duplicate@example.com",
  ];

  // First find users with test emails
  const testUsers = await db
    .select()
    .from(users)
    .where(inArray(users.email, testEmails));

  // Extract workspace IDs from test users
  const workspaceIds = testUsers
    .map((user) => user.defaultWorkspace)
    .filter((id): id is number => id !== null);

  // Delete in correct order to maintain referential integrity
  await db.delete(channels).where(inArray(channels.workspaceId, workspaceIds));
  await db
    .delete(workspaces)
    .where(inArray(workspaces.workspaceId, workspaceIds));
  await db.delete(users).where(inArray(users.email, testEmails));
});

// Cleanup after each test
afterEach(async () => {
  const testEmails = [
    "test@example.com",
    "login.test@example.com",
    "verify.test@example.com",
    "refresh.test@example.com",
    "logout.test@example.com",
    "duplicate@example.com",
  ];

  // First find users with test emails
  const testUsers = await db
    .select()
    .from(users)
    .where(inArray(users.email, testEmails));

  // Extract workspace IDs from test users
  const workspaceIds = testUsers
    .map((user) => user.defaultWorkspace)
    .filter((id): id is number => id !== null);

  // Delete in correct order to maintain referential integrity
  await db.delete(channels).where(inArray(channels.workspaceId, workspaceIds));
  await db
    .delete(workspaces)
    .where(inArray(workspaces.workspaceId, workspaceIds));
  await db.delete(users).where(inArray(users.email, testEmails));
});

// Final cleanup
afterAll(async () => {
  const testEmails = [
    "test@example.com",
    "login.test@example.com",
    "verify.test@example.com",
    "refresh.test@example.com",
    "logout.test@example.com",
    "duplicate@example.com",
  ];

  // First find users with test emails
  const testUsers = await db
    .select()
    .from(users)
    .where(inArray(users.email, testEmails));

  // Extract workspace IDs from test users
  const workspaceIds = testUsers
    .map((user) => user.defaultWorkspace)
    .filter((id): id is number => id !== null);

  // Delete in correct order to maintain referential integrity
  await db.delete(channels).where(inArray(channels.workspaceId, workspaceIds));
  await db
    .delete(workspaces)
    .where(inArray(workspaces.workspaceId, workspaceIds));
  await db.delete(users).where(inArray(users.email, testEmails));

  // Close any remaining server connections
  if (global.server) {
    await new Promise<void>((resolve) => {
      global.server.close(() => resolve());
    });
  }
  // Close database connection
  // await db.();
}, 10000);
