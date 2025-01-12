import supertest from 'supertest';
import express from 'express';
import path from 'path';
import bcrypt from 'bcrypt';
import { registerRoutes } from '../../server/routes';
import { db } from '@db';
import { files, users } from '@db/schema';
import { eq } from 'drizzle-orm';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const server = registerRoutes(app);
const request = supertest(app);

describe('File Management Endpoints', () => {
  let testAdmin: any;
  let testUser: any;
  let adminAccessToken: string;
  let userAccessToken: string;
  let testFileId: number;
  const testPassword = 'TestPassword123!';

  beforeAll(async () => {
    try {
      // Create timestamp for unique emails
      const timestamp = new Date().getTime();
      const passwordHash = await bcrypt.hash(testPassword, 10);

      // Create admin user
      const [admin] = await db.insert(users)
        .values({
          email: `file.admin.${timestamp}@example.com`,
          passwordHash,
          displayName: 'File Admin',
          emailVerified: true,
          deactivated: false,
          lastKnownPresence: 'ONLINE',
          lastLogin: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      testAdmin = admin;

      // Create regular user
      const [user] = await db.insert(users)
        .values({
          email: `file.user.${timestamp}@example.com`,
          passwordHash,
          displayName: 'File User',
          emailVerified: true,
          deactivated: false,
          lastKnownPresence: 'ONLINE',
          lastLogin: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      testUser = user;

      // Login admin to get access token
      const adminLoginResponse = await request
        .post('/api/v1/auth/login')
        .send({
          email: admin.email,
          password: testPassword
        });

      adminAccessToken = adminLoginResponse.body.accessToken;

      // Login regular user to get access token
      const userLoginResponse = await request
        .post('/api/v1/auth/login')
        .send({
          email: user.email,
          password: testPassword
        });

      userAccessToken = userLoginResponse.body.accessToken;

    } catch (error) {
      console.error('Test setup failed:', error);
      throw error;
    }
  });

  describe('POST /api/v1/files/upload', () => {
    it('should upload a file successfully', async () => {
      const testFilePath = path.join(__dirname, '../fixtures/test-file.txt');
      const response = await request
        .post('/api/v1/files/upload')
        .set('Authorization', `Bearer ${userAccessToken}`)
        .attach('file', testFilePath)
        .field('description', 'Test file upload');

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('fileId');
      expect(response.body).toHaveProperty('filename');
      expect(response.body).toHaveProperty('mimeType');
      expect(response.body).toHaveProperty('size');
      testFileId = response.body.fileId;

      // Verify file record in database
      const fileRecord = await db.query.files.findFirst({
        where: eq(files.fileId, testFileId)
      });
      expect(fileRecord).toBeDefined();
      expect(fileRecord?.softDeleted).toBe(false);
    });

    it('should return 400 when no file is provided', async () => {
      const response = await request
        .post('/api/v1/files/upload')
        .set('Authorization', `Bearer ${userAccessToken}`)
        .field('description', 'Missing file');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('FILE_REQUIRED');
    });

    it('should return 401 without authentication', async () => {
      const testFilePath = path.join(__dirname, '../fixtures/test-file.txt');
      const response = await request
        .post('/api/v1/files/upload')
        .attach('file', testFilePath);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('UNAUTHORIZED');
    });
  });

  describe('GET /api/v1/files/{fileId}', () => {
    it('should retrieve file metadata', async () => {
      const response = await request
        .get(`/api/v1/files/${testFileId}`)
        .set('Authorization', `Bearer ${userAccessToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('fileId', testFileId);
      expect(response.body).toHaveProperty('filename');
      expect(response.body).toHaveProperty('uploadedBy');
      expect(response.body).toHaveProperty('createdAt');
    });

    it('should return 404 for non-existent file', async () => {
      const response = await request
        .get('/api/v1/files/99999')
        .set('Authorization', `Bearer ${userAccessToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('FILE_NOT_FOUND');
    });
  });

  describe('GET /api/v1/files/{fileId}/download', () => {
    it('should download the file content', async () => {
      const response = await request
        .get(`/api/v1/files/${testFileId}/download`)
        .set('Authorization', `Bearer ${userAccessToken}`);

      expect(response.status).toBe(200);
      expect(response.header['content-type']).toBeDefined();
      expect(response.header['content-disposition']).toContain('attachment');
    });

    it('should return 404 for non-existent file download', async () => {
      const response = await request
        .get('/api/v1/files/99999/download')
        .set('Authorization', `Bearer ${userAccessToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('FILE_NOT_FOUND');
    });
  });

  describe('DELETE /api/v1/files/{fileId}', () => {
    it('should soft-delete a file', async () => {
      const response = await request
        .delete(`/api/v1/files/${testFileId}`)
        .set('Authorization', `Bearer ${userAccessToken}`);

      expect(response.status).toBe(204);

      // Verify file is soft-deleted in database
      const fileRecord = await db.query.files.findFirst({
        where: eq(files.fileId, testFileId)
      });
      expect(fileRecord?.softDeleted).toBe(true);
    });

    it('should return 404 for non-existent file deletion', async () => {
      const response = await request
        .delete('/api/v1/files/99999')
        .set('Authorization', `Bearer ${userAccessToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('FILE_NOT_FOUND');
    });

    it('should return 403 when deleting another user\'s file', async () => {
      // First create a file as admin
      const testFilePath = path.join(__dirname, '../fixtures/test-file.txt');
      const uploadResponse = await request
        .post('/api/v1/files/upload')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .attach('file', testFilePath)
        .field('description', 'Admin\'s file');

      const adminFileId = uploadResponse.body.fileId;

      // Try to delete admin's file as regular user
      const response = await request
        .delete(`/api/v1/files/${adminFileId}`)
        .set('Authorization', `Bearer ${userAccessToken}`);

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details.code).toBe('FORBIDDEN');
    });
  });

  afterAll(async () => {
    try {
      // Clean up test data
      if (testFileId) {
        await db.delete(files)
          .where(eq(files.fileId, testFileId));
      }

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