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

## Deploy on GitHub Pages (all on GitHub)

1. Push this repo to GitHub (if you haven’t already).
2. In your repo: **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. Push to `main` (or run the workflow manually). The **Actions** tab will build and deploy.
5. Your site will be at **`https://YOUR_USERNAME.github.io/YOUR_REPO/`**.

No Vercel or other host needed.

## Tech Stack

- **TypeScript** – Type-safe development
- **Vite** – Fast dev server and build
- **CesiumJS** – 3D globe, terrain, and GroundPrimitive rendering
