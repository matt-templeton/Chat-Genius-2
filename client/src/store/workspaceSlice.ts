import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { fetchChannels, setCurrentChannel } from "@/store/channelSlice";

export interface Workspace {
  workspaceId: number;
  name: string;
  archived: boolean;
}

interface WorkspaceState {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  loading: boolean;
  error: string | null;
}

const initialState: WorkspaceState = {
  workspaces: [],
  currentWorkspace: null,
  loading: false,
  error: null,
};

export const fetchWorkspaces = createAsyncThunk(
  "workspace/fetchWorkspaces",
  async (_, { rejectWithValue }) => {
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        return rejectWithValue("No authentication token found");
      }

      const response = await fetch("/api/v1/workspaces", {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.text();
        return rejectWithValue(errorData || "Failed to fetch workspaces");
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Error in fetchWorkspaces:", error);
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to fetch workspaces",
      );
    }
  },
);

export const createWorkspace = createAsyncThunk(
  "workspace/createWorkspace",
  async (workspace: { name: string }, { dispatch, rejectWithValue }) => {
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        return rejectWithValue("No authentication token found");
      }

      const response = await fetch("/api/v1/workspaces", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        credentials: "include",
        body: JSON.stringify(workspace),
      });

      if (!response.ok) {
        const errorData = await response.text();
        return rejectWithValue(errorData || "Failed to create workspace");
      }

      const data = await response.json();
      
      // After creating the workspace, fetch its channels
      const channels = await dispatch(fetchChannels({ 
        workspaceId: data.workspaceId,
        showArchived: false 
      })).unwrap();

      // Find the general channel
      const generalChannel = channels.find(
        channel => channel.name.toLowerCase() === 'general'
      );

      if (generalChannel) {
        dispatch(setCurrentChannel(generalChannel));
      }

      return data;
    } catch (error) {
      console.error("Error in createWorkspace:", error);
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to create workspace",
      );
    }
  },
);

const workspaceSlice = createSlice({
  name: "workspace",
  initialState,
  reducers: {
    setCurrentWorkspace: (state, action) => {
      state.currentWorkspace = action.payload;
    },
    clearWorkspaces: (state) => {
      state.workspaces = [];
      state.currentWorkspace = null;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchWorkspaces.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchWorkspaces.fulfilled, (state, action) => {
        state.loading = false;
        state.workspaces = Array.isArray(action.payload) ? action.payload : [];
        // Set first workspace as current if none is selected
        if (!state.currentWorkspace && state.workspaces.length > 0) {
          state.currentWorkspace = state.workspaces[0];
        }
        state.error = null;
      })
      .addCase(fetchWorkspaces.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(createWorkspace.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createWorkspace.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload) {
          state.workspaces.push(action.payload);
          state.currentWorkspace = action.payload;
        }
        state.error = null;
      })
      .addCase(createWorkspace.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

export const { setCurrentWorkspace, clearWorkspaces } = workspaceSlice.actions;
export default workspaceSlice.reducer;