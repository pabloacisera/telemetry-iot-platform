import type { Middleware, UnknownAction } from '@reduxjs/toolkit';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import {
  telemetryReceived,
  statusChanged,
  fetchMotors,
  restartProgressUpdate,
} from './motors.slice';
import { alertReceived, alertResolved, fetchActiveAlerts } from './alerts.slice';

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
  metadata: Record<string, unknown> | null;
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
 * 1. On login/refresh success → opens connection.
 * 2. On each WS event → dispatches to the appropriate slice.
 * 3. On disconnect → auto-reconnect + refetch REST snapshot.
 * 4. On logout → closes connection.
 *
 * Room management:
 * - 'join-motor' / 'leave-motor' actions from components trigger room subscriptions.
 *
 * Components NEVER interact with the socket directly.
 */
export const socketMiddleware: Middleware = (storeAPI) => {
  let socket: Socket | null = null;
  // Seed the alert banner only once per session: every `connect` fires on each
  // auto-reconnect, and re-seeding would re-toast the same unresolved alerts.
  let alertsSeeded = false;

  // Dispara thunks (createAsyncThunk) cuyo tipo no encaja en Dispatch<UnknownAction>.
  const dispatchThunk = storeAPI.dispatch as unknown as (action: unknown) => unknown;

  function connectSocket(): void {
    if (socket?.connected) return;

    const state = storeAPI.getState();
    const token = state.auth.accessToken;

    // NOTE: io() must NOT receive '/socket.io' as the URI — in socket.io v4 a
    // path in the URI is treated as the NAMESPACE (=> "Invalid namespace").
    // Pass the origin (or undefined) and set the server path explicitly.
    socket = io(import.meta.env.VITE_WS_URL, {
      path: '/socket.io',
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socket.on('connect', () => {
      console.log('[WS] Connected');
      if (!alertsSeeded) {
        alertsSeeded = true;
        // Seed the alert banner with currently active alerts only once.
        dispatchThunk(fetchActiveAlerts());
      }
    });

    socket.on('disconnect', () => {
      console.log('[WS] Disconnected, will auto-reconnect');
    });

    socket.on('reconnect', () => {
      console.log('[WS] Reconnected, refetching snapshot');
      dispatchThunk(fetchMotors());
    });

    socket.on('telemetry', (data: TelemetryEvent) => {
      // Don't add telemetry to chart if motor is restarting
      const state = storeAPI.getState();
      const motor = state.motors.byId[data.motorId];
      if (motor && (motor.status === 'restarting' || motor.status === 'shutting_down')) {
        return;
      }

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

    socket.on('alert-resolved', (data: { id: number; motorId: number }) => {
      storeAPI.dispatch(alertResolved(data.id));
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

  return (next) => (action: unknown) => {
    const result = next(action);
    const type = (action as UnknownAction & { type?: string }).type;

    // Connect on login or successful refresh
    if (type === 'auth/login/fulfilled' || type === 'auth/refresh/fulfilled') {
      connectSocket();
    }

    // Disconnect on logout
    if (type === 'auth/logout') {
      disconnectSocket();
    }

    // Room management for motor detail page
    if (type === 'socket/joinMotor' && socket) {
      const motorId = (action as { payload: number }).payload;
      socket.emit('join-motor', motorId);
    }

    if (type === 'socket/leaveMotor' && socket) {
      const motorId = (action as { payload: number }).payload;
      socket.emit('leave-motor', motorId);
    }

    return result;
  };
};

/** Action creators for room management (used by MotorDetailPage). */
export const joinMotorRoom = (motorId: number) => ({
  type: 'socket/joinMotor',
  payload: motorId,
});

export const leaveMotorRoom = (motorId: number) => ({
  type: 'socket/leaveMotor',
  payload: motorId,
});
