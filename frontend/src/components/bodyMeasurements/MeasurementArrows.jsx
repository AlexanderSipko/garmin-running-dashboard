import { useId, useLayoutEffect, useRef, useState } from "react";

export default function MeasurementArrows({ active }) {
  const overlay = useRef(null);
  const marker = useId();
  const [lines, setLines] = useState([]);

  useLayoutEffect(() => {
    const container = overlay.current.parentElement;
    function update() {
      const bounds = container.getBoundingClientRect();
      const fields = [...container.querySelectorAll("[data-measurement-field]")];
      setLines(fields.flatMap((field) => {
        const key = field.dataset.measurementField;
        const zone = container.querySelector(`[data-zone="${key}"]`);
        const matrix = zone?.getScreenCTM();
        if (!matrix) return [];
        const left = field.dataset.side === "left";
        const length = zone.getTotalLength();
        const start = zone.getPointAtLength(left ? 0 : length).matrixTransform(matrix);
        const target = field.getBoundingClientRect();
        return [{
          key,
          x1: start.x - bounds.left,
          y1: start.y - bounds.top,
          x2: (left ? target.right + 2 : target.left - 2) - bounds.left,
          y2: target.top + target.height / 2 - bounds.top,
        }];
      }));
    }

    const observer = new ResizeObserver(update);
    observer.observe(container);
    for (const element of container.querySelectorAll("[data-measurement-field], svg[role=img]")) {
      observer.observe(element);
    }
    update();
    return () => observer.disconnect();
  }, []);

  return (
    <svg ref={overlay} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
      <defs>
        <marker id={marker} viewBox="0 0 6 6" markerWidth="5" markerHeight="5" refX="5" refY="3" orient="auto">
          <path d="M1 1L5 3L1 5" fill="none" stroke="#849aa6" strokeWidth="1.2" />
        </marker>
      </defs>
      {lines.map(({ key, x1, y1, x2, y2 }) => (
        <path key={key} d={`M${x1} ${y1} C${(x1 + x2) / 2} ${y1},${(x1 + x2) / 2} ${y2},${x2} ${y2}`}
          fill="none" stroke={key === active ? "#ffc988" : "#849aa6"} strokeWidth={key === active ? 1.7 : 1}
          markerEnd={`url(#${marker})`} />
      ))}
    </svg>
  );
}
