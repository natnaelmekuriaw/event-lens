'use client';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AnalyticsBucket } from '@eventlens/contracts';

export function AnalyticsTrends({ series }: { series: AnalyticsBucket[] }) {
  return (
    <div>
      <div
        role="img"
        aria-label="Event and active-user trends. Exact values are in the table below."
        className="h-72 w-full"
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={series}
            margin={{ top: 8, right: 12, bottom: 8, left: -18 }}
          >
            <CartesianGrid stroke="#e7e5e4" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={28} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="events"
              name="Events"
              stroke="#047857"
              strokeWidth={2}
              dot={series.length <= 14}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="activeUsers"
              name="Active users"
              stroke="#b45309"
              strokeWidth={2}
              dot={series.length <= 14}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer font-medium">
          View exact values
        </summary>
        <div className="mt-3 max-h-72 overflow-auto">
          <table className="w-full text-left">
            <caption className="sr-only">
              Events and active users by period
            </caption>
            <thead>
              <tr className="border-b">
                <th scope="col" className="py-2">
                  Period starts
                </th>
                <th scope="col">Events</th>
                <th scope="col">Active users</th>
              </tr>
            </thead>
            <tbody>
              {series.map((point) => (
                <tr key={point.date} className="border-b border-stone-100">
                  <th scope="row" className="py-2 font-normal">
                    {point.date}
                  </th>
                  <td>{point.events.toLocaleString()}</td>
                  <td>{point.activeUsers.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
