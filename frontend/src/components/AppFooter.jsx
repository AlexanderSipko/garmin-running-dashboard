import { Check, CircleHelp } from "lucide-react";

function AppFooter({ usesDemoData, syncedAt }) {
  return (
    <footer className="footnote [border-top:1px_solid_var(--border)] mt-[14px] pt-[11px] px-[2px] pb-0 flex justify-between text-[color:var(--muted)] text-[9px] [&_span]:flex [&_span]:items-center [&_span]:gap-[6px]">
      <span>
        {usesDemoData ? (
          <>
            <CircleHelp size={13} /> Демонстрационные данные — Garmin пока не
            синхронизирован
          </>
        ) : (
          <>
            <Check size={13} /> Данные Garmin · только чтение
          </>
        )}
      </span>
      <span>
        {syncedAt
          ? `Синхронизация ${new Date(syncedAt).toLocaleString("ru-RU", {
              dateStyle: "short",
              timeStyle: "short",
            })}`
          : "Макеты v1"}
      </span>
    </footer>
  );
}

export default AppFooter;
