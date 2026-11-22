import SectionEyebrow from "./SectionEyebrow";
import { ChevronRight, Footprints } from "lucide-react";
import { fmtDate } from "../lib/format";

function RecentActivities({ rows }) {
  return (
    <article className="recent-card [background:var(--panel)] [border:1px_solid_var(--border)] rounded-[11px] py-[15px] px-[17px] min-w-0">
      <div className="card-heading [&_h2]:[font:600_14px_Manrope,_sans-serif] [&_h2]:tracking-[-0.25px] [&_h2]:mt-1 mx-0 mb-0 flex justify-between items-center [&_h2]:mt-1">
        <div>
          <SectionEyebrow>ИСТОРИЯ</SectionEyebrow>
          <h2>Тренировки периода</h2>
        </div>
        <span className="row-count text-[9px] text-[color:var(--muted)]">{rows.length} активн.</span>
      </div>
      {rows.length ? (
        <div className="recent-list mt-2">
          {rows.slice(0, 5).map((a, i) => (
            <div className="recent-row h-[45px] [border-top:1px_solid_var(--border)] flex items-center gap-[9px] [&_>_b_small]:block [&_>_b_small]:text-[color:var(--muted)] [&_>_b_small]:text-[9px] [&_>_b_small]:mt-[2px] [&_>_b]:text-[11px] [&_>_b]:whitespace-nowrap [&_>_svg]:text-[color:var(--muted)]" key={a.id || i}>
              <span className="recent-icon w-[27px] h-[27px] rounded-[8px] [background:var(--accent-soft)] text-[color:var(--accent)] grid place-items-center [flex:none]">
                <Footprints size={16} />
              </span>
              <div className="recent-name [flex:1] min-w-0 [&_b]:block [&_b]:overflow-hidden [&_b]:text-[ellipsis] [&_b]:whitespace-nowrap [&_b]:text-[10px] [&_b]:font-semibold [&_small]:block [&_small]:text-[color:var(--muted)] [&_small]:text-[9px] [&_small]:mt-[2px]">
                <b>{a.name || "Бег"}</b>
                <small>{fmtDate(a.start_time)}</small>
              </div>
              <b>
                {(Number(a.distance_meters || 0) / 1000).toFixed(1)}
                <small> км</small>
              </b>
              <ChevronRight size={15} />
            </div>
          ))}
        </div>
      ) : (
        <div className="latest-empty min-h-[76px] grid place-items-center text-[color:var(--muted)] text-[11px]">В этом периоде пока нет активностей.</div>
      )}
    </article>
  );
}

export default RecentActivities;
