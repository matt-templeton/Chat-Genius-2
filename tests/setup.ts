import { db } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';
import '@jest/globals';

// Increase test timeout for slower DB operations
jest.setTimeout(30000);

// Global setup before all tests
beforeAll(async () => {
  // Database is already configured through the DATABASE_URL environment variable
  // Clean up any existing test data
  await db.delete(users).where(eq(users.email, 'test@example.com'));
  await db.delete(users).where(eq(users.email, 'login.test@example.com'));
  await db.delete(users).where(eq(users.email, 'verify.test@example.com'));
  await db.delete(users).where(eq(users.email, 'refresh.test@example.com'));
  await db.delete(users).where(eq(users.email, 'logout.test@example.com'));
  await db.delete(users).where(eq(users.email, 'duplicate@example.com'));
});

// Cleanup after each test
afterEach(async () => {
  // Clean up test data after each test
  await db.delete(users).where(eq(users.email, 'test@example.com'));
  await db.delete(users).where(eq(users.email, 'login.test@example.com'));
  await db.delete(users).where(eq(users.email, 'verify.test@example.com'));
  await db.delete(users).where(eq(users.email, 'refresh.test@example.com'));
  await db.delete(users).where(eq(users.email, 'logout.test@example.com'));
  await db.delete(users).where(eq(users.email, 'duplicate@example.com'));
});

// Final cleanup
afterAll(async () => {
  // Clean up all test data one final time
  await db.delete(users).where(eq(users.email, 'test@example.com'));
  await db.delete(users).where(eq(users.email, 'login.test@example.com'));
  await db.delete(users).where(eq(users.email, 'verify.test@example.com'));
  await db.delete(users).where(eq(users.email, 'refresh.test@example.com'));
  await db.delete(users).where(eq(users.email, 'logout.test@example.com'));
  await db.delete(users).where(eq(users.email, 'duplicate@example.com'));
});