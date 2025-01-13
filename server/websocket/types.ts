import type { WebSocket } from 'ws';

/**
 * WebSocket event types for channel-related events
 */
export type ChannelEvent = {
  type: 'CHANNEL_CREATED' | 'CHANNEL_UPDATED' | 'CHANNEL_ARCHIVED';
  workspaceId: number;
  channel: {
    id: number;
    name: string;
    description?: string;
    isPrivate: boolean;
    workspaceId: number;
    createdAt: string;
    updatedAt: string;
    archived: boolean;
  };
};

/**
 * WebSocket client data structure
 */
export type WebSocketClient = {
  workspaceId: number;
  userId: number;
  ws: WebSocket;
};