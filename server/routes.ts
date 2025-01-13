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
import { WebSocket, WebSocketServer } from 'ws';

const MemoryStoreSession = MemoryStore(session);

// Store connected clients by workspace
const clients: Map<number, Set<WebSocket>> = new Map();

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
  const apiPrefix = '/api/v1';

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
  app.use(`${apiPrefix}/emojis`, emojiRouter);

  // Create HTTP server
  const httpServer = createServer(app);

  // Create WebSocket server
  const wss = new WebSocketServer({ 
    server: httpServer,
    verifyClient: ({ req }, done) => {
      // Ignore vite-hmr protocol requests during development
      if (req.headers['sec-websocket-protocol'] === 'vite-hmr') {
        return done(false);
      }
      done(true);
    }
  });

  // WebSocket connection handling
  wss.on('connection', (ws, req) => {
    // Extract workspaceId from query parameters
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const workspaceId = parseInt(url.searchParams.get('workspaceId') || '0');

    if (!workspaceId) {
      ws.close(1008, 'Workspace ID is required');
      return;
    }

    // Add client to workspace's client set
    if (!clients.has(workspaceId)) {
      clients.set(workspaceId, new Set());
    }
    clients.get(workspaceId)!.add(ws);

    // Handle client disconnection
    ws.on('close', () => {
      const workspaceClients = clients.get(workspaceId);
      if (workspaceClients) {
        workspaceClients.delete(ws);
        if (workspaceClients.size === 0) {
          clients.delete(workspaceId);
        }
      }
    });

    ws.on('message', (message) => {
      try {
        const parsedMessage = JSON.parse(message.toString());
        // Handle incoming messages here, potentially broadcasting to other clients
        console.log('Received message:', parsedMessage);
        app.locals.broadcastToWorkspace(workspaceId, parsedMessage);

      } catch (error) {
        console.error('Failed to parse message:', error);
      }
    });
  });

  // Export broadcast function to be used by channel routes
  app.locals.broadcastToWorkspace = (workspaceId: number, message: any) => {
    const workspaceClients = clients.get(workspaceId);
    if (workspaceClients) {
      const messageStr = JSON.stringify(message);
      workspaceClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(messageStr);
        }
      });
    }
  };

  return httpServer;
}