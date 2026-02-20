import {
  Cartesian2,
  Cartesian3,
  Color,
  Ellipsoid,
  HeightReference,
  Math as CesiumMath,
  Rectangle,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Terrain,
  Viewer,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import "./style.css";
import {
  DEFAULT_GRID_CONFIG,
  insetBounds,
  latLonToTile,
  quadrantAt,
  quadrantBounds,
  tileBounds,
  tileIdToString,
  type TileGridConfig,
} from "./tileGrid";

const viewer = new Viewer("cesiumContainer", {
  terrain: Terrain.fromWorldTerrain(),
  useDefaultRenderLoop: true,
  animation: false,
  timeline: false,
  infoBox: false,
  selectionIndicator: false,
});

// Grid config: 36×72 = 2,592 tiles (~5° each). Bigger tiles, faster startup.
const gridConfig: TileGridConfig = { ...DEFAULT_GRID_CONFIG };
const TILE_GAP = 0.08; // 8% margin for top-level tiles (visible from far)

const TILE_COLOR = new Color(0.2, 0.6, 1.0, 0.65);

/** Smaller margin for deeper sub-tiles so they don't get too thin when zoomed in. */
function gapForDepth(depth: number): number {
  return Math.max(0.01, TILE_GAP * Math.pow(0.5, depth));
}

for (let row = 0; row < gridConfig.latCount; row++) {
  for (let col = 0; col < gridConfig.lonCount; col++) {
    const bounds = tileBounds(row, col, gridConfig, TILE_GAP);
    viewer.entities.add({
      id: tileIdToString({ row, col }),
      rectangle: {
        coordinates: Rectangle.fromDegrees(
          bounds.west,
          bounds.south,
          bounds.east,
          bounds.north
        ),
        fill: true,
        material: TILE_COLOR,
        heightReference: HeightReference.CLAMP_TO_GROUND,
      },
      show: true,
    });
  }
}

const SPLIT_DEPTH = 10; // Split 6 times: smaller tiles near click, one small hole

function addTileEntity(
  id: string,
  west: number,
  south: number,
  east: number,
  north: number
) {
  viewer.entities.add({
    id,
    rectangle: {
      coordinates: Rectangle.fromDegrees(west, south, east, north),
      fill: true,
      material: TILE_COLOR,
      heightReference: HeightReference.CLAMP_TO_GROUND,
    },
    show: true,
  });
}

// Click: split tile in 4, hole on clicked quadrant; or remove sub-tile
const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
handler.setInputAction((click: { position: { x: number; y: number } }) => {
  const position = Cartesian2.fromElements(click.position.x, click.position.y);
  const ray = viewer.camera.getPickRay(position);
  if (!ray) return;
  const globePosition = viewer.scene.globe.pick(ray, viewer.scene);
  if (!globePosition) return;

  const cartographic = Ellipsoid.WGS84.cartesianToCartographic(globePosition);
  const lat = (cartographic.latitude * 180) / Math.PI;
  const lon = (cartographic.longitude * 180) / Math.PI;
  const tile = latLonToTile(lat, lon, gridConfig);
  const baseId = tileIdToString(tile);
  const baseBoundsFull = tileBounds(tile.row, tile.col, gridConfig, 0);

  const baseEntity = viewer.entities.getById(baseId);
  if (baseEntity?.show) {
    // Unsplit tile: split from full cell (no margin), then apply gapForDepth to each child
    viewer.entities.remove(baseEntity);
    let bounds = { ...baseBoundsFull };
    const path: number[] = [];

    for (let level = 0; level < SPLIT_DEPTH; level++) {
      const holeQ = quadrantAt(lat, lon, bounds);
      for (let q = 0; q < 4; q++) {
        if (q === holeQ) continue;
        let b = quadrantBounds(bounds, q as 0 | 1 | 2 | 3);
        b = insetBounds(b, gapForDepth(level));
        const id = path.length ? `${baseId}_${path.join("_")}_${q}` : `${baseId}_${q}`;
        addTileEntity(id, b.west, b.south, b.east, b.north);
      }
      path.push(holeQ);
      bounds = quadrantBounds(bounds, holeQ as 0 | 1 | 2 | 3);
    }
    return;
  }

  // Already split: find leaf entity containing (lat, lon), then split it with remaining depth
  let bounds = { ...baseBoundsFull };
  const path: number[] = [];
  for (let level = 0; level < SPLIT_DEPTH; level++) {
    const q = quadrantAt(lat, lon, bounds);
    path.push(q);
    const id = `${baseId}_${path.join("_")}`;
    const entity = viewer.entities.getById(id);
    if (entity?.show) {
      const currentDepth = path.length;
      const remainingDepth = SPLIT_DEPTH - currentDepth;
      // bounds is still the parent quadrant; narrow to this tile's quadrant
      let tileBounds = quadrantBounds(bounds, q as 0 | 1 | 2 | 3);
      const prefix = `${id}_`;
      // Remove this tile and all its descendants so new split doesn't overlap
      viewer.entities.remove(entity);
      const toRemove: (typeof entity)[] = [];
      viewer.entities.values.forEach((e) => {
        if (e.id && typeof e.id === "string" && e.id.startsWith(prefix)) {
          toRemove.push(e);
        }
      });
      toRemove.forEach((e) => viewer.entities.remove(e));
      // Split only this tile's quadrant (remainingDepth) more times
      bounds = tileBounds;
      for (let d = 0; d < remainingDepth; d++) {
        const holeQ = quadrantAt(lat, lon, bounds);
        const depth = currentDepth + d;
        for (let qq = 0; qq < 4; qq++) {
          if (qq === holeQ) continue;
          let b = quadrantBounds(bounds, qq as 0 | 1 | 2 | 3);
          b = insetBounds(b, gapForDepth(depth));
          const subId = `${baseId}_${path.join("_")}_${qq}`;
          addTileEntity(subId, b.west, b.south, b.east, b.north);
        }
        path.push(holeQ);
        bounds = quadrantBounds(bounds, holeQ as 0 | 1 | 2 | 3);
      }
      return;
    }
    bounds = quadrantBounds(bounds, q as 0 | 1 | 2 | 3);
  }
}, ScreenSpaceEventType.LEFT_CLICK);

// Fly to user's location on startup (slow), or default view if unavailable
const FLY_DURATION = 5; // seconds
const DEFAULT_VIEW = {
  lon: -122.4,
  lat: 37.65,
  height: 8_000_000,
};

// Start from a far view so the fly-to-location animation is visible
viewer.camera.setView({
  destination: Cartesian3.fromDegrees(0, 20, 25_000_000),
  orientation: {
    heading: 0,
    pitch: CesiumMath.toRadians(-90),
  },
});

function flyToLocation(lon: number, lat: number, height: number = 8_000_000) {
  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(lon, lat, height),
    orientation: {
      heading: 0,
      pitch: CesiumMath.toRadians(-45),
    },
    duration: FLY_DURATION,
  });
}

function tryGeolocation() {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    flyToLocation(DEFAULT_VIEW.lon, DEFAULT_VIEW.lat, DEFAULT_VIEW.height);
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { longitude, latitude } = pos.coords;
      flyToLocation(longitude, latitude);
    },
    () => {
      flyToLocation(DEFAULT_VIEW.lon, DEFAULT_VIEW.lat, DEFAULT_VIEW.height);
    },
    {
      enableHighAccuracy: true,
      timeout: 15_000,
      maximumAge: 60_000,
    }
  );
}

// Slight delay so the viewer and tiles are ready, then request location and fly
setTimeout(tryGeolocation, 500);
