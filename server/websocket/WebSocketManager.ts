import WebSocket, { WebSocketServer } from 'ws';
import { Server } from 'http';
import type { WebSocketClient, ChannelEvent } from './types';
import { log } from '../utils/logger';

export class WebSocketManager {
  private wss: WebSocketServer;
  private clients: Map<WebSocket, WebSocketClient> = new Map();

  constructor(server: Server) {
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws',
      verifyClient: (info: { origin: string; secure: boolean; req: any }) => {
        const protocol = info.req.headers['sec-websocket-protocol'];

        // Always allow Vite HMR connections
        if (protocol === 'vite-hmr') {
          return true;
        }

        // For our application connections, verify workspaceId
        const url = new URL(info.req.url, `http://${info.req.headers.host}`);
        const workspaceId = parseInt(url.searchParams.get('workspaceId') || '');

        if (isNaN(workspaceId) || workspaceId <= 0) {
          log(`Invalid workspace ID in connection request: ${workspaceId}`);
          return false;
        }

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

    // Add heartbeat to keep connections alive
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
      // Skip processing for Vite HMR connections
      if (request.headers['sec-websocket-protocol'] === 'vite-hmr') {
        return;
      }

      const url = new URL(request.url, `http://${request.headers.host}`);
      const workspaceId = parseInt(url.searchParams.get('workspaceId') || '');

      if (isNaN(workspaceId) || workspaceId <= 0) {
        log(`Rejecting connection with invalid workspace ID: ${workspaceId}`);
        ws.close(4000, 'Workspace ID is required');
        return;
      }

      this.clients.set(ws, { workspaceId, userId: 1, ws });
      log(`Client connected to workspace ${workspaceId}`);

      // Setup heartbeat response
      ws.on('pong', () => {
        // Connection is alive
      });

      ws.on('close', (code, reason) => {
        this.clients.delete(ws);
        log(`Client disconnected from workspace ${workspaceId}. Code: ${code}, Reason: ${reason}`);
      });

      ws.on('error', (error) => {
        log(`WebSocket error for workspace ${workspaceId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        this.clients.delete(ws);
        try {
          ws.close();
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

    const clients = Array.from(this.clients.entries());
    let successCount = 0;
    let failureCount = 0;

    for (const [ws, client] of clients) {
      if (client.workspaceId === workspaceId && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(message);
          successCount++;
        } catch (error) {
          failureCount++;
          log(`Failed to send message to client: ${error instanceof Error ? error.message : 'Unknown error'}`);
          this.clients.delete(ws);
          try {
            ws.close();
          } catch (e) {
            // Ignore close errors
          }
        }
      }
    }

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