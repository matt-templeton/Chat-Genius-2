import supertest from 'supertest';
import express from 'express';
import bcrypt from 'bcrypt';
import { registerRoutes } from '../../server/routes';
import { db } from '@db';
import { messages, users, channels, workspaces, pinnedMessages } from '@db/schema';
import { eq, and } from 'drizzle-orm';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const server = registerRoutes(app);
const request = supertest(app);

describe('Pin Endpoints', () => {
  let testUser: any;
  let testWorkspace: any;
  let testChannel: any;
  let testMessage: any;
  let accessToken: string;
  const testPassword = 'TestPassword123!';

  beforeEach(async () => {
    try {
      // Create test user
      const timestamp = new Date().getTime();
      const passwordHash = await bcrypt.hash(testPassword, 10);

      const [user] = await db.insert(users)
        .values({
          email: `pin.test.${timestamp}@example.com`,
          passwordHash,
          displayName: 'Pin Test User',
          emailVerified: true
        })
        .returning();

      testUser = user;

      // Create test workspace
      const [workspace] = await db.insert(workspaces)
        .values({
          name: `Test Workspace ${timestamp}`,
          description: 'Test workspace for pin endpoints'
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
          content: 'Test message for pins'
        })
        .returning();

      testMessage = message;

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

  describe('POST /api/v1/messages/:messageId/pin', () => {
    it('should pin a message', async () => {
      const response = await request
        .post(`/api/v1/messages/${testMessage.messageId}/pin`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          reason: 'Important message'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('messageId', testMessage.messageId);
      expect(response.body).toHaveProperty('workspaceId', testMessage.workspaceId);
      expect(response.body).toHaveProperty('pinnedBy', testUser.userId);
      expect(response.body).toHaveProperty('pinnedReason', 'Important message');
    });

    it('should prevent duplicate pins of the same message', async () => {
      // First pin
      await request
        .post(`/api/v1/messages/${testMessage.messageId}/pin`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          reason: 'Important message'
        });

      // Try to pin again
      const response = await request
        .post(`/api/v1/messages/${testMessage.messageId}/pin`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          reason: 'Important message again'
        });

      expect(response.status).toBe(409);
      expect(response.body.details.code).toBe('ALREADY_PINNED');
    });

    it('should return 404 for non-existent message', async () => {
      const response = await request
        .post('/api/v1/messages/99999/pin')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          reason: 'Important message'
        });

      expect(response.status).toBe(404);
      expect(response.body.details.code).toBe('MESSAGE_NOT_FOUND');
    });

    it('should return 401 when not authenticated', async () => {
      const response = await request
        .post(`/api/v1/messages/${testMessage.messageId}/pin`)
        .send({
          reason: 'Important message'
        });

      expect(response.status).toBe(401);
      expect(response.body.details.code).toBe('UNAUTHORIZED');
    });

    it('should validate pin reason length', async () => {
      const response = await request
        .post(`/api/v1/messages/${testMessage.messageId}/pin`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          reason: 'x'.repeat(501) // Assuming max length is 500 characters
        });

      expect(response.status).toBe(400);
      expect(response.body.details.code).toBe('INVALID_PIN_REASON');
    });
  });

  describe('DELETE /api/v1/messages/:messageId/pin', () => {
    beforeEach(async () => {
      // Add a pin to delete
      await request
        .post(`/api/v1/messages/${testMessage.messageId}/pin`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          reason: 'Pin to be deleted'
        });
    });

    it('should unpin a message', async () => {
      const response = await request
        .delete(`/api/v1/messages/${testMessage.messageId}/pin`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(204);

      // Verify pin was deleted
      const pins = await db.query.pinnedMessages.findMany({
        where: and(
          eq(pinnedMessages.messageId, testMessage.messageId),
          eq(pinnedMessages.workspaceId, testMessage.workspaceId)
        )
      });
      expect(pins.length).toBe(0);
    });

    it('should return 404 for non-existent message', async () => {
      const response = await request
        .delete('/api/v1/messages/99999/pin')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(404);
      expect(response.body.details.code).toBe('MESSAGE_NOT_FOUND');
    });

    it('should return 401 when not authenticated', async () => {
      const response = await request
        .delete(`/api/v1/messages/${testMessage.messageId}/pin`);

      expect(response.status).toBe(401);
      expect(response.body.details.code).toBe('UNAUTHORIZED');
    });
  });

  describe('GET /api/v1/messages/channel/:channelId/pins', () => {
    beforeEach(async () => {
      // Add a pin to list
      await request
        .post(`/api/v1/messages/${testMessage.messageId}/pin`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          reason: 'Pin to be listed'
        });
    });

    it('should list all pinned messages in a channel', async () => {
      const response = await request
        .get(`/api/v1/messages/channel/${testChannel.channelId}/pins`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toHaveProperty('messageId', testMessage.messageId);
      expect(response.body[0]).toHaveProperty('workspaceId', testMessage.workspaceId);
      expect(response.body[0]).toHaveProperty('pinnedBy', testUser.userId);
      expect(response.body[0]).toHaveProperty('pinnedReason', 'Pin to be listed');
    });

    it('should return empty array for channel with no pins', async () => {
      // Create a new empty channel
      const [emptyChannel] = await db.insert(channels)
        .values({
          name: `empty-channel-${Date.now()}`,
          workspaceId: testWorkspace.workspaceId,
          topic: 'Empty Channel',
          channelType: 'PUBLIC'
        })
        .returning();

      const response = await request
        .get(`/api/v1/messages/channel/${emptyChannel.channelId}/pins`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(0);
    });

    it('should return 401 when not authenticated', async () => {
      const response = await request
        .get(`/api/v1/messages/channel/${testChannel.channelId}/pins`);

      expect(response.status).toBe(401);
      expect(response.body.details.code).toBe('UNAUTHORIZED');
    });

    it('should return 404 for invalid channel ID', async () => {
      const response = await request
        .get('/api/v1/messages/channel/99999/pins')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(404);
      expect(response.body.details.code).toBe('CHANNEL_NOT_FOUND');
    });
  });

  afterEach(async () => {
    try {
      // Clean up test data in reverse order of creation
      await db.delete(pinnedMessages)
        .where(and(
          eq(pinnedMessages.messageId, testMessage.messageId),
          eq(pinnedMessages.workspaceId, testMessage.workspaceId)
        ));

      await db.delete(messages)
        .where(eq(messages.messageId, testMessage.messageId));

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