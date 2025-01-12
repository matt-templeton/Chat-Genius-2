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
  pinRouter 
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

  // Mount all routes under /api/v1 prefix
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/users', userRouter);
  app.use('/api/v1/workspaces', workspaceRouter);
  app.use('/api/v1/channels', channelRouter);
  app.use('/api/v1/messages', messageRouter);
  app.use('/api/v1/messages', reactionRouter); // Mount under /messages for reactions
  app.use('/api/v1/messages', pinRouter); // Mount under /messages for pins
  app.use('/api/v1/files', fileRouter);

  // Create HTTP server
  const httpServer = createServer(app);

  return httpServer;
}