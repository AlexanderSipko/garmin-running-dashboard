import { CalendarDays, LayoutDashboard, LoaderCircle, Watch } from "lucide-react";
import { dashboardPath, workoutsPath } from "../lib/dashboardRoutes";
import { PageLink } from "./DashboardRouter";

const linkClass = "flex min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 text-[13px] font-semibold text-slate-300 hover:bg-slate-800 focus-visible:outline-2 aria-[current=page]:bg-[#392f26] aria-[current=page]:text-[#ffc988] sm:gap-2 sm:text-sm";

export default function DashboardFooter({ currentPath, onSync, syncing, loading }) {
  const workoutsOpen = currentPath === workoutsPath;
  const syncLabel = syncing ? "Синхронизация с Garmin" : "Обновить Garmin";

  return (
    <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-[#33434b] bg-[#162128]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <nav aria-label="Разделы дашборда"
        className={`mx-auto grid h-14 w-full max-w-md gap-1.5 px-3 py-1.5 sm:gap-2 ${onSync ? "grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]" : "grid-cols-2"}`}>
        <PageLink to={dashboardPath} aria-current={!workoutsOpen ? "page" : undefined} className={linkClass}>
          <LayoutDashboard size={17} className="shrink-0" aria-hidden="true" />
          Дашборд
        </PageLink>
        {onSync && (
          <button type="button" onClick={onSync} disabled={syncing || loading}
            aria-label={syncLabel} title={syncLabel} aria-busy={syncing}
            className="flex min-w-11 items-center justify-center gap-1.5 rounded-xl border border-[#365447] bg-[#20362c] px-2 text-[13px] font-semibold text-[#b6ebc9] hover:bg-[#2a4839] focus-visible:outline-2 disabled:opacity-60 sm:px-3">
            {syncing ? <LoaderCircle size={17} className="shrink-0 animate-spin" aria-hidden="true" />
              : <Watch size={17} className="shrink-0" aria-hidden="true" />}
            <span className="hidden sm:inline">{syncing ? "Обновляю…" : "Обновить Garmin"}</span>
          </button>
        )}
        <PageLink to={workoutsPath} aria-current={workoutsOpen ? "page" : undefined} className={linkClass}>
          <CalendarDays size={17} className="shrink-0" aria-hidden="true" />
          Тренировки
        </PageLink>
      </nav>
    </footer>
  );
}
