import { useEffect, useState } from "react";
import AccountPanel, { accountRequest } from "../components/AccountPanel";
import { ConnectionGuide, DemoIntro, guideHash } from "../components/DemoGuide";
import CalendarPeriodExplorer from "../components/CalendarPeriodExplorer";
import useGarminDashboard from "../hooks/useGarminDashboard";

const theme = "[background:var(--bg)] text-[color:var(--text)] [--bg:#141b20] [--panel:#1a242a] [--border:#303e46] [--text:#e3eaed] [--muted:#91a0a8] [--soft:#b8c5cb] [--accent:#eab16a] [--accent-soft:#332c23]";

function Dashboard({ demo, account, planRevision }) {
  const dashboard = useGarminDashboard(demo);

  return (
    <main className={[
      "app theme-calendar period-explorer-app mx-auto w-full max-w-[none] min-h-screen p-0",
      "max-[760px]:pt-0 px-4 pb-[18px] max-[760px]:[&.period-explorer-app]:p-0 max-[760px]:[.app&]:p-0",
      "max-[420px]:pl-3 max-[420px]:pr-3",
    ].join(" ")}>
      <CalendarPeriodExplorer
        activities={dashboard.activities}
        onActivityUpdated={dashboard.replaceActivity}
        busy={dashboard.busy}
        error={dashboard.error}
        onSync={account?.garmin ? dashboard.sync : undefined}
        publicDemo={demo}
        coachEnabled={Boolean(account?.ai)}
        syncedAt={dashboard.syncedAt}
        planRevision={planRevision}
        wellness={dashboard.wellness}
        deloadWeeks={dashboard.deloadWeeks}
        plannedSessions={dashboard.plannedSessions}
        onTrainingWeekChanged={dashboard.replaceTrainingWeek}
        onMarkDeload={dashboard.markDeloadWeek}
      />
    </main>
  );
}

export default function App() {
  const demoOnly = import.meta.env.VITE_PUBLIC_DEMO === "true";
  const [account, setAccount] = useState(null);
  const [planRevision, setPlanRevision] = useState(0);
  const [pageHash, setPageHash] = useState(() => window.location.hash);
  const showGuide = pageHash === guideHash;

  useEffect(() => {
    function updatePage() {
      setPageHash(window.location.hash);
      window.scrollTo(0, 0);
    }
    window.addEventListener("hashchange", updatePage);
    return () => window.removeEventListener("hashchange", updatePage);
  }, []);

  useEffect(() => {
    if (demoOnly) return;
    const controller = new AbortController();
    accountRequest("", { signal: controller.signal }).then(setAccount).catch(() => {});
    return () => controller.abort();
  }, [demoOnly]);

  return (
    <div className={theme}>
      {!demoOnly && <AccountPanel account={account} onChange={setAccount} onPlanSaved={() => setPlanRevision((value) => value + 1)} />}
      {showGuide ? <ConnectionGuide /> : (
        <>
          {!account && <DemoIntro />}
          <Dashboard key={account?.id || "demo"} demo={!account} account={account} planRevision={planRevision} />
        </>
      )}
    </div>
  );
}
