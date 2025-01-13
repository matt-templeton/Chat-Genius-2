import supertest from 'supertest';
import express from 'express';
import bcrypt from 'bcrypt';
import { registerRoutes } from '../../server/routes';
import { db } from '@db';
import { messages, users, channels, workspaces, emojis, messageReactions } from '@db/schema';
import { eq, and } from 'drizzle-orm';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const server = registerRoutes(app);
const request = supertest(app);

describe('Reaction Endpoints', () => {
  let testUser: any;
  let testWorkspace: any;
  let testChannel: any;
  let testMessage: any;
  let testEmoji: any;
  let accessToken: string;
  const testPassword = 'TestPassword123!';

  beforeEach(async () => {
    try {
      // Create test user
      const timestamp = new Date().getTime();
      const passwordHash = await bcrypt.hash(testPassword, 10);

      const [user] = await db.insert(users)
        .values({
          email: `reaction.test.${timestamp}@example.com`,
          passwordHash,
          displayName: 'Reaction Test User',
          emailVerified: true
        })
        .returning();

      testUser = user;

      // Create test workspace
      const [workspace] = await db.insert(workspaces)
        .values({
          name: `Test Workspace ${timestamp}`,
          description: 'Test workspace for reaction endpoints'
        })
        .returning();

      testWorkspace = workspace;

      // Create test channel
      const [channel] = await db.insert(channels)
        .values({
          name: `test-channel-${timestamp}`,
          workspaceId: testWorkspace.workspaceId,
          topic: 'Test Channel Topic',
          channelType: 'PUBLIC'
        })
        .returning();

      testChannel = channel;

      // Create test message
      const [message] = await db.insert(messages)
        .values({
          workspaceId: testWorkspace.workspaceId,
          channelId: testChannel.channelId,
          userId: testUser.userId,
          content: 'Test message for reactions'
        })
        .returning();

      testMessage = message;

      // Create test emoji
      const [emoji] = await db.insert(emojis)
        .values({
          code: `:test-emoji-${timestamp}:`,
          deleted: false
        })
        .returning();

      testEmoji = emoji;

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

    } catch (error) {
      console.error('Test setup failed:', error);
      throw error;
    }
  });

  describe('POST /api/v1/messages/:messageId/reactions', () => {
    it('should add a reaction to a message', async () => {
      const response = await request
        .post(`/api/v1/messages/${testMessage.messageId}/reactions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          emojiId: testEmoji.emojiId
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('messageId', testMessage.messageId);
      expect(response.body).toHaveProperty('workspaceId', testMessage.workspaceId);
      expect(response.body).toHaveProperty('emojiId', testEmoji.emojiId);
      expect(response.body).toHaveProperty('userId', testUser.userId);
    });

    it('should prevent duplicate reactions from the same user', async () => {
      // Add first reaction
      const firstResponse = await request
        .post(`/api/v1/messages/${testMessage.messageId}/reactions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          emojiId: testEmoji.emojiId
        });

      expect(firstResponse.status).toBe(201);

      // Try to add the same reaction again
      const duplicateResponse = await request
        .post(`/api/v1/messages/${testMessage.messageId}/reactions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          emojiId: testEmoji.emojiId
        });

      expect(duplicateResponse.status).toBe(409);
      expect(duplicateResponse.body.details.code).toBe('DUPLICATE_REACTION');
    });

    it('should return 404 for non-existent message', async () => {
      const response = await request
        .post('/api/v1/messages/99999/reactions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          emojiId: testEmoji.emojiId
        });

      expect(response.status).toBe(404);
      expect(response.body.details.code).toBe('MESSAGE_NOT_FOUND');
    });

    it('should return 404 for non-existent emoji', async () => {
      const response = await request
        .post(`/api/v1/messages/${testMessage.messageId}/reactions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          emojiId: 99999
        });

      expect(response.status).toBe(404);
      expect(response.body.details.code).toBe('EMOJI_NOT_FOUND');
    });
  });

  describe('DELETE /api/v1/messages/:messageId/reactions/:emojiId', () => {
    beforeEach(async () => {
      // Add a reaction to delete
      await request
        .post(`/api/v1/messages/${testMessage.messageId}/reactions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          emojiId: testEmoji.emojiId
        });
    });

    it('should remove a reaction from a message', async () => {
      const response = await request
        .delete(`/api/v1/messages/${testMessage.messageId}/reactions/${testEmoji.emojiId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(204);

      // Verify reaction was deleted
      const reactions = await db.query.messageReactions.findMany({
        where: and(
          eq(messageReactions.messageId, testMessage.messageId),
          eq(messageReactions.workspaceId, testMessage.workspaceId),
          eq(messageReactions.emojiId, testEmoji.emojiId),
          eq(messageReactions.userId, testUser.userId)
        )
      });
      expect(reactions.length).toBe(0);
    });

    it('should return 404 for non-existent message', async () => {
      const response = await request
        .delete(`/api/v1/messages/99999/reactions/${testEmoji.emojiId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(404);
      expect(response.body.details.code).toBe('MESSAGE_NOT_FOUND');
    });
  });

  describe('GET /api/v1/messages/:messageId/reactions', () => {
    beforeEach(async () => {
      // Add a reaction to list
      await request
        .post(`/api/v1/messages/${testMessage.messageId}/reactions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          emojiId: testEmoji.emojiId
        });
    });

    it('should list all reactions for a message', async () => {
      const response = await request
        .get(`/api/v1/messages/${testMessage.messageId}/reactions`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toHaveProperty('messageId', testMessage.messageId);
      expect(response.body[0]).toHaveProperty('workspaceId', testMessage.workspaceId);
      expect(response.body[0]).toHaveProperty('emojiId', testEmoji.emojiId);
      expect(response.body[0]).toHaveProperty('userId', testUser.userId);
    });

    it('should return 404 for non-existent message', async () => {
      const response = await request
        .get('/api/v1/messages/99999/reactions')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(404);
      expect(response.body.details.code).toBe('MESSAGE_NOT_FOUND');
    });
  });

  afterEach(async () => {
    try {
      // Clean up test data in reverse order of creation
      await db.delete(messageReactions)
        .where(and(
          eq(messageReactions.messageId, testMessage.messageId),
          eq(messageReactions.workspaceId, testMessage.workspaceId)
        ));

      await db.delete(messages)
        .where(eq(messages.messageId, testMessage.messageId));

      await db.delete(emojis)
        .where(eq(emojis.emojiId, testEmoji.emojiId));

      await db.delete(channels)
        .where(eq(channels.channelId, testChannel.channelId));

      await db.delete(workspaces)
        .where(eq(workspaces.workspaceId, testWorkspace.workspaceId));

      await db.delete(users)
        .where(eq(users.userId, testUser.userId));
    } catch (error) {
      console.error('Test cleanup failed:', error);
      throw error;
    }
  });
});