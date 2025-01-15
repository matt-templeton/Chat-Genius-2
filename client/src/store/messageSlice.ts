import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { Message } from "@/types/message";

interface CreateMessagePayload {
  channelId: number;
  content: string;
  parentMessageId?: number;
}

export const createMessage = createAsyncThunk(
  "messages/create",
  async (payload: CreateMessagePayload) => {
    const token = localStorage.getItem("accessToken");
    const response = await fetch(`/api/v1/channels/${payload.channelId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        content: payload.content,
        parentMessageId: payload.parentMessageId
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to create message");
    }

    return response.json();
  },
);

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

const messageSlice = createSlice({
  name: "messages",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(createMessage.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createMessage.fulfilled, (state, action) => {
        state.loading = false;
        state.messages.push(action.payload);
      })
      .addCase(createMessage.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || "Failed to create message";
      });
  },
});

export default messageSlice.reducer;