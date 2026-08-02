import axios from 'axios';

/**
 * Axios instance configured for the backend API.
 *
 * - Sends credentials (cookies) for the refresh token httpOnly cookie.
 * - Interceptors are attached separately via setupInterceptors() to break
 *   the circular dependency between store and api.
 */
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  withCredentials: true,
});
