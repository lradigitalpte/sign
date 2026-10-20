import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import { cn } from "@signet/ui/lib/utils";

import { formatNumber } from "@/lib/format";
import type { DayActivity } from "@/lib/types";

const series = [
  { key: "sent", label: "Sent", color: "var(--series-1)" },
  { key: "completed", label: "Completed", color: "var(--series-2)" },
] as const;

const HEIGHT = 220;
const PAD = { top: 12, right: 12, bottom: 26, left: 34 };

const dayLabel = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
const fullDayLabel = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const parseDay = (value: string) => new Date(`${value}T00:00:00Z`);

export type Unit = "day" | "week";

/** Sums days into 7-day buckets ending today; each bucket is dated by its first day. */
export function groupByWeek(data: DayActivity[]): DayActivity[] {
  const weeks: DayActivity[] = [];
  for (let end = data.length; end > 0; end -= 7) {
    const slice = data.slice(Math.max(0, end - 7), end);
    weeks.unshift({
      date: slice[0].date,
      sent: slice.reduce((sum, d) => sum + d.sent, 0),
      completed: slice.reduce((sum, d) => sum + d.completed, 0),
    });
  }
  return weeks;
}

const periodLabel = (unit: Unit, date: string) => (unit === "week" ? `Week of ${dayLabel.format(parseDay(date))}` : fullDayLabel.format(parseDay(date)));

/** Rounds up to a tidy integer axis maximum with 2 even steps. */
function niceMax(value: number) {
  if (value <= 2) return 2;
  const step = Math.ceil(value / 2);
  const magnitude = 10 ** Math.floor(Math.log10(step));
  const tidy = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((m) => m >= step) ?? step;
  return Math.ceil(tidy) * 2;
}

export function Legend() {
  return (
    <ul className="flex items-center gap-4 text-xs text-muted-foreground">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full" style={{ background: s.color }} aria-hidden />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

/** Line chart of envelopes sent and completed per day or week, with a crosshair readout and keyboard support. */
export function ActivityChart({ data, unit = "day" }: { data: DayActivity[]; unit?: Unit }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.round(entry.contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const total = useMemo(() => data.reduce((sum, d) => sum + d.sent + d.completed, 0), [data]);
  const yMax = niceMax(Math.max(0, ...data.map((d) => Math.max(d.sent, d.completed))));
  const innerWidth = width - PAD.left - PAD.right;
  const innerHeight = HEIGHT - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (data.length <= 1 ? innerWidth / 2 : (i / (data.length - 1)) * innerWidth);
  const y = (v: number) => PAD.top + innerHeight - (v / yMax) * innerHeight;

  const paths = series.map((s) => ({
    ...s,
    d: data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d[s.key]).toFixed(1)}`).join(""),
  }));

  // About five date labels regardless of range.
  // About one date label per 72px, so labels never collide on narrow screens.
  const maxLabels = Math.min(6, Math.max(2, Math.floor(innerWidth / 72)));
  const labelEvery = Math.max(1, Math.ceil(data.length / maxLabels));
  const xTicks = data.map((d, i) => ({ i, date: d.date })).filter(({ i }) => i % labelEvery === 0 || i === data.length - 1).filter(({ i }, index, all) => index === all.length - 1 || data.length - 1 - i >= labelEvery);

  const indexFromPointer = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const relative = ((event.clientX - rect.left) / rect.width) * width;
    const ratio = (relative - PAD.left) / innerWidth;
    return Math.min(data.length - 1, Math.max(0, Math.round(ratio * (data.length - 1))));
  };

  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const delta = event.key === "ArrowRight" ? 1 : -1;
      setActive((current) => Math.min(data.length - 1, Math.max(0, (current ?? data.length - 1) + delta)));
    }
    if (event.key === "Escape") setActive(null);
  };

  const point = active !== null ? data[active] : null;
  const tooltipLeft = active !== null ? Math.min(Math.max(x(active), 80), width - 80) : 0;

  return (
    <div ref={containerRef} className="relative">
      <svg
        width={width}
        height={HEIGHT}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        className="block touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-ring/40 rounded-lg"
        role="img"
        aria-label={`Envelopes sent and completed per ${unit}, ${data.length} ${unit}s. Use the arrow keys to read each ${unit}.`}
        tabIndex={0}
        onPointerMove={(event) => setActive(indexFromPointer(event))}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive((current) => current ?? data.length - 1)}
        onBlur={() => setActive(null)}
        onKeyDown={onKeyDown}
      >
        {[0, yMax / 2, yMax].map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} className="stroke-border" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">
              {formatNumber(tick)}
            </text>
          </g>
        ))}
        {xTicks.map(({ i, date }) => (
          <text key={date} x={x(i)} y={HEIGHT - 6} textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"} className="fill-muted-foreground text-[11px]">
            {dayLabel.format(parseDay(date))}
          </text>
        ))}

        {/* Sent is drawn last so it stays visible where the two lines overlap. */}
        {[...paths].reverse().map((p) => (
          <path key={p.key} d={p.d} fill="none" stroke={p.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {data.length <= 40
          ? paths.map((p) =>
              data.map((d, i) =>
                d[p.key] > 0 ? <circle key={`${p.key}-${d.date}`} cx={x(i)} cy={y(d[p.key])} r={3} fill={p.color} className="stroke-card" strokeWidth={2} /> : null,
              ),
            )
          : null}

        {active !== null && point ? (
          <g pointerEvents="none">
            <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={PAD.top + innerHeight} className="stroke-muted-foreground/50" strokeWidth={1} />
            {series.map((s) => (
              <circle key={s.key} cx={x(active)} cy={y(point[s.key])} r={4.5} fill={s.color} className="stroke-card" strokeWidth={2} />
            ))}
          </g>
        ) : null}

        {total === 0 ? (
          <text x={PAD.left + innerWidth / 2} y={PAD.top + innerHeight / 2} textAnchor="middle" className="fill-muted-foreground text-sm">
            No envelopes sent or completed in this period
          </text>
        ) : null}
      </svg>

      {point && active !== null ? (
        <div
          role="status"
          className="pointer-events-none absolute top-0 z-10 w-40 -translate-x-1/2 rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg"
          style={{ left: tooltipLeft }}
        >
          <p className="text-xs text-muted-foreground">{periodLabel(unit, point.date)}</p>
          <ul className="mt-2 space-y-1">
            {series.map((s) => (
              <li key={s.key} className="flex items-center gap-2 text-sm">
                <span className="h-0.5 w-3 rounded-full" style={{ background: s.color }} aria-hidden />
                <span className="font-semibold tabular-nums">{formatNumber(point[s.key])}</span>
                <span className="text-muted-foreground">{s.label.toLowerCase()}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** Table view of the same data: only periods with activity, newest first. */
export function ActivityTable({ data, unit = "day" }: { data: DayActivity[]; unit?: Unit }) {
  const rows = data.filter((d) => d.sent || d.completed).reverse();
  if (rows.length === 0) return <p className="py-10 text-center text-sm text-muted-foreground">No envelopes sent or completed in this period.</p>;
  return (
    <div className="max-h-[220px] overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
          <tr>
            <th className="py-2 text-start font-medium">{unit === "week" ? "Week" : "Day"}</th>
            <th className="py-2 text-end font-medium">Sent</th>
            <th className="py-2 text-end font-medium">Completed</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.date} className="border-t">
              <td className="py-2">{periodLabel(unit, d.date)}</td>
              <td className={cn("py-2 text-end tabular-nums", !d.sent && "text-muted-foreground")}>{formatNumber(d.sent)}</td>
              <td className={cn("py-2 text-end tabular-nums", !d.completed && "text-muted-foreground")}>{formatNumber(d.completed)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
