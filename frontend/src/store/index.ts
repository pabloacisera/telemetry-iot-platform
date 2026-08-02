import { configureStore } from '@reduxjs/toolkit';
import { authSlice } from './auth.slice';
import { motorsSlice } from './motors.slice';
import { alertsSlice } from './alerts.slice';
import { ragSlice } from './rag.slice';
import { socketMiddleware } from './socket.middleware';

/**
 * Redux store configuration.
 * All server state lives here — no component uses useState for server data.
 * The socketMiddleware handles WebSocket lifecycle and event → action translation.
 */
export const store = configureStore({
  reducer: {
    auth: authSlice.reducer,
    motors: motorsSlice.reducer,
    alerts: alertsSlice.reducer,
    rag: ragSlice.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(socketMiddleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
