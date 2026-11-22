import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin } from "lucide-react";

const tileSize = 256;
const mercatorLimit = 85.05112878;

function project([latitude, longitude]) {
  const lat = Math.max(-mercatorLimit, Math.min(latitude, mercatorLimit)) * Math.PI / 180;
  return {
    x: (longitude + 180) / 360,
    y: (1 - Math.asinh(Math.tan(lat)) / Math.PI) / 2,
  };
}

function fitRoute(route, width, height) {
  if (width < 80 || height < 80) return null;

  const projected = route.map(project);
  const originX = projected[0].x;
  const points = projected.map(({ x, y }) => ({ x: x - Math.round(x - originX), y }));
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  if (minX === maxX && minY === maxY) return null;

  const fitWidth = (width - 56) / Math.max(maxX - minX, 1e-9);
  const fitHeight = (height - 56) / Math.max(maxY - minY, 1e-9);
  const zoom = Math.max(0, Math.min(17, Math.floor(Math.log2(Math.min(fitWidth, fitHeight) / tileSize))));
  const tileCount = 2 ** zoom;
  const worldSize = tileCount * tileSize;
  const left = (minX + maxX) * worldSize / 2 - width / 2;
  const top = (minY + maxY) * worldSize / 2 - height / 2;
  const tiles = [];

  for (let x = Math.floor(left / tileSize); x < Math.ceil((left + width) / tileSize); x += 1) {
    for (let y = Math.floor(top / tileSize); y < Math.ceil((top + height) / tileSize); y += 1) {
      if (y < 0 || y >= tileCount) continue;
      const wrappedX = ((x % tileCount) + tileCount) % tileCount;
      tiles.push({
        key: `${x}:${y}`,
        url: `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${y}.png`,
        left: x * tileSize - left,
        top: y * tileSize - top,
      });
    }
  }

  return {
    tiles,
    points: points.map(({ x, y }) => ({ x: x * worldSize - left, y: y * worldSize - top })),
  };
}

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

export default function ActivityRouteMap({ route }) {
  const container = useRef(null);
  const canvas = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [showStreets, setShowStreets] = useState(false);
  const { width, height } = dimensions;
  const map = useMemo(() => fitRoute(route, width, height), [route, width, height]);

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      setDimensions({ width: Math.floor(entry.contentRect.width), height: Math.floor(entry.contentRect.height) });
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!map) return;
    const surface = canvas.current;
    const scale = window.devicePixelRatio || 1;
    surface.width = Math.round(width * scale);
    surface.height = Math.round(height * scale);
    const context = surface.getContext("2d");
    if (!context) return;
    context.setTransform(scale, 0, 0, scale, 0, 0);
    drawRoute(context, map.points);
  }, [map, width, height]);

  return (
    <section className="mt-4 rounded-xl border border-[#34424a] bg-[#202a30] p-3" aria-label="Маршрут тренировки">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h5 className="flex items-center gap-1.5 text-sm font-semibold"><MapPin size={16} aria-hidden="true" /> Маршрут</h5>
        <button type="button" aria-pressed={showStreets} disabled={!map}
          onClick={() => setShowStreets(!showStreets)}
          className="min-h-9 rounded-lg border border-[#46545b] px-2.5 text-xs font-semibold hover:bg-[#26363d] disabled:opacity-50">
          {showStreets ? "Скрыть улицы" : "Показать улицы"}
        </button>
      </div>
      <div ref={container}
        className="relative h-[220px] overflow-hidden rounded-lg bg-[#17252b] [background-image:linear-gradient(#ffffff0d_1px,transparent_1px),linear-gradient(90deg,#ffffff0d_1px,transparent_1px)] [background-size:24px_24px]">
        {showStreets && map?.tiles.map((tile) => (
          <img key={tile.key} src={tile.url} alt="" aria-hidden="true" width={tileSize} height={tileSize}
            className="absolute max-w-none opacity-80" style={{ left: tile.left, top: tile.top }} />
        ))}
        <canvas ref={canvas} className="pointer-events-none absolute inset-0 h-full w-full"
          role="img" aria-label="GPS-маршрут. Зелёная точка — старт, красная — финиш." />
        {showStreets && map && (
          <a className="absolute bottom-0 right-0 rounded-tl bg-[#17252b] px-1.5 py-0.5 text-[10px] text-white underline"
            href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a>
        )}
      </div>
    </section>
  );
}
