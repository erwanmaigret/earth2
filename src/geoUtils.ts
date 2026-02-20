/**
 * Approximate meters per degree at a given latitude (WGS84).
 * Latitude: ~111,320 m/degree (constant)
 * Longitude: ~111,320 * cos(lat) m/degree
 */
const METERS_PER_DEGREE_LAT = 111320;
const DEGREES_PER_METER_LAT = 1 / METERS_PER_DEGREE_LAT;

export function metersToLatitudeDegrees(meters: number): number {
  return meters * DEGREES_PER_METER_LAT;
}

export function metersToLongitudeDegrees(meters: number, latitudeDeg: number): number {
  const cosLat = Math.cos((latitudeDeg * Math.PI) / 180);
  return meters / (METERS_PER_DEGREE_LAT * cosLat);
}

export interface Bounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

/**
 * Returns the geographic bounds of a square centered at (lat, lon) with the given side length in meters.
 */
export function squareBounds(
  centerLat: number,
  centerLon: number,
  sideLengthMeters: number
): Bounds {
  const half = sideLengthMeters / 2;
  const latDelta = metersToLatitudeDegrees(half);
  const lonDelta = metersToLongitudeDegrees(half, centerLat);

  return {
    west: centerLon - lonDelta,
    south: centerLat - latDelta,
    east: centerLon + lonDelta,
    north: centerLat + latDelta,
  };
}
