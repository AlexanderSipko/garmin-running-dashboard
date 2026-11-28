import { useEffect, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";

const formatDay = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

const formatTimestamp = new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" });
const toolProtocol = /<[^<>\r\n]{0,100}(?:tool_calls?|invoke\b|parameter\b)/i;

export function CoachMessages({ messages, onDeleted, disabled = false }) {
  const [deleting, setDeleting] = useState(null);
  const [error, setError] = useState("");
  const exchanges = [];
  for (const message of messages) {
    if (message.role === "user" || !exchanges.length) exchanges.push([]);
    exchanges.at(-1).push(message);
  }

  async function remove(id) {
    setDeleting(id);
    setError("");
    try {
      const response = await fetch(`/api/coach/chat/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error();
      onDeleted(id);
    } catch {
      setError("Не удалось удалить переписку.");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="grid gap-3">
      {exchanges.reverse().map((exchange, index) => (
        <div className="grid gap-1" key={exchange[0].exchange_id ?? exchanges.length - index}>
          {exchange.map((message, position) => (
            <div key={position} className={`rounded-xl p-3 text-sm leading-relaxed ${message.role === "user" ? "bg-[#382e24]" : "bg-[#172229]"}`}>
              <div className="flex items-center gap-x-2">
                <b className="shrink-0 text-xs text-[#f3bc7f]">{message.role === "user" ? "Ты" : "Консультант"}</b>
                <span className="min-w-0 break-words text-[11px] text-slate-400">
                  {message.created_at ? formatTimestamp.format(new Date(message.created_at))
                    : (message.sent_day || message.focus_date) && formatDay.format(new Date(message.sent_day || message.focus_date))}
                </span>
                {message.role === "assistant" && (
                  <span className="min-w-0 break-words text-[11px] text-slate-300">
                    {message.model === "training-week" || message.model === "coach-memory" ? "Ответ приложения"
                      : message.model ? `Модель: ${message.model}` : "Модель не записана"}
                  </span>
                )}
                {position === 0 && message.exchange_id && onDeleted && (
                  <button type="button" onClick={() => remove(message.exchange_id)} disabled={disabled || deleting !== null}
                    aria-label="Удалить вопрос и ответ" title="Удалить вопрос и ответ"
                    className="ml-auto grid size-7 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-white/10 disabled:opacity-50">
                    <X size={13} aria-hidden="true" />
                  </button>
                )}
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words">{
                message.role === "assistant" && (message.content?.trim() === "<" || toolProtocol.test(message.content))
                  ? "Ответ оборвался." : message.content
              }</p>
            </div>
          ))}
        </div>
      ))}
      {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
    </div>
  );
}

function OlderMessages({ day, active, disabled }) {
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
          <CoachMessages messages={group.messages} disabled={disabled}
            onDeleted={(id) => setDays((current) => current.map((entry) => ({
              ...entry, messages: entry.messages.filter((message) => message.exchange_id !== id),
            })).filter((entry) => entry.messages.length))} />
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

export default function CoachChatHistory({ day, active, disabled }) {
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
          <OlderMessages key={day} day={day} active={active && open} disabled={disabled} />
        </div>
      )}
    </section>
  );
}
