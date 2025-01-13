import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

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
  'workspace/fetchWorkspaces',
  async (_, { rejectWithValue }) => {
    try {
      const token = localStorage.getItem('accessToken');
      console.log('Making fetch request to /api/v1/workspaces');
      const response = await fetch('/api/v1/workspaces', {
        headers: {
          'Authorization': `Bearer ${token}`,
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Fetch workspaces failed:', errorText);
        return rejectWithValue(errorText || 'Failed to fetch workspaces');
      }

      const data = await response.json();
      console.log('Fetch workspaces response:', data);
      return data;
    } catch (error) {
      console.error('Error in fetchWorkspaces:', error);
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to fetch workspaces');
    }
  }
);

export const createWorkspace = createAsyncThunk(
  'workspace/createWorkspace',
  async (workspace: { name: string }, { rejectWithValue }) => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/v1/workspaces', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(workspace),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Create workspace failed:', errorText);
        return rejectWithValue(errorText || 'Failed to create workspace');
      }

      const data = await response.json();
      console.log('Create workspace response:', data);
      return data;
    } catch (error) {
      console.error('Error in createWorkspace:', error);
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to create workspace');
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
        if (action.payload) {
          state.workspaces.push(action.payload);
          state.currentWorkspace = action.payload;
        }
        state.error = null;
      })
      .addCase(createWorkspace.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string || 'Failed to create workspace';
      });
  },
});

export const { setCurrentWorkspace, clearWorkspaces } = workspaceSlice.actions;
export default workspaceSlice.reducer;