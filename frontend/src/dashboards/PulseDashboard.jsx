import SectionEyebrow from "../components/SectionEyebrow";
import { Footprints, Gauge, Heart, Route } from "lucide-react";
import MetricCard, { Trend } from "../components/MetricCard";
import LatestActivity from "../components/LatestActivity";
import DistanceChart from "../components/DistanceChart";
import RecentActivities from "../components/RecentActivities";
import PeriodInsight from "../components/PeriodInsight";
import { fmtPace } from "../lib/format";

function PulseDashboard(p) {
  return (
    <>
      <div className="welcome flex justify-between items-end pt-[10px] px-0 pb-5 [&_h1]:[font:700_29px_Manrope,_sans-serif] [&_h1]:tracking-[-1.1px] [&_h1]:my-[6px] mx-0 [&_h1_span]:text-[color:var(--accent)] [&_p]:text-[color:var(--muted)] [&_p]:text-[11px] [&_p]:m-0 max-[760px]:pt-[5px]">
        <div>
          <SectionEyebrow>ТВОЙ БЕГОВОЙ РИТМ</SectionEyebrow>
          <h1>
            Что происходит<span>?</span>
          </h1>
          <p>
            {p.period === "week"
              ? "Короткий обзор последних семи дней."
              : "Сводка последних тридцати дней."}
          </p>
        </div>
        <div className="weekly-total text-right [&_>_span]:block [&_>_span]:text-[8px] [&_>_span]:tracking-[1px] [&_>_span]:text-[color:var(--muted)] [&_>_b]:block [&_>_b]:[font:700_26px_Manrope,_sans-serif] [&_>_b]:my-[3px] mx-0 [&_small]:[font:500_11px_'DM_Sans',_sans-serif] [&_small]:text-[color:var(--muted)]">
          <span>ЗА ПЕРИОД</span>
          <b>
            {p.km.toFixed(1)} <small>км</small>
          </b>
          <Trend value={p.delta} />
        </div>
      </div>
      <LatestActivity activity={p.latest} />
      <div className="metric-grid grid grid-cols-[repeat(4,_1fr)] gap-[9px] my-[10px] mx-0 max-[760px]:grid-cols-[repeat(2,_1fr)]">
        <MetricCard
          icon={<Route size={15} />}
          label="ДИСТАНЦИЯ"
          value={p.km.toFixed(1)}
          unit="км"
          trend={p.delta}
        />
        <MetricCard
          icon={<Footprints size={15} />}
          label="ТРЕНИРОВКИ"
          value={p.activities.length}
          unit="раз"
        />
        <MetricCard
          icon={<Gauge size={15} />}
          label="СРЕДНИЙ ТЕМП"
          value={fmtPace(p.avgPace)}
          unit="/км"
        />
        <MetricCard
          icon={<Heart size={15} />}
          label="СРЕДНИЙ ПУЛЬС"
          value={p.avgHr || "—"}
          unit={p.avgHr ? "bpm" : ""}
        />
      </div>
      <div className="two-columns grid grid-cols-[1.25fr_0.75fr] gap-[10px] my-[10px] mx-0 max-[760px]:grid-cols-[1fr]">
        <DistanceChart data={p.chart} />
        <RecentActivities rows={p.activities} />
      </div>
      <PeriodInsight kind="pulse" p={p} />
    </>
  );
}

export default PulseDashboard;
