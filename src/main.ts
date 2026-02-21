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

// Initial view: whole globe (for Cesium's default); we override with a zoomed-in view below
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

// Grid config: 18×36 = 648 tiles (~10° each). Bigger initial tiles.
const gridConfig: TileGridConfig = { latCount: 18, lonCount: 36 };
const TILE_GAP = 0.03; // 3% margin for top-level tiles (smaller gaps between big tiles)

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

// Start at whole-globe view (same as home button); no setView override.

const SPLIT_DEPTH = 15; // More steps so the smallest tiles (and hole) are even smaller

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

let leftMouseDown = false;
handler.setInputAction(() => {
  leftMouseDown = true;
}, ScreenSpaceEventType.LEFT_DOWN);
handler.setInputAction(() => {
  leftMouseDown = false;
}, ScreenSpaceEventType.LEFT_UP);
handler.setInputAction(() => {
  if (leftMouseDown && followLocation) stopFollowing();
  leftMouseDown = false;
}, ScreenSpaceEventType.MOUSE_MOVE);
handler.setInputAction(() => {
  if (followLocation) stopFollowing();
}, ScreenSpaceEventType.WHEEL);

// Height above ellipsoid in meters when following. Lower = closer to the ground.
const LOCATION_VIEW_HEIGHT = 300;
const FOLLOW_FLY_DURATION = 2.5; // seconds to animate to location when starting follow
const orientation = {
  heading: 0,
  pitch: CesiumMath.toRadians(-90),
  roll: 0,
};

// --- Follow location: watch position, move camera, remove tile under center ---
let followLocation = false;
let followFlyInProgress = false; // true while our "start follow" flyTo is running
let followWatchId: number | null = null;
let followTargetLon: number | null = null;
let followTargetLat: number | null = null;
const FOLLOW_LERP = 0.12; // per frame toward target
const FOLLOW_REMOVE_THROTTLE_MS = 180; // remove tile under center at most this often
let lastFollowRemoveTime = 0;

function setCameraView(lon: number, lat: number, height: number = LOCATION_VIEW_HEIGHT) {
  viewer.camera.setView({
    destination: Cartesian3.fromDegrees(lon, lat, height),
    orientation,
  });
}

function onFollowTick() {
  if (!followLocation || followTargetLon == null || followTargetLat == null) return;
  const carto = viewer.camera.positionCartographic;
  const curLon = (carto.longitude * 180) / Math.PI;
  const curLat = (carto.latitude * 180) / Math.PI;
  const newLon = curLon + (followTargetLon - curLon) * FOLLOW_LERP;
  const newLat = curLat + (followTargetLat - curLat) * FOLLOW_LERP;
  setCameraView(newLon, newLat, LOCATION_VIEW_HEIGHT);
  const now = performance.now();
  if (now - lastFollowRemoveTime >= FOLLOW_REMOVE_THROTTLE_MS) {
    lastFollowRemoveTime = now;
    removeOrSplitTileAt(newLat, newLon);
  }
}

function startFollowing() {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return;
  }
  followLocation = true;
  followTargetLon = null;
  followTargetLat = null;

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { longitude, latitude } = pos.coords;
      viewer.camera.cancelFlight();
      followFlyInProgress = true;
      viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(longitude, latitude, LOCATION_VIEW_HEIGHT),
        orientation,
        duration: FOLLOW_FLY_DURATION,
        complete: () => {
          followFlyInProgress = false;
          followTargetLon = longitude;
          followTargetLat = latitude;
          viewer.scene.preRender.addEventListener(onFollowTick);
          followWatchId = navigator.geolocation.watchPosition(
            (p) => {
              followTargetLon = p.coords.longitude;
              followTargetLat = p.coords.latitude;
            },
            () => {},
            { enableHighAccuracy: true, maximumAge: 2000 }
          );
          removeOrSplitTileAt(latitude, longitude);
        },
      });
    },
    () => {
      stopFollowing();
    },
    { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 }
  );
}

function stopFollowing() {
  followLocation = false;
  viewer.scene.preRender.removeEventListener(onFollowTick);
  if (followWatchId != null) {
    navigator.geolocation.clearWatch(followWatchId);
    followWatchId = null;
  }
  followTargetLon = null;
  followTargetLat = null;
  const btn = document.getElementById("followLocation");
  if (btn) btn.textContent = "Follow location";
}

// When flying to a search result (or any flyTo), stop follow mode
const originalViewerFlyTo = viewer.flyTo.bind(viewer);
viewer.flyTo = function (target: Parameters<typeof originalViewerFlyTo>[0], options?: Parameters<typeof originalViewerFlyTo>[1]) {
  if (followLocation) stopFollowing();
  return originalViewerFlyTo(target, options);
};
const originalCameraFlyTo = viewer.camera.flyTo.bind(viewer.camera);
viewer.camera.flyTo = function (options: Parameters<typeof originalCameraFlyTo>[0]) {
  if (followLocation && !followFlyInProgress) stopFollowing();
  return originalCameraFlyTo(options);
};

// Button: toggle follow location (no initial jump on start)
const followLocationBtn = document.getElementById("followLocation") as HTMLButtonElement | null;
if (followLocationBtn) {
  followLocationBtn.addEventListener("click", () => {
    if (followLocation) {
      stopFollowing();
      followLocationBtn.textContent = "Follow location";
    } else {
      startFollowing();
      followLocationBtn.textContent = "Stop follow";
    }
  });
}
