import DashboardFooter from "./DashboardFooter";
import { useEffect, useState } from "react";
import AccountPanel, { accountRequest, selectedCoachModelLabel } from "../components/AccountPanel";
import { ConnectionGuide, DemoIntro } from "../components/DemoGuide";
import BodyMeasurements from "../components/BodyMeasurements";
import WorkoutHistory from "../components/WorkoutHistory";
import { guidePath, measurementsPath, telegramPath, workoutsPath } from "../lib/dashboardRoutes";
import { initializeTelegramMiniApp } from "../lib/telegramMiniApp";
import { DashboardRouter, useDashboardPath } from "./DashboardRouter";
import CalendarPeriodExplorer from "../components/CalendarPeriodExplorer";
import useWeatherForecast from "../hooks/useWeatherForecast";
import useGarminDashboard from "../hooks/useGarminDashboard";

const theme = "[background:var(--bg)] text-[color:var(--text)] [--bg:#141b20] [--panel:#1a242a] [--border:#303e46] [--text:#e3eaed] [--muted:#91a0a8] [--soft:#b8c5cb] [--accent:#eab16a] [--accent-soft:#332c23]";

function Dashboard({ demo, account, planRevision, weather, onWeatherChange, pagePath }) {
  const dashboard = useGarminDashboard(demo);
  const coachEnabled = !demo && Boolean(account?.ai);
  const coachModelLabel = coachEnabled ? selectedCoachModelLabel(account) : "";
  const viewScope = account?.id ?? "demo";

  let content;
  if (pagePath === measurementsPath) {
    content = <BodyMeasurements account={account} request={accountRequest} />;
  } else if (pagePath === workoutsPath) {
    content = <WorkoutHistory activities={dashboard.activities} loading={dashboard.loading} error={dashboard.error} demo={demo}
      onActivityUpdated={dashboard.replaceActivity} coachEnabled={coachEnabled} coachModelLabel={coachModelLabel}
      viewScope={viewScope} syncedAt={dashboard.syncedAt} planRevision={planRevision}
      onTrainingWeekChanged={dashboard.replaceTrainingWeek} />;
  } else if (dashboard.loading) {
    content = <p role="status" className="mx-auto max-w-4xl px-4 py-8 text-sm text-slate-300">Загружаю личные данные…</p>;
  } else {
    content = (
      <main className={[
        "app theme-calendar period-explorer-app mx-auto w-full max-w-[none] min-h-screen p-0",
        "max-[760px]:pt-0 px-4 pb-[18px] max-[760px]:[&.period-explorer-app]:p-0 max-[760px]:[.app&]:p-0",
        "max-[420px]:pl-3 max-[420px]:pr-3",
      ].join(" ")}>
        <CalendarPeriodExplorer
          key={pagePath}
          activities={dashboard.activities}
          pagePath={pagePath}
          viewScope={viewScope}
          onActivityUpdated={dashboard.replaceActivity}
          busy={dashboard.busy}
          error={dashboard.error}
          publicDemo={demo}
          coachEnabled={coachEnabled}
          coachModelLabel={coachModelLabel}
          syncedAt={dashboard.syncedAt}
          planRevision={planRevision}
          weather={weather}
          weatherRequest={accountRequest}
          onWeatherChange={onWeatherChange}
          wellness={dashboard.wellness}
          deloadWeeks={dashboard.deloadWeeks}
          weeklyVolume={dashboard.weeklyVolume}
          plannedSessions={dashboard.plannedSessions}
          onTrainingWeekChanged={dashboard.replaceTrainingWeek}
          onMarkDeload={dashboard.markDeloadWeek}
        />
      </main>
    );
  }

  return (
    <>
      {content}
      <DashboardFooter currentPath={pagePath} onSync={account?.garmin ? dashboard.sync : undefined}
        syncing={dashboard.busy} loading={dashboard.loading} />
    </>
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
    if (pagePath === telegramPath) {
      // The dashboard can still open if Telegram's script is unavailable.
      void initializeTelegramMiniApp().catch(() => {});
    }
  }, [pagePath]);

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
    <div className={`${theme} min-h-dvh min-w-0 pt-[var(--app-safe-top)] ${showGuide ? "" : "[--footer-height:calc(3.25rem+var(--app-safe-bottom))] pb-[var(--footer-height)]"}`}>
      {!demoOnly && <AccountPanel account={account} weatherLocation={weather?.location} onWeatherChange={changeLocation} onChange={setAccount} onPlanSaved={() => setPlanRevision((value) => value + 1)} />}
      {showGuide ? <ConnectionGuide /> : (
        <>
          {!account && pagePath !== workoutsPath && pagePath !== measurementsPath && <DemoIntro />}
          <Dashboard key={account?.id || "demo"} demo={!account} account={account} planRevision={planRevision}
            weather={weather} onWeatherChange={changeLocation} pagePath={pagePath} />
        </>
      )}
    </div>
  );
}
