import { createSlice, createAsyncThunk, createAction } from '@reduxjs/toolkit';

export interface Channel {
  channelId: number;
  name: string;
  workspaceId: number;
  archived: boolean;
  description?: string;
  channelType: 'PUBLIC' | 'PRIVATE' | 'DM';
  createdAt: string;
}

interface ChannelState {
  channels: Channel[];
  currentChannel: Channel | null;
  loading: boolean;
  error: string | null;
  showArchived: boolean;
}

const initialState: ChannelState = {
  channels: [],
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
  async ({ workspaceId, channel }: { workspaceId: number, channel: Partial<Channel> }, { rejectWithValue }) => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/v1/channels', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: channel.name,
          workspaceId: workspaceId,
          description: channel.description || undefined,
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
      // Only add the channel if it doesn't already exist
      const channel = action.payload;
      const channelExists = state.channels.some(c => c.channelId === channel.channelId);
      if (!channelExists) {
        state.channels.push(channel);
        // If this is the newly created channel, set it as current
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
        //state.currentChannel = action.payload; //Removed - handled in handleChannelCreated
        state.error = null;
      })
      .addCase(createChannel.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string || 'Failed to create channel';
      });
  },
});

export const {
  setCurrentChannel,
  toggleShowArchived,
  clearChannels,
} = channelSlice.actions;

export default channelSlice.reducer;