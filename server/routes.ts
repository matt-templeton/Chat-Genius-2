import type { Express } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import MemoryStore from "memorystore";
import passport from './middleware/auth';
import { promises as fs } from 'fs';
import path from 'path';
import { 
  authRouter, 
  userRouter, 
  workspaceRouter, 
  channelRouter, 
  messageRouter,
  reactionRouter,
  fileRouter,
  pinRouter,
  emojiRouter 
} from './routes/index';
import express from 'express';

const MemoryStoreSession = MemoryStore(session);

export async function registerRoutes(app: Express): Promise<Server> {
  // Create uploads directory if it doesn't exist
  const uploadsDir = path.join(process.cwd(), 'uploads');
  try {
    await fs.access(uploadsDir);
  } catch {
    await fs.mkdir(uploadsDir, { recursive: true });
  }

  // Serve static files from uploads directory
  app.use('/uploads', express.static(uploadsDir));

  // Session middleware
  app.use(session({
    store: new MemoryStoreSession({
      checkPeriod: 86400000 // prune expired entries every 24h
    }),
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  }));

  // Initialize passport middleware
  app.use(passport.initialize());
  app.use(passport.session());

  // Mount all routes under /v1 prefix as per OpenAPI spec
  const apiPrefix = '/v1';

  // Auth routes
  app.use(`${apiPrefix}/auth`, authRouter);

  // User routes
  app.use(`${apiPrefix}/users`, userRouter);

  // Workspace and channel routes
  app.use(`${apiPrefix}/workspaces`, workspaceRouter);
  app.use(`${apiPrefix}/workspaces`, channelRouter); // Workspace-related channel routes
  app.use(`${apiPrefix}/channels`, channelRouter); // Channel-specific routes

  // Message-related routes
  app.use(`${apiPrefix}/channels`, messageRouter); // Channel messages
  app.use(`${apiPrefix}/messages`, messageRouter); // Message-specific operations

  // Message reactions and pins
  app.use(`${apiPrefix}/messages`, reactionRouter);
  app.use(`${apiPrefix}/messages`, pinRouter);

  // File and emoji routes
  app.use(`${apiPrefix}/files`, fileRouter);
  app.use(`${apiPrefix}/emojis`, emojiRouter);

  // Create HTTP server
  const httpServer = createServer(app);

  return httpServer;
}