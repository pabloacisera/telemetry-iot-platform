import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import { api } from '../services/api';

/** Sensor data within a motor. */
export interface SensorData {
  id: number;
  sensorType: string;
  status: string;
  healthyMax: number;
  warningMax: number;
  criticalMax: number;
  lastValue: number | null;
  lastReadingAt: string | null;
  /** Ring buffer of recent values (~50 points) for the chart. */
  recentValues: { value: number; timestamp: string }[];
}

/** Raw motor object returned by the REST API. */
interface MotorApiResponse {
  id: number;
  code: string;
  name: string;
  location: string | null;
  connectionType: string;
  status: string;
  statusChangedAt: string | null;
  sensors: Array<{
    id: number;
    sensorType: string;
    status: string;
    healthyMax: number;
    warningMax: number;
    criticalMax: number;
    lastValue: number | null;
    lastReadingAt: string | null;
  }>;
}

/** Single motor state. */
export interface MotorData {
  id: number;
  code: string;
  name: string;
  location: string | null;
  connectionType: string;
  status: string;
  statusChangedAt: string | null;
  sensors: Record<string, SensorData>;
  /** Seconds remaining during a restart countdown (null when not restarting). */
  restartSecondsRemaining: number | null;
}

interface MotorsState {
  byId: Record<number, MotorData>;
  loading: boolean;
  error: string | null;
}

const initialState: MotorsState = {
  byId: {},
  loading: false,
  error: null,
};

/** Fetch initial snapshot from GET /motors (Redis-backed). */
export const fetchMotors = createAsyncThunk('motors/fetchAll', async () => {
  const response = await api.get<MotorApiResponse[]>('/motors');
  return response.data;
});

/** Fetch a single motor with recent readings for chart pre-population. */
export const fetchMotorDetail = createAsyncThunk(
  'motors/fetchDetail',
  async (motorId: number) => {
    const response = await api.get<MotorApiResponse & {
      sensors: Array<MotorApiResponse['sensors'][number] & {
        recentValues?: { value: number; timestamp: string }[];
      }>;
    }>(`/motors/${motorId}`);
    return response.data;
  },
);

/**
 * Motors slice — dictionary of motor_id → motor data.
 * Updated via REST (initial load) and WebSocket (real-time).
 * Each sensor maintains a ring buffer of ~50 recent values for charts.
 */
export const motorsSlice = createSlice({
  name: 'motors',
  initialState,
  reducers: {
    /** Push a new telemetry reading into the sensor's ring buffer. */
    telemetryReceived(state, action: PayloadAction<{
      motorId: number;
      sensorType: string;
      value: number;
      recordedAt: string;
    }>) {
      const { motorId, sensorType, value, recordedAt } = action.payload;
      const motor = state.byId[motorId];
      if (!motor) return;

      const sensor = motor.sensors[sensorType];
      if (!sensor) return;

      sensor.lastValue = value;
      sensor.lastReadingAt = recordedAt;
      sensor.recentValues.push({ value, timestamp: recordedAt });

      if (sensor.recentValues.length > 50) {
        sensor.recentValues.shift();
      }
    },

    /** Update motor or sensor status from a status-change event. */
    statusChanged(state, action: PayloadAction<{
      motorId: number;
      motorSensorId?: number;
      fromStatus?: string;
      toStatus?: string;
      sensorStatus?: string;
    }>) {
      const { motorId, toStatus, sensorStatus, motorSensorId } = action.payload;
      const motor = state.byId[motorId];
      if (!motor) return;

      if (toStatus) {
        motor.status = toStatus;
        // Clear countdown when motor leaves restarting state
        if (toStatus !== 'restarting') {
          motor.restartSecondsRemaining = null;
        }
      }

      if (sensorStatus && motorSensorId) {
        const sensor = Object.values(motor.sensors).find(s => s.id === motorSensorId);
        if (sensor) sensor.status = sensorStatus;
      }
    },

    /** Update restart countdown for a motor. */
    restartProgressUpdate(state, action: PayloadAction<{
      motorId: number;
      secondsRemaining: number;
    }>) {
      const motor = state.byId[action.payload.motorId];
      if (!motor) return;
      const seconds = action.payload.secondsRemaining;
      motor.restartSecondsRemaining = seconds > 0 ? seconds : null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMotors.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchMotors.fulfilled, (state, action) => {
        state.loading = false;
        for (const motor of action.payload) {
          const sensors: Record<string, SensorData> = {};
          for (const s of motor.sensors) {
            sensors[s.sensorType] = { ...s, recentValues: [] };
          }
          state.byId[motor.id] = {
            ...motor,
            sensors,
            restartSecondsRemaining: null,
          };
        }
      })
      .addCase(fetchMotors.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch motors';
      })
      .addCase(fetchMotorDetail.fulfilled, (state, action) => {
        const motor = action.payload;
        const sensors: Record<string, SensorData> = {};
        for (const s of motor.sensors) {
          sensors[s.sensorType] = {
            ...s,
            recentValues: s.recentValues || [],
          };
        }
        const existing = state.byId[motor.id];
        state.byId[motor.id] = {
          ...motor,
          sensors,
          restartSecondsRemaining: existing?.restartSecondsRemaining ?? null,
        };
      });
  },
});

export const { telemetryReceived, statusChanged, restartProgressUpdate } = motorsSlice.actions;
