import CalendarPeriodExplorer from "../components/CalendarPeriodExplorer";
import useGarminDashboard from "../hooks/useGarminDashboard";

function App() {
  const dashboard = useGarminDashboard("year", new Date());

  return (
    <main className={[
      "app theme-calendar period-explorer-app mx-auto [background:var(--bg)] text-[color:var(--text)]",
      "w-full max-w-[none] min-h-screen p-0 [--bg:#141b20] [--panel:#1a242a] [--border:#303e46]",
      "[--text:#e3eaed] [--muted:#91a0a8] [--soft:#b8c5cb] [--accent:#eab16a] [--accent-soft:#332c23]",
      "max-[760px]:pt-0 px-4 pb-[18px] max-[760px]:[&.period-explorer-app]:p-0 max-[760px]:[.app&]:p-0",
      "max-[420px]:pl-3 max-[420px]:pr-3",
    ].join(" ")}>
      <CalendarPeriodExplorer
        activities={dashboard.historyActivities}
        busy={dashboard.busy}
        error={dashboard.error}
        onSync={dashboard.sync}
        publicDemo={dashboard.publicDemo}
        syncedAt={dashboard.syncedAt}
        usesDemoData={dashboard.usesDemoData}
        wellness={dashboard.wellness}
      />
    </main>
  );
}

export default App;
