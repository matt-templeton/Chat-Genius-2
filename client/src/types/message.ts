/**
 * Message Types
 * Defines the structure for messages and related entities
 */

export interface MessageUser {
  userId: number;
  displayName: string;
  profilePicture: string | null;
}

export interface Message {
  messageId: number;
  channelId: number;
  workspaceId: number;
  userId: number;
  content: string;
  parentMessageId?: number | null;
  deleted: boolean;
  postedAt: string;
  createdAt: string;
  updatedAt: string;
  reactions?: Reaction[];
  isPinned?: boolean;
  user?: MessageUser | null;
}

export interface Reaction {
  reactionId: number;
  messageId: number;
  userId: number;
  emojiId: number;
  createdAt: string;
}
