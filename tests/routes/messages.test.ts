import supertest from 'supertest';
import express from 'express';
import bcrypt from 'bcrypt';
import { registerRoutes } from '../../server/routes';
import { db } from '@db';
import { messages, users, channels, workspaces } from '@db/schema';
import { eq, and } from 'drizzle-orm';

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
  const testPassword = 'TestPassword123!';

  beforeEach(async () => {
    try {
      // Create test user with timestamp to ensure unique email
      const timestamp = new Date().getTime();
      const passwordHash = await bcrypt.hash(testPassword, 10);

      const [user] = await db.insert(users)
        .values({
          email: `message.test.${timestamp}@example.com`,
          passwordHash,
          displayName: 'Message Test User',
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
      expect(user.email).toContain('message.test');
      testUser = user;

      // Create test workspace
      const [workspace] = await db.insert(workspaces)
        .values({
          name: `Test Workspace ${timestamp}`,
          description: 'Test workspace for message endpoints',
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
      expect(response.body.messageId).toBeDefined();
      expect(response.body).toHaveProperty('content', 'Test message content');
      expect(parseInt(response.body.userId.toString())).toBe(parseInt(testUser.userId.toString()));
      expect(parseInt(response.body.channelId.toString())).toBe(parseInt(testChannel.channelId.toString()));
      expect(parseInt(response.body.workspaceId.toString())).toBe(parseInt(testWorkspace.workspaceId.toString()));
    });

    it('should create a reply to another message', async () => {
      // First create a parent message
      const parentResponse = await request
        .post(`/api/v1/channels/${testChannel.channelId}/messages`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          content: 'Parent message'
        });

      expect(parentResponse.status).toBe(201);
      expect(parentResponse.body.messageId).toBeDefined();

      const response = await request
        .post(`/api/v1/channels/${testChannel.channelId}/messages`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          content: 'Reply message',
          parentMessageId: parentResponse.body.messageId
        });

      expect(response.status).toBe(201);
      expect(response.body.messageId).toBeDefined();
      expect(parseInt(response.body.parentMessageId.toString())).toBe(parseInt(parentResponse.body.messageId.toString()));
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
        const [message] = await db.insert(messages)
          .values({
            workspaceId: parseInt(testWorkspace.workspaceId.toString()),
            channelId: parseInt(testChannel.channelId.toString()),
            userId: parseInt(testUser.userId.toString()),
            content: `Test message ${i + 1}`,
            deleted: false,
            postedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date()
          })
          .returning();

        // Verify message creation
        expect(message).toBeDefined();
        expect(message.messageId).toBeDefined();
        expect(message.content).toBe(`Test message ${i + 1}`);
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
      await db.update(messages)
        .set({ deleted: true })
        .where(eq(messages.channelId, parseInt(testChannel.channelId.toString())))
        .execute();

      const response = await request
        .get(`/api/v1/channels/${testChannel.channelId}/messages`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.every((msg: any) => !msg.deleted)).toBe(true);
    });

    it('should include deleted messages when requested', async () => {
      await db.update(messages)
        .set({ deleted: true })
        .where(eq(messages.channelId, parseInt(testChannel.channelId.toString())))
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

  afterEach(async () => {
    try {
      if (testWorkspace?.workspaceId) {
        // Clean up test data in reverse order of creation
        await db.delete(messages)
          .where(eq(messages.workspaceId, parseInt(testWorkspace.workspaceId.toString())));
        await db.delete(channels)
          .where(eq(channels.workspaceId, parseInt(testWorkspace.workspaceId.toString())));
        await db.delete(workspaces)
          .where(eq(workspaces.workspaceId, parseInt(testWorkspace.workspaceId.toString())));
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