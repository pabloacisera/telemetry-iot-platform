import type { Middleware, UnknownAction } from '@reduxjs/toolkit';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import {
  telemetryReceived,
  statusChanged,
  fetchMotors,
  restartProgressUpdate,
} from './motors.slice';
import { alertReceived } from './alerts.slice';

/** WebSocket telemetry event payload. */
interface TelemetryEvent {
  motorId: number;
  sensorType: string;
  value: number;
  recordedAt: string;
}

/** WebSocket status-change event payload. */
interface StatusChangeEvent {
  motorId: number;
  motorSensorId?: number;
  fromStatus?: string;
  toStatus?: string;
  sensorStatus?: string;
}

/** WebSocket alert event payload. */
interface AlertEvent {
  id: number;
  motorId: number;
  type: string;
  triggeredAt: string;
  resolvedAt: string | null;
}

/** WebSocket restart-progress event payload. */
interface RestartProgressEvent {
  motorId: number;
  secondsRemaining: number;
}

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
export const socketMiddleware: Middleware = (storeAPI) => {
  let socket: Socket | null = null;

  function connectSocket(): void {
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

    socket.on('reconnect', () => {
      console.log('[WS] Reconnected, refetching snapshot');
      storeAPI.dispatch(fetchMotors());
    });

    socket.on('telemetry', (data: TelemetryEvent) => {
      storeAPI.dispatch(telemetryReceived({
        motorId: data.motorId,
        sensorType: data.sensorType,
        value: data.value,
        recordedAt: data.recordedAt,
      }));
    });

    socket.on('status-change', (data: StatusChangeEvent) => {
      storeAPI.dispatch(statusChanged(data));
    });

    socket.on('alert', (data: AlertEvent) => {
      storeAPI.dispatch(alertReceived(data));
    });

    socket.on('restart-progress', (data: RestartProgressEvent) => {
      storeAPI.dispatch(restartProgressUpdate({
        motorId: data.motorId,
        secondsRemaining: data.secondsRemaining,
      }));
    });
  }

  function disconnectSocket(): void {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
  }

  return (next) => (action: UnknownAction) => {
    const result = next(action);

    if ((action as UnknownAction & { type?: string }).type === 'auth/login/fulfilled') {
      connectSocket();
    }

    if ((action as UnknownAction & { type?: string }).type === 'auth/logout') {
      disconnectSocket();
    }

    return result;
  };
};
