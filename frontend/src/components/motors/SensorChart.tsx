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

/** Format time to HH:MM:SS */
function formatTime(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/**
 * Real-time sensor chart (Recharts LineChart).
 * Shows the ring buffer of ~50 recent values with threshold reference lines.
 * Each chart has its OWN status badge independent of the motor's status.
 */
export function SensorChart({ sensor, sensorType }: SensorChartProps) {
  const data = sensor.recentValues.map((v) => ({
    time: formatTime(v.timestamp),
    value: v.value,
  }));

  // Show max 6 ticks on X axis to avoid crowding
  const tickInterval = data.length > 6 ? Math.floor(data.length / 6) : 0;

  return (
    <div className="sensor-chart">
      <div className="chart-header">
        <h3>{LABELS[sensorType] || sensorType}</h3>
        <StatusBadge status={sensor.status} />
      </div>
      {data.length < 3 ? (
        <p className="chart-empty">Esperando datos...</p>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="time"
              tick={{ fontSize: 10 }}
              interval={tickInterval}
              angle={-30}
              textAnchor="end"
              height={40}
            />
            <YAxis domain={['auto', 'auto']} width={45} />
            <Tooltip />
            <ReferenceLine
              y={sensor.warningMax}
              stroke="#f59e0b"
              strokeDasharray="5 5"
              label={{ value: 'Adv.', position: 'right', fontSize: 10, fill: '#f59e0b' }}
            />
            <ReferenceLine
              y={sensor.criticalMax}
              stroke="#ef4444"
              strokeDasharray="3 3"
              label={{ value: 'Crít.', position: 'right', fontSize: 10, fill: '#ef4444' }}
            />
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
      )}
    </div>
  );
}
