import supertest from 'supertest';
import express from 'express';
import bcrypt from 'bcrypt';
import { registerRoutes } from '../../server/routes';
import { db } from '@db';
import { channels, users, workspaces, userChannels, userWorkspaces } from '@db/schema';
import { eq, and } from 'drizzle-orm';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const server = registerRoutes(app);
const request = supertest(app);

describe('Channel Endpoints', () => {
  let testUser: any;
  let testWorkspace: any;
  let testChannel: any;
  let testMember: any;
  let accessToken: string;
  const testPassword = 'TestPassword123!';

  beforeEach(async () => {
    try {
      // Create test user with timestamp to ensure unique email
      const timestamp = new Date().getTime();
      const passwordHash = await bcrypt.hash(testPassword, 10);

      const [user] = await db.insert(users)
        .values({
          email: `channel.test.${timestamp}@example.com`,
          passwordHash,
          displayName: 'Channel Test User',
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
      expect(user.email).toContain('channel.test');
      testUser = user;

      // Create test member (another user) for member management tests
      const [member] = await db.insert(users)
        .values({
          email: `channel.member.${timestamp}@example.com`,
          passwordHash,
          displayName: 'Channel Member',
          emailVerified: true,
          deactivated: false,
          lastKnownPresence: 'ONLINE',
          lastLogin: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      // Verify member creation
      expect(member).toBeDefined();
      expect(member.userId).toBeDefined();
      testMember = member;

      // Create test workspace
      const [workspace] = await db.insert(workspaces)
        .values({
          name: `Test Workspace ${timestamp}`,
          description: 'Test workspace for channel endpoints',
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      // Verify workspace creation
      expect(workspace).toBeDefined();
      expect(workspace.workspaceId).toBeDefined();
      expect(typeof parseInt(workspace.workspaceId.toString())).toBe('number');
      testWorkspace = workspace;

      // Create workspace-user relationship
      await db.insert(userWorkspaces)
        .values({
          userId: testUser.userId,
          workspaceId: workspace.workspaceId,
          role: 'OWNER',
          createdAt: new Date(),
          updatedAt: new Date()
        });

      // Add test member to workspace
      await db.insert(userWorkspaces)
        .values({
          userId: testMember.userId,
          workspaceId: workspace.workspaceId,
          role: 'MEMBER',
          createdAt: new Date(),
          updatedAt: new Date()
        });

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

  describe('POST /api/v1/channels', () => {
    it('should create a new channel', async () => {
      const response = await request
        .post('/api/v1/channels')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          workspaceId: testWorkspace.workspaceId,
          name: 'test-channel',
          topic: 'Test Channel Topic',
          channelType: 'PUBLIC'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('channelId');
      expect(response.body).toHaveProperty('name', 'test-channel');
      expect(response.body).toHaveProperty('topic', 'Test Channel Topic');
      expect(response.body).toHaveProperty('channelType', 'PUBLIC');
      expect(response.body).toHaveProperty('workspaceId', testWorkspace.workspaceId);
      testChannel = response.body;

      // Verify channel creation in database
      const channel = await db.query.channels.findFirst({
        where: eq(channels.channelId, testChannel.channelId)
      });
      expect(channel).toBeDefined();
      expect(channel?.name).toBe('test-channel');

      // Verify creator was added as channel member
      const membership = await db.query.userChannels.findFirst({
        where: and(
          eq(userChannels.channelId, testChannel.channelId),
          eq(userChannels.userId, testUser.userId)
        )
      });
      expect(membership).toBeDefined();
    });

    it('should return 400 with invalid data', async () => {
      const response = await request
        .post('/api/v1/channels')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          workspaceId: testWorkspace.workspaceId,
          // Missing required name field
          topic: 'Invalid Channel'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('VALIDATION_ERROR');
    });

    it('should return 401 without authentication', async () => {
      const response = await request
        .post('/api/v1/channels')
        .send({
          workspaceId: testWorkspace.workspaceId,
          name: 'test-channel',
          topic: 'Test Channel Topic'
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('UNAUTHORIZED');
    });
  });

  describe('GET /api/v1/workspaces/{workspaceId}/channels', () => {
    beforeEach(async () => {
      // Create a test channel for listing
      const [channel] = await db.insert(channels)
        .values({
          name: `test-channel-${Date.now()}`,
          workspaceId: testWorkspace.workspaceId,
          topic: 'Test Channel Topic',
          channelType: 'PUBLIC',
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      expect(channel).toBeDefined();
      expect(channel.channelId).toBeDefined();
      testChannel = channel;

      // Add test user as channel member
      await db.insert(userChannels)
        .values({
          userId: testUser.userId,
          channelId: channel.channelId,
          createdAt: new Date(),
          updatedAt: new Date()
        });
    });

    it('should list channels in a workspace', async () => {
      const response = await request
        .get(`/api/v1/workspaces/${testWorkspace.workspaceId}/channels`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toHaveProperty('channelId');
      expect(response.body[0]).toHaveProperty('workspaceId', testWorkspace.workspaceId);
    });

    it('should exclude archived channels by default', async () => {
      // Archive the test channel
      await db.update(channels)
        .set({ archived: true })
        .where(eq(channels.channelId, testChannel.channelId));

      const response = await request
        .get(`/api/v1/workspaces/${testWorkspace.workspaceId}/channels`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.every((channel: any) => !channel.archived)).toBe(true);
    });

    it('should include archived channels when includeArchived=true', async () => {
      // Archive the test channel
      await db.update(channels)
        .set({ archived: true })
        .where(eq(channels.channelId, testChannel.channelId));

      const response = await request
        .get(`/api/v1/workspaces/${testWorkspace.workspaceId}/channels?includeArchived=true`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.some((channel: any) => channel.archived)).toBe(true);
    });
  });

  describe('GET /api/v1/channels/{channelId}', () => {
    beforeEach(async () => {
      // Create a test channel
      const [channel] = await db.insert(channels)
        .values({
          name: 'test-channel-details',
          workspaceId: testWorkspace.workspaceId,
          topic: 'Test Channel Topic',
          channelType: 'PUBLIC',
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      expect(channel).toBeDefined();
      expect(channel.channelId).toBeDefined();
      testChannel = channel;

      // Add test user as channel member
      await db.insert(userChannels)
        .values({
          userId: testUser.userId,
          channelId: channel.channelId,
          createdAt: new Date(),
          updatedAt: new Date()
        });
    });

    it('should return channel details', async () => {
      const response = await request
        .get(`/api/v1/channels/${testChannel.channelId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('channelId', testChannel.channelId);
      expect(response.body).toHaveProperty('name', 'test-channel-details');
      expect(response.body).toHaveProperty('workspaceId', testWorkspace.workspaceId);
    });

    it('should return 404 for non-existent channel', async () => {
      const response = await request
        .get('/api/v1/channels/99999')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('CHANNEL_NOT_FOUND');
    });
  });

  describe('PUT /api/v1/channels/{channelId}', () => {
    beforeEach(async () => {
      // Create a test channel
      const [channel] = await db.insert(channels)
        .values({
          name: 'test-channel-update',
          workspaceId: testWorkspace.workspaceId,
          topic: 'Initial Topic',
          channelType: 'PUBLIC',
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      expect(channel).toBeDefined();
      expect(channel.channelId).toBeDefined();
      testChannel = channel;

      // Add test user as channel member
      await db.insert(userChannels)
        .values({
          userId: testUser.userId,
          channelId: channel.channelId,
          createdAt: new Date(),
          updatedAt: new Date()
        });
    });

    it('should update channel details', async () => {
      const response = await request
        .put(`/api/v1/channels/${testChannel.channelId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'updated-channel',
          topic: 'Updated Topic'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('name', 'updated-channel');
      expect(response.body).toHaveProperty('topic', 'Updated Topic');

      // Verify update in database
      const channel = await db.query.channels.findFirst({
        where: eq(channels.channelId, testChannel.channelId)
      });
      expect(channel?.name).toBe('updated-channel');
      expect(channel?.topic).toBe('Updated Topic');
    });

    it('should return 404 for non-existent channel', async () => {
      const response = await request
        .put('/api/v1/channels/99999')
        .set('Authorization', `Bearer ${accessToken}`)
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
    beforeEach(async () => {
      // Create a test channel
      const [channel] = await db.insert(channels)
        .values({
          name: 'test-channel-delete',
          workspaceId: testWorkspace.workspaceId,
          topic: 'Channel to be archived',
          channelType: 'PUBLIC',
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      expect(channel).toBeDefined();
      expect(channel.channelId).toBeDefined();
      testChannel = channel;

      // Add test user as channel member
      await db.insert(userChannels)
        .values({
          userId: testUser.userId,
          channelId: channel.channelId,
          createdAt: new Date(),
          updatedAt: new Date()
        });
    });

    it('should archive a channel (soft-delete)', async () => {
      const response = await request
        .delete(`/api/v1/channels/${testChannel.channelId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(204);

      // Verify channel is archived in database
      const channel = await db.query.channels.findFirst({
        where: eq(channels.channelId, testChannel.channelId)
      });
      expect(channel?.archived).toBe(true);
    });

    it('should return 404 for non-existent channel', async () => {
      const response = await request
        .delete('/api/v1/channels/99999')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('CHANNEL_NOT_FOUND');
    });
  });

  describe('POST /api/v1/channels/{channelId}/members', () => {
    beforeEach(async () => {
      // Create a test channel
      const [channel] = await db.insert(channels)
        .values({
          name: 'test-channel-members',
          workspaceId: testWorkspace.workspaceId,
          topic: 'Member management test channel',
          channelType: 'PUBLIC',
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      expect(channel).toBeDefined();
      expect(channel.channelId).toBeDefined();
      testChannel = channel;
    });

    it('should add a member to the channel', async () => {
      const response = await request
        .post(`/api/v1/channels/${testChannel.channelId}/members`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          userId: testMember.userId
        });

      expect(response.status).toBe(201);

      // Verify member was added
      const membership = await db.query.userChannels.findFirst({
        where: and(
          eq(userChannels.channelId, testChannel.channelId),
          eq(userChannels.userId, testMember.userId)
        )
      });
      expect(membership).toBeDefined();
    });

    it('should return 404 for non-existent channel', async () => {
      const response = await request
        .post('/api/v1/channels/99999/members')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          userId: testMember.userId
        });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('CHANNEL_NOT_FOUND');
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request
        .post(`/api/v1/channels/${testChannel.channelId}/members`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          userId: 99999
        });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('USER_NOT_FOUND');
    });
  });

  describe('DELETE /api/v1/channels/{channelId}/members', () => {
    beforeEach(async () => {
      // Create a test channel
      const [channel] = await db.insert(channels)
        .values({
          name: 'test-channel-members',
          workspaceId: testWorkspace.workspaceId,
          topic: 'Member management test channel',
          channelType: 'PUBLIC',
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      expect(channel).toBeDefined();
      expect(channel.channelId).toBeDefined();
      testChannel = channel;

      // Add test member to channel
      await db.insert(userChannels)
        .values({
          userId: testMember.userId,
          channelId: channel.channelId,
          createdAt: new Date(),
          updatedAt: new Date()
        });
    });

    it('should remove a member from the channel', async () => {
      const response = await request
        .delete(`/api/v1/channels/${testChannel.channelId}/members?userId=${testMember.userId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(204);

      // Let's verify the member was removed using a raw query
      const result = await db.select()
        .from(userChannels)
        .where(and(
          eq(userChannels.channelId, testChannel.channelId),
          eq(userChannels.userId, testMember.userId)
        ));

      // After deletion, the array should be empty
      expect(result).toHaveLength(0);
    });

    it('should return 404 for non-existent channel', async () => {
      const response = await request
        .delete(`/api/v1/channels/99999/members?userId=${testMember.userId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('CHANNEL_NOT_FOUND');
    });

    it('should return 400 when userId is missing', async () => {
      const response = await request
        .delete(`/api/v1/channels/${testChannel.channelId}/members`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('MISSING_USER_ID');
    });
  });

  describe('POST /api/v1/channels/dm', () => {
    beforeEach(async () => {
      // We already have testUser and testMember set up from the parent beforeEach
    });

    it('should create a new DM channel between two users', async () => {
      const response = await request
        .post('/api/v1/channels/dm')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          workspaceId: testWorkspace.workspaceId,
          participants: [testMember.userId]
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('channelId');
      expect(response.body).toHaveProperty('channelType', 'DM');
      expect(response.body).toHaveProperty('workspaceId', testWorkspace.workspaceId);

      // Verify channel creation in database
      const channel = await db.query.channels.findFirst({
        where: eq(channels.channelId, response.body.channelId)
      });
      expect(channel).toBeDefined();
      expect(channel?.channelType).toBe('DM');

      // Verify both users were added as channel members
      const memberships = await db.query.userChannels.findMany({
        where: eq(userChannels.channelId, response.body.channelId)
      });
      expect(memberships).toHaveLength(2);
      const memberIds = memberships.map(m => m.userId);
      expect(memberIds).toContain(testUser.userId);
      expect(memberIds).toContain(testMember.userId);
    });

    it('should return existing DM channel if one already exists', async () => {
      // First create a DM channel
      const firstResponse = await request
        .post('/api/v1/channels/dm')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          workspaceId: testWorkspace.workspaceId,
          participants: [testMember.userId]
        });

      expect(firstResponse.status).toBe(201);
      const firstChannelId = firstResponse.body.channelId;

      // Try to create another DM channel with the same participants
      const secondResponse = await request
        .post('/api/v1/channels/dm')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          workspaceId: testWorkspace.workspaceId,
          participants: [testMember.userId]
        });

      expect(secondResponse.status).toBe(200);
      expect(secondResponse.body.channelId).toBe(firstChannelId);
    });

    it('should return 401 without authentication', async () => {
      const response = await request
        .post('/api/v1/channels/dm')
        .send({
          workspaceId: testWorkspace.workspaceId,
          participants: [testMember.userId]
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('UNAUTHORIZED');
    });

    it('should return 400 with invalid data', async () => {
      const response = await request
        .post('/api/v1/channels/dm')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          workspaceId: testWorkspace.workspaceId,
          // Missing participants array
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when participant is not a workspace member', async () => {
      // Create a user who is not a workspace member
      const [nonMember] = await db.insert(users)
        .values({
          email: `non.member.${Date.now()}@example.com`,
          passwordHash: await bcrypt.hash(testPassword, 10),
          displayName: 'Non Member',
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      const response = await request
        .post('/api/v1/channels/dm')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          workspaceId: testWorkspace.workspaceId,
          participants: [nonMember.userId]
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('INVALID_PARTICIPANTS');

      // Clean up
      await db.delete(users)
        .where(eq(users.userId, nonMember.userId));
    });

    it('should handle multiple participants gracefully', async () => {
      // Create another test member
      const [thirdMember] = await db.insert(users)
        .values({
          email: `third.member.${Date.now()}@example.com`,
          passwordHash: await bcrypt.hash(testPassword, 10),
          displayName: 'Third Member',
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      // Add third member to workspace
      await db.insert(userWorkspaces)
        .values({
          userId: thirdMember.userId,
          workspaceId: testWorkspace.workspaceId,
          role: 'MEMBER',
          createdAt: new Date(),
          updatedAt: new Date()
        });

      const response = await request
        .post('/api/v1/channels/dm')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          workspaceId: testWorkspace.workspaceId,
          participants: [testMember.userId, thirdMember.userId]
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('channelId');

      // Verify all three users were added as channel members
      const memberships = await db.query.userChannels.findMany({
        where: eq(userChannels.channelId, response.body.channelId)
      });
      expect(memberships).toHaveLength(3);

      // Clean up in correct order
      await db.delete(userChannels)
        .where(eq(userChannels.userId, thirdMember.userId));
      await db.delete(userWorkspaces)
        .where(eq(userWorkspaces.userId, thirdMember.userId));
      await db.delete(users)
        .where(eq(users.userId, thirdMember.userId));
    });

    it('should not create DM channel in non-existent workspace', async () => {
      const response = await request
        .post('/api/v1/channels/dm')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          workspaceId: 99999,
          participants: [testMember.userId]
        });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('WORKSPACE_NOT_FOUND');
    });
  });

  describe('GET /api/v1/channels/{channelId}/members', () => {
    beforeEach(async () => {
      // Create a test channel
      const [channel] = await db.insert(channels)
        .values({
          name: 'test-channel-members',
          workspaceId: testWorkspace.workspaceId,
          topic: 'Member listing test channel',
          channelType: 'PUBLIC',
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      expect(channel).toBeDefined();
      expect(channel.channelId).toBeDefined();
      testChannel = channel;

      // Add test user as channel member
      await db.insert(userChannels)
        .values({
          userId: testUser.userId,
          channelId: channel.channelId,
          createdAt: new Date(),
          updatedAt: new Date()
        });

      // Add test member to channel
      await db.insert(userChannels)
        .values({
          userId: testMember.userId,
          channelId: channel.channelId,
          createdAt: new Date(),
          updatedAt: new Date()
        });
    });

    it('should return list of channel members', async () => {
      const response = await request
        .get(`/api/v1/channels/${testChannel.channelId}/members`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(2);
      
      // Verify member structure
      response.body.forEach((member: any) => {
        expect(member).toHaveProperty('userId');
        expect(member).toHaveProperty('displayName');
        expect(member).toHaveProperty('profilePicture');
      });

      // Verify both users are present
      const memberIds = response.body.map((m: any) => m.userId);
      expect(memberIds).toContain(testUser.userId);
      expect(memberIds).toContain(testMember.userId);
    });

    it('should return 404 for non-existent channel', async () => {
      const response = await request
        .get('/api/v1/channels/99999/members')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('CHANNEL_NOT_FOUND');
    });

    it('should return 401 without authentication', async () => {
      const response = await request
        .get(`/api/v1/channels/${testChannel.channelId}/members`);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('UNAUTHORIZED');
    });

    it('should return 403 if user is not a workspace member', async () => {
      // Create a new user who isn't a workspace member
      const [nonMember] = await db.insert(users)
        .values({
          email: `non.member.${Date.now()}@example.com`,
          passwordHash: await bcrypt.hash(testPassword, 10),
          displayName: 'Non Member',
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      // Login as non-member
      const loginResponse = await request
        .post('/api/v1/auth/login')
        .send({
          email: nonMember.email,
          password: testPassword
        });

      const nonMemberToken = loginResponse.body.accessToken;

      const response = await request
        .get(`/api/v1/channels/${testChannel.channelId}/members`)
        .set('Authorization', `Bearer ${nonMemberToken}`);

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('NOT_WORKSPACE_MEMBER');

      // Clean up
      await db.delete(users)
        .where(eq(users.userId, nonMember.userId));
    });

    it('should return 403 if user is workspace member but not channel member', async () => {
      // Create a new user who is workspace member but not channel member
      const [workspaceMember] = await db.insert(users)
        .values({
          email: `workspace.member.${Date.now()}@example.com`,
          passwordHash: await bcrypt.hash(testPassword, 10),
          displayName: 'Workspace Member',
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      // Add to workspace but not channel
      await db.insert(userWorkspaces)
        .values({
          userId: workspaceMember.userId,
          workspaceId: testWorkspace.workspaceId,
          role: 'MEMBER',
          createdAt: new Date(),
          updatedAt: new Date()
        });

      // Login as workspace member
      const loginResponse = await request
        .post('/api/v1/auth/login')
        .send({
          email: workspaceMember.email,
          password: testPassword
        });

      const workspaceMemberToken = loginResponse.body.accessToken;

      const response = await request
        .get(`/api/v1/channels/${testChannel.channelId}/members`)
        .set('Authorization', `Bearer ${workspaceMemberToken}`);

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('NOT_CHANNEL_MEMBER');

      // Clean up
      await db.delete(userWorkspaces)
        .where(eq(userWorkspaces.userId, workspaceMember.userId));
      await db.delete(users)
        .where(eq(users.userId, workspaceMember.userId));
    });

    it('should handle archived channels', async () => {
      // Archive the channel
      await db.update(channels)
        .set({ archived: true })
        .where(eq(channels.channelId, testChannel.channelId));

      const response = await request
        .get(`/api/v1/channels/${testChannel.channelId}/members`)
        .set('Authorization', `Bearer ${accessToken}`);

      // Should still return members even if channel is archived
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(2);
    });

    it('should handle channels with no members', async () => {
      // Create empty channel
      const [emptyChannel] = await db.insert(channels)
        .values({
          name: 'empty-channel',
          workspaceId: testWorkspace.workspaceId,
          channelType: 'PUBLIC',
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      // Add test user as only member
      await db.insert(userChannels)
        .values({
          userId: testUser.userId,
          channelId: emptyChannel.channelId,
          createdAt: new Date(),
          updatedAt: new Date()
        });

      const response = await request
        .get(`/api/v1/channels/${emptyChannel.channelId}/members`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].userId).toBe(testUser.userId);
    });
  });

  afterEach(async () => {
    try {
      // Clean up test data in reverse order of creation
      if (testChannel?.channelId) {
        // Delete UserChannels records first
        await db.delete(userChannels)
          .where(eq(userChannels.channelId, testChannel.channelId));
        await db.delete(channels)
          .where(eq(channels.channelId, testChannel.channelId));
      }

      // Delete all UserChannels records for test users
      if (testUser?.userId) {
        await db.delete(userChannels)
          .where(eq(userChannels.userId, testUser.userId));
      }
      if (testMember?.userId) {
        await db.delete(userChannels)
          .where(eq(userChannels.userId, testMember.userId));
      }

      // Then delete workspace relationships
      if (testWorkspace?.workspaceId) {
        await db.delete(userWorkspaces)
          .where(eq(userWorkspaces.workspaceId, testWorkspace.workspaceId));
        await db.delete(workspaces)
          .where(eq(workspaces.workspaceId, testWorkspace.workspaceId));
      }

      // Finally delete users
      if (testUser?.userId) {
        await db.delete(users)
          .where(eq(users.userId, testUser.userId));
      }
      if (testMember?.userId) {
        await db.delete(users)
          .where(eq(users.userId, testMember.userId));
      }
    } catch (error) {
      console.error('Test cleanup failed:', error);
      throw error;
    }
  });
});