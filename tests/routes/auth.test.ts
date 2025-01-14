import supertest from "supertest";
import express from "express";
import { registerRoutes } from "../../server/routes";
import { db } from "../../db";
import { users, userWorkspaces } from "../../db/schema";
import { eq, and } from "drizzle-orm";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

declare global {
  var server: any;
}

const request = supertest(app);
global.server = app.listen(0, "0.0.0.0");
registerRoutes(app);
const request = supertest(app);

describe("Auth Endpoints", () => {
  describe("POST /api/v1/auth/register", () => {
    it("should create a new user when valid data is provided", async () => {
      // Clear any existing test data
      await db.delete(userWorkspaces).where(eq(userWorkspaces.userId, 1));
      await db.delete(users).where(eq(users.email, "test@example.com"));

      const response = await request.post("/api/v1/auth/register").send({
        email: "test@example.com",
        password: "TestPassword123!",
        displayName: "Test User",
      });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty(
        "message",
        "User created successfully",
      );
      expect(response.body).not.toHaveProperty("passwordHash");

      // Verify the user and workspace were created properly
      const user = await db.query.users.findFirst({
        where: eq(users.email, "test@example.com"),
      });
      expect(user).toBeDefined();
      expect(user?.defaultWorkspace).toBeDefined();

      const userWorkspace = await db.query.userWorkspaces.findFirst({
        where: and(
          eq(userWorkspaces.userId, user!.userId),
          eq(userWorkspaces.workspaceId, user!.defaultWorkspace!),
        ),
      });
      expect(userWorkspace).toBeDefined();
    });

    it("should return 400 when email is invalid", async () => {
      const response = await request.post("/api/v1/auth/register").send({
        email: "invalid-email",
        password: "TestPassword123!",
        displayName: "Test User",
      });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        details: {
          code: "INVALID_EMAIL",
        },
      });
    });

    it("should return 400 when password is too weak", async () => {
      const response = await request.post("/api/v1/auth/register").send({
        email: "test@example.com",
        password: "123",
        displayName: "Test User",
      });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        details: {
          code: "WEAK_PASSWORD",
        },
      });
    });

    it("should return 409 when email is already in use", async () => {
      // First registration
      await request.post("/api/v1/auth/register").send({
        email: "duplicate@example.com",
        password: "TestPassword123!",
        displayName: "Test User",
      });

      // Duplicate registration
      const response = await request.post("/api/v1/auth/register").send({
        email: "duplicate@example.com",
        password: "TestPassword123!",
        displayName: "Another User",
      });

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        details: {
          code: "EMAIL_IN_USE",
        },
      });
    });
  });

  describe("POST /api/v1/auth/login", () => {
    beforeEach(async () => {
      // Create a test user
      await request.post("/api/v1/auth/register").send({
        email: "login.test@example.com",
        password: "TestPassword123!",
        displayName: "Login Test User",
      });
    });

    it("should successfully login with valid credentials", async () => {
      const response = await request.post("/api/v1/auth/login").send({
        email: "login.test@example.com",
        password: "TestPassword123!",
      });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      });
    });

    it("should return 401 with invalid credentials", async () => {
      const response = await request.post("/api/v1/auth/login").send({
        email: "login.test@example.com",
        password: "WrongPassword123!",
      });

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        details: {
          code: "INVALID_CREDENTIALS",
        },
      });
    });

    it("should return 401 with non-existent email", async () => {
      const response = await request.post("/api/v1/auth/login").send({
        email: "nonexistent@example.com",
        password: "TestPassword123!",
      });

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        details: {
          code: "INVALID_CREDENTIALS",
        },
      });
    });
  });

  describe("POST /api/v1/auth/verify-email", () => {
    let verificationToken: string;

    beforeEach(async () => {
      const registerResponse = await request
        .post("/api/v1/auth/register")
        .send({
          email: "verify.test@example.com",
          password: "TestPassword123!",
          displayName: "Verify Test User",
        });

      // In a real implementation, we would capture the verification token
      // from the email service mock. For now, we use a test token
      verificationToken = "test-verification-token";
    });

    it("should verify email with valid token", async () => {
      const response = await request
        .post("/api/v1/auth/verify-email")
        .send({ token: verificationToken });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty(
        "message",
        "Email verified successfully",
      );
    });

    it("should return 400 with invalid token", async () => {
      const response = await request
        .post("/api/v1/auth/verify-email")
        .send({ token: "invalid-token" });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        details: {
          code: "INVALID_TOKEN",
        },
      });
    });

    it("should return 400 with expired token", async () => {
      const response = await request
        .post("/api/v1/auth/verify-email")
        .send({ token: "expired-verification-token" });

      expect(response.status).toBe(400);
      // Per OpenAPI spec, expired tokens also return INVALID_TOKEN
      expect(response.body).toMatchObject({
        details: {
          code: "INVALID_TOKEN",
        },
      });
    });
  });

  describe("POST /api/v1/auth/refresh", () => {
    let refreshToken: string;

    beforeEach(async () => {
      // Create and login a test user to get a refresh token
      await request.post("/api/v1/auth/register").send({
        email: "refresh.test@example.com",
        password: "TestPassword123!",
        displayName: "Refresh Test User",
      });

      const loginResponse = await request.post("/api/v1/auth/login").send({
        email: "refresh.test@example.com",
        password: "TestPassword123!",
      });

      refreshToken = loginResponse.body.refreshToken;
    });

    it("should refresh access token with valid refresh token", async () => {
      const response = await request
        .post("/api/v1/auth/refresh")
        .send({ refreshToken });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      });
    });

    it("should return 401 with invalid refresh token", async () => {
      const response = await request
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: "invalid-refresh-token" });

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        details: {
          code: "INVALID_TOKEN",
        },
      });
    });

    it("should return 401 with expired refresh token", async () => {
      const response = await request
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: "expired-refresh-token" });

      expect(response.status).toBe(401);
      // Per OpenAPI spec, expired tokens also return INVALID_TOKEN
      expect(response.body).toMatchObject({
        details: {
          code: "INVALID_TOKEN",
        },
      });
    });
  });

  describe("POST /api/v1/auth/logout", () => {
    let accessToken: string;

    beforeEach(async () => {
      // Create and login a test user
      await request.post("/api/v1/auth/register").send({
        email: "logout.test@example.com",
        password: "TestPassword123!",
        displayName: "Logout Test User",
      });

      const loginResponse = await request.post("/api/v1/auth/login").send({
        email: "logout.test@example.com",
        password: "TestPassword123!",
      });

      accessToken = loginResponse.body.accessToken;
    });

    it("should successfully logout with valid access token", async () => {
      // First verify the token works with protected endpoint
      const beforeResponse = await request
        .get("/api/v1/users/me")
        .set("Authorization", `Bearer ${accessToken}`);

      expect(beforeResponse.status).toBe(200);
      expect(beforeResponse.body).toHaveProperty("userId");
      expect(beforeResponse.body).toHaveProperty(
        "email",
        "logout.test@example.com",
      );

      // Perform logout
      const logoutResponse = await request
        .post("/api/v1/auth/logout")
        .set("Authorization", `Bearer ${accessToken}`);

      expect(logoutResponse.status).toBe(200);
      expect(logoutResponse.body).toHaveProperty(
        "message",
        "Logout successful",
      );
    });

    it("should return 401 when logging out without token", async () => {
      const response = await request.post("/api/v1/auth/logout");

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        details: {
          code: "UNAUTHORIZED",
        },
      });
    });
  });

  // Cleanup after each test
  // afterEach(async () => {
  //   await db.delete(users).where(eq(users.email, "test@example.com"));
  //   await db.delete(users).where(eq(users.email, "login.test@example.com"));
  //   await db.delete(users).where(eq(users.email, "verify.test@example.com"));
  //   await db.delete(users).where(eq(users.email, "refresh.test@example.com"));
  //   await db.delete(users).where(eq(users.email, "logout.test@example.com"));
  //   await db.delete(users).where(eq(users.email, "duplicate@example.com"));
  // });
});
