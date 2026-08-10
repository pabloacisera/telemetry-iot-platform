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
}

const initialState: AlertsState = {
  active: [],
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
 */
export const alertsSlice = createSlice({
  name: 'alerts',
  initialState,
  reducers: {
    /** A new alert arrived via WebSocket. */
    alertReceived(state, action: PayloadAction<Alert>) {
      state.active.unshift(action.payload);
    },

    /** An alert was resolved (remove from active list). */
    alertResolved(state, action: PayloadAction<number>) {
      state.active = state.active.filter((a) => a.id !== action.payload);
    },

    /** Dismiss an alert from the UI (hide, not resolve in backend). */
    alertDismissed(state, action: PayloadAction<number>) {
      state.active = state.active.filter((a) => a.id !== action.payload);
    },

    /** Set initial alerts list (from REST on load). */
    setAlerts(state, action: PayloadAction<Alert[]>) {
      state.active = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(fetchActiveAlerts.fulfilled, (state, action) => {
      state.active = action.payload;
    });
  },
});

export const { alertReceived, alertResolved, alertDismissed, setAlerts } = alertsSlice.actions;
