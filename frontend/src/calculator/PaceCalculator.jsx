import SectionEyebrow from "../components/SectionEyebrow";
import { useMemo, useState } from "react";
import CalculatorInputs from "./CalculatorInputs";
import CalculatorResults from "./CalculatorResults";
import PaceVariants from "./PaceVariants";
import SplitTable from "./SplitTable";
import { calculateSplits } from "../lib/paceCalculator";

function PaceCalculator() {
  const [distanceKm, setDistanceKm] = useState(10);
  const [mode, setMode] = useState("pace");
  const [paceMinutes, setPaceMinutes] = useState(5);
  const [paceSeconds, setPaceSeconds] = useState(30);
  const [finishHours, setFinishHours] = useState(0);
  const [finishMinutes, setFinishMinutes] = useState(55);
  const [finishSeconds, setFinishSeconds] = useState(0);

  const validDistance = Math.max(0, Number(distanceKm) || 0);
  const enteredPace = Math.max(0, paceMinutes * 60 + paceSeconds);
  const enteredTime = finishHours * 3600 + finishMinutes * 60 + finishSeconds;
  const finishTime =
    mode === "pace" ? enteredPace * validDistance : enteredTime;
  const paceSecondsPerKm =
    mode === "pace"
      ? enteredPace
      : validDistance > 0
      ? enteredTime / validDistance
      : 0;
  const splits = useMemo(
    () => calculateSplits(validDistance, paceSecondsPerKm),
    [validDistance, paceSecondsPerKm]
  );

  return (
    <section className="pace-calculator-page pt-[18px]">
      <header className="calculator-page-heading mb-[18px] [&_h1]:my-[6px] mx-0 [&_h1]:[font:700_28px_Manrope,_sans-serif] [&_h1]:tracking-[-1px] [&_p]:max-w-[560px] [&_p]:m-0 [&_p]:text-[color:var(--muted)] [&_p]:text-[11px] [&_p]:leading-[1.6]">
        <SectionEyebrow>ИНСТРУМЕНТ ДЛЯ ТРЕНИРОВОК</SectionEyebrow>
        <h1>Калькулятор темпа</h1>
        <p>
          Рассчитай время на дистанции или темп для своей цели и посмотри
          ориентиры по каждому километру.
        </p>
      </header>

      <div className="calculator-top-grid grid grid-cols-[1fr_1fr] gap-[10px] mb-[10px] max-[760px]:grid-cols-[1fr]">
        <CalculatorInputs
          distanceKm={distanceKm}
          setDistanceKm={setDistanceKm}
          mode={mode}
          setMode={setMode}
          paceMinutes={paceMinutes}
          setPaceMinutes={setPaceMinutes}
          paceSeconds={paceSeconds}
          setPaceSeconds={setPaceSeconds}
          finishHours={finishHours}
          setFinishHours={setFinishHours}
          finishMinutes={finishMinutes}
          setFinishMinutes={setFinishMinutes}
          finishSeconds={finishSeconds}
          setFinishSeconds={setFinishSeconds}
        />
        <CalculatorResults
          distanceKm={validDistance}
          paceSecondsPerKm={paceSecondsPerKm}
          finishSeconds={finishTime}
        />
      </div>

      <SplitTable splits={splits} />
      <PaceVariants
        distanceKm={validDistance}
        paceSecondsPerKm={paceSecondsPerKm}
      />
    </section>
  );
}

export default PaceCalculator;
