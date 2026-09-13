import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import { fmtCurrency, fmtDate } from "../lib/format";

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-lg bg-ink px-2.5 py-1.5 font-mono text-xs text-paper shadow-lg">
      <p className="opacity-55">{fmtDate(point.date)}</p>
      <p className="tnum mt-0.5 font-medium">{fmtCurrency(point.close)}</p>
    </div>
  );
}

/* Chart language: rising periods draw solid cobalt, falling draw dashed ink. */
export default function PriceChart({ ticker, points }) {
  const rising = points.length > 1 && points[points.length - 1].close >= points[0].close;
  const stroke = rising ? "var(--color-cobalt)" : "var(--color-ink)";
  const gradientId = `grad-${ticker}`;

  return (
    <div>
      <ResponsiveContainer width="100%" height={140}>
        <AreaChart data={points} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={rising ? 0.18 : 0.05} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis domain={["dataMin", "dataMax"]} hide />
          <Tooltip
            content={<ChartTooltip />}
            cursor={{ stroke: "var(--color-cobalt)", strokeOpacity: 0.4, strokeDasharray: "3 3" }}
          />
          <Area
            type="monotone"
            dataKey="close"
            stroke={stroke}
            strokeWidth={1.6}
            strokeOpacity={rising ? 1 : 0.55}
            strokeDasharray={rising ? "0" : "5 4"}
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0, fill: stroke }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
      <div className="mt-1 flex justify-between">
        <span className="microlabel">{fmtDate(points[0].date)}</span>
        <span className="microlabel">{fmtDate(points[points.length - 1].date)}</span>
      </div>
    </div>
  );
}
