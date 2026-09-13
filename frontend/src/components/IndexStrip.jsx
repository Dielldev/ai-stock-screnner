import { useEffect, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import { api } from "../lib/api";
import { dirGlyph, fmtPercent } from "../lib/format";

const level = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function IndexTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-lg bg-ink px-2.5 py-1.5 font-mono text-xs text-paper shadow-lg">
      <p className="opacity-55">{fmtTime(point.time)}</p>
      <p className="tnum mt-0.5 font-medium">{level.format(point.close)}</p>
    </div>
  );
}

function IndexTile({ index, delay }) {
  const up = (index.change_percent ?? 0) >= 0;
  const stroke = up ? "var(--color-cobalt)" : "var(--color-ink)";
  const gradId = `idx-grad-${index.symbol.replace(/\W/g, "")}`;

  return (
    <div className="panel card-enter flex items-center gap-4 p-4" style={{ animationDelay: `${delay}ms` }}>
      <div className="min-w-0 shrink-0">
        <p className="microlabel">{index.name}</p>
        <p className="tnum mt-1 font-mono text-sm font-medium">{level.format(index.price)}</p>
        <span
          className={`tnum mt-1.5 inline-block rounded-full px-2 py-0.5 font-mono text-[11px] ${
            up ? "bg-sky-soft text-cobalt" : "bg-ink/5 text-ink/55"
          }`}
        >
          {dirGlyph(index.change_percent)} {fmtPercent(index.change_percent)}
        </span>
      </div>
      <div className="h-16 min-w-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={index.points} margin={{ top: 4, right: 0, bottom: 2, left: 0 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={stroke} stopOpacity={up ? 0.18 : 0.08} />
                <stop offset="100%" stopColor={stroke} stopOpacity={0} />
              </linearGradient>
            </defs>
            <YAxis hide domain={["dataMin", "dataMax"]} />
            <Tooltip
              content={<IndexTooltip />}
              cursor={{ stroke, strokeOpacity: 0.4, strokeDasharray: "3 3" }}
            />
            <Area
              type="monotone"
              dataKey="close"
              stroke={stroke}
              strokeOpacity={up ? 1 : 0.65}
              strokeWidth={1.7}
              fill={`url(#${gradId})`}
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0, fill: stroke }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Compact intraday sparklines for the three major US indexes, shown above the greeting. */
export default function IndexStrip() {
  const [indexes, setIndexes] = useState(null); // null loading, "error" failed

  useEffect(() => {
    let active = true;
    api
      .getIndexes()
      .then((data) => active && setIndexes(data))
      .catch(() => active && setIndexes("error"));
    return () => {
      active = false;
    };
  }, []);

  if (indexes === "error") return null;

  return (
    <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
      {indexes === null
        ? [0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-[96px]" style={{ animationDelay: `${i * 120}ms` }} />
          ))
        : indexes.map((index, i) => <IndexTile key={index.symbol} index={index} delay={i * 90} />)}
    </div>
  );
}
