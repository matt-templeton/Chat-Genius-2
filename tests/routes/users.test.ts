import supertest from 'supertest';
import express from 'express';
import { registerRoutes } from '../../server/routes';
import { db } from '../../db';
import { users } from '../../db/schema';
import { eq } from 'drizzle-orm';

const app = express();
const server = registerRoutes(app);
const request = supertest(app);

describe('User Endpoints', () => {
  let adminAccessToken: string;
  let userAccessToken: string;
  let testUserId: number;

  beforeAll(async () => {
    // Create and login an admin user
    await request
      .post('/api/v1/auth/register')
      .send({
        email: 'admin@example.com',
        password: 'AdminPass123!',
        displayName: 'Admin User'
      });

    const adminLogin = await request
      .post('/api/v1/auth/login')
      .send({
        email: 'admin@example.com',
        password: 'AdminPass123!'
      });

    adminAccessToken = adminLogin.body.accessToken;

    // Create and login a regular user
    const userRegister = await request
      .post('/api/v1/auth/register')
      .send({
        email: 'user@example.com',
        password: 'UserPass123!',
        displayName: 'Test User'
      });

    testUserId = userRegister.body.userId;

    const userLogin = await request
      .post('/api/v1/auth/login')
      .send({
        email: 'user@example.com',
        password: 'UserPass123!'
      });

    userAccessToken = userLogin.body.accessToken;
  });

  describe('GET /api/v1/users', () => {
    it('should list all active users', async () => {
      const response = await request
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${adminAccessToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toHaveProperty('email');
      expect(response.body[0]).toHaveProperty('displayName');
      expect(response.body[0]).not.toHaveProperty('password');
    });

    it('should return 401 without authentication', async () => {
      const response = await request.get('/api/v1/users');
      
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('UNAUTHORIZED');
    });
  });

  describe('GET /api/v1/users/me', () => {
    it('should return current user profile', async () => {
      const response = await request
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${userAccessToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('email', 'user@example.com');
      expect(response.body).toHaveProperty('displayName', 'Test User');
      expect(response.body).not.toHaveProperty('password');
    });

    it('should return 401 without authentication', async () => {
      const response = await request.get('/api/v1/users/me');
      
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('UNAUTHORIZED');
    });
  });

  describe('GET /api/v1/users/{userId}', () => {
    it('should return user details by ID', async () => {
      const response = await request
        .get(`/api/v1/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('email', 'user@example.com');
      expect(response.body).toHaveProperty('displayName', 'Test User');
      expect(response.body).not.toHaveProperty('password');
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request
        .get('/api/v1/users/99999')
        .set('Authorization', `Bearer ${adminAccessToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('USER_NOT_FOUND');
    });
  });

  describe('PUT /api/v1/users/{userId}', () => {
    it('should update user profile', async () => {
      const response = await request
        .put(`/api/v1/users/${testUserId}`)
        .set('Authorization', `Bearer ${userAccessToken}`)
        .send({
          displayName: 'Updated Name',
          theme: 'dark'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('displayName', 'Updated Name');
      expect(response.body).toHaveProperty('theme', 'dark');
    });

    it('should return 403 when updating another user\'s profile', async () => {
      const response = await request
        .put(`/api/v1/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          displayName: 'Unauthorized Update'
        });

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('FORBIDDEN');
    });
  });

  describe('DELETE /api/v1/users/{userId}', () => {
    it('should soft-delete (deactivate) a user', async () => {
      const response = await request
        .delete(`/api/v1/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`);

      expect(response.status).toBe(204);

      // Verify user is deactivated
      const user = await db.query.users.findFirst({
        where: eq(users.userId, testUserId)
      });
      expect(user?.deactivated).toBe(true);
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request
        .delete('/api/v1/users/99999')
        .set('Authorization', `Bearer ${adminAccessToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('USER_NOT_FOUND');
    });
  });

  describe('POST /api/v1/users/{userId}/reactivate', () => {
    it('should reactivate a deactivated user', async () => {
      // First, deactivate the user
      await request
        .delete(`/api/v1/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`);

      // Then reactivate
      const response = await request
        .post(`/api/v1/users/${testUserId}/reactivate`)
        .set('Authorization', `Bearer ${adminAccessToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('deactivated', false);

      // Verify user is reactivated in database
      const user = await db.query.users.findFirst({
        where: eq(users.userId, testUserId)
      });
      expect(user?.deactivated).toBe(false);
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request
        .post('/api/v1/users/99999/reactivate')
        .set('Authorization', `Bearer ${adminAccessToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('USER_NOT_FOUND');
    });
  });
});
