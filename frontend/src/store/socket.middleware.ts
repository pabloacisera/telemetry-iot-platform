import { Middleware } from '@reduxjs/toolkit';
import { io, Socket } from 'socket.io-client';
import { telemetryReceived, statusChanged, fetchMotors } from './motors.slice';
import { alertReceived } from './alerts.slice';

/**
 * Socket middleware — the ONLY translator of WebSocket events into Redux actions.
 *
 * Lifecycle:
 * 1. On login success (auth/login/fulfilled) → opens connection.
 * 2. On each WS event → dispatches to the appropriate slice.
 * 3. On disconnect → auto-reconnect + refetch REST snapshot.
 * 4. On logout → closes connection.
 *
 * Components NEVER interact with the socket directly.
 */
let socket: Socket | null = null;

export const socketMiddleware: Middleware = (storeAPI) => (next) => (action: any) => {
  const result = next(action);

  // On successful login → open WebSocket
  if (action.type === 'auth/login/fulfilled') {
    connectSocket(storeAPI);
  }

  // On logout → close WebSocket
  if (action.type === 'auth/logout') {
    disconnectSocket();
  }

  return result;
};

/** Open WebSocket and subscribe to events. */
function connectSocket(storeAPI: any): void {
  if (socket?.connected) return;

  const state = storeAPI.getState();
  const token = state.auth.accessToken;

  socket = io(import.meta.env.VITE_WS_URL || 'http://localhost:3000', {
    auth: { token },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  socket.on('connect', () => {
    console.log('[WS] Connected');
  });

  socket.on('disconnect', () => {
    console.log('[WS] Disconnected, will auto-reconnect');
  });

  // On reconnect → refetch snapshot to cover the gap
  socket.on('reconnect', () => {
    console.log('[WS] Reconnected, refetching snapshot');
    storeAPI.dispatch(fetchMotors());
  });

  // Telemetry event → push to sensor ring buffer
  socket.on('telemetry', (data: any) => {
    storeAPI.dispatch(telemetryReceived({
      motorId: data.motorId,
      sensorType: data.sensorType,
      value: data.value,
      recordedAt: data.recordedAt,
    }));
  });

  // Status change → update motor/sensor status
  socket.on('status-change', (data: any) => {
    storeAPI.dispatch(statusChanged(data));
  });

  // Alert → add to active alerts
  socket.on('alert', (data: any) => {
    storeAPI.dispatch(alertReceived(data));
  });
}

/** Close the WebSocket connection. */
function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
