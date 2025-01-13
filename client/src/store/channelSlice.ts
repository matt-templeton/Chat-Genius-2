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
          workspaceId,
          name: channel.name,
          description: channel.description || '',
          channelType: channel.channelType,
        }),
      });

      console.log('Create channel response status:', response.status);
      const responseText = await response.text();
      console.log('Create channel response:', responseText);

      if (!response.ok) {
        console.error('Failed to create channel:', responseText);
        return rejectWithValue(responseText || 'Failed to create channel');
      }

      try {
        return JSON.parse(responseText) as Channel;
      } catch (e) {
        console.error('Failed to parse channel response:', e);
        return rejectWithValue('Invalid response from server');
      }
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

export const { setCurrentChannel, toggleShowArchived, clearChannels } = channelSlice.actions;
export default channelSlice.reducer;