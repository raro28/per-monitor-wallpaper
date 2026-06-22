export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MonitorGeom {
  connector: string;
  geometry: Rect;
}

export interface Placed {
  connector: string;
  rect: Rect;
}

export interface Arrangement {
  scale: number;
  tiles: Placed[];
}

/**
 * Map real monitor geometries into an areaW x areaH box: translate so the
 * bounding box starts at origin, scale uniformly to fit, then center.
 */
export function computeArrangement(monitors: MonitorGeom[], areaW: number, areaH: number): Arrangement {
  if (monitors.length === 0) return { scale: 1, tiles: [] };

  const minX = Math.min(...monitors.map((m) => m.geometry.x));
  const minY = Math.min(...monitors.map((m) => m.geometry.y));
  const maxX = Math.max(...monitors.map((m) => m.geometry.x + m.geometry.width));
  const maxY = Math.max(...monitors.map((m) => m.geometry.y + m.geometry.height));
  const bboxW = maxX - minX;
  const bboxH = maxY - minY;

  const scale = Math.min(areaW / bboxW, areaH / bboxH);
  const offsetX = (areaW - bboxW * scale) / 2;
  const offsetY = (areaH - bboxH * scale) / 2;

  const tiles = monitors.map((m) => ({
    connector: m.connector,
    rect: {
      x: offsetX + (m.geometry.x - minX) * scale,
      y: offsetY + (m.geometry.y - minY) * scale,
      width: m.geometry.width * scale,
      height: m.geometry.height * scale,
    },
  }));

  return { scale, tiles };
}
