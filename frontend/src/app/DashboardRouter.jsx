import { createContext, useContext, useEffect, useState } from "react";
import { legacyPage } from "../lib/dashboardRoutes";

const RouteContext = createContext(null);

function currentPath() {
  return legacyPage(window.location.hash) || window.location.pathname.replace(/\/$/, "") || "/";
}

export function DashboardRouter({ children }) {
  const [path, setPath] = useState(currentPath);

  useEffect(() => {
    function updateRoute() {
      const oldPage = legacyPage(window.location.hash);
      if (oldPage) window.history.replaceState(window.history.state, "", oldPage + window.location.search);
      setPath(currentPath());
    }
    updateRoute();
    window.addEventListener("popstate", updateRoute);
    window.addEventListener("hashchange", updateRoute);
    return () => {
      window.removeEventListener("popstate", updateRoute);
      window.removeEventListener("hashchange", updateRoute);
    };
  }, []);

  useEffect(() => { window.scrollTo(0, 0); }, [path]);

  function navigate(to) {
    if (window.location.pathname === to && !window.location.hash) return;
    window.history.pushState(null, "", to);
    setPath(to);
  }

  return <RouteContext.Provider value={{ path, navigate }}>{children}</RouteContext.Provider>;
}

export function useDashboardPath() {
  return useContext(RouteContext).path;
}

export function PageLink({ to, ...props }) {
  const router = useContext(RouteContext);

  return (
    <a {...props} href={to} onClick={(event) => {
      if (!router || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey
        || event.shiftKey || event.altKey || (props.target && props.target !== "_self")) return;
      event.preventDefault();
      router.navigate(to);
    }} />
  );
}
