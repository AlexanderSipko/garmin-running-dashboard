import DashboardFooter from "./DashboardFooter";
import { useEffect, useState } from "react";
import AccountPanel, { accountRequest } from "../components/AccountPanel";
import { ConnectionGuide, DemoIntro } from "../components/DemoGuide";
import WorkoutHistory from "../components/WorkoutHistory";
import { guidePath, workoutsPath } from "../lib/dashboardRoutes";
import { DashboardRouter, useDashboardPath } from "./DashboardRouter";
import CalendarPeriodExplorer from "../components/CalendarPeriodExplorer";
import useWeatherForecast from "../hooks/useWeatherForecast";
import useGarminDashboard from "../hooks/useGarminDashboard";

const theme = "[background:var(--bg)] text-[color:var(--text)] [--bg:#141b20] [--panel:#1a242a] [--border:#303e46] [--text:#e3eaed] [--muted:#91a0a8] [--soft:#b8c5cb] [--accent:#eab16a] [--accent-soft:#332c23]";

function Dashboard({ demo, account, planRevision, weather, onWeatherChange, pagePath }) {
  const dashboard = useGarminDashboard(demo);

  if (pagePath === workoutsPath) {
    return <WorkoutHistory activities={dashboard.activities} loading={dashboard.loading} error={dashboard.error} demo={demo} />;
  }

  if (dashboard.loading) {
    return <p role="status" className="mx-auto max-w-4xl px-4 py-8 text-sm text-slate-300">Загружаю личные данные…</p>;
  }

  return (
    <main className={[
      "app theme-calendar period-explorer-app mx-auto w-full max-w-[none] min-h-screen p-0",
      "max-[760px]:pt-0 px-4 pb-[18px] max-[760px]:[&.period-explorer-app]:p-0 max-[760px]:[.app&]:p-0",
      "max-[420px]:pl-3 max-[420px]:pr-3",
    ].join(" ")}>
      <CalendarPeriodExplorer
        activities={dashboard.activities}
        pagePath={pagePath}
        onActivityUpdated={dashboard.replaceActivity}
        busy={dashboard.busy}
        error={dashboard.error}
        onSync={account?.garmin ? dashboard.sync : undefined}
        publicDemo={demo}
        coachEnabled={Boolean(account?.ai)}
        syncedAt={dashboard.syncedAt}
        planRevision={planRevision}
        weather={weather}
        weatherRequest={accountRequest}
        onWeatherChange={onWeatherChange}
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
  return <DashboardRouter><DashboardApp /></DashboardRouter>;
}

function DashboardApp() {
  const demoOnly = import.meta.env.VITE_PUBLIC_DEMO === "true";
  const [account, setAccount] = useState(null);
  const [checkingSession, setCheckingSession] = useState(!demoOnly);
  const [sessionError, setSessionError] = useState("");
  const [sessionAttempt, setSessionAttempt] = useState(0);
  const [planRevision, setPlanRevision] = useState(0);
  const pagePath = useDashboardPath();
  const { weather, changeLocation } = useWeatherForecast(account?.id, accountRequest);
  const showGuide = pagePath === guidePath;

  useEffect(() => {
    if (demoOnly) return;
    const controller = new AbortController();
    accountRequest("", { signal: controller.signal })
      .then((user) => { if (!controller.signal.aborted) setAccount(user); })
      .catch((error) => {
        if (!controller.signal.aborted && error.status !== 401) {
          setSessionError("Не удалось проверить сессию. Попробуй ещё раз.");
        }
      })
      .finally(() => { if (!controller.signal.aborted) setCheckingSession(false); });
    return () => controller.abort();
  }, [demoOnly, sessionAttempt]);

  function retrySession() {
    setSessionError("");
    setCheckingSession(true);
    setSessionAttempt((value) => value + 1);
  }

  if (checkingSession || sessionError) {
    return (
      <main className={`${theme} grid min-h-dvh place-items-center p-6`}>
        <div className="grid justify-items-center gap-3">
          {sessionError ? (
            <>
              <p role="alert">{sessionError}</p>
              <button type="button" onClick={retrySession} className="rounded-lg border border-slate-600 px-4 py-2">Повторить</button>
            </>
          ) : <p role="status" className="text-slate-300">Загружаю дашборд…</p>}
        </div>
      </main>
    );
  }

  return (
    <div className={`${theme} min-h-dvh ${showGuide ? "" : "[--footer-height:calc(3.75rem+env(safe-area-inset-bottom))] pb-[var(--footer-height)]"}`}>
      {!demoOnly && <AccountPanel account={account} weatherLocation={weather?.location} onWeatherChange={changeLocation} onChange={setAccount} onPlanSaved={() => setPlanRevision((value) => value + 1)} />}
      {showGuide ? <ConnectionGuide /> : (
        <>
          {!account && pagePath !== workoutsPath && <DemoIntro />}
          <Dashboard key={account?.id || "demo"} demo={!account} account={account} planRevision={planRevision}
            weather={weather} onWeatherChange={changeLocation} pagePath={pagePath} />
          <DashboardFooter currentPath={pagePath} />
        </>
      )}
    </div>
  );
}
