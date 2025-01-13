import WebSocket, { WebSocketServer } from 'ws';
import { Server } from 'http';
import type { WebSocketClient, ChannelEvent } from './types';
import { log } from '../utils/logger';

export class WebSocketManager {
  private wss: WebSocketServer;
  private clients: Map<WebSocket, WebSocketClient> = new Map();
  private connectionsByIp: Map<string, number> = new Map();
  private readonly MAX_CONNECTIONS_PER_IP = 3;

  constructor(server: Server) {
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws',
      verifyClient: (info: { origin: string; secure: boolean; req: any }) => {
        const protocol = info.req.headers['sec-websocket-protocol'];

        // Always allow Vite HMR connections
        if (protocol === 'vite-hmr') {
          log('Allowing Vite HMR connection');
          return true;
        }

        // For our application connections, verify workspaceId
        const url = new URL(info.req.url, `http://${info.req.headers.host}`);
        const workspaceId = parseInt(url.searchParams.get('workspaceId') || '');

        if (isNaN(workspaceId) || workspaceId <= 0) {
          log(`Rejected connection - invalid workspace ID: ${workspaceId}`);
          return false;
        }

        log(`Accepted connection for workspace ID: ${workspaceId}`);
        return true;
      }
    });

    this.setupWebSocketServer();
    log('WebSocket server initialized');
  }

  private setupWebSocketServer(): void {
    this.wss.on('connection', this.handleConnection.bind(this));

    this.wss.on('error', (error) => {
      log(`WebSocket server error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    });

    // Add heartbeat to keep connections alive and clean up stale ones
    setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        }
      });
    }, 30000);
  }

  private handleConnection(ws: WebSocket, request: any): void {
    try {
      const ip = request.headers['x-forwarded-for'] || request.socket.remoteAddress;
      const currentConnections = this.connectionsByIp.get(ip) || 0;

      if (currentConnections >= this.MAX_CONNECTIONS_PER_IP) {
        ws.close(1013, 'Too many connections');
        return;
      }

      this.connectionsByIp.set(ip, currentConnections + 1);

      // Skip processing for Vite HMR connections
      if (request.headers['sec-websocket-protocol'] === 'vite-hmr') {
        log('Processing Vite HMR connection');
        return;
      }

      const url = new URL(request.url, `http://${request.headers.host}`);
      const workspaceId = parseInt(url.searchParams.get('workspaceId') || '');

      if (isNaN(workspaceId) || workspaceId <= 0) {
        log(`Rejecting connection with invalid workspace ID: ${workspaceId}`);
        ws.close(4000, 'Invalid workspace ID');
        return;
      }

      // Close any existing connections for this workspace/user combination
      Array.from(this.clients.entries()).forEach(([existingWs, client]) => {
        if (client.workspaceId === workspaceId && client.userId === 1) {
          log(`Closing existing connection for workspace ${workspaceId} and user ${client.userId}`);
          existingWs.close(1000, 'New connection established');
          this.clients.delete(existingWs);
        }
      });

      // Add the new connection
      this.clients.set(ws, { workspaceId, userId: 1, ws });
      log(`Client connected to workspace ${workspaceId}`);

      // Setup heartbeat response
      ws.on('pong', () => {
        // Connection is alive
      });

      ws.on('close', (code, reason) => {
        this.clients.delete(ws);
        const ipConnections = this.connectionsByIp.get(ip);
        if (ipConnections && ipConnections > 0) {
          this.connectionsByIp.set(ip, ipConnections - 1);
        }
        log(`Client disconnected from workspace ${workspaceId}. Code: ${code}, Reason: ${reason}`);
      });

      ws.on('error', (error) => {
        log(`WebSocket error for workspace ${workspaceId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        this.clients.delete(ws);
        try {
          ws.close(1011, 'Internal server error');
        } catch (e) {
          // Ignore close errors
        }
      });

      // Send initial connection success message
      ws.send(JSON.stringify({ 
        type: 'CONNECTED', 
        workspaceId,
        timestamp: new Date().toISOString()
      }));

    } catch (error) {
      log(`Connection error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      try {
        ws.close(4000, 'Invalid connection parameters');
      } catch (e) {
        // Ignore close errors
      }
    }
  }

  public broadcastToWorkspace(workspaceId: number, event: ChannelEvent): void {
    if (!workspaceId) {
      log('Invalid workspace ID for broadcast');
      return;
    }

    const message = JSON.stringify({
      ...event,
      timestamp: new Date().toISOString()
    });

    let successCount = 0;
    let failureCount = 0;

    this.clients.forEach((client, ws) => {
      if (client.workspaceId === workspaceId && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(message);
          successCount++;
        } catch (error) {
          failureCount++;
          log(`Failed to send message to client: ${error instanceof Error ? error.message : 'Unknown error'}`);
          this.clients.delete(ws);
          try {
            ws.close(1011, 'Failed to send message');
          } catch (e) {
            // Ignore close errors
          }
        }
      }
    });

    log(`Broadcast to workspace ${workspaceId}: ${successCount} successful, ${failureCount} failed`);
  }
}

// Singleton instance
let wsManager: WebSocketManager | null = null;

export function initializeWebSocketManager(server: Server): WebSocketManager {
  if (!wsManager) {
    wsManager = new WebSocketManager(server);
  }
  return wsManager;
}

export function getWebSocketManager(): WebSocketManager {
  if (!wsManager) {
    throw new Error('WebSocket manager not initialized');
  }
  return wsManager;
}