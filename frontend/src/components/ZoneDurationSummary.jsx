const percent = new Intl.NumberFormat("ru-RU", { style: "percent", maximumFractionDigits: 1 });

function durationLabel(minutes) {
  if (minutes === 0) return "0 мин";
  if (minutes < 1) return "<1 мин";
  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return hours ? `${hours} ч ${rest} мин` : `${rest} мин`;
}

export default function ZoneDurationSummary({ totals, coveredMinutes, title, caption, label }) {
  if (!coveredMinutes) return null;
  const segments = totals.filter(({ minutes }) => minutes > 0);
  let offset = 0;
  const ringStops = segments.map(({ color, minutes }) => {
    const start = offset;
    offset += minutes / coveredMinutes * 100;
    return `${color} ${start}% ${offset}%`;
  });

  return (
    <div className="mt-2 border-t border-white/10 pt-2">
      <div className="mb-3 flex flex-wrap justify-between gap-x-2 gap-y-1 text-xs">
        <h3 className="font-semibold text-slate-200">{title}</h3>
        <span className="text-slate-400">{caption}</span>
      </div>
      <div className="grid items-center gap-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-5">
        <div className="relative isolate mx-auto grid size-32 shrink-0 place-items-center rounded-full"
          style={{ background: segments.length === 1 ? segments[0].color : `conic-gradient(${ringStops.join(", ")})` }}>
          <span aria-hidden="true" className="absolute inset-3 -z-10 rounded-full bg-[#19242b]" />
          <div className="max-w-24 text-center leading-tight">
            <b className="block text-sm tabular-nums text-slate-100">{durationLabel(coveredMinutes)}</b>
            <span className="text-[10px] text-slate-400">{label}</span>
          </div>
        </div>
        <div className="min-w-0">
          <div aria-hidden="true" className="mb-2 flex h-3 gap-[3px] overflow-hidden rounded-md bg-[#142129]">
            {segments.map(({ zone, color, minutes }) => (
              <span key={zone} className="min-w-0 rounded-sm" style={{ flex: `${minutes} 1 0px`, backgroundColor: color }} />
            ))}
          </div>
          <dl className="grid grid-cols-2 gap-2 text-xs tabular-nums sm:grid-cols-3">
            {totals.filter(({ zone, minutes }) => zone !== "Вне зон" || minutes > 0).map(({ zone, color, minutes }) => (
              <div key={zone} className="grid min-w-0 gap-1 rounded-md bg-[#223139] px-2 py-1.5">
                <dt className="flex flex-wrap items-center justify-between gap-x-1 font-semibold">
                  <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2 rounded-sm" style={{ backgroundColor: color }} />{zone}</span>
                  <span style={{ color }}>{percent.format(minutes / coveredMinutes)}</span>
                </dt>
                <dd className="whitespace-nowrap text-slate-200">{durationLabel(minutes)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}
export const zoneColors = [
  ["Z1", "#a3b3bd"], ["Z2", "#82bee5"], ["Z3", "#8de0cc"],
  ["Z4", "#ffc988"], ["Z5", "#f18b9b"], ["Вне зон", "#65747c"],
];

