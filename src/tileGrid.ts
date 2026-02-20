/**
 * Global tile grid system covering the whole Earth.
 * Tiles are identified by (row, col) indices.
 */

export interface TileId {
  row: number;
  col: number;
}

export function tileIdToString(tile: TileId): string {
  return `tile_${tile.row}_${tile.col}`;
}

export function parseTileId(id: string): TileId | null {
  const match = id.match(/^tile_(\d+)_(\d+)$/);
  if (!match) return null;
  return {
    row: parseInt(match[1], 10),
    col: parseInt(match[2], 10),
  };
}

export interface TileGridConfig {
  /** Number of latitudinal divisions (rows). Default 90 = 2° per tile. */
  latCount: number;
  /** Number of longitudinal divisions (cols). Default 180 = 2° per tile. */
  lonCount: number;
}

export const DEFAULT_GRID_CONFIG: TileGridConfig = {
  latCount: 36,
  lonCount: 72,
};

/**
 * Returns the geographic bounds [west, south, east, north] in degrees for a tile.
 * @param gapFraction - Fraction of each tile dimension to leave as gap on each side (0–1). e.g. 0.08 = 8% margin each side = visible border between tiles.
 */
export function tileBounds(
  row: number,
  col: number,
  config: TileGridConfig = DEFAULT_GRID_CONFIG,
  gapFraction: number = 0
): { west: number; south: number; east: number; north: number } {
  const latStep = 180 / config.latCount;
  const lonStep = 360 / config.lonCount;

  let south = -90 + row * latStep;
  let north = south + latStep;
  let west = -180 + col * lonStep;
  let east = west + lonStep;

  if (gapFraction > 0) {
    const marginLon = lonStep * gapFraction;
    const marginLat = latStep * gapFraction;
    west += marginLon / 2;
    east -= marginLon / 2;
    south += marginLat / 2;
    north -= marginLat / 2;
  }

  return { west, south, east, north };
}

export type Bounds = { west: number; south: number; east: number; north: number };

/**
 * Returns a copy of bounds inset by gapFraction on each side (for margins between tiles).
 */
export function insetBounds(bounds: Bounds, gapFraction: number): Bounds {
  const w = bounds.east - bounds.west;
  const h = bounds.north - bounds.south;
  const marginLon = w * (gapFraction / 2);
  const marginLat = h * (gapFraction / 2);
  return {
    west: bounds.west + marginLon,
    south: bounds.south + marginLat,
    east: bounds.east - marginLon,
    north: bounds.north - marginLat,
  };
}

/**
 * Returns bounds for one quadrant of a rectangle. Quadrant: 0=SW, 1=SE, 2=NW, 3=NE.
 */
export function quadrantBounds(
  bounds: Bounds,
  quadrant: 0 | 1 | 2 | 3
): Bounds {
  const midLon = (bounds.west + bounds.east) / 2;
  const midLat = (bounds.south + bounds.north) / 2;
  switch (quadrant) {
    case 0:
      return { west: bounds.west, south: bounds.south, east: midLon, north: midLat };
    case 1:
      return { west: midLon, south: bounds.south, east: bounds.east, north: midLat };
    case 2:
      return { west: bounds.west, south: midLat, east: midLon, north: bounds.north };
    case 3:
      return { west: midLon, south: midLat, east: bounds.east, north: bounds.north };
  }
}

/**
 * Returns which quadrant (0=SW, 1=SE, 2=NW, 3=NE) contains the given point.
 */
export function quadrantAt(
  lat: number,
  lon: number,
  bounds: Bounds
): 0 | 1 | 2 | 3 {
  const midLon = (bounds.west + bounds.east) / 2;
  const midLat = (bounds.south + bounds.north) / 2;
  const north = lat >= midLat ? 1 : 0;
  const east = lon >= midLon ? 1 : 0;
  return ((north << 1) | east) as 0 | 1 | 2 | 3;
}

/**
 * Returns the tile (row, col) containing the given lat/lon in degrees.
 */
export function latLonToTile(
  lat: number,
  lon: number,
  config: TileGridConfig = DEFAULT_GRID_CONFIG
): TileId {
  const latStep = 180 / config.latCount;
  const lonStep = 360 / config.lonCount;

  const row = Math.min(
    Math.floor((lat + 90) / latStep),
    config.latCount - 1
  );
  const col = Math.min(
    Math.floor((lon + 180) / lonStep),
    config.lonCount - 1
  );

  return { row: Math.max(0, row), col: Math.max(0, col) };
}
