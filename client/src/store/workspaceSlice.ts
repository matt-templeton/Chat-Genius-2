import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

interface Workspace {
  id: number;
  name: string;
  archived: boolean;
  // Add other fields as needed based on API response
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
  'workspace/fetchWorkspaces',
  async (_, { rejectWithValue }) => {
    try {
      const response = await fetch('/api/workspaces', {
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.text();
        return rejectWithValue(error);
      }

      return response.json();
    } catch (error) {
      return rejectWithValue('Failed to fetch workspaces');
    }
  }
);

export const createWorkspace = createAsyncThunk(
  'workspace/createWorkspace',
  async (workspace: { name: string }, { rejectWithValue }) => {
    try {
      const response = await fetch('/api/workspaces', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(workspace),
      });

      if (!response.ok) {
        const error = await response.text();
        return rejectWithValue(error);
      }

      return response.json();
    } catch (error) {
      return rejectWithValue('Failed to create workspace');
    }
  }
);

const workspaceSlice = createSlice({
  name: 'workspace',
  initialState,
  reducers: {
    setCurrentWorkspace: (state, action) => {
      state.currentWorkspace = action.payload;
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
        state.workspaces = action.payload;
        state.error = null;
      })
      .addCase(fetchWorkspaces.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string || 'Failed to fetch workspaces';
      })
      .addCase(createWorkspace.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createWorkspace.fulfilled, (state, action) => {
        state.loading = false;
        state.workspaces.push(action.payload);
        state.error = null;
      })
      .addCase(createWorkspace.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string || 'Failed to create workspace';
      });
  },
});

export const { setCurrentWorkspace } = workspaceSlice.actions;
export default workspaceSlice.reducer;