import supertest from "supertest";
import express from "express";
import { registerRoutes } from "../../server/routes";
import { db } from "@db";
import { files, messages, workspaces, users } from "@db/schema";
import { eq, and } from "drizzle-orm";
import path from "path";
import fs from "fs/promises";
import bcrypt from "bcrypt";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const server = registerRoutes(app);
const request = supertest(app);

describe("File Upload and Management Endpoints", () => {
  let testUser: any;
  let testWorkspace: any;
  let testMessage: any;
  let testFile: any;
  let accessToken: string;
  const testPassword = "TestPassword123!";

  beforeEach(async () => {
    try {
      // Create test user
      const timestamp = new Date().getTime();
      const [user] = await db
        .insert(users)
        .values({
          email: `file.test.${timestamp}@example.com`,
          passwordHash: await bcrypt.hash(testPassword, 10),
          displayName: "File Test User",
          emailVerified: true,
          deactivated: false,
          lastKnownPresence: "ONLINE",
          lastLogin: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      testUser = user;

      // Create test workspace
      const [workspace] = await db
        .insert(workspaces)
        .values({
          name: `Test Workspace ${timestamp}`,
          description: "Test workspace for file endpoints",
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      testWorkspace = workspace;

      // Create test message if needed for file attachment tests
      const [message] = await db
        .insert(messages)
        .values({
          content: "Test message for file attachment",
          userId: user.userId,
          workspaceId: workspace.workspaceId,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      testMessage = message;

      // Login to get access token
      const loginResponse = await request.post("/api/v1/auth/login").send({
        email: user.email,
        password: testPassword,
      });

      accessToken = loginResponse.body.accessToken;
    } catch (error) {
      console.error("Test setup failed:", error);
      throw error;
    }
  });

  describe("POST /api/v1/files", () => {
    it("should upload a file successfully", async () => {
      // Create a temporary test file
      const testFilePath = path.join(__dirname, "test-file.txt");
      await fs.writeFile(testFilePath, "Test file content");

      const response = await request
        .post("/api/v1/files")
        .set("Authorization", `Bearer ${accessToken}`)
        .field("workspaceId", testWorkspace.workspaceId.toString())
        .attach("file", testFilePath);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty("fileId");
      expect(response.body).toHaveProperty("filename");
      expect(response.body).toHaveProperty("fileUrl");
      expect(response.body).toHaveProperty("workspaceId", testWorkspace.workspaceId);

      testFile = response.body;
      // Clean up test file
      await fs.unlink(testFilePath);
    });

    it("should upload a file and attach it to a message", async () => {
      const testFilePath = path.join(__dirname, "test-file.txt");
      await fs.writeFile(testFilePath, "Test file content");

      const response = await request
        .post("/api/v1/files")
        .set("Authorization", `Bearer ${accessToken}`)
        .field("workspaceId", testWorkspace.workspaceId.toString())
        .field("messageId", testMessage.messageId.toString())
        .attach("file", testFilePath);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty("messageId", testMessage.messageId);

      // Clean up test file
      await fs.unlink(testFilePath);
    });

    it("should handle duplicate file uploads in the same workspace", async () => {
      const testFilePath = path.join(__dirname, "test-file.txt");
      await fs.writeFile(testFilePath, "Test file content");

      // First upload
      const firstResponse = await request
        .post("/api/v1/files")
        .set("Authorization", `Bearer ${accessToken}`)
        .field("workspaceId", testWorkspace.workspaceId.toString())
        .attach("file", testFilePath);

      expect(firstResponse.status).toBe(201);
      const firstFileId = firstResponse.body.fileId;

      // Second upload of the same file
      const secondResponse = await request
        .post("/api/v1/files")
        .set("Authorization", `Bearer ${accessToken}`)
        .field("workspaceId", testWorkspace.workspaceId.toString())
        .attach("file", testFilePath);

      expect(secondResponse.status).toBe(200); // Returns existing file
      expect(secondResponse.body.fileId).toBe(firstFileId);

      // Clean up test file
      await fs.unlink(testFilePath);
    });

    it("should return 400 when file size exceeds limit", async () => {
      // Create a temporary large file (51MB)
      const testFilePath = path.join(__dirname, "large-test-file.txt");
      const largeContent = Buffer.alloc(51 * 1024 * 1024, 'x');
      await fs.writeFile(testFilePath, largeContent);

      const response = await request
        .post("/api/v1/files")
        .set("Authorization", `Bearer ${accessToken}`)
        .field("workspaceId", testWorkspace.workspaceId.toString())
        .attach("file", testFilePath);

      expect(response.status).toBe(400);
      expect(response.body.details.code).toBe("FILE_TOO_LARGE");

      // Clean up test file
      await fs.unlink(testFilePath);
    });

    it("should return 400 when no file is provided", async () => {
      const response = await request
        .post("/api/v1/files")
        .set("Authorization", `Bearer ${accessToken}`)
        .field("workspaceId", testWorkspace.workspaceId.toString());

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error");
      expect(response.body.details.code).toBe("FILE_REQUIRED");
    });

    it("should return 401 without authentication", async () => {
      const testFilePath = path.join(__dirname, "test-file.txt");
      await fs.writeFile(testFilePath, "Test file content");

      const response = await request
        .post("/api/v1/files")
        .field("workspaceId", testWorkspace.workspaceId.toString())
        .attach("file", testFilePath);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty("error");
      expect(response.body.details.code).toBe("UNAUTHORIZED");

      // Clean up test file
      await fs.unlink(testFilePath);
    });

    it("should return 404 when workspace does not exist", async () => {
      const testFilePath = path.join(__dirname, "test-file.txt");
      await fs.writeFile(testFilePath, "Test file content");

      const response = await request
        .post("/api/v1/files")
        .set("Authorization", `Bearer ${accessToken}`)
        .field("workspaceId", "99999")
        .attach("file", testFilePath);

      expect(response.status).toBe(404);
      expect(response.body.details.code).toBe("WORKSPACE_NOT_FOUND");

      // Clean up test file
      await fs.unlink(testFilePath);
    });

    it("should return 400 for invalid file type", async () => {
      // Create a test file with .exe extension
      const testFilePath = path.join(__dirname, "test-file.exe");
      await fs.writeFile(testFilePath, "Mock executable content");

      const response = await request
        .post("/api/v1/files")
        .set("Authorization", `Bearer ${accessToken}`)
        .field("workspaceId", testWorkspace.workspaceId.toString())
        .attach("file", testFilePath);

      expect(response.status).toBe(400);
      expect(response.body.details.code).toBe("INVALID_FILE_TYPE");

      // Clean up test file
      await fs.unlink(testFilePath);
    });
  });

  describe("GET /api/v1/files/:fileId", () => {
    beforeEach(async () => {
      // Create a test file record
      const testFilePath = path.join(__dirname, "test-file.txt");
      await fs.writeFile(testFilePath, "Test file content");

      const uploadResponse = await request
        .post("/api/v1/files")
        .set("Authorization", `Bearer ${accessToken}`)
        .field("workspaceId", testWorkspace.workspaceId.toString())
        .attach("file", testFilePath);

      testFile = uploadResponse.body;
      await fs.unlink(testFilePath);
    });

    it("should return file details", async () => {
      const response = await request
        .get(`/api/v1/files/${testFile.fileId}`)
        .set("Authorization", `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("fileId", testFile.fileId);
      expect(response.body).toHaveProperty("filename", testFile.filename);
      expect(response.body).toHaveProperty("workspaceId", testWorkspace.workspaceId);
    });

    it("should return 404 for non-existent file", async () => {
      const response = await request
        .get("/api/v1/files/99999")
        .set("Authorization", `Bearer ${accessToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty("error");
      expect(response.body.details.code).toBe("FILE_NOT_FOUND");
    });

    it("should return 401 without authentication", async () => {
      const response = await request
        .get(`/api/v1/files/${testFile.fileId}`);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty("error");
      expect(response.body.details.code).toBe("UNAUTHORIZED");
    });
    it("should return 404 for file without workspace association", async () => {
      // Create a test file record without workspace association
      const [fileWithoutWorkspace] = await db
        .insert(files)
        .values({
          userId: testUser.userId,
          filename: "test-file.txt",
          fileType: "text/plain",
          fileUrl: "/uploads/test-file.txt",
          fileSize: 100,
          fileHash: "test-hash",
          uploadTime: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      const response = await request
        .get(`/api/v1/files/${fileWithoutWorkspace.fileId}`)
        .set("Authorization", `Bearer ${accessToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty("error");
      expect(response.body.details.code).toBe("INVALID_FILE");

      // Clean up test file record
      await db.delete(files).where(eq(files.fileId, fileWithoutWorkspace.fileId));
    });
  });

  afterEach(async () => {
    try {
      // Clean up test data
      if (testFile?.fileId) {
        await db.delete(files).where(eq(files.fileId, testFile.fileId));
      }

      if (testMessage?.messageId) {
        await db
          .delete(messages)
          .where(eq(messages.messageId, testMessage.messageId));
      }

      if (testWorkspace?.workspaceId) {
        await db
          .delete(workspaces)
          .where(eq(workspaces.workspaceId, testWorkspace.workspaceId));
      }

      if (testUser?.userId) {
        await db.delete(users).where(eq(users.userId, testUser.userId));
      }

      // Clean up any test files in uploads directory
      const uploadsDir = path.join(process.cwd(), "uploads");
      const uploadedFiles = await fs.readdir(uploadsDir);
      for (const file of uploadedFiles) {
        if (file.startsWith("test-")) {
          await fs.unlink(path.join(uploadsDir, file));
        }
      }
    } catch (error) {
      console.error("Test cleanup failed:", error);
      throw error;
    }
  });
});