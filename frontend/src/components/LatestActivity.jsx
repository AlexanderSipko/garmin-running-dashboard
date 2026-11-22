import SectionEyebrow from "./SectionEyebrow";
import { Footprints } from "lucide-react";
import { fmtDate, fmtDuration, fmtPace } from "../lib/format";

function LatestActivity({ activity }) {
  if (!activity)
    return (
      <div className="latest-empty min-h-[76px] grid place-items-center text-[color:var(--muted)] text-[11px]">
        Синхронизируй Garmin, чтобы увидеть тренировку.
      </div>
    );
  const km = Number(activity.distance_meters || 0) / 1000;
  const secs = Number(
    activity.moving_duration_seconds || activity.duration_seconds || 0
  );
  return (
    <article className="latest-card [background:var(--panel)] [border:1px_solid_var(--border)] rounded-[11px] py-4 px-[18px] mb-[10px] [.coach-highlight_&]:m-0">
      <div className="latest-title flex justify-between items-center [&_h2]:[font:600_14px_Manrope,_sans-serif] [&_h2]:tracking-[-0.25px] [&_h2]:mt-1 mx-0 mb-0 [&_p]:mt-1 mx-0 mb-0 [&_p]:text-[color:var(--muted)] [&_p]:text-[10px]">
        <div>
          <SectionEyebrow>ПОСЛЕДНЯЯ АКТИВНОСТЬ</SectionEyebrow>
          <h2>{activity.name || "Пробежка"}</h2>
          <p>
            {fmtDate(activity.start_time, {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
        </div>
        <span className="activity-round w-[36px] h-[36px] rounded-[11px] [background:var(--accent-soft)] text-[color:var(--accent)] grid place-items-center">
          <Footprints size={19} />
        </span>
      </div>
      <div className={[
        "latest-stats flex gap-0 mt-[15px] pt-[13px] [border-top:1px_solid_var(--border)] [&_>_div]:[flex:1]",
        "[&_>_div]:[border-right:1px_solid_var(--border)] [&_>_div]:pl-[14px] [&_>_div:first-child]:pl-0",
        "[&_>_div:last-child]:[border:0] [&_small]:block [&_small]:text-[color:var(--muted)]",
        "[&_small]:text-[8px] [&_small]:tracking-[0.8px] [&_b]:block",
        "[&_b]:[font:700_17px_Manrope,_sans-serif] [&_b]:mt-1 [&_i]:[font:500_9px_'DM_Sans',_sans-serif]",
        "[&_i]:text-[color:var(--muted)] [&_i]:[font-style:normal] max-[760px]:flex-wrap max-[760px]:gap-y-3",
        "max-[760px]:[&_>_div]:min-w-[33%] max-[420px]:[&_>_div]:min-w-[50%]",
        "max-[420px]:[&_>_div:nth-child(2)]:[border-right:0]",
      ].join(" ")}>
        <div>
          <small>ДИСТАНЦИЯ</small>
          <b>
            {km.toFixed(1)} <i>км</i>
          </b>
        </div>
        <div>
          <small>СРЕДНИЙ ТЕМП</small>
          <b>
            {fmtPace(km ? secs / km : 0)} <i>/км</i>
          </b>
        </div>
        <div>
          <small>ВРЕМЯ</small>
          <b>{fmtDuration(secs)}</b>
        </div>
        {activity.avg_hr_bpm && (
          <div>
            <small>ПУЛЬС</small>
            <b>
              {Math.round(activity.avg_hr_bpm)} <i>bpm</i>
            </b>
          </div>
        )}
      </div>
    </article>
  );
}

export default LatestActivity;
