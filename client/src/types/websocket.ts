export interface WebSocketChannelEvent {
  type: "CHANNEL_CREATED" | "CHANNEL_UPDATED" | "CHANNEL_ARCHIVED";
  workspaceId: number;
  data: {
    id: number;
    name: string;
    description: string;
    isPrivate: boolean;
    channelType: 'PUBLIC' | 'PRIVATE' | 'DM';
    workspaceId: number;
    topic?: string;
    archived?: boolean;
  };
}

export interface WebSocketMessageEvent {
  type: "MESSAGE_CREATED";
  workspaceId: number;
  data: {
    messageId: number;
    channelId: number;
    content: string;
    userId: number;
    workspaceId: number;
    createdAt: string;
    parentMessageId?: number;
    hasAttachments: boolean;
    identifier?: number;
    user: {
      userId: number;
      displayName: string;
      profilePicture?: string | null;
    };
  };
}

export type WebSocketEvent = WebSocketChannelEvent | WebSocketMessageEvent; 