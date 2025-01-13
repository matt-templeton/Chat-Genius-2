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
import type { IncomingMessage } from 'http';
import type { WebSocketMessage } from './types/websocket';

const MemoryStoreSession = MemoryStore(session);

// Track connected clients by workspace
const clients = new Map<number, Set<WebSocket>>();

// Extend Server type to include our custom broadcast function
interface ExtendedServer extends Server {
  broadcastToWorkspace(workspaceId: number, data: WebSocketMessage): void;
}

export async function registerRoutes(app: Express): Promise<ExtendedServer> {
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
  app.use(`${apiPrefix}/workspaces`, channelRouter);

  // Global channel routes and channel-specific operations
  app.use(`${apiPrefix}/channels`, channelRouter);

  // Message routes - both channel-specific and message-specific operations
  app.use(`${apiPrefix}/channels`, messageRouter);
  app.use(`${apiPrefix}/messages`, messageRouter);

  // Message-related features
  app.use(`${apiPrefix}/messages`, reactionRouter);
  app.use(`${apiPrefix}/messages`, pinRouter);

  // Standalone feature routes
  app.use(`${apiPrefix}/files`, fileRouter);
  app.use(`${apiPrefix}/emojis`, emojiRouter);

  // Create HTTP server
  const httpServer = createServer(app) as ExtendedServer;

  // Create WebSocket server
  const wss = new WebSocketServer({ 
    server: httpServer,
    path: '/ws',
    // Ignore vite HMR websocket connections
    verifyClient: ({ req }: { req: IncomingMessage }) => {
      return req.headers['sec-websocket-protocol'] !== 'vite-hmr';
    }
  });

  // WebSocket connection handler
  wss.on('connection', (ws: WebSocket) => {
    ws.on('message', (message: string) => {
      try {
        const data = JSON.parse(message.toString()) as WebSocketMessage;

        // Handle workspace subscription
        if (data.type === 'subscribe' && data.workspaceId) {
          const workspaceId = parseInt(data.workspaceId.toString());
          if (!clients.has(workspaceId)) {
            clients.set(workspaceId, new Set());
          }
          clients.get(workspaceId)?.add(ws);

          // Send confirmation
          ws.send(JSON.stringify({
            type: 'subscribed',
            workspaceId
          }));
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });

    // Handle client disconnection
    ws.on('close', () => {
      // Remove client from all workspace subscriptions
      // Convert Map.entries() to Array to avoid iteration issues
      Array.from(clients.entries()).forEach(([workspaceId, workspaceClients]) => {
        workspaceClients.delete(ws);
        if (workspaceClients.size === 0) {
          clients.delete(workspaceId);
        }
      });
    });
  });

  // Add broadcast function to server
  httpServer.broadcastToWorkspace = (workspaceId: number, data: WebSocketMessage) => {
    const workspaceClients = clients.get(workspaceId);
    if (workspaceClients) {
      const message = JSON.stringify(data);
      workspaceClients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });
    }
  };

  return httpServer;
}