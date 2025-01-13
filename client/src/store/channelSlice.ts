import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

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

      let data;
      try {
        data = await response.json();
      } catch (e) {
        console.error('Failed to parse channel creation response:', e);
        return rejectWithValue('Invalid response from server');
      }

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
    // New reducers for handling WebSocket events
    handleChannelCreated: (state, action) => {
      const channel = action.payload;
      if (!state.channels.some(c => c.channelId === channel.id)) {
        state.channels.push({
          channelId: channel.id,
          name: channel.name,
          workspaceId: channel.workspaceId,
          archived: channel.archived,
          description: channel.description,
          channelType: channel.isPrivate ? 'PRIVATE' : 'PUBLIC',
          createdAt: channel.createdAt,
        });
      }
    },
    handleChannelUpdated: (state, action) => {
      const channel = action.payload;
      const index = state.channels.findIndex(c => c.channelId === channel.id);
      if (index !== -1) {
        state.channels[index] = {
          ...state.channels[index],
          name: channel.name,
          archived: channel.archived,
          description: channel.description,
        };
        if (state.currentChannel?.channelId === channel.id) {
          state.currentChannel = state.channels[index];
        }
      }
    },
    handleChannelArchived: (state, action) => {
      const channel = action.payload;
      const index = state.channels.findIndex(c => c.channelId === channel.id);
      if (index !== -1) {
        state.channels[index].archived = true;
        if (state.currentChannel?.channelId === channel.id) {
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
        state.channels.push(action.payload);
        state.currentChannel = action.payload;
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
  handleChannelCreated,
  handleChannelUpdated,
  handleChannelArchived,
} = channelSlice.actions;

export default channelSlice.reducer;