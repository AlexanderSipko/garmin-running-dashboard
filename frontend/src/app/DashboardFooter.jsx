import { CalendarDays, LayoutDashboard } from "lucide-react";
import { dashboardPath, workoutsPath } from "../lib/dashboardRoutes";
import { PageLink } from "./DashboardRouter";

const links = [
  { to: dashboardPath, label: "Дашборд", Icon: LayoutDashboard },
  { to: workoutsPath, label: "Тренировки", Icon: CalendarDays },
];

export default function DashboardFooter({ currentPath }) {
  const activePath = currentPath === workoutsPath ? workoutsPath : dashboardPath;

  return (
    <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-[#33434b] bg-[#162128]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <nav aria-label="Разделы дашборда" className="mx-auto grid h-14 w-full max-w-sm grid-cols-2 gap-2 px-3 py-1.5">
        {links.map(({ to, label, Icon }) => (
          <PageLink key={to} to={to} aria-current={activePath === to ? "page" : undefined}
            className="flex min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 text-[13px] font-semibold text-slate-300 hover:bg-slate-800 focus-visible:outline-2 aria-[current=page]:bg-[#392f26] aria-[current=page]:text-[#ffc988] sm:gap-2 sm:text-sm">
            <Icon size={17} className="shrink-0" aria-hidden="true" />
            {label}
          </PageLink>
        ))}
      </nav>
    </footer>
  );
}
