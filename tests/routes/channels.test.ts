import supertest from 'supertest';
import express from 'express';
import { registerRoutes } from '../../server/routes';
import { db } from '../../db';
import { channels, users, workspaces } from '../../db/schema';
import { eq } from 'drizzle-orm';

const app = express();
const server = registerRoutes(app);
const request = supertest(app);

describe('Channel Endpoints', () => {
  let adminAccessToken: string;
  let userAccessToken: string;
  let testWorkspaceId: number;
  let testChannelId: number;

  beforeAll(async () => {
    // Create and login an admin user
    await request
      .post('/api/v1/auth/register')
      .send({
        email: 'channel.admin@example.com',
        password: 'AdminPass123!',
        displayName: 'Channel Admin'
      });

    const adminLogin = await request
      .post('/api/v1/auth/login')
      .send({
        email: 'channel.admin@example.com',
        password: 'AdminPass123!'
      });

    adminAccessToken = adminLogin.body.accessToken;

    // Create and login a regular user
    await request
      .post('/api/v1/auth/register')
      .send({
        email: 'channel.user@example.com',
        password: 'UserPass123!',
        displayName: 'Channel User'
      });

    const userLogin = await request
      .post('/api/v1/auth/login')
      .send({
        email: 'channel.user@example.com',
        password: 'UserPass123!'
      });

    userAccessToken = userLogin.body.accessToken;

    // Create a test workspace
    const workspaceResponse = await request
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({
        name: 'Test Workspace for Channels',
        description: 'Test workspace for channel operations'
      });

    testWorkspaceId = workspaceResponse.body.workspaceId;
  });

  describe('GET /api/v1/workspaces/{workspaceId}/channels', () => {
    it('should list channels in a workspace', async () => {
      const response = await request
        .get(`/api/v1/workspaces/${testWorkspaceId}/channels`)
        .set('Authorization', `Bearer ${adminAccessToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should exclude archived channels by default', async () => {
      const response = await request
        .get(`/api/v1/workspaces/${testWorkspaceId}/channels`)
        .set('Authorization', `Bearer ${adminAccessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.every((channel: any) => !channel.archived)).toBe(true);
    });

    it('should include archived channels when includeArchived=true', async () => {
      const response = await request
        .get(`/api/v1/workspaces/${testWorkspaceId}/channels?includeArchived=true`)
        .set('Authorization', `Bearer ${adminAccessToken}`);

      expect(response.status).toBe(200);
      // Some channels might be archived
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('POST /api/v1/channels', () => {
    it('should create a new channel', async () => {
      const response = await request
        .post('/api/v1/channels')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          workspaceId: testWorkspaceId,
          name: 'test-channel',
          topic: 'Test Channel Topic',
          channelType: 'PUBLIC'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('name', 'test-channel');
      expect(response.body).toHaveProperty('topic', 'Test Channel Topic');
      expect(response.body).toHaveProperty('channelType', 'PUBLIC');
      testChannelId = response.body.channelId;
    });

    it('should return 400 with invalid data', async () => {
      const response = await request
        .post('/api/v1/channels')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          workspaceId: testWorkspaceId,
          // Missing required name field
          topic: 'Invalid Channel'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/v1/channels/{channelId}', () => {
    it('should return channel details', async () => {
      const response = await request
        .get(`/api/v1/channels/${testChannelId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('name', 'test-channel');
      expect(response.body).toHaveProperty('workspaceId', testWorkspaceId);
    });

    it('should return 404 for non-existent channel', async () => {
      const response = await request
        .get('/api/v1/channels/99999')
        .set('Authorization', `Bearer ${adminAccessToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('CHANNEL_NOT_FOUND');
    });
  });

  describe('PUT /api/v1/channels/{channelId}', () => {
    it('should update channel details', async () => {
      const response = await request
        .put(`/api/v1/channels/${testChannelId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          name: 'updated-channel',
          topic: 'Updated Topic'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('name', 'updated-channel');
      expect(response.body).toHaveProperty('topic', 'Updated Topic');
    });

    it('should return 404 for non-existent channel', async () => {
      const response = await request
        .put('/api/v1/channels/99999')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          name: 'updated-channel',
          topic: 'Updated Topic'
        });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('CHANNEL_NOT_FOUND');
    });
  });

  describe('DELETE /api/v1/channels/{channelId}', () => {
    it('should archive a channel (soft-delete)', async () => {
      const response = await request
        .delete(`/api/v1/channels/${testChannelId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`);

      expect(response.status).toBe(204);

      // Verify channel is archived
      const channel = await db.query.channels.findFirst({
        where: eq(channels.channelId, testChannelId)
      });
      expect(channel?.archived).toBe(true);
    });

    it('should return 404 for non-existent channel', async () => {
      const response = await request
        .delete('/api/v1/channels/99999')
        .set('Authorization', `Bearer ${adminAccessToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('CHANNEL_NOT_FOUND');
    });
  });

  describe('POST /api/v1/channels/{channelId}/members', () => {
    it('should add a member to the channel', async () => {
      const response = await request
        .post(`/api/v1/channels/${testChannelId}/members`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          userId: 2 // Assuming this is the user's ID
        });

      expect(response.status).toBe(201);
    });

    it('should return 404 for non-existent channel', async () => {
      const response = await request
        .post('/api/v1/channels/99999/members')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          userId: 2
        });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('CHANNEL_NOT_FOUND');
    });
  });

  describe('DELETE /api/v1/channels/{channelId}/members', () => {
    it('should remove a member from the channel', async () => {
      const response = await request
        .delete(`/api/v1/channels/${testChannelId}/members?userId=2`)
        .set('Authorization', `Bearer ${adminAccessToken}`);

      expect(response.status).toBe(204);
    });

    it('should return 404 for non-existent channel', async () => {
      const response = await request
        .delete('/api/v1/channels/99999/members?userId=2')
        .set('Authorization', `Bearer ${adminAccessToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('CHANNEL_NOT_FOUND');
    });
  });
});
