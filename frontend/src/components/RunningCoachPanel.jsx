import SectionEyebrow from "./SectionEyebrow";
import { useState } from "react";
import { Bot, LoaderCircle, Send, Sparkles } from "lucide-react";
import useRunningCoach from "../hooks/useRunningCoach";

function RunningCoachPanel({
  period,
  periodStart,
  periodEnd,
  syncedAt,
  hasRealData,
}) {
  const [question, setQuestion] = useState("");
  const coach = useRunningCoach({
    period,
    periodStart,
    periodEnd,
    syncedAt,
    enabled: hasRealData,
  });

  const submitQuestion = async (event) => {
    event.preventDefault();
    const currentQuestion = question;
    setQuestion("");
    await coach.ask(currentQuestion);
  };

  return (
    <section className="running-coach-panel p-[18px] mb-[14px] [border:1px_solid_var(--border)] rounded-[11px] [background:var(--panel)] max-[460px]:py-[14px] px-[11px] text-[14px]">
      <header className="running-coach-heading flex items-center gap-[10px] pb-[13px] [border-bottom:1px_solid_var(--border)] [&_h2]:mt-[3px] mx-0 mb-0 [&_h2]:[font:600_15px_Manrope,_sans-serif]">
        <span className="coach-icon grid w-[36px] h-[36px] place-items-center rounded-[10px] [background:var(--accent-soft)] text-[color:var(--accent)]">
          <Bot size={18} />
        </span>
        <div>
          <SectionEyebrow>ИИ-ТРЕНЕР · GARMIN</SectionEyebrow>
          <h2 className="text-[17px]">Разбор и вопросы</h2>
        </div>
        {coach.totalTokens > 0 && (
          <span className="coach-token-total ml-auto text-[color:var(--muted)] text-[11px] tabular-nums">
            {coach.totalTokens.toLocaleString("ru-RU")} токенов
          </span>
        )}
        <span className={`coach-api-status flex-[0_0_auto] py-1 px-[7px] border border-[#49545b] rounded-full bg-[#20282d] text-[#aebbc1] text-[12px] font-semibold whitespace-nowrap${coach.error ? " has-error border-[#754845] bg-[#342120] text-[#f0aaa2]" : coach.summary || coach.messages.some((message) => message.role === "assistant") ? " is-online border-[#426d50] bg-[#1b3023] text-[#a8e0b5]" : ""}`}>
          {!coach.statusChecked
            ? "Проверяю API…"
            : coach.unavailable
              ? "Сервис недоступен"
              : !coach.enabled
                ? "Тренер отключён"
              : coach.error
                ? "Ошибка API"
                : coach.summary || coach.messages.some((message) => message.role === "assistant")
                  ? "API отвечает"
                  : coach.configured
                    ? "Ключ задан"
                    : "Ключ не задан"}
        </span>
      </header>

      {!coach.statusChecked ? (
        <div className={[
          "coach-key-help pt-4 px-0 pb-[3px] [&_b]:text-[13px] [&_p]:text-[color:var(--muted)]",
          "[&_p]:text-[11px] [&_p]:leading-[1.6] [&_small]:text-[color:var(--muted)] [&_small]:text-[11px]",
          "[&_small]:leading-[1.6] [&_p]:my-[7px] mx-0 [&_code]:py-[2px] px-1 [&_code]:rounded-[4px]",
          "[&_code]:[background:var(--bg)] [&_code]:text-[color:var(--accent)] [&_code]:text-[10px]",
        ].join(" ")}>
          <b>Проверяю подключение</b>
          <p>Получаю статус агента с backend.</p>
        </div>
      ) : coach.unavailable ? (
        <div className={[
          "coach-key-help pt-4 px-0 pb-[3px] [&_b]:text-[13px] [&_p]:text-[color:var(--muted)]",
          "[&_p]:text-[11px] [&_p]:leading-[1.6] [&_small]:text-[color:var(--muted)] [&_small]:text-[11px]",
          "[&_small]:leading-[1.6] [&_p]:my-[7px] mx-0 [&_code]:py-[2px] px-1 [&_code]:rounded-[4px]",
          "[&_code]:[background:var(--bg)] [&_code]:text-[color:var(--accent)] [&_code]:text-[10px]",
        ].join(" ")}>
          <b>Backend агента недоступен</b>
          <p>Проверь, что Docker-контейнеры проекта запущены.</p>
        </div>
      ) : !coach.enabled ? (
        <div className={[
          "coach-key-help pt-4 px-0 pb-[3px] [&_b]:text-[13px] [&_p]:text-[color:var(--muted)]",
          "[&_p]:text-[11px] [&_p]:leading-[1.6] [&_small]:text-[color:var(--muted)] [&_small]:text-[11px]",
          "[&_small]:leading-[1.6] [&_p]:my-[7px] mx-0 [&_code]:py-[2px] px-1 [&_code]:rounded-[4px]",
          "[&_code]:[background:var(--bg)] [&_code]:text-[color:var(--accent)] [&_code]:text-[10px]",
        ].join(" ")}>
          <b>ИИ-тренер временно отключён</b>
          <p>Во время разработки запросы к GigaChat не отправляются.</p>
        </div>
      ) : !coach.configured ? (
        <div className={[
          "coach-key-help pt-4 px-0 pb-[3px] [&_b]:text-[13px] [&_p]:text-[color:var(--muted)]",
          "[&_p]:text-[11px] [&_p]:leading-[1.6] [&_small]:text-[color:var(--muted)] [&_small]:text-[11px]",
          "[&_small]:leading-[1.6] [&_p]:my-[7px] mx-0 [&_code]:py-[2px] px-1 [&_code]:rounded-[4px]",
          "[&_code]:[background:var(--bg)] [&_code]:text-[color:var(--accent)] [&_code]:text-[10px]",
        ].join(" ")}>
          <b>Добавь API-ключ ИИ-провайдера</b>
          <p>
            Добавь ключ в локальный <code>.env</code> как{" "}
            <code>GIGACHAT_AUTH_KEY</code> в локальном <code>.env</code>, затем
            пересобери backend. Это ключ авторизации проекта GigaChat API; не
            access token. Ключ остаётся на бэкенде.
          </p>
          <small>
            Условия оплаты и лимиты зависят от выбранного API-провайдера.
          </small>
        </div>
      ) : !hasRealData ? (
        <div className={[
          "coach-key-help pt-4 px-0 pb-[3px] [&_b]:text-[13px] [&_p]:text-[color:var(--muted)]",
          "[&_p]:text-[11px] [&_p]:leading-[1.6] [&_small]:text-[color:var(--muted)] [&_small]:text-[11px]",
          "[&_small]:leading-[1.6] [&_p]:my-[7px] mx-0 [&_code]:py-[2px] px-1 [&_code]:rounded-[4px]",
          "[&_code]:[background:var(--bg)] [&_code]:text-[color:var(--accent)] [&_code]:text-[10px]",
        ].join(" ")}>
          <b>Сначала синхронизируй Garmin</b>
          <p>ИИ-тренер анализирует реальные тренировки за выбранный период.</p>
        </div>
      ) : (
        <>
          <div className="coach-summary pt-[14px] px-0 pb-3 [&_>_p]:my-[9px] mx-0 [&_>_p]:text-[color:var(--text)] [&_>_p]:text-[15px] [&_>_p]:leading-[1.65] max-[460px]:[&_>_p]:text-[14px]">
            <div className="coach-summary-title flex items-center gap-2 text-[color:var(--accent)] text-[12px] font-semibold [&_>_span]:flex [&_>_span]:items-center [&_>_span]:gap-[7px] [&_>_svg]:ml-auto">
              <span>
                <Sparkles size={15} /> Саммари выбранного периода
              </span>
              {coach.loadingSummary && (
                <LoaderCircle className="spin animate-spin" size={15} />
              )}
            </div>
            {coach.summary ? (
              <p>{coach.summary}</p>
            ) : (
              <p className="coach-placeholder [.coach-summary_>_p&]:text-[color:var(--muted)]">
                {coach.loadingSummary
                  ? "Анализирую тренировки…"
                  : "Саммари пока не готово."}
              </p>
            )}
            {coach.summaryUsage && (
              <small className="usage-line text-[color:var(--muted)] text-[10px]">
                Саммари: {coach.summaryUsage.total_tokens} токенов · модель{" "}
                {coach.model} · {coach.provider}
              </small>
            )}
            <button
              className="coach-refresh block p-0 mt-[9px] [border:0] [background:transparent] text-[color:var(--accent)] text-[11px] [&:disabled]:opacity-[0.6]"
              onClick={coach.refreshSummary}
              disabled={coach.loadingSummary}
              type="button"
            >
              {coach.summary ? "Обновить разбор" : "Получить разбор периода"}
            </button>
          </div>

          <div className="coach-messages flex flex-col gap-[9px] max-h-[350px] overflow-y-auto py-3 px-0 [border-top:1px_solid_var(--border)]" aria-live="polite">
            {coach.messages.map((message, index) => (
              <article className={`coach-message max-w-[88%] py-[10px] px-3 rounded-[9px] bg-[color:var(--bg)] [&_>_b]:text-[color:var(--accent)] [&_>_b]:text-[10px] [&_p]:my-1 [&_p]:whitespace-pre-wrap [&_>_small]:text-[color:var(--muted)] [&_>_small]:text-[9px] ${message.role === "user" ? "user self-end bg-[color:var(--accent-soft)]" : ""}`} key={index}>
                <b>{message.role === "user" ? "Ты" : "Тренер"}</b>
                <p>{message.content}</p>
                {message.usage && (
                  <small>
                    {message.usage.total_tokens} токенов в этом ответе
                  </small>
                )}
              </article>
            ))}
            {coach.sending && (
              <div className="coach-thinking flex items-center gap-[7px] text-[color:var(--muted)] text-[11px]">
                <LoaderCircle className="spin animate-spin" size={15} /> Думаю над ответом…
              </div>
            )}
          </div>

          <form className={[
            "coach-question-form flex gap-2 pt-3 [border-top:1px_solid_var(--border)] [&_input]:w-full",
            "[&_input]:min-w-0 [&_input]:py-[11px] px-3 [&_input]:[border:1px_solid_var(--border)]",
            "[&_input]:rounded-[8px] [&_input]:[outline:none] [&_input]:[background:var(--bg)]",
            "[&_input]:text-[color:var(--text)] [&_input]:[font:14px_'DM_Sans',_sans-serif]",
            "[&_input:focus]:border-[color:var(--accent)] [&_button]:grid [&_button]:w-[42px]",
            "[&_button]:[flex:0_0_42px] [&_button]:place-items-center [&_button]:[border:0]",
            "[&_button]:rounded-[8px] [&_button]:[background:var(--accent)] [&_button]:text-[color:var(--bg)]",
            "[&_button:disabled]:opacity-[0.45] [&_button:disabled]:cursor-not-allowed",
          ].join(" ")} onSubmit={submitQuestion}>
            <label className="visually-hidden absolute w-[1px] h-[1px] overflow-hidden [clip:rect(0,_0,_0,_0)] whitespace-nowrap [clip-path:inset(50%)]" htmlFor="coach-question">
              Вопрос ИИ-тренеру
            </label>
            <input
              id="coach-question"
              value={question}
              maxLength={1200}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Например: почему темп на лёгких пробежках изменился?"
            />
            <button
              disabled={!question.trim() || coach.sending}
              type="submit"
              aria-label="Отправить вопрос"
            >
              <Send size={16} />
            </button>
          </form>
          <p className="coach-privacy-note text-[color:var(--muted)] leading-[1.6] mt-2 mx-0 mb-0 text-[10px]">
            Сводки выбранного и предыдущего периода отправляются в{" "}
            {coach.provider || "настроенный API"}. Использованные токены
            показываются выше.
          </p>
        </>
      )}

      {coach.error && <p className="coach-error mt-[9px] mx-0 mb-0 text-[color:#e98c7c] text-[11px]">{coach.error}</p>}
    </section>
  );
}

export default RunningCoachPanel;
