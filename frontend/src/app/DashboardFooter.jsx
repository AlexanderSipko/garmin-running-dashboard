import { CalendarDays, LayoutDashboard, LoaderCircle, Ruler, Watch } from "lucide-react";
import { dashboardPath, measurementsPath, workoutsPath } from "../lib/dashboardRoutes";
import { PageLink } from "./DashboardRouter";

const linkClass = "flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-0.5 text-[10px] leading-none sm:flex-row sm:px-2 font-semibold text-slate-300 hover:bg-slate-800 focus-visible:outline-2 aria-[current=page]:bg-[#392f26] aria-[current=page]:text-[#ffc988] sm:gap-2 sm:text-sm";

export default function DashboardFooter({ currentPath, onSync, syncing, loading }) {
  const workoutsOpen = currentPath === workoutsPath;
  const measurementsOpen = currentPath === measurementsPath;
  const syncLabel = syncing ? "Синхронизация с Garmin" : "Обновить Garmin";

  return (
    <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-[#33434b] bg-[#162128]/95 pb-[var(--app-safe-bottom)] backdrop-blur">
      <nav aria-label="Разделы дашборда"
        className={`mx-auto grid h-12 w-full max-w-lg gap-1 px-1.5 py-1 sm:gap-2 ${onSync ? "grid-cols-[minmax(0,1fr)_2.5rem_repeat(2,minmax(0,1fr))] sm:grid-cols-[minmax(0,1fr)_auto_repeat(2,minmax(0,1fr))]" : "grid-cols-3"}`}>
        <PageLink to={dashboardPath} aria-current={!workoutsOpen && !measurementsOpen ? "page" : undefined} className={linkClass}>
          <LayoutDashboard size={15} className="shrink-0" aria-hidden="true" />
          <span className="max-w-full truncate">Дашборд</span>
        </PageLink>
        {onSync && (
          <button type="button" onClick={onSync} disabled={syncing || loading}
            aria-label={syncLabel} title={syncLabel} aria-busy={syncing}
            className="flex min-w-0 items-center justify-center gap-1.5 rounded-xl border border-[#365447] bg-[#20362c] px-2 text-[13px] font-semibold text-[#b6ebc9] hover:bg-[#2a4839] focus-visible:outline-2 disabled:opacity-60 sm:px-3">
            {syncing ? <LoaderCircle size={15} className="shrink-0 animate-spin" aria-hidden="true" />
              : <Watch size={15} className="shrink-0" aria-hidden="true" />}
            <span className="hidden sm:inline">{syncing ? "Обновляю…" : "Обновить Garmin"}</span>
          </button>
        )}
        <PageLink to={workoutsPath} aria-current={workoutsOpen ? "page" : undefined} className={linkClass}>
          <CalendarDays size={15} className="shrink-0" aria-hidden="true" />
          <span className="max-w-full truncate">Тренировки</span>
        </PageLink>
        <PageLink to={measurementsPath} aria-current={measurementsOpen ? "page" : undefined} className={linkClass}>
          <Ruler size={15} className="shrink-0" aria-hidden="true" />
          <span className="max-w-full truncate">Замеры</span>
        </PageLink>
      </nav>
    </footer>
  );
}
