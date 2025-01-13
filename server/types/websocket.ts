export interface WebSocketMessage {
  type: string;
  workspaceId?: number;
  data?: any;
}

export interface ChannelCreatedMessage extends WebSocketMessage {
  type: 'channel_created';
  workspaceId: number;
  data: {
    id: number;
    name: string;
    description?: string;
    isPrivate: boolean;
    createdAt: string;
    createdBy: number;
  };
}

export interface SubscribeMessage extends WebSocketMessage {
  type: 'subscribe';
  workspaceId: number;
}

export interface SubscribedMessage extends WebSocketMessage {
  type: 'subscribed';
  workspaceId: number;
}

export type WebSocketEvent = 
  | ChannelCreatedMessage
  | SubscribeMessage
  | SubscribedMessage;
