import SectionEyebrow from "./SectionEyebrow";
import { useEffect, useState } from "react";
import { Bike, Clock3, Footprints, Gauge, Heart, RefreshCw, Route } from "lucide-react";
import { requestActivityDetails } from "../lib/activityDetailsRequest";
import { fmtDate, fmtDuration, fmtPace } from "../lib/format";
import { getActivityCategory } from "../lib/calendarAnalytics";
import ActivityCoachAnalysis from "./ActivityCoachAnalysis";
import StrengthActivity from "./StrengthActivity";
import ActivityRouteMap from "./ActivityRouteMap";
import ActivityTrackCharts from "./ActivityTrackCharts";

function ActivityDetail({ date, activities, detailCache, onActivityUpdated, onOpenChat, coachModelLabel }) {
  return (
    <section className="activity-detail pt-[15px] px-0 pb-0 mt-[14px] [border-top:1px_solid_var(--border)]">
      <div className="activity-detail-heading flex items-center justify-between gap-[14px] [&_h3]:mt-1 mx-0 mb-3 [&_h3]:[font:600_14px_Manrope,_sans-serif] [&_h3]:capitalize">
        <div>
          <SectionEyebrow>ТРЕНИРОВКА ЗА ДЕНЬ</SectionEyebrow>
          <h3>
            {fmtDate(date, { weekday: "long", day: "numeric", month: "long" })}
          </h3>
        </div>
        <span className="activity-detail-count text-[color:var(--muted)] text-[11px]">
          {activities.length}{" "}
          {activities.length === 1 ? "активность" : "активности"}
        </span>
      </div>

      {activities.length ? (
        activities.map((activity, index) => (
          <div key={activity.id || index} className="mb-3">
            {getActivityCategory(activity) === "strength"
              ? <StrengthActivity activity={activity} onActivityUpdated={onActivityUpdated} />
              : <ActivitySummary activity={activity} detailCache={detailCache} onActivityUpdated={onActivityUpdated} />}
            <ActivityCoachAnalysis activity={activity} onOpenChat={onOpenChat} modelLabel={coachModelLabel} />
          </div>
        ))
      ) : (
        <p className="rest-day-message mt-[11px] mx-0 mb-0 text-[color:var(--muted)] text-[11px]">В этот день тренировок нет.</p>
      )}
    </section>
  );
}

function ActivitySummary({ activity, detailCache, onActivityUpdated }) {
  const distanceKm = Number(activity.distance_meters || 0) / 1000;
  const durationSeconds = Number(
    activity.moving_duration_seconds || activity.duration_seconds || 0
  );
  const activityId = String(activity.id || "");
  const activityType = String(activity.type || "").toLowerCase();
  const isRun = /(run|running|trail)/.test(activityType);
  const cycling = getActivityCategory(activity) === "cycling";
  const SportIcon = cycling ? Bike : Footprints;
  const canLoadDetails = /^\d+$/.test(activityId) && isRun;
  const [detail, setDetail] = useState(() => detailCache.get(activityId) ?? null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    if (!canLoadDetails || (refreshCount === 0 && detailCache.has(activityId))) return;

    const controller = new AbortController();
    const { signal } = controller;
    setDetailLoading(true);
    setDetailError("");

    async function loadDetails() {
      if (refreshCount > 0) return requestActivityDetails(activityId, { method: "POST", signal });
      const saved = await requestActivityDetails(activityId, { signal });
      if (saved.details_saved || signal.aborted) return saved;
      return requestActivityDetails(activityId, { method: "POST", onlyIfMissing: true, signal });
    }

    loadDetails()
      .then((result) => {
        if (signal.aborted) return;
        const cleanDetail = {
          saved: Boolean(result.details_saved),
          description: typeof result.description === "string" ? result.description : "",
          splits: Array.isArray(result.splits) ? result.splits : [],
          points: Array.isArray(result.points) ? result.points : [],
          route: Array.isArray(result.route) ? result.route : [],
          sampleCount: Number(result.sample_count || 0),
          trackAvailable: Boolean(result.track_available),
          trackMessage: result.track_message || "",
        };
        detailCache.set(activityId, cleanDetail);
        setDetail(cleanDetail);
        if (result.activity) onActivityUpdated(result.activity, result.weekly_volume);
      })
      .catch((error) => {
        if (!signal.aborted) setDetailError(error.message);
      })
      .finally(() => {
        if (!signal.aborted) setDetailLoading(false);
      });

    return () => controller.abort();
  }, [activityId, canLoadDetails, detailCache, refreshCount, onActivityUpdated]);

  const splits = detail?.splits || [];

  return (
    <article className="activity-detail-run py-3 px-0 [border-top:1px_solid_var(--border)] [&_h4]:flex [&_h4]:items-center [&_h4]:gap-2 [&_h4]:mt-0 mx-0 mb-3 [&_h4]:text-[13px] [&_h4_svg]:text-[color:var(--accent)]">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-sm font-bold">
          <SportIcon size={16} className="text-[color:var(--accent)]" aria-hidden="true" />
          {activity.name || (cycling ? "Велосипед" : "Пробежка")}
        </h4>
        {canLoadDetails && (
          <button type="button" disabled={detailLoading} onClick={() => setRefreshCount((count) => count + 1)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#46545b] px-2.5 text-xs font-semibold text-[#e5ebee] hover:bg-[#26363d] disabled:opacity-60">
            <RefreshCw size={14} className={detailLoading ? "animate-spin" : undefined} aria-hidden="true" />
            {detailLoading ? "Обновляю…" : "Обновить детали"}
          </button>
        )}
      </div>
      <div className="activity-detail-metrics grid grid-cols-[repeat(4,_1fr)] gap-2 max-[760px]:grid-cols-[repeat(2,_1fr)]">
        <DetailMetric
          icon={<Route size={15} />}
          label="ДИСТАНЦИЯ"
          value={`${distanceKm.toFixed(1)} км`}
        />
        <DetailMetric
          icon={<Gauge size={15} />}
          label={cycling ? "СРЕДНЯЯ СКОРОСТЬ" : "СРЕДНИЙ ТЕМП"}
          value={cycling ? (durationSeconds > 0 ? `${(distanceKm * 3600 / durationSeconds).toFixed(1)} км/ч` : "—") : `${fmtPace(
            distanceKm ? durationSeconds / distanceKm : 0
          )} /км`}
        />
        <DetailMetric
          icon={<Clock3 size={15} />}
          label="ВРЕМЯ"
          value={fmtDuration(durationSeconds)}
        />
        {activity.avg_hr_bpm && (
          <DetailMetric
            icon={<Heart size={15} />}
            label="СРЕДНИЙ ПУЛЬС"
            value={`${Math.round(activity.avg_hr_bpm)} bpm`}
          />
        )}
      </div>
      {detailLoading && <p className="splits-unavailable mt-[11px] mx-0 mb-0 text-[color:var(--muted)] text-[11px]">{refreshCount > 0 ? "Обновляю детали из Garmin…" : "Загружаю детали…"}</p>}
      {detailError && <p className="splits-unavailable mt-[11px] mx-0 mb-0 text-[color:var(--muted)] text-[11px]">{detailError}</p>}
      {detail?.description && (
        <section aria-label="Описание из Garmin" className="mt-3 rounded-xl border border-[#34424a] bg-[#202a30] p-3">
          <h5 className="mb-1 text-xs font-semibold text-[#aebbc0]">Описание из Garmin</h5>
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{detail.description}</p>
        </section>
      )}
      {detail && !detail.saved && !detailLoading && (
        <p className="mt-3 text-xs text-[color:var(--muted)]">Детали ещё не сохранены. Нажми «Обновить детали», чтобы загрузить их из Garmin.</p>
      )}
      {detail?.saved && <ActivityTrackCharts points={detail.points} />}
      {detail?.trackMessage && <p className="splits-unavailable mt-[11px] mx-0 mb-0 text-[color:var(--muted)] text-[11px]">{detail.trackMessage}</p>}
      {splits.length > 0 && <SplitList splits={splits} />}
      {detail?.route?.length > 1 && <ActivityRouteMap route={detail.route} />}
      {detail?.saved && !splits.length && !detail.trackAvailable && !detail.trackMessage && (
        <p className="splits-unavailable mt-[11px] mx-0 mb-0 text-[color:var(--muted)] text-[11px]">Для этой тренировки Garmin не вернул сплиты или точки записи.</p>
      )}
      {!canLoadDetails && isRun && <p className="splits-unavailable mt-[11px] mx-0 mb-0 text-[color:var(--muted)] text-[11px]">Подробности доступны для синхронизированных Garmin-тренировок.</p>}
    </article>
  );
}

function DetailMetric({ icon, label, value }) {
  return (
    <div className="detail-metric [&_>_span]:text-[color:var(--accent)] grid grid-cols-[18px_1fr] items-center gap-x-[6px] gap-y-[3px] [&_>_span]:row-span-2 [&_small]:text-[color:var(--muted)] [&_small]:text-[8px] [&_small]:tracking-[0.5px] [&_b]:text-[12px]">
      <span>{icon}</span>
      <small>{label}</small>
      <b>{value}</b>
    </div>
  );
}

function SplitList({ splits }) {
  return (
    <div className="split-list mt-4 min-w-0 overflow-x-auto">
      <table className="w-full border-collapse text-left text-[13px] tabular-nums text-[color:var(--soft)] [&_td]:border-t [&_td]:border-[color:var(--border)] [&_td]:px-2 [&_td]:py-3 [&_td]:whitespace-nowrap [&_th]:px-2 [&_th]:py-2 [&_th]:whitespace-nowrap">
        <caption className="pb-2 text-left text-[15px] font-semibold text-[color:var(--text)]">Сплиты</caption>
        <thead>
          <tr>
            <th scope="col">Км</th>
            <th scope="col">Темп</th>
            <th scope="col">Пульс</th>
            <th scope="col">Дистанция</th>
          </tr>
        </thead>
        <tbody>
          {splits.map((split, index) => {
            const kilometer = split.index ?? split.splitIndex ?? index + 1;
            const pace = getSplitPace(split);
            const heartRate = Number(split.avg_hr_bpm);
            const distance = Number(split.distance_km ?? split.distanceKm);
            return (
              <tr key={index}>
                <td>{split.label || kilometer}</td>
                <td className="font-semibold text-[color:var(--text)]">
                  {Number.isFinite(pace) && pace > 0 ? `${fmtPace(pace)} /км` : "—"}
                </td>
                <td>{Number.isFinite(heartRate) && heartRate > 0 ? `${Math.round(heartRate)} уд/мин` : "—"}</td>
                <td>{Number.isFinite(distance) && distance > 0 ? `${distance.toLocaleString("ru-RU")} км` : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function getSplitPace(split) {
  return Number(
    split.pace_seconds_per_km || split.paceSecondsPerKm || split.pace || 0
  );
}

export default ActivityDetail;
