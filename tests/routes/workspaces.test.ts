import supertest from 'supertest';
import express from 'express';
import { registerRoutes } from '../../server/routes';
import { db } from '../../db';
import { workspaces, users, userWorkspaces } from '../../db/schema';
import { eq } from 'drizzle-orm';

const app = express();
const server = registerRoutes(app);
const request = supertest(app);

describe('Workspace Endpoints', () => {
  let adminAccessToken: string;
  let userAccessToken: string;
  let testWorkspaceId: number;

  beforeAll(async () => {
    // Create and login an admin user
    await request
      .post('/api/v1/auth/register')
      .send({
        email: 'workspace.admin@example.com',
        password: 'AdminPass123!',
        displayName: 'Workspace Admin'
      });

    const adminLogin = await request
      .post('/api/v1/auth/login')
      .send({
        email: 'workspace.admin@example.com',
        password: 'AdminPass123!'
      });

    adminAccessToken = adminLogin.body.accessToken;

    // Create and login a regular user
    await request
      .post('/api/v1/auth/register')
      .send({
        email: 'workspace.user@example.com',
        password: 'UserPass123!',
        displayName: 'Workspace User'
      });

    const userLogin = await request
      .post('/api/v1/auth/login')
      .send({
        email: 'workspace.user@example.com',
        password: 'UserPass123!'
      });

    userAccessToken = userLogin.body.accessToken;
  });

  describe('GET /api/v1/workspaces', () => {
    it('should list all workspaces', async () => {
      const response = await request
        .get('/api/v1/workspaces')
        .set('Authorization', `Bearer ${adminAccessToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should return 401 without authentication', async () => {
      const response = await request.get('/api/v1/workspaces');
      
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('UNAUTHORIZED');
    });
  });

  describe('POST /api/v1/workspaces', () => {
    it('should create a new workspace', async () => {
      const response = await request
        .post('/api/v1/workspaces')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          name: 'Test Workspace',
          description: 'A test workspace'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('name', 'Test Workspace');
      expect(response.body).toHaveProperty('description', 'A test workspace');
      testWorkspaceId = response.body.workspaceId;
    });

    it('should return 400 with invalid data', async () => {
      const response = await request
        .post('/api/v1/workspaces')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          description: 'Missing name field'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/v1/workspaces/{workspaceId}', () => {
    it('should return workspace details', async () => {
      const response = await request
        .get(`/api/v1/workspaces/${testWorkspaceId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('name', 'Test Workspace');
    });

    it('should return 404 for non-existent workspace', async () => {
      const response = await request
        .get('/api/v1/workspaces/99999')
        .set('Authorization', `Bearer ${adminAccessToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('WORKSPACE_NOT_FOUND');
    });
  });

  describe('PUT /api/v1/workspaces/{workspaceId}', () => {
    it('should update workspace details', async () => {
      const response = await request
        .put(`/api/v1/workspaces/${testWorkspaceId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          name: 'Updated Workspace',
          description: 'Updated description'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('name', 'Updated Workspace');
      expect(response.body).toHaveProperty('description', 'Updated description');
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
  });

  describe('DELETE /api/v1/workspaces/{workspaceId}', () => {
    it('should archive a workspace (soft-delete)', async () => {
      const response = await request
        .delete(`/api/v1/workspaces/${testWorkspaceId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`);

      expect(response.status).toBe(204);

      // Verify workspace is archived
      const workspace = await db.query.workspaces.findFirst({
        where: eq(workspaces.workspaceId, testWorkspaceId)
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
  });
});
