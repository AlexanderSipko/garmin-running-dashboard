import { useEffect, useState } from "react";
import { ScanLine, Trash2 } from "lucide-react";

const dateLabel = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric" });

export default function ActivityCoachAnalysis({ activity, onReview }) {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const path = `/api/coach/activity-analysis/${activity.id}`;

  useEffect(() => {
    const controller = new AbortController();
    fetch(path, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then(({ analysis }) => { if (!controller.signal.aborted) setAnalysis(analysis); })
      .catch(() => { if (!controller.signal.aborted) setError("Не удалось загрузить сохранённый разбор."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [path]);

  async function remove() {
    if (!window.confirm("Удалить сохранённый разбор из карточки тренировки? Переписка останется в чате.")) return;
    setDeleting(true);
    setError("");
    try {
      const response = await fetch(path, { method: "DELETE" });
      if (!response.ok) throw new Error();
      setAnalysis(null);
    } catch {
      setError("Не удалось удалить разбор. Попробуй ещё раз.");
    } finally {
      setDeleting(false);
    }
  }

  if (!analysis && !onReview && !error) return null;

  return (
    <section className="mt-3 grid gap-2 rounded-xl border border-[#415157] bg-[#1b282f] p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-[#f3bc7f]">
          <ScanLine size={16} aria-hidden="true" /> Разбор ИИ
        </h3>
        {analysis && <button type="button" disabled={deleting} title="Удалить разбор" aria-label="Удалить сохранённый разбор"
          onClick={remove} className="grid size-9 place-items-center rounded-lg border border-rose-300/30 text-rose-300 hover:bg-rose-400/15 disabled:opacity-50">
          <Trash2 size={15} aria-hidden="true" />
        </button>}
      </div>
      {analysis && <>
        <small className="flex flex-wrap gap-x-2 text-slate-400">
          <span>{analysis.model}{analysis.model_preset === "openai-light" ? " · Light" : analysis.model_preset === "openai" ? " · Medium" : ""}</span>
          {analysis.created_at && <time dateTime={analysis.created_at}>{dateLabel.format(new Date(analysis.created_at))}</time>}
        </small>
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{analysis.answer}</p>
      </>}
      {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
      {onReview && <button type="button" aria-haspopup="dialog" disabled={loading || deleting}
        onClick={() => { setError(""); onReview(activity, setAnalysis); }}
        className="min-h-10 w-fit rounded-lg border border-[#6f5540] bg-[#302820] px-3 text-sm font-semibold text-[#f3bc7f] hover:bg-[#413426] disabled:opacity-50">
        {analysis ? "Проанализировать заново" : "Разобрать тренировку"}
      </button>}
    </section>
  );
}
