export interface Channel {
  channelId: number;
  name: string;
  channelType: 'PUBLIC' | 'PRIVATE' | 'DM';
  workspaceId: number;
}