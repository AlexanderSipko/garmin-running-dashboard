import SectionEyebrow from "../components/SectionEyebrow";
import { COMMON_DISTANCES } from "../lib/paceCalculator";

const selectedButtonClassName = [
  "selected [.style-options_button&]:border-[color:var(--accent)]",
  "[.style-options_button&]:[box-shadow:0_0_0_1px_color-mix(in_srgb,_var(--accent)_23%,_transparent)]",
  "[.distance-presets_button&]:border-[color:var(--accent)]",
  "[.distance-presets_button&]:[background:var(--accent-soft)]",
  "[.distance-presets_button&]:text-[color:var(--accent)]",
  "[.calculator-mode_button&]:border-[color:var(--accent)]",
  "[.calculator-mode_button&]:[background:var(--accent-soft)]",
  "[.calculator-mode_button&]:text-[color:var(--accent)]",
  "[.year-month-card&]:border-[color:var(--accent)]",
  "[.year-month-card&]:[background:var(--accent-soft)]",
].join(" ");

function CalculatorInputs({
  distanceKm,
  setDistanceKm,
  mode,
  setMode,
  paceMinutes,
  setPaceMinutes,
  paceSeconds,
  setPaceSeconds,
  finishHours,
  setFinishHours,
  finishMinutes,
  setFinishMinutes,
  finishSeconds,
  setFinishSeconds,
}) {
  const updateDistance = (value) => {
    const distance = Number(value);
    if (Number.isFinite(distance)) setDistanceKm(distance);
  };

  return (
    <section className="calculator-inputs p-[17px] [border:1px_solid_var(--border)] rounded-[11px] [background:var(--panel)]">
      <div className="calculator-card-heading [&_h2]:mt-1 mx-0 mb-[14px] [&_h2]:[font:600_14px_Manrope,_sans-serif]">
        <SectionEyebrow>ПАРАМЕТРЫ РАСЧЁТА</SectionEyebrow>
        <h2>Задай дистанцию и цель</h2>
      </div>

      <label className={[
        "calculator-field flex flex-col gap-[6px] text-[color:var(--muted)] text-[10px] [&_input]:w-full",
        "[&_input]:min-h-[39px] [&_input]:py-2 px-[10px] [&_input]:[border:1px_solid_var(--border)]",
        "[&_input]:rounded-[7px] [&_input]:[outline:none] [&_input]:[background:var(--bg)]",
        "[&_input]:text-[color:var(--text)] [&_input]:[font:600_13px_'DM_Sans',_sans-serif]",
        "[&_input:focus]:border-[color:var(--accent)]",
      ].join(" ")}>
        <span>Дистанция, км</span>
        <input
          type="number"
          min="0.1"
          max="200"
          step="0.1"
          value={distanceKm}
          onChange={(event) => updateDistance(event.target.value)}
        />
      </label>

      <div className="distance-presets flex flex-wrap gap-[6px] mt-[9px] [&_button]:py-[7px] px-[9px] [&_button]:[border:1px_solid_var(--border)] [&_button]:rounded-[6px] [&_button]:[background:var(--bg)] [&_button]:text-[color:var(--muted)] [&_button]:text-[9px]" aria-label="Популярные дистанции">
        {COMMON_DISTANCES.map((preset) => (
          <button
            key={preset.value}
            className={distanceKm === preset.value ? selectedButtonClassName : ""}
            onClick={() => setDistanceKm(preset.value)}
            type="button"
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className={[
        "calculator-mode flex flex-wrap gap-[6px] mt-[9px] [&_button]:py-[7px] px-[9px]",
        "[&_button]:[border:1px_solid_var(--border)] [&_button]:rounded-[6px]",
        "[&_button]:[background:var(--bg)] [&_button]:text-[color:var(--muted)] [&_button]:text-[9px]",
        "mt-[15px] mx-0 mb-3 [&_button]:[flex:1] [&_button]:min-h-[35px]",
      ].join(" ")} role="group" aria-label="Способ расчёта">
        <button
          className={mode === "pace" ? selectedButtonClassName : ""}
          onClick={() => setMode("pace")}
          type="button"
        >
          Знаю темп
        </button>
        <button
          className={mode === "time" ? selectedButtonClassName : ""}
          onClick={() => setMode("time")}
          type="button"
        >
          Знаю время
        </button>
      </div>

      {mode === "pace" ? (
        <div className="calculator-field-group grid grid-cols-[1fr_1fr] gap-2 [&.three-fields]:grid-cols-[repeat(3,_1fr)]">
          <label className={[
            "calculator-field flex flex-col gap-[6px] text-[color:var(--muted)] text-[10px] [&_input]:w-full",
            "[&_input]:min-h-[39px] [&_input]:py-2 px-[10px] [&_input]:[border:1px_solid_var(--border)]",
            "[&_input]:rounded-[7px] [&_input]:[outline:none] [&_input]:[background:var(--bg)]",
            "[&_input]:text-[color:var(--text)] [&_input]:[font:600_13px_'DM_Sans',_sans-serif]",
            "[&_input:focus]:border-[color:var(--accent)]",
          ].join(" ")}>
            <span>Целевой темп, мин/км</span>
            <input
              type="number"
              min="1"
              max="59"
              value={paceMinutes}
              onChange={(event) => setPaceMinutes(Number(event.target.value))}
            />
          </label>
          <label className={[
            "calculator-field flex flex-col gap-[6px] text-[color:var(--muted)] text-[10px] [&_input]:w-full",
            "[&_input]:min-h-[39px] [&_input]:py-2 px-[10px] [&_input]:[border:1px_solid_var(--border)]",
            "[&_input]:rounded-[7px] [&_input]:[outline:none] [&_input]:[background:var(--bg)]",
            "[&_input]:text-[color:var(--text)] [&_input]:[font:600_13px_'DM_Sans',_sans-serif]",
            "[&_input:focus]:border-[color:var(--accent)]",
          ].join(" ")}>
            <span>Секунды</span>
            <input
              type="number"
              min="0"
              max="59"
              value={paceSeconds}
              onChange={(event) => setPaceSeconds(Number(event.target.value))}
            />
          </label>
        </div>
      ) : (
        <div className="calculator-field-group three-fields grid grid-cols-[1fr_1fr] gap-2 [&.three-fields]:grid-cols-[repeat(3,_1fr)] [.calculator-field-group&]:grid-cols-[repeat(3,_1fr)]">
          <NumberField
            label="Часы"
            value={finishHours}
            onChange={setFinishHours}
          />
          <NumberField
            label="Минуты"
            value={finishMinutes}
            onChange={setFinishMinutes}
          />
          <NumberField
            label="Секунды"
            value={finishSeconds}
            onChange={setFinishSeconds}
          />
        </div>
      )}
    </section>
  );
}

function NumberField({ label, value, onChange }) {
  return (
    <label className={[
      "calculator-field flex flex-col gap-[6px] text-[color:var(--muted)] text-[10px] [&_input]:w-full",
      "[&_input]:min-h-[39px] [&_input]:py-2 px-[10px] [&_input]:[border:1px_solid_var(--border)]",
      "[&_input]:rounded-[7px] [&_input]:[outline:none] [&_input]:[background:var(--bg)]",
      "[&_input]:text-[color:var(--text)] [&_input]:[font:600_13px_'DM_Sans',_sans-serif]",
      "[&_input:focus]:border-[color:var(--accent)]",
    ].join(" ")}>
      <span>{label}</span>
      <input
        type="number"
        min="0"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export default CalculatorInputs;
