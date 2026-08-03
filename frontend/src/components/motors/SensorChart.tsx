import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { StatusBadge } from './StatusBadge';

interface SensorChartProps {
  sensor: {
    sensorType: string;
    status: string;
    healthyMax: number;
    warningMax: number;
    criticalMax: number;
    recentValues: { value: number; timestamp: string }[];
  };
  sensorType: string;
}

/** Label mapping for display. */
const LABELS: Record<string, string> = {
  temperature: 'Temperatura (°C)',
  vibration: 'Vibración (mm/s)',
  current: 'Corriente (A)',
};

/**
 * Real-time sensor chart (Recharts LineChart).
 * Shows the ring buffer of ~50 recent values with threshold reference lines.
 * Each chart has its OWN status badge independent of the motor's status.
 */
export function SensorChart({ sensor, sensorType }: SensorChartProps) {
  const data = sensor.recentValues.map((v) => ({
    time: new Date(v.timestamp).toLocaleTimeString(),
    value: v.value,
  }));

  return (
    <div className="sensor-chart">
      <div className="chart-header">
        <h3>{LABELS[sensorType] || sensorType}</h3>
        <StatusBadge status={sensor.status} />
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data}>
          <XAxis dataKey="time" tick={{ fontSize: 10 }} />
          <YAxis domain={['auto', 'auto']} />
          <Tooltip />
          <ReferenceLine y={sensor.warningMax} stroke="#f59e0b" strokeDasharray="5 5" label="Advertencia" />
          <ReferenceLine y={sensor.criticalMax} stroke="#ef4444" strokeDasharray="3 3" label="Crítico" />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#3b82f6"
            dot={false}
            strokeWidth={2}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
