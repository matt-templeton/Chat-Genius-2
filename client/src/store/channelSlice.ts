import { createSlice, createAsyncThunk, createAction } from '@reduxjs/toolkit';

export interface Channel {
  channelId: number;
  name: string;
  workspaceId: number;
  archived: boolean;
  description?: string;
  topic?: string;
  channelType: 'PUBLIC' | 'PRIVATE' | 'DM';
  participants?: string[];
  lastMessage?: string;
  createdAt: string;
}

interface ChannelState {
  channels: Channel[];
  dms: Channel[];
  currentChannel: Channel | null;
  loading: boolean;
  error: string | null;
  showArchived: boolean;
}

const initialState: ChannelState = {
  channels: [],
  dms: [],
  currentChannel: null,
  loading: false,
  error: null,
  showArchived: false,
};

export const fetchChannels = createAsyncThunk(
  'channel/fetchChannels',
  async ({ workspaceId, showArchived }: { workspaceId: number; showArchived: boolean }, { rejectWithValue }) => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/v1/workspaces/${workspaceId}/channels?includeArchived=${showArchived}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to fetch channels:', errorText);
        return rejectWithValue(errorText || 'Failed to fetch channels');
      }

      const data = await response.json();
      return data || [];
    } catch (error) {
      console.error('Error fetching channels:', error);
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to fetch channels');
    }
  }
);

export const createChannel = createAsyncThunk(
  'channel/createChannel',
  async ({ workspaceId, channel }: { 
    workspaceId: number, 
    channel: Pick<Channel, 'name' | 'channelType' | 'topic'> 
  }, { rejectWithValue }) => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/v1/channels', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        credentials: 'include',
        body: JSON.stringify({
          name: channel.name,
          workspaceId,
          topic: channel.topic,
          channelType: channel.channelType,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to create channel:', errorText);
        return rejectWithValue(errorText || 'Failed to create channel');
      }

      const data = await response.json();
      if (!data) {
        console.error('No data returned from channel creation');
        return rejectWithValue('No data returned from server');
      }

      return data as Channel;
    } catch (error) {
      console.error('Error creating channel:', error);
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to create channel');
    }
  }
);

export const fetchDirectMessages = createAsyncThunk(
  'channel/fetchDirectMessages',
  async ({ workspaceId }: { workspaceId: number }, { rejectWithValue }) => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/v1/workspaces/${workspaceId}/dms`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        return rejectWithValue(errorText || 'Failed to fetch direct messages');
      }

      const data = await response.json();
      return data || [];
    } catch (error) {
      console.error('Error fetching direct messages:', error);
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to fetch direct messages');
    }
  }
);

export const createDirectMessage = createAsyncThunk(
  'channel/createDirectMessage',
  async ({ workspaceId, participants }: { 
    workspaceId: number,
    participants: string[]
  }, { rejectWithValue }) => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/v1/channels', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        credentials: 'include',
        body: JSON.stringify({
          workspaceId,
          channelType: 'DM',
          participants,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return rejectWithValue(errorText || 'Failed to create direct message');
      }

      const data = await response.json();
      return data as Channel;
    } catch (error) {
      console.error('Error creating direct message:', error);
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to create direct message');
    }
  }
);


// WebSocket event actions
export const handleChannelCreated = createAction<Channel>('channel/handleChannelCreated');
export const handleChannelUpdated = createAction<Channel>('channel/handleChannelUpdated');
export const handleChannelArchived = createAction<number>('channel/handleChannelArchived');

const channelSlice = createSlice({
  name: 'channel',
  initialState,
  reducers: {
    setCurrentChannel: (state, action) => {
      state.currentChannel = action.payload;
    },
    toggleShowArchived: (state) => {
      state.showArchived = !state.showArchived;
    },
    clearChannels: (state) => {
      state.channels = [];
      state.currentChannel = null;
      state.error = null;
    },
    handleChannelCreated: (state, action) => {
      const channel = action.payload;
      const channelExists = state.channels.some(c => c.channelId === channel.channelId);
      if (!channelExists) {
        state.channels.push(channel);
        // Set as current if it matches
        if (state.currentChannel?.channelId === channel.channelId) {
          state.currentChannel = channel;
        }
      }
    },
    handleChannelUpdated: (state, action) => {
      const channel = action.payload;
      const index = state.channels.findIndex(c => c.channelId === channel.channelId);
      if (index !== -1) {
        state.channels[index] = channel;
        if (state.currentChannel?.channelId === channel.channelId) {
          state.currentChannel = channel;
        }
      }
    },
    handleChannelArchived: (state, action) => {
      const channelId = action.payload;
      const index = state.channels.findIndex(c => c.channelId === channelId);
      if (index !== -1) {
        state.channels[index].archived = true;
        if (state.currentChannel?.channelId === channelId) {
          state.currentChannel = null;
        }
      }
    },
    handleDirectMessageCreated: (state, action) => {
      const dm = action.payload;
      const dmExists = state.dms.some(d => d.channelId === dm.channelId);
      if (!dmExists && dm.channelType === 'DM') {
        state.dms.push(dm);
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchChannels.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchChannels.fulfilled, (state, action) => {
        state.loading = false;
        state.channels = action.payload;
        state.error = null;
      })
      .addCase(fetchChannels.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string || 'Failed to fetch channels';
      })
      .addCase(createChannel.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createChannel.fulfilled, (state, action) => {
        state.loading = false;
        state.error = null;
      })
      .addCase(createChannel.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string || 'Failed to create channel';
      })
      .addCase(fetchDirectMessages.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchDirectMessages.fulfilled, (state, action) => {
        state.loading = false;
        state.dms = action.payload.filter((channel: Channel) => channel.channelType === 'DM');
        state.error = null;
      })
      .addCase(fetchDirectMessages.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string || 'Failed to fetch direct messages';
      })
      .addCase(createDirectMessage.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createDirectMessage.fulfilled, (state, action) => {
        state.loading = false;
        state.error = null;
      })
      .addCase(createDirectMessage.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string || 'Failed to create direct message';
      });
  },
});

export const {
  setCurrentChannel,
  toggleShowArchived,
  clearChannels,
  handleDirectMessageCreated,
} = channelSlice.actions;

export default channelSlice.reducer;