import type { Express } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import MemoryStore from "memorystore";
import passport from "./middleware/auth";
import { promises as fs } from "fs";
import path from "path";
import {
  authRouter,
  userRouter,
  workspaceRouter,
  channelRouter,
  messageRouter,
  reactionRouter,
  fileRouter,
  pinRouter,
} from "./routes/index";
import express from "express";
import { initializeWebSocketManager } from "./websocket/WebSocketManager";

const MemoryStoreSession = MemoryStore(session);

export async function registerRoutes(app: Express): Promise<Server> {
  // Create uploads directory if it doesn't exist
  const uploadsDir = path.join(process.cwd(), "uploads");
  try {
    await fs.access(uploadsDir);
  } catch {
    await fs.mkdir(uploadsDir, { recursive: true });
  }

  // Serve static files from uploads directory
  app.use("/uploads", express.static(uploadsDir));

  // Session middleware
  app.use(
    session({
      store: new MemoryStoreSession({
        checkPeriod: 86400000, // prune expired entries every 24h
      }),
      secret: process.env.SESSION_SECRET || "your-secret-key",
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === "production",
        maxAge: 2 * 60 * 60 * 1000, // 2 hours
      },
    }),
  );

  // Initialize passport middleware
  app.use(passport.initialize());
  app.use(passport.session());

  // Mount all routes under /api/v1 prefix
  const apiPrefix = "/api/v1";

  // Authentication routes
  app.use(`${apiPrefix}/auth`, authRouter);

  // User management routes
  app.use(`${apiPrefix}/users`, userRouter);

  // Workspace and workspace-specific channel routes
  app.use(`${apiPrefix}/workspaces`, workspaceRouter);
  app.use(`${apiPrefix}/workspaces`, channelRouter); // For /workspaces/:workspaceId/channels endpoints

  // Global channel routes and channel-specific operations
  app.use(`${apiPrefix}/channels`, channelRouter);

  // Message routes - both channel-specific and message-specific operations
  app.use(`${apiPrefix}/channels`, messageRouter); // For /channels/:channelId/messages endpoints
  app.use(`${apiPrefix}/messages`, messageRouter); // For /messages/:messageId endpoints

  // Message-related features
  app.use(`${apiPrefix}/messages`, reactionRouter); // For /messages/:messageId/reactions
  app.use(`${apiPrefix}/messages`, pinRouter); // For /messages/:messageId/pin

  // Standalone feature routes
  app.use(`${apiPrefix}/files`, fileRouter);

  // Create HTTP server
  const httpServer = createServer(app);

  // Initialize WebSocket manager after all routes are set up
  initializeWebSocketManager(httpServer);

  return httpServer;
}
