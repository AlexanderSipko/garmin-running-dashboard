import SectionEyebrow from "../components/SectionEyebrow";
import { formatClock } from "../lib/paceCalculator";

function SplitTable({ splits }) {
  return (
    <section className="calculator-table-card p-[17px] [border:1px_solid_var(--border)] rounded-[11px] [background:var(--panel)] mb-[10px]">
      <div className="calculator-card-heading [&_h2]:mt-1 mx-0 mb-[14px] [&_h2]:[font:600_14px_Manrope,_sans-serif]">
        <SectionEyebrow>РАСКЛАДКА ДИСТАНЦИИ</SectionEyebrow>
        <h2>Ориентиры по километрам</h2>
      </div>
      <div className="calculator-table-wrap overflow-x-auto">
        <table className={[
          "calculator-table w-full border-collapse text-[10px] whitespace-nowrap [&_th]:py-[10px] px-2",
          "[&_th]:[border-top:1px_solid_var(--border)] [&_th]:text-left [&_td]:py-[10px] px-2",
          "[&_td]:[border-top:1px_solid_var(--border)] [&_td]:text-left [&_th]:text-[color:var(--muted)]",
          "[&_th]:text-[8px] [&_th]:font-semibold [&_th]:tracking-[0.7px] [&_td]:text-[color:var(--text)]",
        ].join(" ")}>
          <thead>
            <tr>
              <th>Отрезок</th>
              <th>Дистанция</th>
              <th>Время отрезка</th>
              <th>Общее время</th>
            </tr>
          </thead>
          <tbody>
            {splits.map((split, index) => (
              <tr key={`${split.label}-${index}`}>
                <td>{split.label}</td>
                <td>{split.distanceKm.toLocaleString("ru-RU")} км</td>
                <td>{formatClock(split.segmentSeconds)}</td>
                <td>{formatClock(split.elapsedSeconds)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default SplitTable;
