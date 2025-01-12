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
      // Create test user with timestamp to ensure unique email
      const timestamp = new Date().getTime();
      const passwordHash = await bcrypt.hash(testPassword, 10);

      const [user] = await db.insert(users)
        .values({
          email: `reaction.test.${timestamp}@example.com`,
          passwordHash,
          displayName: 'Reaction Test User',
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
      expect(user.email).toContain('reaction.test');
      testUser = user;

      // Create test workspace
      const [workspace] = await db.insert(workspaces)
        .values({
          name: `Test Workspace ${timestamp}`,
          description: 'Test workspace for reaction endpoints',
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      // Verify workspace creation
      expect(workspace).toBeDefined();
      expect(workspace.workspaceId).toBeDefined();
      expect(typeof parseInt(workspace.workspaceId.toString())).toBe('number');
      expect(workspace.name).toContain('Test Workspace');
      testWorkspace = workspace;

      // Create test channel
      const [channel] = await db.insert(channels)
        .values({
          name: `test-channel-${timestamp}`,
          workspaceId: parseInt(testWorkspace.workspaceId.toString()),
          topic: 'Test Channel Topic',
          channelType: 'PUBLIC',
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      // Verify channel creation
      expect(channel).toBeDefined();
      expect(channel.channelId).toBeDefined();

      // Handle potentially null workspaceId
      if (!channel.workspaceId) {
        throw new Error('Channel created without workspaceId');
      }

      expect(typeof parseInt(channel.channelId.toString())).toBe('number');
      expect(typeof parseInt(channel.workspaceId.toString())).toBe('number');
      expect(parseInt(channel.workspaceId.toString())).toBe(parseInt(testWorkspace.workspaceId.toString()));
      testChannel = channel;

      // Create test message
      const [message] = await db.insert(messages)
        .values({
          workspaceId: parseInt(testWorkspace.workspaceId.toString()),
          channelId: parseInt(testChannel.channelId.toString()),
          userId: parseInt(testUser.userId.toString()),
          content: 'Test message for reactions',
          deleted: false,
          postedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      // Verify message creation
      expect(message).toBeDefined();
      expect(message.messageId).toBeDefined();
      expect(message.content).toBe('Test message for reactions');
      testMessage = message;

      // Create test emoji
      const [emoji] = await db.insert(emojis)
        .values({
          code: `:test-emoji-${timestamp}:`,
          deleted: false,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      // Verify emoji creation
      expect(emoji).toBeDefined();
      expect(emoji.emojiId).toBeDefined();
      expect(emoji.code).toContain('test-emoji');
      testEmoji = emoji;

      // Login to get access token
      const loginResponse = await request
        .post('/api/v1/auth/login')
        .send({
          email: user.email,
          password: testPassword
        });

      if (loginResponse.status !== 200) {
        console.error('Login failed:', loginResponse.body);
        throw new Error(`Login failed with status ${loginResponse.status}`);
      }

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

  describe('POST /api/v1/messages/:messageId/reactions', () => {
    it('should add a reaction to a message', async () => {
      const response = await request
        .post(`/api/v1/messages/${testMessage.messageId}/reactions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          emojiId: testEmoji.emojiId
        });

      expect(response.status).toBe(201);
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
      await db.insert(messageReactions)
        .values({
          messageId: parseInt(testMessage.messageId.toString()),
          workspaceId: parseInt(testWorkspace.workspaceId.toString()),
          emojiId: parseInt(testEmoji.emojiId.toString()),
          userId: parseInt(testUser.userId.toString()),
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
    });

    it('should remove a reaction from a message', async () => {
      const response = await request
        .delete(`/api/v1/messages/${testMessage.messageId}/reactions/${testEmoji.emojiId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(204);
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
      // Add some reactions to list
      await db.insert(messageReactions)
        .values({
          messageId: parseInt(testMessage.messageId.toString()),
          workspaceId: parseInt(testWorkspace.workspaceId.toString()),
          emojiId: parseInt(testEmoji.emojiId.toString()),
          userId: parseInt(testUser.userId.toString()),
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
    });

    it('should list all reactions for a message', async () => {
      const response = await request
        .get(`/api/v1/messages/${testMessage.messageId}/reactions`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toHaveProperty('emojiId', testEmoji.emojiId);
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
      if (testWorkspace?.workspaceId) {
        // Clean up test data in reverse order of creation
        await db.delete(messageReactions)
          .where(eq(messageReactions.workspaceId, parseInt(testWorkspace.workspaceId.toString())));
        await db.delete(messages)
          .where(eq(messages.workspaceId, parseInt(testWorkspace.workspaceId.toString())));
        await db.delete(channels)
          .where(eq(channels.workspaceId, parseInt(testWorkspace.workspaceId.toString())));
        await db.delete(workspaces)
          .where(eq(workspaces.workspaceId, parseInt(testWorkspace.workspaceId.toString())));
      }
      if (testEmoji?.emojiId) {
        await db.delete(emojis)
          .where(eq(emojis.emojiId, parseInt(testEmoji.emojiId.toString())));
      }
      if (testUser?.email) {
        await db.delete(users)
          .where(eq(users.email, testUser.email));
      }
    } catch (error) {
      console.error('Test cleanup failed:', error);
      throw error;
    }
  });
});
