import type { Express } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import MemoryStore from "memorystore";
import passport from './middleware/auth';
import { authRouter, userRouter, workspaceRouter, channelRouter, messageRouter } from './routes/index';

const MemoryStoreSession = MemoryStore(session);

export function registerRoutes(app: Express): Server {
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

  // Create HTTP server
  const httpServer = createServer(app);

  return httpServer;
}