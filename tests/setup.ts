import { db } from '../db';
import { users, workspaces, channels } from '../db/schema';
import { eq, inArray } from 'drizzle-orm';
import '@jest/globals';

// Increase test timeout for slower DB operations
jest.setTimeout(30000);

// Global setup before all tests
beforeAll(async () => {
  // Database is already configured through the DATABASE_URL environment variable
  // Clean up any existing test data
  const testEmails = [
    'test@example.com',
    'login.test@example.com', 
    'verify.test@example.com',
    'refresh.test@example.com',
    'logout.test@example.com',
    'duplicate@example.com'
  ];

  // First find users with test emails
  const testUsers = await db.select().from(users).where(inArray(users.email, testEmails));

  // Get workspace IDs owned by test users
  const testUserIds = testUsers.map(user => user.userId);
  const testWorkspaces = await db.select().from(workspaces).where(inArray(workspaces.userId, testUserIds));
  const workspaceIds = testWorkspaces.map(ws => ws.workspaceId);

  // Delete in correct order to maintain referential integrity
  await db.delete(channels).where(inArray(channels.workspaceId, workspaceIds));
  await db.delete(workspaces).where(inArray(workspaces.workspaceId, workspaceIds));
  await db.delete(users).where(inArray(users.email, testEmails));
});

// Cleanup after each test
afterEach(async () => {
  const testEmails = [
    'test@example.com',
    'login.test@example.com', 
    'verify.test@example.com',
    'refresh.test@example.com',
    'logout.test@example.com',
    'duplicate@example.com'
  ];

  // First find users with test emails
  const testUsers = await db.select().from(users).where(inArray(users.email, testEmails));

  // Get workspace IDs owned by test users
  const testUserIds = testUsers.map(user => user.userId);
  const testWorkspaces = await db.select().from(workspaces).where(inArray(workspaces.userId, testUserIds));
  const workspaceIds = testWorkspaces.map(ws => ws.workspaceId);

  // Delete in correct order to maintain referential integrity
  await db.delete(channels).where(inArray(channels.workspaceId, workspaceIds));
  await db.delete(workspaces).where(inArray(workspaces.workspaceId, workspaceIds));
  await db.delete(users).where(inArray(users.email, testEmails));
});

// Final cleanup
afterAll(async () => {
  const testEmails = [
    'test@example.com',
    'login.test@example.com', 
    'verify.test@example.com',
    'refresh.test@example.com',
    'logout.test@example.com',
    'duplicate@example.com'
  ];

  // First find users with test emails
  const testUsers = await db.select().from(users).where(inArray(users.email, testEmails));

  // Get workspace IDs owned by test users
  const testUserIds = testUsers.map(user => user.userId);
  const testWorkspaces = await db.select().from(workspaces).where(inArray(workspaces.userId, testUserIds));
  const workspaceIds = testWorkspaces.map(ws => ws.workspaceId);

  // Delete in correct order to maintain referential integrity
  await db.delete(channels).where(inArray(channels.workspaceId, workspaceIds));
  await db.delete(workspaces).where(inArray(workspaces.workspaceId, workspaceIds));
  await db.delete(users).where(inArray(users.email, testEmails));
});