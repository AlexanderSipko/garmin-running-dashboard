import { useEffect, useMemo, useRef, useState } from "react";
import { Focus, Layers2, MapPin, Minus, Plus } from "lucide-react";
import { fitRoute, mapFrame, mapScale, maxZoom, minZoom, panBy, projectRoute, tileSize, zoomAt } from "../lib/routeMap";

function drawRoute(context, points) {
  context.lineJoin = "round";
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (const { x, y } of points.slice(1)) context.lineTo(x, y);
  context.lineWidth = 7;
  context.strokeStyle = "#111b22";
  context.stroke();
  context.lineWidth = 4;
  context.strokeStyle = "#ffc17f";
  context.stroke();

  for (const [point, color] of [[points[0], "#82dba6"], [points.at(-1), "#f88b83"]]) {
    context.beginPath();
    context.arc(point.x, point.y, 5, 0, Math.PI * 2);
    context.fillStyle = color;
    context.fill();
    context.lineWidth = 2;
    context.strokeStyle = "#111b22";
    context.stroke();
  }
}

const controlClass = "grid size-11 place-items-center bg-[#18252c] text-[#e5ebee] hover:bg-[#2b3b42] focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-[#ffc17f] disabled:opacity-40";

function MarkerKey({ color, children }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-2 rounded-full ${color}`} aria-hidden="true" />{children}
    </span>
  );
}

export default function ActivityRouteMap({ route }) {
  const container = useRef(null);
  const canvas = useRef(null);
  const pointers = useRef(new Map());
  const pinchDistance = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [customView, setCustomView] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [showStreets, setShowStreets] = useState(false);
  const { width, height } = dimensions;
  const projected = useMemo(() => projectRoute(route), [route]);
  const fitted = useMemo(() => fitRoute(projected, width, height), [projected, width, height]);
  const view = customView || fitted;
  const frame = useMemo(
    () => view ? mapFrame(view, projected, width, height, showStreets) : null,
    [view, projected, width, height, showStreets]
  );
  const scaleBar = view && mapScale(view);

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      setDimensions({ width: Math.floor(entry.contentRect.width), height: Math.floor(entry.contentRect.height) });
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!frame) return;
    const surface = canvas.current;
    const scale = window.devicePixelRatio || 1;
    surface.width = Math.round(width * scale);
    surface.height = Math.round(height * scale);
    const context = surface.getContext("2d");
    if (!context) return;
    context.setTransform(scale, 0, 0, scale, 0, 0);
    drawRoute(context, frame.points);
  }, [frame, width, height]);

  function changeZoom(step, offsetX = 0, offsetY = 0) {
    if (view) setCustomView((current) => zoomAt(current || fitted, step, offsetX, offsetY));
  }

  function startPointer(event) {
    if (!view || event.button !== 0 || pointers.current.size >= 2) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const [first, second] = [...pointers.current.values()];
      pinchDistance.current = Math.hypot(first.x - second.x, first.y - second.y);
    }
    setDragging(true);
  }

  function movePointer(event) {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;

    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const [first, second] = [...pointers.current.values()];
      const distance = Math.hypot(first.x - second.x, first.y - second.y);
      const reference = pinchDistance.current;
      if (!reference || distance <= 0) return;
      const ratio = distance / reference;
      if (ratio > 1.45 || ratio < 0.69) {
        const bounds = event.currentTarget.getBoundingClientRect();
        changeZoom(ratio > 1 ? 1 : -1,
          (first.x + second.x) / 2 - bounds.left - width / 2,
          (first.y + second.y) / 2 - bounds.top - height / 2);
        pinchDistance.current = distance;
      }
      return;
    }

    const dx = event.clientX - previous.x;
    const dy = event.clientY - previous.y;
    setCustomView((current) => panBy(current || fitted, dx, dy));
  }

  function endPointer(event) {
    pointers.current.delete(event.pointerId);
    pinchDistance.current = null;
    if (!pointers.current.size) setDragging(false);
  }

  function handleKey(event) {
    if (!view || event.target !== event.currentTarget) return;
    const directions = { ArrowLeft: [45, 0], ArrowRight: [-45, 0], ArrowUp: [0, 45], ArrowDown: [0, -45] };
    if (directions[event.key]) {
      event.preventDefault();
      setCustomView((current) => panBy(current || fitted, ...directions[event.key]));
    } else if (["+", "=", "-", "0"].includes(event.key)) {
      event.preventDefault();
      if (event.key === "0") setCustomView(null);
      else changeZoom(event.key === "-" ? -1 : 1);
    }
  }

  return (
    <section className="mt-4 rounded-2xl border border-[#3b4b52] bg-linear-to-br from-[#27373e] to-[#1a242a] p-3 sm:p-4" aria-label="Маршрут тренировки">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h5 className="flex items-center gap-2 text-base font-bold">
          <MapPin size={18} className="text-[#ffc17f]" aria-hidden="true" /> Маршрут
        </h5>
        <button type="button" aria-pressed={showStreets} disabled={!view}
          onClick={() => setShowStreets(!showStreets)}
          className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold disabled:opacity-50 ${showStreets ? "border-[#9d754f] bg-[#413426] text-[#ffc17f]" : "border-[#46545b] text-[#d3dce0] hover:bg-[#26363d]"}`}>
          <Layers2 size={15} aria-hidden="true" /> {showStreets ? "Улицы включены" : "Показать улицы"}
        </button>
      </div>

      <div className="relative overflow-hidden rounded-xl border border-[#3b4b52]">
        <div ref={container} tabIndex={view ? 0 : undefined} role="region"
          aria-label="Карта маршрута. Используй стрелки для перемещения, плюс и минус для масштаба."
          onPointerDown={startPointer} onPointerMove={movePointer} onPointerUp={endPointer}
          onPointerCancel={endPointer} onLostPointerCapture={endPointer} onKeyDown={handleKey}
          className={`relative h-[250px] touch-none select-none overflow-hidden bg-[#16262d] [background-image:radial-gradient(#ffffff1c_1px,transparent_1px)] [background-size:20px_20px] sm:h-[310px] ${dragging ? "cursor-grabbing" : "cursor-grab"}`}>
          {frame?.tiles.map((tile) => (
            <img key={tile.key} src={tile.url} alt="" draggable={false} width={tileSize} height={tileSize}
              className="pointer-events-none absolute max-w-none opacity-85" style={{ left: tile.left, top: tile.top }} />
          ))}
          <canvas ref={canvas} className="pointer-events-none absolute inset-0 h-full w-full"
            role="img" aria-label="GPS-маршрут. Зелёная точка — старт, красная — финиш." />
        </div>

        <div className="absolute right-2 top-2 grid overflow-hidden rounded-xl border border-[#4a5b62] shadow-lg" aria-label="Масштаб карты">
          <button type="button" className={controlClass} aria-label="Приблизить" disabled={!view || view.zoom >= maxZoom}
            onClick={() => changeZoom(1)}><Plus size={18} /></button>
          <button type="button" className={`${controlClass} border-t border-[#4a5b62]`} aria-label="Отдалить"
            disabled={!view || view.zoom <= minZoom} onClick={() => changeZoom(-1)}><Minus size={18} /></button>
          <button type="button" className={`${controlClass} border-t border-[#4a5b62]`} aria-label="Показать весь маршрут"
            title="Показать весь маршрут" disabled={!customView} onClick={() => setCustomView(null)}><Focus size={18} /></button>
        </div>

        {scaleBar && (
          <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-[#18252c]/90 px-2 py-1 text-[10px] font-semibold text-white" aria-hidden="true">
            {scaleBar.value}
            <div className="h-1.5 border-x border-b border-white" style={{ width: scaleBar.width }} />
          </div>
        )}
        {showStreets && frame && (
          <a className="absolute bottom-0 right-0 rounded-tl bg-[#17252b]/95 px-1.5 py-0.5 text-[10px] text-white underline"
            href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#bbc8cd]">
        <MarkerKey color="bg-[#82dba6]">Старт</MarkerKey>
        <MarkerKey color="bg-[#f88b83]">Финиш</MarkerKey>
      </div>
    </section>
  );
}
