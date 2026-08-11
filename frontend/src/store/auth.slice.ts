import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import { api } from '../services/api';

interface AuthState {
  user: { userId: number; email: string; role: string } | null;
  accessToken: string | null;
  loading: boolean;
  refreshAttempted: boolean;
  error: string | null;
}

const initialState: AuthState = {
  user: null,
  accessToken: null,
  loading: false,
  refreshAttempted: false,
  error: null,
};

/** Decoded JWT payload shape. */
interface JwtPayload {
  sub: number;
  email: string;
  role: string;
}

/**
 * Safely decode a JWT payload.
 * Returns null if the token is malformed or cannot be decoded.
 */
function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const base64 = token.split('.')[1];
    const decoded = atob(base64);
    return JSON.parse(decoded) as JwtPayload;
  } catch {
    return null;
  }
}

/** Login thunk — calls POST /auth/login, stores access token in memory. */
export const login = createAsyncThunk(
  'auth/login',
  async (credentials: { email: string; password: string }, { rejectWithValue }) => {
    try {
      const response = await api.post('/auth/login', credentials);
      return response.data as { accessToken: string };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Login failed';
      return rejectWithValue(message);
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Refresh failed';
      return rejectWithValue(message);
    }
  },
);

/**
 * Logout thunk — revokes the refresh token server-side, then clears local state.
 * Local state is cleared even if the request fails (best-effort).
 */
export const logoutUser = createAsyncThunk(
  'auth/logoutUser',
  async (_, { dispatch }) => {
    try {
      await api.post('/auth/logout');
    } finally {
      dispatch(logout());
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
    setUser(state, action: PayloadAction<{ userId: number; email: string; role: string }>) {
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
        const payload = decodeJwtPayload(action.payload.accessToken);
        if (payload) {
          state.user = { userId: payload.sub, email: payload.email, role: payload.role };
        }
      })
      .addCase(login.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(refreshToken.fulfilled, (state, action) => {
        state.refreshAttempted = true;
        state.accessToken = action.payload.accessToken;
        const payload = decodeJwtPayload(action.payload.accessToken);
        if (payload) {
          state.user = { userId: payload.sub, email: payload.email, role: payload.role };
        }
      })
      .addCase(refreshToken.rejected, (state) => {
        state.refreshAttempted = true;
        state.user = null;
        state.accessToken = null;
      });
  },
});

export const { logout, setUser } = authSlice.actions;
