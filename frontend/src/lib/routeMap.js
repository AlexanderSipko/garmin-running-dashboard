export const tileSize = 256;
export const minZoom = 0;
export const maxZoom = 19;

const mercatorLimit = 85.05112878;
const earthEquatorMeters = 40075016.686;
const tileUrl = import.meta.env.VITE_MAP_TILES_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export function projectRoute(route) {
  const points = route.map(([latitude, longitude]) => {
    const lat = Math.max(-mercatorLimit, Math.min(latitude, mercatorLimit)) * Math.PI / 180;
    return {
      x: (longitude + 180) / 360,
      y: (1 - Math.asinh(Math.tan(lat)) / Math.PI) / 2,
    };
  });
  const origin = points[0]?.x;
  return points.map(({ x, y }) => ({ x: x - Math.round(x - origin), y }));
}

export function worldSize(zoom) {
  return tileSize * 2 ** zoom;
}

export function fitRoute(points, width, height) {
  if (points.length < 2 || width < 80 || height < 80) return null;
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  if (minX === maxX && minY === maxY) return null;

  const fitWidth = (width - 56) / Math.max(maxX - minX, 1e-9);
  const fitHeight = (height - 56) / Math.max(maxY - minY, 1e-9);
  const zoom = Math.max(minZoom, Math.min(17, Math.floor(Math.log2(Math.min(fitWidth, fitHeight) / tileSize))));
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, zoom };
}

export function zoomAt(view, step, offsetX = 0, offsetY = 0) {
  const zoom = Math.max(minZoom, Math.min(maxZoom, view.zoom + step));
  if (zoom === view.zoom) return view;
  const difference = 1 / worldSize(view.zoom) - 1 / worldSize(zoom);
  return {
    x: view.x + offsetX * difference,
    y: Math.min(1, Math.max(0, view.y + offsetY * difference)),
    zoom,
  };
}

export function panBy(view, dx, dy) {
  const scale = worldSize(view.zoom);
  return { ...view, x: view.x - dx / scale, y: Math.min(1, Math.max(0, view.y - dy / scale)) };
}

export function mapFrame(view, points, width, height, showStreets) {
  const scale = worldSize(view.zoom);
  const left = view.x * scale - width / 2;
  const top = view.y * scale - height / 2;
  const tiles = [];
  if (showStreets) {
    const tileCount = 2 ** view.zoom;
    for (let x = Math.floor(left / tileSize); x < Math.ceil((left + width) / tileSize); x += 1) {
      for (let y = Math.floor(top / tileSize); y < Math.ceil((top + height) / tileSize); y += 1) {
        if (y < 0 || y >= tileCount) continue;
        const wrappedX = ((x % tileCount) + tileCount) % tileCount;
        tiles.push({
          key: `${view.zoom}:${x}:${y}`,
          url: tileUrl.replace("{z}", view.zoom).replace("{x}", wrappedX).replace("{y}", y),
          left: x * tileSize - left,
          top: y * tileSize - top,
        });
      }
    }
  }
  return {
    tiles,
    points: points.map(({ x, y }) => ({ x: x * scale - left, y: y * scale - top })),
  };
}

export function mapScale(view) {
  const latitudeCosine = 1 / Math.cosh(Math.PI * (1 - 2 * view.y));
  const metersPerPixel = earthEquatorMeters * latitudeCosine / worldSize(view.zoom);
  const target = metersPerPixel * 78;
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const meters = (target >= 5 * magnitude ? 5 : target >= 2 * magnitude ? 2 : 1) * magnitude;
  const value = meters >= 1000 ? `${meters / 1000} км` : `${meters} м`;
  return { width: meters / metersPerPixel, value };
}
