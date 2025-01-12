import supertest from 'supertest';
import express from 'express';
import { registerRoutes } from '../../server/routes';
import { db } from '../../db';
import { messages, users, channels, workspaces } from '../../db/schema';
import { eq } from 'drizzle-orm';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const server = registerRoutes(app);
const request = supertest(app);

describe('Message Endpoints', () => {
  let testUser: any;
  let testWorkspace: any;
  let testChannel: any;
  let accessToken: string;

  beforeEach(async () => {
    // Create test user
    const [user] = await db.insert(users)
      .values({
        email: 'message.test@example.com',
        passwordHash: 'hashed_password',
        displayName: 'Message Test User',
        emailVerified: true,
        deactivated: false,
        lastKnownPresence: 'ONLINE',
        lastLogin: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    testUser = user;

    // Create test workspace
    const [workspace] = await db.insert(workspaces)
      .values({
        workspaceId: 1,
        description: 'Test Workspace',
        userId: testUser.userId,
        createdAt: new Date(),
        updatedAt: new Date(),
        archived: false
      })
      .returning();
    testWorkspace = workspace;

    // Create test channel
    const [channel] = await db.insert(channels)
      .values({
        channelId: 1,
        workspaceId: testWorkspace.workspaceId,
        userId: testUser.userId,
        channelType: 'PUBLIC',
        description: 'test-channel',
        createdAt: new Date(),
        updatedAt: new Date(),
        archived: false
      })
      .returning();
    testChannel = channel;

    // Login to get access token
    const loginResponse = await request
      .post('/api/v1/auth/login')
      .send({
        email: 'message.test@example.com',
        password: 'TestPassword123!'
      });

    accessToken = loginResponse.body.accessToken;
  });

  describe('POST /api/v1/channels/:channelId/messages', () => {
    it('should create a new message in the channel', async () => {
      const response = await request
        .post(`/api/v1/channels/${testChannel.channelId}/messages`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          content: 'Test message content'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('messageId');
      expect(response.body).toHaveProperty('content', 'Test message content');
      expect(response.body).toHaveProperty('userId', testUser.userId);
      expect(response.body).toHaveProperty('channelId', testChannel.channelId);
      expect(response.body).toHaveProperty('workspaceId', testWorkspace.workspaceId);
    });

    it('should create a reply to another message', async () => {
      // First create a parent message
      const parentResponse = await request
        .post(`/api/v1/channels/${testChannel.channelId}/messages`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          content: 'Parent message'
        });

      const response = await request
        .post(`/api/v1/channels/${testChannel.channelId}/messages`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          content: 'Reply message',
          parentMessageId: parentResponse.body.messageId
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('parentMessageId', parentResponse.body.messageId);
    });

    it('should return 404 for non-existent channel', async () => {
      const response = await request
        .post('/api/v1/channels/99999/messages')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          content: 'Test message'
        });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('CHANNEL_NOT_FOUND');
    });

    it('should return 401 without authentication', async () => {
      const response = await request
        .post(`/api/v1/channels/${testChannel.channelId}/messages`)
        .send({
          content: 'Test message'
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('UNAUTHORIZED');
    });
  });

  describe('GET /api/v1/channels/:channelId/messages', () => {
    beforeEach(async () => {
      // Create some test messages
      for (let i = 0; i < 5; i++) {
        await db.insert(messages).values({
          workspaceId: testWorkspace.workspaceId,
          channelId: testChannel.channelId,
          userId: testUser.userId,
          content: `Test message ${i + 1}`,
          deleted: false,
          postedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }
    });

    it('should list messages in channel with pagination', async () => {
      const response = await request
        .get(`/api/v1/channels/${testChannel.channelId}/messages`)
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ limit: 3 });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(3);
    });

    it('should exclude deleted messages by default', async () => {
      // Mark one message as deleted
      await db.update(messages)
        .set({ deleted: true })
        .where(eq(messages.channelId, testChannel.channelId))
        .execute();

      const response = await request
        .get(`/api/v1/channels/${testChannel.channelId}/messages`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.every((msg: any) => !msg.deleted)).toBe(true);
    });

    it('should include deleted messages when requested', async () => {
      // Mark one message as deleted
      await db.update(messages)
        .set({ deleted: true })
        .where(eq(messages.channelId, testChannel.channelId))
        .execute();

      const response = await request
        .get(`/api/v1/channels/${testChannel.channelId}/messages`)
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ includeDeleted: true });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.some((msg: any) => msg.deleted)).toBe(true);
    });
  });

  describe('PUT /api/v1/messages/:messageId', () => {
    let testMessage: any;

    beforeEach(async () => {
      // Create a test message
      const [message] = await db.insert(messages)
        .values({
          workspaceId: testWorkspace.workspaceId,
          channelId: testChannel.channelId,
          userId: testUser.userId,
          content: 'Original content',
          deleted: false,
          postedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
      testMessage = message;
    });

    it('should update message content', async () => {
      const response = await request
        .put(`/api/v1/messages/${testMessage.messageId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          content: 'Updated content'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('content', 'Updated content');
    });

    it('should return 403 when trying to update another user\'s message', async () => {
      // Create another user and their message
      const [otherUser] = await db.insert(users)
        .values({
          email: 'other.user@example.com',
          passwordHash: 'hashed_password',
          displayName: 'Other User',
          emailVerified: true,
          deactivated: false,
          lastKnownPresence: 'ONLINE',
          lastLogin: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      const [otherMessage] = await db.insert(messages)
        .values({
          workspaceId: testWorkspace.workspaceId,
          channelId: testChannel.channelId,
          userId: otherUser.userId,
          content: 'Other user\'s message',
          deleted: false,
          postedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      const response = await request
        .put(`/api/v1/messages/${otherMessage.messageId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          content: 'Trying to update other\'s message'
        });

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('NOT_MESSAGE_OWNER');
    });
  });

  describe('DELETE /api/v1/messages/:messageId', () => {
    let testMessage: any;

    beforeEach(async () => {
      // Create a test message
      const [message] = await db.insert(messages)
        .values({
          workspaceId: testWorkspace.workspaceId,
          channelId: testChannel.channelId,
          userId: testUser.userId,
          content: 'Message to delete',
          deleted: false,
          postedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
      testMessage = message;
    });

    it('should soft delete a message', async () => {
      const response = await request
        .delete(`/api/v1/messages/${testMessage.messageId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(204);

      // Verify message is marked as deleted
      const deletedMessage = await db.query.messages.findFirst({
        where: eq(messages.messageId, testMessage.messageId)
      });
      expect(deletedMessage?.deleted).toBe(true);
    });

    it('should return 403 when trying to delete another user\'s message', async () => {
      // Create another user and their message
      const [otherUser] = await db.insert(users)
        .values({
          email: 'other.user2@example.com',
          passwordHash: 'hashed_password',
          displayName: 'Other User 2',
          emailVerified: true,
          deactivated: false,
          lastKnownPresence: 'ONLINE',
          lastLogin: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      const [otherMessage] = await db.insert(messages)
        .values({
          workspaceId: testWorkspace.workspaceId,
          channelId: testChannel.channelId,
          userId: otherUser.userId,
          content: 'Other user\'s message',
          deleted: false,
          postedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      const response = await request
        .delete(`/api/v1/messages/${otherMessage.messageId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('NOT_MESSAGE_OWNER');
    });
  });

  afterEach(async () => {
    // Clean up test data
    await db.delete(messages).where(eq(messages.workspaceId, testWorkspace.workspaceId));
    await db.delete(channels).where(eq(channels.workspaceId, testWorkspace.workspaceId));
    await db.delete(workspaces).where(eq(workspaces.workspaceId, testWorkspace.workspaceId));
    await db.delete(users).where(eq(users.email, 'message.test@example.com'));
    await db.delete(users).where(eq(users.email, 'other.user@example.com'));
    await db.delete(users).where(eq(users.email, 'other.user2@example.com'));
  });
});