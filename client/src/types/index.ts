/**
 * Common type definitions shared between frontend and backend
 */

/** Channel Types */
export type ChannelType = 'PUBLIC' | 'PRIVATE' | 'DM';

/** User Presence States */
export type PresenceState = 'ONLINE' | 'AWAY' | 'DND' | 'OFFLINE';

/** User Roles in Workspace */
export type WorkspaceRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'GUEST';

/** Theme Type */
export type ThemeType = 'light' | 'dark' | 'system';

/** User interface matching backend schema */
export interface User {
  id: number;
  email: string;
  displayName: string;
  profilePicture?: string;
  statusMessage?: string;
  lastKnownPresence?: PresenceState;
  theme: ThemeType;
  deactivated: boolean;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Workspace interface */
export interface Workspace {
  id: number;
  name: string;
  description?: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Channel interface */
export interface Channel {
  id: number;
  workspaceId: number;
  name: string;
  topic?: string;
  channelType: ChannelType;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Message interface */
export interface Message {
  id: number;
  userId: number | null;
  channelId: number;
  workspaceId: number;
  parentMessageId?: number;
  content: string;
  deleted: boolean;
  postedAt: string;
  createdAt: string;
  updatedAt: string;
}

/** File interface */
export interface File {
  id: number;
  userId: number;
  messageId?: number;
  workspaceId: number;
  filename: string;
  fileType?: string;
  fileUrl: string;
  fileSize?: number;
  uploadTime: string;
}

/** Emoji interface */
export interface Emoji {
  id: number;
  code: string;
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Message Reaction interface */
export interface MessageReaction {
  id: number;
  messageId: number;
  workspaceId: number;
  emojiId: number;
  userId: number;
  createdAt: string;
  updatedAt: string;
}