/**
 * Message Types
 * Defines the structure for messages and related entities
 */

export interface MessageUser {
  userId: number;
  displayName: string;
  profilePicture?: string | null;
}

export interface Message {
  messageId: number;
  content: string;
  userId: number;
  channelId: number;
  workspaceId: number;
  parentMessageId?: number;
  postedAt: string;
  deleted?: boolean;
  hasAttachments?: boolean;
  createdAt: string;
  updatedAt: string;
  user?: MessageUser;
  replyCount?: number;
  reactions?: Record<string, number>;
}

export interface Reaction {
  reactionId: number;
  messageId: number;
  userId: number;
  emojiId: number;
  createdAt: string;
}
