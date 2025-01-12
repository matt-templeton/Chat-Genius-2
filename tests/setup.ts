import { db } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';
import '@jest/globals';

// Increase test timeout for slower DB operations
jest.setTimeout(30000);

// Global setup before all tests
beforeAll(async () => {
  // Database is already configured through the DATABASE_URL environment variable
  // We can add additional setup here if needed
});

// Cleanup after all tests
afterAll(async () => {
  // Add cleanup logic if needed
});

// Reset state between tests
afterEach(async () => {
  // Clean up test data after each test
  // Note: We're using soft deletes, so we'll mark test data as deleted/archived
  try {
    const testUsers = await db.query.users.findMany({
      where: eq(users.email, 'test@example.com')
    });

    for (const user of testUsers) {
      await db.update(users).set({ deactivated: true }).where(eq(users.userId, user.userId));
    }
  } catch (error) {
    console.error('Error cleaning up test data:', error);
  }
});