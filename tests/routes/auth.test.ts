import supertest from 'supertest';
import express from 'express';
import { registerRoutes } from '../../server/routes';
import { db } from '../../db';
import { users } from '../../db/schema';
import { eq } from 'drizzle-orm';

const app = express();
const server = registerRoutes(app);
const request = supertest(app);

describe('Auth Endpoints', () => {
  describe('POST /api/v1/auth/register', () => {
    it('should create a new user when valid data is provided', async () => {
      const response = await request
        .post('/api/v1/auth/register')
        .send({
          email: 'test@example.com',
          password: 'TestPassword123!',
          displayName: 'Test User'
        });

      expect(response.status).toBe(201);
      expect(response.body).not.toHaveProperty('password');
      expect(response.body).toHaveProperty('email', 'test@example.com');
      expect(response.body).toHaveProperty('displayName', 'Test User');
      expect(response.body).toHaveProperty('emailVerified', false);
    });

    it('should return 400 when email is invalid', async () => {
      const response = await request
        .post('/api/v1/auth/register')
        .send({
          email: 'invalid-email',
          password: 'TestPassword123!',
          displayName: 'Test User'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('INVALID_EMAIL');
    });

    it('should return 400 when password is too weak', async () => {
      const response = await request
        .post('/api/v1/auth/register')
        .send({
          email: 'test@example.com',
          password: '123',
          displayName: 'Test User'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('WEAK_PASSWORD');
    });

    it('should return 409 when email is already in use', async () => {
      // First registration
      await request
        .post('/api/v1/auth/register')
        .send({
          email: 'duplicate@example.com',
          password: 'TestPassword123!',
          displayName: 'Test User'
        });

      // Duplicate registration
      const response = await request
        .post('/api/v1/auth/register')
        .send({
          email: 'duplicate@example.com',
          password: 'TestPassword123!',
          displayName: 'Another User'
        });

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('EMAIL_ALREADY_EXISTS');
    });
  });

  describe('POST /api/v1/auth/login', () => {
    beforeEach(async () => {
      // Create a test user
      await request
        .post('/api/v1/auth/register')
        .send({
          email: 'login.test@example.com',
          password: 'TestPassword123!',
          displayName: 'Login Test User'
        });
    });

    it('should successfully login with valid credentials', async () => {
      const response = await request
        .post('/api/v1/auth/login')
        .send({
          email: 'login.test@example.com',
          password: 'TestPassword123!'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
    });

    it('should return 401 with invalid password', async () => {
      const response = await request
        .post('/api/v1/auth/login')
        .send({
          email: 'login.test@example.com',
          password: 'WrongPassword123!'
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('INVALID_CREDENTIALS');
    });

    it('should return 401 with non-existent email', async () => {
      const response = await request
        .post('/api/v1/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'TestPassword123!'
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('POST /api/v1/auth/verify-email', () => {
    let verificationToken: string;

    beforeEach(async () => {
      // Create a test user and capture the verification token
      const registerResponse = await request
        .post('/api/v1/auth/register')
        .send({
          email: 'verify.test@example.com',
          password: 'TestPassword123!',
          displayName: 'Verify Test User'
        });

      // In a real implementation, we would capture the verification token
      // from the email service mock
      verificationToken = 'test-verification-token';
    });

    it('should verify email with valid token', async () => {
      const response = await request
        .post('/api/v1/auth/verify-email')
        .send({ token: verificationToken });

      expect(response.status).toBe(200);

      // Verify user's email is marked as verified
      const user = await db.query.users.findFirst({
        where: eq(users.email, 'verify.test@example.com')
      });
      expect(user?.emailVerified).toBe(true);
    });

    it('should return 400 with invalid token', async () => {
      const response = await request
        .post('/api/v1/auth/verify-email')
        .send({ token: 'invalid-token' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('INVALID_VERIFICATION_TOKEN');
    });

    it('should return 400 with expired token', async () => {
      const response = await request
        .post('/api/v1/auth/verify-email')
        .send({ token: 'expired-token' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('EXPIRED_VERIFICATION_TOKEN');
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    let refreshToken: string;

    beforeEach(async () => {
      // Create and login a test user to get a refresh token
      await request
        .post('/api/v1/auth/register')
        .send({
          email: 'refresh.test@example.com',
          password: 'TestPassword123!',
          displayName: 'Refresh Test User'
        });

      const loginResponse = await request
        .post('/api/v1/auth/login')
        .send({
          email: 'refresh.test@example.com',
          password: 'TestPassword123!'
        });

      refreshToken = loginResponse.body.refreshToken;
    });

    it('should refresh access token with valid refresh token', async () => {
      const response = await request
        .post('/api/v1/auth/refresh')
        .send({ refreshToken });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
    });

    it('should return 401 with invalid refresh token', async () => {
      const response = await request
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'invalid-token' });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('INVALID_REFRESH_TOKEN');
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    let accessToken: string;

    beforeEach(async () => {
      // Create and login a test user
      await request
        .post('/api/v1/auth/register')
        .send({
          email: 'logout.test@example.com',
          password: 'TestPassword123!',
          displayName: 'Logout Test User'
        });

      const loginResponse = await request
        .post('/api/v1/auth/login')
        .send({
          email: 'logout.test@example.com',
          password: 'TestPassword123!'
        });

      accessToken = loginResponse.body.accessToken;
    });

    it('should successfully logout with valid access token', async () => {
      const response = await request
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
    });

    it('should return 401 when logging out without token', async () => {
      const response = await request
        .post('/api/v1/auth/logout');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('UNAUTHORIZED');
    });
  });
});