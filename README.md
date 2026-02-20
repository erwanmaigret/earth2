# Earth Tile Grid

A web-based project that visualizes a global tile grid on an Earth globe using TypeScript and CesiumJS. Tiles cover the whole Earth surface and can be clicked to select/deselect.

## Quick Start

```bash
npm install
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173) in your browser.

## Features

- **Global tile grid** — Covers the whole Earth surface (~2° tiles by default, 16,200 tiles)
- **Click to select** — Click any tile to select it (orange highlight), click again to deselect
- **Tile identification** — Each tile has a unique ID (`tile_row_col`) for programmatic use

## Configuration

Edit `gridConfig` in `src/main.ts`:

- **latCount**, **lonCount** — Grid resolution. Default `90×180` ≈ 2° per tile. Increase for finer grid (e.g., `180×360` for 1° tiles).

The tile system is in `src/tileGrid.ts` — use `latLonToTile()`, `tileBounds()`, `parseTileId()` etc. for custom logic.

## Scripts

| Command       | Description                    |
| ------------- | ------------------------------ |
| `npm run dev` | Start dev server (Vite)        |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview production build locally |

## Deploy on GitHub Pages

1. In the repo: **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Push to `main`; the workflow builds and deploys automatically.
4. Site URL: **`https://erwanmaigret.github.io/earth2/`**

## Tech Stack

- **TypeScript** – Type-safe development
- **Vite** – Fast dev server and build
- **CesiumJS** – 3D globe, terrain, and GroundPrimitive rendering
