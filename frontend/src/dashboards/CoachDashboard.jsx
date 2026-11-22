import SectionEyebrow from "../components/SectionEyebrow";
import { Clock3, Gauge, Heart, Route } from "lucide-react";
import MetricCard, { Trend } from "../components/MetricCard";
import LatestActivity from "../components/LatestActivity";
import DistanceChart from "../components/DistanceChart";
import RecentActivities from "../components/RecentActivities";
import PeriodInsight from "../components/PeriodInsight";
import { fmtDuration, fmtPace } from "../lib/format";

function CoachDashboard(p) {
  return (
    <>
      <div className="coach-intro [&_h1]:[font:700_29px_Manrope,_sans-serif] [&_h1]:tracking-[-1.1px] [&_h1]:my-[6px] mx-0 [&_p]:text-[color:var(--muted)] [&_p]:text-[11px] [&_p]:m-0 pt-[14px] px-0 pb-5 [&_h1]:text-[31px]">
        <SectionEyebrow>
          ТРЕНИРОВОЧНЫЙ ДНЕВНИК · {p.period === "week" ? "НЕДЕЛЯ" : "МЕСЯЦ"}
        </SectionEyebrow>
        <h1>Привет, бегун.</h1>
        <p>Вот как прошёл твой период — цифры и наблюдения без лишнего шума.</p>
      </div>
      <div className={[
        "coach-highlight grid grid-cols-[1.6fr_0.7fr] gap-[10px] [&_aside]:[background:#e8e9df]",
        "[&_aside]:rounded-[11px] [&_aside]:p-[18px] [&_aside]:text-[color:#2e352f] [&_aside]:flex",
        "[&_aside]:items-start [&_aside]:flex-col [&_aside]:justify-center",
        "[&_aside_strong]:[font:700_30px_Manrope,_sans-serif] [&_aside_strong]:my-1 mx-0",
        "[&_aside_strong_small]:[font:500_11px_'DM_Sans',_sans-serif] [&_aside_p]:text-[10px]",
        "[&_aside_p]:text-[color:#747b70] [&_aside_p]:mt-2 mx-0 mb-0 max-[760px]:grid-cols-[1fr]",
        "max-[760px]:[&_aside]:min-h-[130px]",
      ].join(" ")}>
        <LatestActivity activity={p.latest} />
        <aside>
          <SectionEyebrow>ОБЪЁМ ЗА ПЕРИОД</SectionEyebrow>
          <strong>
            {p.km.toFixed(1)} <small>км</small>
          </strong>
          <Trend value={p.delta} />
          <p>
            {p.activities.length} тренировок · {fmtDuration(p.seconds)} в
            движении
          </p>
        </aside>
      </div>
      <PeriodInsight kind="coach" p={p} />
      <div className="coach-stats grid grid-cols-[repeat(4,_1fr)] gap-[9px] my-[10px] mx-0 max-[760px]:grid-cols-[repeat(2,_1fr)]">
        <MetricCard
          icon={<Route size={15} />}
          label="ДИСТАНЦИЯ"
          value={p.km.toFixed(1)}
          unit="км"
          trend={p.delta}
        />
        <MetricCard
          icon={<Clock3 size={15} />}
          label="ВРЕМЯ"
          value={fmtDuration(p.seconds)}
          unit=""
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
      <DistanceChart
        data={p.chart}
        title="Как менялся недельный километраж"
        palette="blue"
      />
      <RecentActivities rows={p.activities} />
    </>
  );
}

export default CoachDashboard;
