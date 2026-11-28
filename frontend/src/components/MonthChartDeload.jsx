export const deloadAreaStyle = {
  ifOverflow: "visible", fill: "#72c8b3", fillOpacity: 0.16, strokeOpacity: 0,
};

export function getDeloadRanges(days) {
  const ranges = new Map();
  for (const day of days) {
    if (!day.deloadWeek) continue;
    const range = ranges.get(day.deloadWeek);
    if (range) range.end = day.label;
    else ranges.set(day.deloadWeek, { start: day.label, end: day.label });
  }
  return [...ranges];
}

export function DeloadLegend() {
  return (
    <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-[#aee2d4]">
      <span className="size-2.5 rounded-sm bg-[#72c8b3]/50" aria-hidden="true" /> Разгрузочная неделя
    </p>
  );
}

export function MonthAxisTick({ x, y, payload, days }) {
  const day = days.get(payload.value);
  if (!day) return null;

  return (
    <g>
      {day.weekend && (
        <line x1={x - 3} x2={x + 3} y1={y - 4} y2={y - 4} stroke="#ffc17f" strokeWidth={2.5} strokeLinecap="round" />
      )}
      <text x={x} y={y} dy={9} textAnchor="middle"
        fill={day.weekend ? "#ffd1a5" : day.deloadWeek ? "#aee2d4" : "#aebbc0"}
        className={day.weekend
          ? "text-[12px] font-extrabold max-[620px]:text-[9px]"
          : "text-[11px] font-medium max-[620px]:hidden"}>
        {day.label}
      </text>
    </g>
  );
}

