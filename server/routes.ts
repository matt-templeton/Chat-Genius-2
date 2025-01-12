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

  // Add JSON and URL-encoded body parsing before any routes
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

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

  // Mount all routes under /api/v1 prefix
  const apiPrefix = '/api/v1';

  // Auth routes need to be first to handle registration and login
  app.use(`${apiPrefix}/auth`, authRouter);

  // Protected routes
  app.use(`${apiPrefix}/users`, userRouter);
  app.use(`${apiPrefix}/workspaces`, workspaceRouter);
  app.use(`${apiPrefix}/channels`, channelRouter);

  // Mount message-related routes
  app.use(`${apiPrefix}/channels`, messageRouter);
  app.use(`${apiPrefix}/messages`, messageRouter);

  // Mount reactions and pins under /messages
  app.use(`${apiPrefix}/messages`, reactionRouter);
  app.use(`${apiPrefix}/messages`, pinRouter);

  // Mount file and emoji routes
  app.use(`${apiPrefix}/files`, fileRouter);
  app.use(`${apiPrefix}/emojis`, emojiRouter);

  // Error handling middleware
  app.use((err: any, req: any, res: any, next: any) => {
    console.error(err.stack);
    res.status(err.status || 500).json({
      error: true,
      message: err.message || 'Internal Server Error',
      details: {
        code: err.code || 'INTERNAL_SERVER_ERROR'
      }
    });
  });

  // Create HTTP server
  const httpServer = createServer(app);

  return httpServer;
}