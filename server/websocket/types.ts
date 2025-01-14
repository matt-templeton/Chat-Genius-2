import type { WebSocket } from "ws";

/**
 * WebSocket event types for channel-related events
 */
export interface ChannelEvent {
  type: string;
  workspaceId: number;
  data?: any;
  timestamp?: string;
}

/**
 * WebSocket client data structure
 */
export type WebSocketClient = {
  workspaceId: number;
  userId: number;
  ws: WebSocket;
};
