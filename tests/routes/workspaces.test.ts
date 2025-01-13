import supertest from 'supertest';
import express from 'express';
import bcrypt from 'bcrypt';
import { registerRoutes } from '../../server/routes';
import { db } from '@db';
import { workspaces, users, userWorkspaces } from '@db/schema';
import { eq, and } from 'drizzle-orm';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const server = registerRoutes(app);
const request = supertest(app);

describe('Workspace Endpoints', () => {
  let testAdmin: any;
  let testUser: any;
  let adminAccessToken: string;
  let userAccessToken: string;
  let testWorkspaceId: number;
  const testPassword = 'TestPassword123!';

  beforeAll(async () => {
    try {
      // Create timestamp for unique emails
      const timestamp = new Date().getTime();
      const passwordHash = await bcrypt.hash(testPassword, 10);

      // Create admin user
      const [admin] = await db.insert(users)
        .values({
          email: `workspace.admin.${timestamp}@example.com`,
          passwordHash,
          displayName: 'Workspace Admin',
          emailVerified: true,
          deactivated: false,
          lastKnownPresence: 'ONLINE',
          lastLogin: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      // Verify admin creation
      expect(admin).toBeDefined();
      expect(admin.userId).toBeDefined();
      expect(typeof parseInt(admin.userId.toString())).toBe('number');
      expect(admin.email).toContain('workspace.admin');
      testAdmin = admin;

      // Create regular user
      const [user] = await db.insert(users)
        .values({
          email: `workspace.user.${timestamp}@example.com`,
          passwordHash,
          displayName: 'Workspace User',
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
      expect(user.email).toContain('workspace.user');
      testUser = user;

      // Login admin to get access token
      const adminLoginResponse = await request
        .post('/api/v1/auth/login')
        .send({
          email: admin.email,
          password: testPassword
        });

      expect(adminLoginResponse.status).toBe(200);
      expect(adminLoginResponse.body).toHaveProperty('accessToken');
      adminAccessToken = adminLoginResponse.body.accessToken;
      expect(adminAccessToken).toBeDefined();
      expect(typeof adminAccessToken).toBe('string');

      // Login regular user to get access token
      const userLoginResponse = await request
        .post('/api/v1/auth/login')
        .send({
          email: user.email,
          password: testPassword
        });

      expect(userLoginResponse.status).toBe(200);
      expect(userLoginResponse.body).toHaveProperty('accessToken');
      userAccessToken = userLoginResponse.body.accessToken;
      expect(userAccessToken).toBeDefined();
      expect(typeof userAccessToken).toBe('string');

    } catch (error) {
      console.error('Test setup failed:', error);
      throw error;
    }
  });

  describe('POST /api/v1/workspaces', () => {
    it('should create a new workspace and set creator as owner', async () => {
      const response = await request
        .post('/api/v1/workspaces')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          name: 'Test Workspace',
          description: 'A test workspace'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('workspaceId');
      expect(response.body).toHaveProperty('name', 'Test Workspace');
      expect(response.body).toHaveProperty('description', 'A test workspace');
      testWorkspaceId = response.body.workspaceId;

      // Verify workspace was actually created in database
      const workspace = await db.query.workspaces.findFirst({
        where: eq(workspaces.workspaceId, testWorkspaceId)
      });
      expect(workspace).toBeDefined();
      expect(workspace?.name).toBe('Test Workspace');

      // Verify admin was added as workspace owner
      const userWorkspace = await db.query.userWorkspaces.findFirst({
        where: and(
          eq(userWorkspaces.userId, testAdmin.userId),
          eq(userWorkspaces.workspaceId, testWorkspaceId)
        )
      });
      expect(userWorkspace).toBeDefined();
      expect(userWorkspace?.role).toBe('OWNER');
    });

    it('should return 400 with invalid data', async () => {
      const response = await request
        .post('/api/v1/workspaces')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          // Missing required name field
          description: 'Missing name field'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 401 without authentication', async () => {
      const response = await request
        .post('/api/v1/workspaces')
        .send({
          name: 'Test Workspace',
          description: 'A test workspace'
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('UNAUTHORIZED');
    });
  });

  describe('GET /api/v1/workspaces', () => {
    let secondWorkspaceId: number;

    beforeEach(async () => {
      // Create a second workspace that only the admin is a member of
      const [workspace] = await db.insert(workspaces)
        .values({
          name: 'Admin Only Workspace',
          description: 'A workspace where only admin is a member',
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      secondWorkspaceId = workspace.workspaceId;

      // Add admin as owner of the second workspace
      await db.insert(userWorkspaces)
        .values({
          userId: testAdmin.userId,
          workspaceId: secondWorkspaceId,
          role: 'OWNER',
          createdAt: new Date(),
          updatedAt: new Date()
        });
    });

    it('should list only workspaces where the user is a member', async () => {
      // Add regular user to the first workspace but not the second
      await db.insert(userWorkspaces)
        .values({
          userId: testUser.userId,
          workspaceId: testWorkspaceId,
          role: 'MEMBER',
          createdAt: new Date(),
          updatedAt: new Date()
        });

      // Test admin user (should see both workspaces)
      const adminResponse = await request
        .get('/api/v1/workspaces')
        .set('Authorization', `Bearer ${adminAccessToken}`);

      expect(adminResponse.status).toBe(200);
      expect(Array.isArray(adminResponse.body)).toBe(true);
      expect(adminResponse.body.length).toBe(2);

      // Test regular user (should only see one workspace)
      const userResponse = await request
        .get('/api/v1/workspaces')
        .set('Authorization', `Bearer ${userAccessToken}`);

      expect(userResponse.status).toBe(200);
      expect(Array.isArray(userResponse.body)).toBe(true);
      expect(userResponse.body.length).toBe(1);
      expect(userResponse.body[0].workspaceId).toBe(testWorkspaceId);
    });

    it('should return empty array for user with no workspaces', async () => {
      const response = await request
        .get('/api/v1/workspaces')
        .set('Authorization', `Bearer ${userAccessToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(0);
    });

    it('should return 401 without authentication', async () => {
      const response = await request.get('/api/v1/workspaces');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('UNAUTHORIZED');
    });

    afterEach(async () => {
      if (secondWorkspaceId) {
        await db.delete(userWorkspaces)
          .where(eq(userWorkspaces.workspaceId, secondWorkspaceId));
        await db.delete(workspaces)
          .where(eq(workspaces.workspaceId, secondWorkspaceId));
      }
    });
  });

  describe('GET /api/v1/workspaces/{workspaceId}', () => {
    let testLocalWorkspace: any;

    beforeEach(async () => {
      // Create a test workspace
      const [workspace] = await db.insert(workspaces)
        .values({
          name: 'Test Workspace for Details',
          description: 'A test workspace for getting details',
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      expect(workspace).toBeDefined();
      expect(workspace.workspaceId).toBeDefined();
      testLocalWorkspace = workspace;

      // Create UserWorkspace relationship
      await db.insert(userWorkspaces)
        .values({
          userId: testAdmin.userId,
          workspaceId: workspace.workspaceId,
          role: 'OWNER',
          createdAt: new Date(),
          updatedAt: new Date()
        });
    });

    it('should return workspace details', async () => {
      const response = await request
        .get(`/api/v1/workspaces/${testLocalWorkspace.workspaceId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('name', 'Test Workspace for Details');
    });

    it('should return 404 for non-existent workspace', async () => {
      const response = await request
        .get('/api/v1/workspaces/99999')
        .set('Authorization', `Bearer ${adminAccessToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('WORKSPACE_NOT_FOUND');
    });

    afterEach(async () => {
      if (testLocalWorkspace?.workspaceId) {
        await db.delete(userWorkspaces)
          .where(eq(userWorkspaces.workspaceId, testLocalWorkspace.workspaceId));
        await db.delete(workspaces)
          .where(eq(workspaces.workspaceId, testLocalWorkspace.workspaceId));
      }
    });
  });

  describe('PUT /api/v1/workspaces/{workspaceId}', () => {
    let testLocalWorkspace: any;

    beforeEach(async () => {
      // Create a test workspace
      const [workspace] = await db.insert(workspaces)
        .values({
          name: 'Test Workspace for Update',
          description: 'Initial description',
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      expect(workspace).toBeDefined();
      expect(workspace.workspaceId).toBeDefined();
      testLocalWorkspace = workspace;

      // Create UserWorkspace relationship
      await db.insert(userWorkspaces)
        .values({
          userId: testAdmin.userId,
          workspaceId: workspace.workspaceId,
          role: 'OWNER',
          createdAt: new Date(),
          updatedAt: new Date()
        });
    });

    it('should update workspace details', async () => {
      const response = await request
        .put(`/api/v1/workspaces/${testLocalWorkspace.workspaceId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          name: 'Updated Workspace',
          description: 'Updated description'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('name', 'Updated Workspace');
      expect(response.body).toHaveProperty('description', 'Updated description');

      // Verify update in database
      const workspace = await db.query.workspaces.findFirst({
        where: eq(workspaces.workspaceId, testLocalWorkspace.workspaceId)
      });
      expect(workspace?.name).toBe('Updated Workspace');
      expect(workspace?.description).toBe('Updated description');
    });

    it('should return 404 for non-existent workspace', async () => {
      const response = await request
        .put('/api/v1/workspaces/99999')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          name: 'Updated Workspace',
          description: 'Updated description'
        });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('WORKSPACE_NOT_FOUND');
    });

    afterEach(async () => {
      if (testLocalWorkspace?.workspaceId) {
        await db.delete(userWorkspaces)
          .where(eq(userWorkspaces.workspaceId, testLocalWorkspace.workspaceId));
        await db.delete(workspaces)
          .where(eq(workspaces.workspaceId, testLocalWorkspace.workspaceId));
      }
    });
  });

  describe('DELETE /api/v1/workspaces/{workspaceId}', () => {
    let testLocalWorkspace: any;

    beforeEach(async () => {
      // Create a test workspace
      const [workspace] = await db.insert(workspaces)
        .values({
          name: 'Test Workspace for Archiving',
          description: 'A test workspace to be archived',
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      expect(workspace).toBeDefined();
      expect(workspace.workspaceId).toBeDefined();
      testLocalWorkspace = workspace;

      // Create UserWorkspace relationship
      await db.insert(userWorkspaces)
        .values({
          userId: testAdmin.userId,
          workspaceId: workspace.workspaceId,
          role: 'OWNER',
          createdAt: new Date(),
          updatedAt: new Date()
        });
    });

    it('should archive a workspace (soft-delete)', async () => {
      const response = await request
        .delete(`/api/v1/workspaces/${testLocalWorkspace.workspaceId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`);

      expect(response.status).toBe(204);

      // Verify workspace is archived in database
      const workspace = await db.query.workspaces.findFirst({
        where: eq(workspaces.workspaceId, testLocalWorkspace.workspaceId)
      });
      expect(workspace?.archived).toBe(true);
    });

    it('should return 404 for non-existent workspace', async () => {
      const response = await request
        .delete('/api/v1/workspaces/99999')
        .set('Authorization', `Bearer ${adminAccessToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('WORKSPACE_NOT_FOUND');
    });

    afterEach(async () => {
      if (testLocalWorkspace?.workspaceId) {
        await db.delete(userWorkspaces)
          .where(eq(userWorkspaces.workspaceId, testLocalWorkspace.workspaceId));
        await db.delete(workspaces)
          .where(eq(workspaces.workspaceId, testLocalWorkspace.workspaceId));
      }
    });
  });

  afterAll(async () => {
    try {
      // Clean up test data in reverse order of creation
      if (testWorkspaceId) {
        // First clean up UserWorkspaces entries for all workspaces
        await db.delete(userWorkspaces)
          .where(eq(userWorkspaces.workspaceId, testWorkspaceId));

        // Then clean up Workspaces
        await db.delete(workspaces)
          .where(eq(workspaces.workspaceId, testWorkspaceId));
      }

      // Finally clean up Users
      if (testUser?.email) {
        await db.delete(users)
          .where(eq(users.email, testUser.email));
      }
      if (testAdmin?.email) {
        await db.delete(users)
          .where(eq(users.email, testAdmin.email));
      }
    } catch (error) {
      console.error('Test cleanup failed:', error);
      throw error;
    }
  });
});