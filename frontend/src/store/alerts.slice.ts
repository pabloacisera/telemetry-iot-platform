import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import { api } from '../services/api';

export interface Alert {
  id: number;
  motorId: number;
  type: string;
  metadata: Record<string, unknown> | null;
  triggeredAt: string;
  resolvedAt: string | null;
}

interface AlertsState {
  active: Alert[];
  /** IDs of alerts already shown/dismissed this session — never re-toast them. */
  dismissedIds: number[];
}

/** Toasts are transient: only seed alerts triggered recently (avoids a burst on reload). */
const SEED_RECENT_WINDOW_MS = 10 * 60 * 1000;
/** Max toasts rendered at once. */
const MAX_ACTIVE_TOASTS = 5;

const initialState: AlertsState = {
  active: [],
  dismissedIds: [],
};

/** Fetch currently active (unresolved) alerts from REST — seeds the banner. */
export const fetchActiveAlerts = createAsyncThunk('alerts/fetchActive', async () => {
  const response = await api.get<Alert[]>('/alerts');
  return response.data;
});

/**
 * Alerts slice — maintains the list of active (unresolved) alerts.
 * Fed by WebSocket 'alert' events (global broadcast).
 * Used by AlertBanner to show real-time notifications.
 *
 * `active` is transient (toasts): every entry has an auto-dismiss timer.
 * Dismissed/resolved IDs are remembered in `dismissedIds` so re-fetches or
 * socket reconnects never re-show the same alert twice.
 */
export const alertsSlice = createSlice({
  name: 'alerts',
  initialState,
  reducers: {
    /** A new alert arrived via WebSocket. */
    alertReceived(state, action: PayloadAction<Alert>) {
      if (state.dismissedIds.includes(action.payload.id)) return;
      if (state.active.some((a) => a.id === action.payload.id)) return;
      state.active = [action.payload, ...state.active].slice(0, MAX_ACTIVE_TOASTS);
    },

    /** An alert was resolved (remove from active list). */
    alertResolved(state, action: PayloadAction<number>) {
      state.active = state.active.filter((a) => a.id !== action.payload);
      if (!state.dismissedIds.includes(action.payload)) {
        state.dismissedIds.push(action.payload);
      }
    },

    /** Dismiss an alert from the UI (hide, not resolve in backend). */
    alertDismissed(state, action: PayloadAction<number>) {
      state.active = state.active.filter((a) => a.id !== action.payload);
      if (!state.dismissedIds.includes(action.payload)) {
        state.dismissedIds.push(action.payload);
      }
    },

    /** Set initial alerts list (from REST on load). */
    setAlerts(state, action: PayloadAction<Alert[]>) {
      const cutoff = Date.now() - SEED_RECENT_WINDOW_MS;
      const recent = action.payload
        .filter((a) => !state.dismissedIds.includes(a.id))
        .filter((a) => new Date(a.triggeredAt).getTime() >= cutoff);
      state.active = recent.slice(0, MAX_ACTIVE_TOASTS);
    },
  },
  extraReducers: (builder) => {
    builder.addCase(fetchActiveAlerts.fulfilled, (state, action) => {
      const known = new Set(state.active.map((a) => a.id));
      state.dismissedIds.forEach((id) => known.add(id));
      const cutoff = Date.now() - SEED_RECENT_WINDOW_MS;
      const fresh = action.payload
        .filter((a) => !known.has(a.id))
        .filter((a) => new Date(a.triggeredAt).getTime() >= cutoff);
      state.active = [...fresh, ...state.active]
        .sort((a, b) => new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime())
        .slice(0, MAX_ACTIVE_TOASTS);
    });
  },
});

export const { alertReceived, alertResolved, alertDismissed, setAlerts } = alertsSlice.actions;
