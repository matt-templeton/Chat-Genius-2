import WebSocket, { WebSocketServer } from 'ws';
import { Server } from 'http';
import type { WebSocketClient, ChannelEvent } from './types';
import { log } from '../vite';

export class WebSocketManager {
  private wss: WebSocketServer;
  private clients: Map<WebSocket, WebSocketClient> = new Map();

  constructor(server: Server) {
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws',
      verifyClient: (info: { origin: string; secure: boolean; req: any }) => {
        // Skip verification for vite HMR connections
        if (info.req.headers['sec-websocket-protocol'] === 'vite-hmr') {
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
  }

  private handleConnection(ws: WebSocket, request: any): void {
    try {
      const url = new URL(request.url, `http://${request.headers.host}`);
      const workspaceId = parseInt(url.searchParams.get('workspaceId') || '');

      if (isNaN(workspaceId)) {
        ws.close(4000, 'Workspace ID is required');
        return;
      }

      this.clients.set(ws, { workspaceId, userId: 1, ws });
      log(`Client connected to workspace ${workspaceId}`);

      ws.on('close', () => {
        this.clients.delete(ws);
        log(`Client disconnected from workspace ${workspaceId}`);
      });

      ws.on('error', (error) => {
        log(`WebSocket error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        this.clients.delete(ws);
        try {
          ws.close();
        } catch (e) {
          // Ignore close errors
        }
      });

      // Send initial connection success message
      ws.send(JSON.stringify({ type: 'CONNECTED', workspaceId }));
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

    const message = JSON.stringify(event);
    const clients = Array.from(this.clients.entries());

    for (const [ws, client] of clients) {
      if (client.workspaceId === workspaceId && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(message);
        } catch (error) {
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