import axios from 'axios';
import { store } from '../store';
import { refreshToken, logout } from '../store/auth.slice';

/**
 * Axios instance configured for the backend API.
 *
 * Features:
 * - Automatically attaches the access token from Redux to every request.
 * - On 401, attempts a silent token refresh and retries the original request.
 * - On refresh failure, logs out the user.
 * - Sends credentials (cookies) for the refresh token httpOnly cookie.
 */
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  withCredentials: true, // Send httpOnly cookies
});

// Attach access token to every request
api.interceptors.request.use((config) => {
  const state = store.getState();
  const token = state.auth.accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401 → try refresh → retry original request
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        await store.dispatch(refreshToken()).unwrap();
        // Retry with new token
        const state = store.getState();
        originalRequest.headers.Authorization = `Bearer ${state.auth.accessToken}`;
        return api(originalRequest);
      } catch {
        store.dispatch(logout());
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  },
);
