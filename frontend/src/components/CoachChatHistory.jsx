import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

const formatDay = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function CoachMessages({ messages }) {
  const exchanges = [];
  for (const message of messages) {
    if (message.role === "user" || !exchanges.length) exchanges.push([]);
    exchanges.at(-1).push(message);
  }

  return (
    <div className="grid gap-3">
      {exchanges.reverse().map((exchange, index) => (
        <div className="grid gap-1" key={exchanges.length - index}>
          {exchange.map((message, position) => (
            <div key={position} className={`rounded-xl p-3 text-sm leading-relaxed ${message.role === "user" ? "bg-[#382e24]" : "bg-[#172229]"}`}>
              <b className="text-xs text-[#f3bc7f]">{message.role === "user" ? "Ты" : "Консультант"}</b>
              <p className="mt-1 whitespace-pre-wrap break-words">{message.content}</p>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function OlderMessages({ day, active }) {
  const [days, setDays] = useState([]);
  const [next, setNext] = useState(day);
  const [request, setRequest] = useState(day);
  const [error, setError] = useState("");
  const more = useRef(null);

  useEffect(() => {
    if (!request || !active) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ day, before: request });
    fetch(`/api/coach/chat?${query}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Не удалось загрузить историю.");
        return response.json();
      })
      .then((result) => {
        if (controller.signal.aborted) return;
        setDays((current) => [...current, ...result.days]);
        setNext(result.next_before);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("Не удалось загрузить историю.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setRequest(null);
      });
    return () => controller.abort();
  }, [active, day, request]);

  useEffect(() => {
    if (!active || !next || request || error || !more.current || !window.IntersectionObserver) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setRequest(next);
    });
    observer.observe(more.current);
    return () => observer.disconnect();
  }, [active, next, request, error]);

  return (
    <div className="grid gap-4 pt-3" aria-busy={Boolean(request)}>
      {days.map((group) => (
        <section key={group.day ?? "undated"} className="grid gap-2">
          <h4 className="text-sm font-semibold text-slate-300">
            {group.day ? formatDay.format(new Date(group.day)) : "Сообщения без даты"}
          </h4>
          <CoachMessages messages={group.messages} />
        </section>
      ))}
      {request && <p role="status" className="text-sm text-slate-400">Загружаю историю…</p>}
      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
      {next && !request && (
        <button ref={more} type="button" className="justify-self-start rounded-lg border border-[#415157] px-3 py-2 text-sm"
          onClick={() => { setError(""); setRequest(next); }}>
          {error ? "Повторить загрузку" : "Показать более ранние сообщения"}
        </button>
      )}
      {!next && !days.length && <p className="text-sm text-slate-400">За прошлые дни сообщений пока нет.</p>}
    </div>
  );
}

export default function CoachChatHistory({ day, active }) {
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(false);

  return (
    <section className="rounded-xl border border-[#415157] px-3 py-2">
      <button type="button" aria-expanded={open} onClick={() => { setOpen(!open); setOpened(true); }}
        className="flex min-h-9 w-full items-center justify-between gap-2 text-left text-sm font-semibold text-slate-300">
        История переписки
        <ChevronDown aria-hidden="true" size={17} className={open ? "rotate-180" : ""} />
      </button>
      {opened && (
        <div hidden={!open}>
          <OlderMessages key={day} day={day} active={active && open} />
        </div>
      )}
    </section>
  );
}
