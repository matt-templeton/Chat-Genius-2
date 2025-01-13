import type { Server } from 'http';
import { db } from '@db';
import { channels } from '@db/schema';
import type { ChannelCreatedMessage } from '../types/websocket';
import { eq } from 'drizzle-orm';

interface CreateChannelParams {
  name: string;
  workspaceId: number;
  topic?: string;
  channelType?: 'PUBLIC' | 'PRIVATE' | 'DM';
  createdBy?: number;
}

export async function createChannel(params: CreateChannelParams, server: Server) {
  const { name, workspaceId, topic, channelType = 'PUBLIC', createdBy } = params;

  // Create the channel in the database
  const [channel] = await db.insert(channels).values({
    name,
    workspaceId,
    topic,
    channelType,
    archived: false,
  }).returning();

  // Broadcast the new channel to all connected clients in the workspace
  const message: ChannelCreatedMessage = {
    type: 'channel_created',
    workspaceId,
    data: {
      id: channel.channelId,
      name: channel.name,
      topic: channel.topic || undefined,
      channelType: channel.channelType,
      archived: channel.archived,
      createdAt: channel.createdAt.toISOString(),
      createdBy: createdBy || 0,
    },
  };

  (server as any).broadcastToWorkspace(workspaceId, message);

  return channel;
}