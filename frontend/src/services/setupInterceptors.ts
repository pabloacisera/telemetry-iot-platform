import type { Store } from '@reduxjs/toolkit';
import { api } from './api';
import { refreshToken, logout } from '../store/auth.slice';

/**
 * Attaches request/response interceptors to the api instance.
 *
 * Must be called once from main.tsx after the Redux store is created,
 * breaking the circular import between store and api.
 */
export function setupInterceptors(store: Store): void {
  api.interceptors.request.use((config) => {
    const state = store.getState();
    const token = state.auth.accessToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  api.interceptors.response.use(
    (response) => response,
    async (error) => {
      const originalRequest = error.config;

      // Don't intercept auth endpoints — they handle their own errors
      const isAuthUrl = originalRequest?.url?.includes('/auth/');
      if (isAuthUrl) {
        return Promise.reject(error);
      }

      if (error.response?.status === 401 && !originalRequest._retry) {
        originalRequest._retry = true;

        try {
          await (store.dispatch as (action: any) => any)(refreshToken()).unwrap();
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
}
