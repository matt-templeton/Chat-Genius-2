import supertest from 'supertest';
import express from 'express';
import bcrypt from 'bcrypt';
import { registerRoutes } from '../../server/routes';
import { db } from '@db';
import { emojis, users } from '@db/schema';
import { eq, and, desc, like, sql } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { isAuthenticated } from '../../server/middleware/auth';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const server = registerRoutes(app);
const request = supertest(app);

describe('Emoji Endpoints', () => {
  let testUser: any;
  let testEmoji: any;
  let accessToken: string;
  const testPassword = 'TestPassword123!';

  beforeEach(async () => {
    try {
      // First clean up all existing emojis to ensure a clean state
      await db.delete(emojis);

      // Create test user with timestamp to ensure unique email
      const timestamp = new Date().getTime();
      const passwordHash = await bcrypt.hash(testPassword, 10);

      const [user] = await db.insert(users)
        .values({
          email: `emoji.test.${timestamp}@example.com`,
          passwordHash,
          displayName: 'Emoji Test User',
          emailVerified: true,
          deactivated: false,
          lastKnownPresence: 'ONLINE',
          lastLogin: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      // Verify user creation
      expect(user).toBeDefined();
      expect(user.userId).toBeDefined();
      expect(typeof parseInt(user.userId.toString())).toBe('number');
      expect(user.email).toContain('emoji.test');
      testUser = user;

      // Login to get access token
      const loginResponse = await request
        .post('/api/v1/auth/login')
        .send({
          email: user.email,
          password: testPassword
        });

      expect(loginResponse.status).toBe(200);
      expect(loginResponse.body).toHaveProperty('accessToken');
      accessToken = loginResponse.body.accessToken;
      expect(accessToken).toBeDefined();
      expect(typeof accessToken).toBe('string');

    } catch (error) {
      console.error('Test setup failed:', error);
      throw error;
    }
  });

  describe('GET /api/v1/emojis', () => {
    const testTimestamp = new Date().getTime();

    beforeEach(async () => {
      try {
        // Create multiple test emojis for pagination testing
        const emojiCodes = ['emoji1', 'emoji2', 'emoji3', 'emoji4', 'emoji5'];
        for (const code of emojiCodes) {
          const [emoji] = await db.insert(emojis)
            .values({
              code: `test_emoji_${code}_${testTimestamp}`,
              deleted: false,
              createdAt: new Date(),
              updatedAt: new Date()
            })
            .returning();

          // Verify emoji creation
          expect(emoji).toBeDefined();
          expect(emoji.emojiId).toBeDefined();
          expect(typeof parseInt(emoji.emojiId.toString())).toBe('number');
          expect(emoji.code).toContain(`test_emoji_${code}_${testTimestamp}`);
        }

        // Verify total count of test emojis
        const totalCount = await db.select({ 
          count: sql<number>`cast(count(*) as integer)` 
        })
        .from(emojis)
        .where(eq(emojis.deleted, false));

        expect(totalCount[0].count).toBe(5);

      } catch (error) {
        console.error('Error setting up test emojis:', error);
        throw error;
      }
    });

    it('should list emojis with pagination', async () => {
      const response = await request
        .get('/api/v1/emojis')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);

      // Verify correct pagination metadata
      expect(response.body).toHaveProperty('pagination');
      expect(response.body.pagination).toMatchObject({
        currentPage: 1,
        itemsPerPage: 20,
        totalItems: 5,  // Only our test emojis
        totalPages: 1   // With 20 items per page, 5 items fit on one page
      });

      // Verify data matches our test emojis
      response.body.data.forEach((emoji: any) => {
        expect(emoji.code).toContain(`test_emoji_`);
        expect(emoji.code).toContain(testTimestamp.toString());
      });
    });

    it('should respect pagination parameters and return correct metadata', async () => {
      const response = await request
        .get('/api/v1/emojis')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ page: 2, limit: 2 });  // Get second page with 2 items per page

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);  // Should return 2 items
      expect(response.body.pagination).toMatchObject({
        currentPage: 2,
        itemsPerPage: 2,
        totalItems: 5,  // Only our test emojis
        totalPages: 3   // 5 items ÷ 2 per page = 3 pages (rounded up)
      });

      // Verify the returned emojis are different from first page
      const firstPageResponse = await request
        .get('/api/v1/emojis')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ page: 1, limit: 2 });

      expect(firstPageResponse.status).toBe(200);
      const firstPageIds = firstPageResponse.body.data.map((e: any) => e.emojiId);
      const secondPageIds = response.body.data.map((e: any) => e.emojiId);
      expect(firstPageIds).not.toEqual(secondPageIds);

      // Verify all returned emojis are from our test set
      [...firstPageResponse.body.data, ...response.body.data].forEach((emoji: any) => {
        expect(emoji.code).toContain(`test_emoji_`);
        expect(emoji.code).toContain(testTimestamp.toString());
      });
    });

    it('should validate minimum pagination parameters', async () => {
      const response = await request
        .get('/api/v1/emojis')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ page: 0, limit: 0 }); // Invalid values below minimum

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('INVALID_REQUEST');
    });

    it('should validate maximum pagination limit', async () => {
      const response = await request
        .get('/api/v1/emojis')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ page: 1, limit: 101 }); // Exceeds maximum limit of 100

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('INVALID_REQUEST');
    });

    it('should exclude deleted emojis', async () => {
      // Create a deleted emoji
      const [deletedEmoji] = await db.insert(emojis)
        .values({
          code: `test_emoji_deleted_${testTimestamp}`,
          deleted: true,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      expect(deletedEmoji).toBeDefined();
      expect(deletedEmoji.deleted).toBe(true);

      const response = await request
        .get('/api/v1/emojis')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.every((emoji: any) => !emoji.deleted)).toBe(true);
      expect(response.body.data.every((emoji: any) => 
        emoji.code.includes(`test_emoji_`) && 
        emoji.code.includes(testTimestamp.toString())
      )).toBe(true);
    });

    it('should return 401 without authentication', async () => {
      const response = await request.get('/api/v1/emojis');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('UNAUTHORIZED');
    });
  });

  describe('POST /api/v1/emojis', () => {
    it('should create a new emoji', async () => {
      const timestamp = new Date().getTime();
      const response = await request
        .post('/api/v1/emojis')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          code: `test_emoji_${timestamp}`
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('emojiId');
      expect(response.body).toHaveProperty('code', `test_emoji_${timestamp}`);
      expect(response.body).toHaveProperty('deleted', false);
      expect(response.body).toHaveProperty('createdAt');
      expect(response.body).toHaveProperty('updatedAt');
      testEmoji = response.body;

      // Verify emoji creation in database
      const emoji = await db.query.emojis.findFirst({
        where: eq(emojis.emojiId, testEmoji.emojiId)
      });
      expect(emoji).toBeDefined();
      expect(emoji?.code).toBe(`test_emoji_${timestamp}`);
      expect(emoji?.deleted).toBe(false);
    });

    it('should return 400 with invalid data', async () => {
      const response = await request
        .post('/api/v1/emojis')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          // Missing required code field
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('INVALID_REQUEST');
      expect(response.body.details).toHaveProperty('validationErrors');
    });

    it('should validate emoji code length constraints', async () => {
      const response = await request
        .post('/api/v1/emojis')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          code: 'a'.repeat(51) // Exceeds maxLength: 50
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('INVALID_REQUEST');
      expect(response.body.details).toHaveProperty('validationErrors');
    });

    it('should return 409 when emoji code already exists', async () => {
      const timestamp = new Date().getTime();
      const emojiCode = `duplicate_emoji_${timestamp}`;

      // First create an emoji
      const firstResponse = await request
        .post('/api/v1/emojis')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          code: emojiCode
        });

      expect(firstResponse.status).toBe(201);

      // Try to create another emoji with the same code
      const response = await request
        .post('/api/v1/emojis')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          code: emojiCode
        });

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('EMOJI_EXISTS');
    });

    it('should return 401 without authentication', async () => {
      const response = await request
        .post('/api/v1/emojis')
        .send({
          code: 'test_emoji'
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('UNAUTHORIZED');
    });

    it('should validate emoji code format strictly', async () => {
      // Test empty code
      const emptyResponse = await request
        .post('/api/v1/emojis')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ code: '' });

      expect(emptyResponse.status).toBe(400);
      expect(emptyResponse.body.details.code).toBe('INVALID_REQUEST');

      // Test code exceeding maximum length
      const longCode = 'a'.repeat(51);  // Max length is 50
      const longResponse = await request
        .post('/api/v1/emojis')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ code: longCode });

      expect(longResponse.status).toBe(400);
      expect(longResponse.body.details.code).toBe('INVALID_REQUEST');

      // Test missing code field
      const missingResponse = await request
        .post('/api/v1/emojis')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({});

      expect(missingResponse.status).toBe(400);
      expect(missingResponse.body.details.code).toBe('INVALID_REQUEST');
    });
  });

  describe('GET /api/v1/emojis/{emojiId}', () => {
    beforeEach(async () => {
      const timestamp = new Date().getTime();
      // Create a test emoji
      const [emoji] = await db.insert(emojis)
        .values({
          code: `test_emoji_details_${timestamp}`,
          deleted: false,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      expect(emoji).toBeDefined();
      expect(emoji.emojiId).toBeDefined();
      testEmoji = emoji;
    });

    it('should return emoji details', async () => {
      const response = await request
        .get(`/api/v1/emojis/${testEmoji.emojiId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        emojiId: testEmoji.emojiId,
        code: testEmoji.code,
        deleted: false
      });
      expect(response.body).toHaveProperty('createdAt');
      expect(response.body).toHaveProperty('updatedAt');
    });

    it('should return deleted emoji details if it exists', async () => {
      // First soft delete the emoji
      await db.update(emojis)
        .set({ deleted: true, updatedAt: new Date() })
        .where(eq(emojis.emojiId, testEmoji.emojiId));

      const response = await request
        .get(`/api/v1/emojis/${testEmoji.emojiId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        emojiId: testEmoji.emojiId,
        code: testEmoji.code,
        deleted: true
      });
    });

    it('should return 404 for non-existent emoji', async () => {
      const response = await request
        .get('/api/v1/emojis/99999')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('EMOJI_NOT_FOUND');
    });

    it('should return 401 without authentication', async () => {
      const response = await request
        .get(`/api/v1/emojis/${testEmoji.emojiId}`);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('UNAUTHORIZED');
    });
  });

  describe('DELETE /api/v1/emojis/{emojiId}', () => {
    beforeEach(async () => {
      const timestamp = new Date().getTime();
      // Create a test emoji for deletion
      const [emoji] = await db.insert(emojis)
        .values({
          code: `test_emoji_delete_${timestamp}`,
          deleted: false,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      expect(emoji).toBeDefined();
      expect(emoji.emojiId).toBeDefined();
      testEmoji = emoji;
    });

    it('should soft delete an emoji', async () => {
      const response = await request
        .delete(`/api/v1/emojis/${testEmoji.emojiId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(204);

      // Verify emoji is soft deleted in database
      const emoji = await db.query.emojis.findFirst({
        where: eq(emojis.emojiId, testEmoji.emojiId)
      });
      expect(emoji).toBeDefined();
      expect(emoji?.deleted).toBe(true);
      expect(emoji?.updatedAt).not.toEqual(testEmoji.updatedAt);
    });

    it('should return 404 for non-existent emoji', async () => {
      const response = await request
        .delete('/api/v1/emojis/99999')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('EMOJI_NOT_FOUND');
    });

    it('should return 401 without authentication', async () => {
      const response = await request
        .delete(`/api/v1/emojis/${testEmoji.emojiId}`);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('UNAUTHORIZED');
    });
  });

  afterEach(async () => {
    try {
      // Clean up test data
      await db.delete(emojis);

      if (testUser?.userId) {
        await db.delete(users)
          .where(eq(users.userId, testUser.userId));
      }
    } catch (error) {
      console.error('Test cleanup failed:', error);
      throw error;
    }
  });
});