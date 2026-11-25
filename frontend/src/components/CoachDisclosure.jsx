import { useState } from "react";
import { ChevronDown } from "lucide-react";

export default function CoachDisclosure({ storageKey, title, children }) {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(storageKey) !== "closed"; }
    catch { return true; }
  });

  function toggle(event) {
    const next = event.currentTarget.open;
    setOpen(next);
    try { localStorage.setItem(storageKey, next ? "open" : "closed"); }
    catch { /* The section still toggles without storage. */ }
  }

  return (
    <details open={open} onToggle={toggle} className="rounded-xl border border-[#415157] bg-[#172229]">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 text-sm font-bold text-[#f3bc7f] [&::-webkit-details-marker]:hidden">
        {title}<ChevronDown size={16} aria-hidden="true" className={open ? "rotate-180" : ""} />
      </summary>
      <div className="px-3 pb-3">{children}</div>
    </details>
  );
}
