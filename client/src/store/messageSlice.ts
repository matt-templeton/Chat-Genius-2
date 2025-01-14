import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

export interface Message {
  messageId: number;
  channelId: number;
  workspaceId: number;
  userId: number;
  content: string;
  createdAt: string;
  reactions?: any[];
}

interface MessageState {
  messages: Message[];
  loading: boolean;
  error: string | null;
}

const initialState: MessageState = {
  messages: [],
  loading: false,
  error: null,
};

export const createMessage = createAsyncThunk(
  'message/createMessage',
  async ({ channelId, content }: { channelId: number; content: string }, { rejectWithValue }) => {
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        return rejectWithValue('No authentication token found');
      }

      const response = await fetch(`/api/v1/channels/${channelId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ content }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to create message:', errorText);
        return rejectWithValue(errorText || 'Failed to create message');
      }

      const data = await response.json();
      return data as Message;
    } catch (error) {
      console.error('Error creating message:', error);
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to create message');
    }
  }
);

const messageSlice = createSlice({
  name: 'message',
  initialState,
  reducers: {
    clearMessages: (state) => {
      state.messages = [];
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(createMessage.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createMessage.fulfilled, (state, action) => {
        state.loading = false;
        state.messages.push(action.payload);
        state.error = null;
      })
      .addCase(createMessage.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string || 'Failed to create message';
      });
  },
});

export const { clearMessages } = messageSlice.actions;
export default messageSlice.reducer;