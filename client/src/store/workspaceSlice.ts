import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

interface Workspace {
  id: number;
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
      // Get the token from localStorage
      const token = localStorage.getItem('accessToken');

      const response = await fetch('/api/v1/workspaces', {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${token}`,
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Handle unauthorized access
          window.location.href = '/login';
          return rejectWithValue('Please log in to access workspaces');
        }
        const error = await response.text();
        return rejectWithValue(error);
      }

      const data = await response.json();
      // Filter out archived workspaces by default
      return data.filter((workspace: Workspace) => !workspace.archived);
    } catch (error) {
      return rejectWithValue('Failed to fetch workspaces');
    }
  }
);

export const createWorkspace = createAsyncThunk(
  'workspace/createWorkspace',
  async (workspace: { name: string }, { rejectWithValue }) => {
    try {
      // Get the token from localStorage
      const token = localStorage.getItem('accessToken');

      const response = await fetch('/api/v1/workspaces', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        credentials: 'include',
        body: JSON.stringify(workspace),
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Handle unauthorized access
          window.location.href = '/login';
          return rejectWithValue('Please log in to create workspaces');
        }
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
        state.currentWorkspace = action.payload;
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