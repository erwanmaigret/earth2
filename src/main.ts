import {
  Camera,
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

// Match our initial "far view" so no built-in default-view animation overrides the geolocation flyTo
Camera.DEFAULT_VIEW_RECTANGLE = Rectangle.fromDegrees(-180, -90, 180, 90);
Camera.DEFAULT_VIEW_FACTOR = 0.5;
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

/** Remove or split the tile at (lat, lon) — same as a click on that point. */
function removeOrSplitTileAt(lat: number, lon: number) {
  const tile = latLonToTile(lat, lon, gridConfig);
  const baseId = tileIdToString(tile);
  const baseBoundsFull = tileBounds(tile.row, tile.col, gridConfig, 0);

  const baseEntity = viewer.entities.getById(baseId);
  if (baseEntity?.show) {
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
      let tileBounds = quadrantBounds(bounds, q as 0 | 1 | 2 | 3);
      const prefix = `${id}_`;
      viewer.entities.remove(entity);
      const toRemove: (typeof entity)[] = [];
      viewer.entities.values.forEach((e) => {
        if (e.id && typeof e.id === "string" && e.id.startsWith(prefix)) {
          toRemove.push(e);
        }
      });
      toRemove.forEach((e) => viewer.entities.remove(e));
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
  removeOrSplitTileAt(lat, lon);
}, ScreenSpaceEventType.LEFT_CLICK);

// Fly to user's location on startup (slow), or default view if unavailable
const FLY_DURATION = 5; // seconds
const DEFAULT_VIEW = {
  lon: -122.4,
  lat: 37.65,
  height: 5_000_000,
};

const statusEl = document.getElementById("locationStatus");

function setLocationStatus(msg: string, fadeAfterMs?: number) {
  if (!statusEl) return;
  statusEl.textContent = msg;
  statusEl.classList.remove("fade");
  if (fadeAfterMs != null) {
    setTimeout(() => statusEl.classList.add("fade"), fadeAfterMs);
  }
}

// Camera already at far view (DEFAULT_VIEW_RECTANGLE above). No setView here so nothing overrides the upcoming flyTo.

// Height above ellipsoid in meters. 500 m for a close view of the ground.
const LOCATION_VIEW_HEIGHT = 500;

function flyToLocation(
  lon: number,
  lat: number,
  height: number = LOCATION_VIEW_HEIGHT,
  removeTileAfterFly?: boolean
) {
  const destination = Cartesian3.fromDegrees(lon, lat, height);
  const orientation = {
    heading: 0,
    pitch: CesiumMath.toRadians(-90), // straight down at the ground
    roll: 0,
  };

  viewer.camera.cancelFlight();

  // Defer so we're not in the same tick as geolocation callback (avoids being overridden)
  requestAnimationFrame(() => {
    viewer.camera.cancelFlight();
    viewer.camera.flyTo({
      destination,
      orientation,
      duration: FLY_DURATION,
      complete: removeTileAfterFly
        ? () => removeOrSplitTileAt(lat, lon)
        : undefined,
    });
    viewer.scene.requestRender();
    // If something cancelled the flight, jump to location after the flight would have finished
    setTimeout(() => {
      const current = viewer.camera.positionCartographic;
      const currentLon = (current.longitude * 180) / Math.PI;
      const currentLat = (current.latitude * 180) / Math.PI;
      const dist = Math.hypot(currentLon - lon, currentLat - lat);
      if (dist > 2) {
        viewer.camera.cancelFlight();
        viewer.camera.setView({ destination, orientation });
        if (removeTileAfterFly) removeOrSplitTileAt(lat, lon);
      }
    }, (FLY_DURATION + 1) * 1000);
  });
}

function tryGeolocation() {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    setLocationStatus("Location not supported — using default view", 4000);
    flyToLocation(DEFAULT_VIEW.lon, DEFAULT_VIEW.lat, DEFAULT_VIEW.height);
    return;
  }
  setLocationStatus("Flying to your location…");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { longitude, latitude } = pos.coords;
      setLocationStatus("Using your location", 4000);
      flyToLocation(longitude, latitude, undefined, true);
    },
    () => {
      setLocationStatus("Location unavailable — using default view", 5000);
      flyToLocation(DEFAULT_VIEW.lon, DEFAULT_VIEW.lat, DEFAULT_VIEW.height);
    },
    {
      enableHighAccuracy: true,
      timeout: 20_000,
      maximumAge: 0, // Prefer fresh position on start
    }
  );
}

// Slight delay so the viewer and tiles are ready, then request location and fly
setTimeout(tryGeolocation, 500);

// Button: fly to current location when detected
const goToMyLocationBtn = document.getElementById("goToMyLocation") as HTMLButtonElement | null;
if (goToMyLocationBtn) {
  goToMyLocationBtn.addEventListener("click", () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationStatus("Location not supported", 4000);
      return;
    }
    goToMyLocationBtn.disabled = true;
    setLocationStatus("Getting location…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { longitude, latitude } = pos.coords;
        setLocationStatus("Flying to your location", 3000);
        flyToLocation(longitude, latitude, undefined, true);
        goToMyLocationBtn.disabled = false;
      },
      () => {
        setLocationStatus("Location unavailable — allow access or try again", 5000);
        goToMyLocationBtn.disabled = false;
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 }
    );
  });
}
