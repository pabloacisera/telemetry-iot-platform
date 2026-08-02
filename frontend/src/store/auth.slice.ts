import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '../services/api';

interface AuthState {
  user: { userId: number; email: string; role: string } | null;
  accessToken: string | null;
  loading: boolean;
  error: string | null;
}

const initialState: AuthState = {
  user: null,
  accessToken: null,
  loading: false,
  error: null,
};

/** Login thunk — calls POST /auth/login, stores access token in memory. */
export const login = createAsyncThunk(
  'auth/login',
  async (credentials: { email: string; password: string }, { rejectWithValue }) => {
    try {
      const response = await api.post('/auth/login', credentials);
      return response.data as { accessToken: string };
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.message || 'Login failed');
    }
  },
);

/** Refresh thunk — calls POST /auth/refresh (cookie sent automatically). */
export const refreshToken = createAsyncThunk(
  'auth/refresh',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.post('/auth/refresh');
      return response.data as { accessToken: string };
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.message || 'Refresh failed');
    }
  },
);

/**
 * Auth slice — manages user session state.
 * Access token lives in Redux memory (never localStorage).
 * Refresh token is an httpOnly cookie (browser handles it).
 */
export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout(state) {
      state.user = null;
      state.accessToken = null;
    },
    setUser(state, action) {
      state.user = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.loading = false;
        state.accessToken = action.payload.accessToken;
        // Decode JWT payload to get user info
        const payload = JSON.parse(atob(action.payload.accessToken.split('.')[1]));
        state.user = { userId: payload.sub, email: payload.email, role: payload.role };
      })
      .addCase(login.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(refreshToken.fulfilled, (state, action) => {
        state.accessToken = action.payload.accessToken;
        const payload = JSON.parse(atob(action.payload.accessToken.split('.')[1]));
        state.user = { userId: payload.sub, email: payload.email, role: payload.role };
      })
      .addCase(refreshToken.rejected, (state) => {
        state.user = null;
        state.accessToken = null;
      });
  },
});

export const { logout, setUser } = authSlice.actions;
