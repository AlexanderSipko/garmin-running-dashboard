import { Footprints, LoaderCircle, RefreshCw } from "lucide-react";

function AppHeader({ connected, busy, onSync }) {
  return (
    <header className="app-top h-[70px] flex justify-between items-center [border-bottom:1px_solid_var(--border)] [.theme-coach_&]:border-[color:#dfded5]">
      <a className="logo flex items-center gap-[10px] text-[color:var(--text)] [font:800_19px_Manrope,_sans-serif] tracking-[-0.7px] [text-decoration:none] [&_small]:block [&_small]:[font:700_8px_'DM_Sans',_sans-serif] [&_small]:text-[color:var(--muted)] [&_small]:tracking-[1.2px] [&_small]:mt-[1px]" href="#">
        <span className="logo-icon w-[35px] h-[35px] rounded-[11px] grid place-items-center text-[color:var(--accent)] [background:var(--accent-soft)]">
          <Footprints size={19} />
        </span>
        <span>
          stride<span className="dot [.logo_&]:text-[color:var(--accent)]">.</span>
          <small>GARMIN RUNNING</small>
        </span>
      </a>
      <div className="top-right flex items-center gap-[17px] max-[760px]:gap-[9px]">
        <span className={`api-state flex items-center gap-[7px] text-[color:var(--muted)] text-[11px] [&_i]:block [&_i]:w-[7px] [&_i]:h-[7px] [&_i]:rounded-full [&_i]:bg-[#777e79] [&.is-connected_i]:bg-[#78c47f] ${connected ? "is-connected" : ""}`}>
          <i />
          {connected ? "Garmin подключён" : "режим эскиза"}
        </span>
        <button
          className="sync-button [border:1px_solid_var(--border)] [background:var(--panel)] text-[color:var(--text)] py-[9px] px-3 rounded-[8px] flex items-center gap-[7px] text-[11px] [&:disabled]:opacity-[0.55] [&:disabled]:cursor-not-allowed max-[760px]:[&_span]:hidden"
          onClick={onSync}
          disabled={busy || !connected}
        >
          {busy ? (
            <LoaderCircle className="spin animate-spin" size={15} />
          ) : (
            <RefreshCw size={15} />
          )}
          <span>{busy ? "Загрузка" : "Синхронизировать"}</span>
        </button>
      </div>
    </header>
  );
}

export default AppHeader;
