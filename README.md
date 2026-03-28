# Photo Grid Print Builder

Small offline web app that takes a folder of photos and builds a numbered photo grid for A4 landscape printing.

## Features

- Folder import (`webkitdirectory`) and drag/drop image import
- A4 landscape print preview (`297mm x 210mm`)
- Grid presets plus custom rows/columns
- Per-tile crop editing (drag to reposition, wheel/slider to zoom)
- Multi-page output with configurable starting photo
- Number overlay controls (position, size, colors)
- Print stylesheet that outputs the grid cleanly
- Local settings + crop transform persistence in `localStorage`
- Imported photos persisted offline in browser `IndexedDB` between reloads
- Zoom/crop is persisted per image and restored on reload

## Run

Open `index.html` in a browser.

For best local file compatibility, you can also run a local static server:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Use

1. Load photos with **Choose Photo Folder** or drag/drop.
2. Select a tile and drag it to reposition the crop.
3. Zoom with mouse wheel over a tile or with the zoom slider.
4. Set **Starting Photo** and page mode (**Auto** or **Manual** page count).
5. Tune grid/number settings.
6. Use **Preview Page** to inspect each page before printing.
7. Click **Print A4 Landscape**.
