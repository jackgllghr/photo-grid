(function () {
  const PAGE_MM = { width: 297, height: 210 };
  const SETTINGS_KEY = "photo-grid-settings-v2";
  const TRANSFORMS_KEY = "photo-grid-transforms-v2";
  const DB_NAME = "photo-grid-offline-v1";
  const DB_VERSION = 1;
  const PHOTO_STORE = "photos";
  const PRINT_PAGE_MARGIN_MM = 8;

  const defaults = {
    rows: 3,
    cols: 4,
    marginMm: 8,
    gapMm: 3,
    numPosition: "top-left",
    numSizeMm: 6,
    numColor: "#ffffff",
    numBg: "#111111",
    startPhoto: 1,
    pagesMode: "auto",
    manualPages: 1,
    previewPage: 1
  };

  const state = {
    ...defaults,
    ...loadSettings(),
    photos: [],
    transforms: loadTransforms(),
    selectedPhotoIndex: null,
    drag: null,
    persistenceReady: false
  };

  let dbPromise = null;

  const ui = {
    folderInput: document.getElementById("folderInput"),
    filesInput: document.getElementById("filesInput"),
    shuffleBtn: document.getElementById("shuffleBtn"),
    clearPhotosBtn: document.getElementById("clearPhotosBtn"),
    dropZone: document.getElementById("dropZone"),
    imageCount: document.getElementById("imageCount"),
    presetSelect: document.getElementById("presetSelect"),
    rowsInput: document.getElementById("rowsInput"),
    colsInput: document.getElementById("colsInput"),
    marginInput: document.getElementById("marginInput"),
    gapInput: document.getElementById("gapInput"),
    startPhotoInput: document.getElementById("startPhotoInput"),
    pagesMode: document.getElementById("pagesMode"),
    manualPagesInput: document.getElementById("manualPagesInput"),
    previewPageInput: document.getElementById("previewPageInput"),
    prevPageBtn: document.getElementById("prevPageBtn"),
    nextPageBtn: document.getElementById("nextPageBtn"),
    previewPageStatus: document.getElementById("previewPageStatus"),
    pageSummary: document.getElementById("pageSummary"),
    numPosition: document.getElementById("numPosition"),
    numSize: document.getElementById("numSize"),
    numColor: document.getElementById("numColor"),
    numBg: document.getElementById("numBg"),
    selectedInfo: document.getElementById("selectedInfo"),
    zoomRange: document.getElementById("zoomRange"),
    resetTile: document.getElementById("resetTile"),
    resetAll: document.getElementById("resetAll"),
    replacePhotoBtn: document.getElementById("replacePhotoBtn"),
    replacePhotoInput: document.getElementById("replacePhotoInput"),
    printBtn: document.getElementById("printBtn"),
    pagesRoot: document.getElementById("pagesRoot"),
    printRoot: document.getElementById("printRoot")
  };

  start();

  async function start() {
    bindControls();
    syncInputsFromState();
    render();
    await restorePhotosFromPersistence();
  }

  function bindControls() {
    ui.folderInput.addEventListener("change", (event) => {
      ingestFiles(event.target.files);
      ui.folderInput.value = "";
    });

    ui.filesInput.addEventListener("change", (event) => {
      ingestFiles(event.target.files);
      ui.filesInput.value = "";
    });

    ["dragenter", "dragover"].forEach((name) => {
      ui.dropZone.addEventListener(name, (event) => {
        event.preventDefault();
        ui.dropZone.classList.add("dragging");
      });
    });

    ["dragleave", "drop"].forEach((name) => {
      ui.dropZone.addEventListener(name, (event) => {
        event.preventDefault();
        ui.dropZone.classList.remove("dragging");
      });
    });

    ui.dropZone.addEventListener("drop", (event) => {
      ingestFiles(event.dataTransfer.files);
    });

    ui.shuffleBtn.addEventListener("click", async () => {
      if (state.photos.length < 2) return;
      shufflePhotosInPlace(state.photos);

      state.photos.forEach((photo, index) => {
        photo.order = index;
      });

      state.selectedPhotoIndex = null;
      state.startPhoto = 1;
      state.previewPage = 1;

      await persistPhotoOrder();
      saveSettings();
      render();
    });

    ui.clearPhotosBtn.addEventListener("click", async () => {
      await clearAllPhotos();
    });

    ui.presetSelect.addEventListener("change", () => {
      if (ui.presetSelect.value === "custom") return;
      const [cols, rows] = ui.presetSelect.value.split("x").map(Number);
      state.cols = cols;
      state.rows = rows;
      saveSettings();
      syncInputsFromState();
      render();
    });

    ui.rowsInput.addEventListener("input", () => {
      state.rows = clampInt(ui.rowsInput.value, 1, 10);
      ui.presetSelect.value = "custom";
      saveSettings();
      render();
    });

    ui.colsInput.addEventListener("input", () => {
      state.cols = clampInt(ui.colsInput.value, 1, 10);
      ui.presetSelect.value = "custom";
      saveSettings();
      render();
    });

    ui.marginInput.addEventListener("input", () => {
      state.marginMm = clampFloat(ui.marginInput.value, 0, 30);
      saveSettings();
      render();
    });

    ui.gapInput.addEventListener("input", () => {
      state.gapMm = clampFloat(ui.gapInput.value, 0, 20);
      saveSettings();
      render();
    });

    ui.startPhotoInput.addEventListener("input", () => {
      state.startPhoto = clampInt(ui.startPhotoInput.value, 1, getMaxStartPhoto());
      state.previewPage = 1;
      saveSettings();
      render();
    });

    ui.pagesMode.addEventListener("change", () => {
      state.pagesMode = ui.pagesMode.value === "manual" ? "manual" : "auto";
      if (state.pagesMode === "auto") {
        state.previewPage = clampInt(state.previewPage, 1, getAutoPageCount());
      }
      saveSettings();
      render();
    });

    ui.manualPagesInput.addEventListener("input", () => {
      state.manualPages = clampInt(ui.manualPagesInput.value, 1, 500);
      state.previewPage = clampInt(state.previewPage, 1, getPageCount());
      saveSettings();
      render();
    });

    ui.previewPageInput.addEventListener("input", () => {
      state.previewPage = clampInt(ui.previewPageInput.value, 1, getPageCount());
      saveSettings();
      render();
    });

    ui.prevPageBtn.addEventListener("click", () => {
      state.previewPage = clampInt(state.previewPage - 1, 1, getPageCount());
      saveSettings();
      render();
    });

    ui.nextPageBtn.addEventListener("click", () => {
      state.previewPage = clampInt(state.previewPage + 1, 1, getPageCount());
      saveSettings();
      render();
    });

    ui.numPosition.addEventListener("change", () => {
      state.numPosition = ui.numPosition.value;
      saveSettings();
      render();
    });

    ui.numSize.addEventListener("input", () => {
      state.numSizeMm = clampFloat(ui.numSize.value, 2, 16);
      saveSettings();
      render();
    });

    ui.numColor.addEventListener("input", () => {
      state.numColor = ui.numColor.value;
      saveSettings();
      render();
    });

    ui.numBg.addEventListener("input", () => {
      state.numBg = ui.numBg.value;
      saveSettings();
      render();
    });

    ui.zoomRange.addEventListener("input", () => {
      if (state.selectedPhotoIndex === null) return;
      const photo = state.photos[state.selectedPhotoIndex];
      if (!photo) return;
      const transform = getTransform(photo);
      transform.zoom = clampFloat(ui.zoomRange.value, 1, 3);
      clampTransform(photo, transform);
      saveTransforms();
      render();
    });

    ui.resetTile.addEventListener("click", () => {
      if (state.selectedPhotoIndex === null) return;
      const photo = state.photos[state.selectedPhotoIndex];
      if (!photo) return;
      state.transforms[getTransformKey(photo)] = defaultTransform();
      saveTransforms();
      render();
    });

    ui.resetAll.addEventListener("click", () => {
      const next = {};
      for (const photo of state.photos) {
        next[getTransformKey(photo)] = defaultTransform();
      }
      state.transforms = next;
      saveTransforms();
      render();
    });

    ui.replacePhotoBtn.addEventListener("click", () => {
      if (state.selectedPhotoIndex === null) return;
      const selected = state.photos[state.selectedPhotoIndex];
      if (!selected) return;
      ui.replacePhotoInput.click();
    });

    ui.replacePhotoInput.addEventListener("change", async (event) => {
      await replaceSelectedPhoto(event.target.files);
      ui.replacePhotoInput.value = "";
    });

    ui.printBtn.addEventListener("click", () => {
      printWithPrintJs();
    });
  }

  async function replaceSelectedPhoto(fileList) {
    if (state.selectedPhotoIndex === null) return;

    const targetIndex = state.selectedPhotoIndex;
    const currentPhoto = state.photos[targetIndex];
    if (!currentPhoto) return;

    const file = Array.from(fileList || []).find((item) => item.type.startsWith("image/"));
    if (!file) return;

    const newSrc = URL.createObjectURL(file);

    try {
      const dims = await getImageDimensions(newSrc);
      const nextPhoto = {
        id: makePhotoId(file),
        transformKey: makeTransformKey(file.name, file.size, file.lastModified),
        name: file.name,
        order: currentPhoto.order,
        src: newSrc,
        width: dims.width,
        height: dims.height,
        size: file.size,
        lastModified: file.lastModified
      };

      const oldKey = getTransformKey(currentPhoto);
      state.photos[targetIndex] = nextPhoto;
      delete state.transforms[oldKey];
      state.transforms[getTransformKey(nextPhoto)] = defaultTransform();
      state.drag = null;

      URL.revokeObjectURL(currentPhoto.src);

      try {
        await replacePersistedPhoto(currentPhoto.id, nextPhoto, file);
      } catch (_error) {
        ui.imageCount.textContent = "Photo replaced, but browser storage quota prevented offline persistence.";
      }

      saveTransforms();
      saveSettings();
      render();
    } catch (_error) {
      URL.revokeObjectURL(newSrc);
    }
  }

  function printWithPrintJs() {
    if (typeof window.printJS !== "function") {
      window.print();
      return;
    }

    const printableId = "printRoot";
    ui.printRoot.innerHTML = "";
    const printMetrics = getPrintPageMetrics();
    buildPrintPages(printMetrics);

    window.printJS({
      printable: printableId,
      type: "html",
      scanStyles: false,
      showModal: false,
      targetStyles: ["*"],
      style: getPrintJsStyle(printMetrics)
    });
  }

  function buildPrintPages(printMetrics) {
    const pageCount = getPageCount();
    const cellsPerPage = getCellsPerPage();
    const startIndex = state.startPhoto - 1;

    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
      const pageEl = document.createElement("div");
      pageEl.className = "page-preview";
      pageEl.style.setProperty("--num-color", state.numColor);
      pageEl.style.setProperty("--num-bg", state.numBg);

      const grid = document.createElement("div");
      grid.className = "grid";
      const gridMetrics = applyPrintGridMetrics(grid, printMetrics);

      for (let cell = 0; cell < cellsPerPage; cell += 1) {
        const photoIndex = startIndex + pageIndex * cellsPerPage + cell;
        const photo = state.photos[photoIndex];

        const tile = document.createElement("div");
        tile.className = "tile";

        if (!photo) {
          tile.classList.add("empty");
          tile.textContent = "No photo";
        } else {
          const transform = getTransform(photo);
          const fit = getFitMetrics(photo, transform.zoom);
          const widthMm = (gridMetrics.cellWidthMm * fit.widthPct) / 100;
          const heightMm = (gridMetrics.cellHeightMm * fit.heightPct) / 100;
          const dxMm = (transform.x / 100) * gridMetrics.cellWidthMm;
          const dyMm = (transform.y / 100) * gridMetrics.cellHeightMm;
          tile.style.backgroundImage = `url("${photo.src}")`;
          tile.style.backgroundRepeat = "no-repeat";
          tile.style.backgroundSize = `${widthMm}mm ${heightMm}mm`;
          tile.style.backgroundPosition = `calc(50% + ${dxMm}mm) calc(50% + ${dyMm}mm)`;
        }

        const badge = document.createElement("span");
        badge.className = `tile-number ${state.numPosition}`;
        badge.style.fontSize = `${state.numSizeMm}mm`;
        badge.textContent = String(photoIndex + 1);
        tile.appendChild(badge);

        grid.appendChild(tile);
      }

      pageEl.appendChild(grid);
      ui.printRoot.appendChild(pageEl);
    }
  }

  function applyPrintGridMetrics(grid, printMetrics) {
    const scaledMarginMm = state.marginMm * printMetrics.scale;
    const scaledGapMm = state.gapMm * printMetrics.scale;

    const contentWidthMm = Math.max(1, printMetrics.pageWidthMm - scaledMarginMm * 2);
    const contentHeightMm = Math.max(1, printMetrics.pageHeightMm - scaledMarginMm * 2);

    const gapsW = scaledGapMm * (state.cols - 1);
    const gapsH = scaledGapMm * (state.rows - 1);

    const cellWidthMm = Math.max(1, (contentWidthMm - gapsW) / state.cols);
    const cellHeightMm = Math.max(1, (contentHeightMm - gapsH) / state.rows);

    grid.style.position = "absolute";
    grid.style.top = `${scaledMarginMm}mm`;
    grid.style.left = `${scaledMarginMm}mm`;
    grid.style.right = "auto";
    grid.style.bottom = "auto";
    grid.style.width = `${contentWidthMm}mm`;
    grid.style.height = `${contentHeightMm}mm`;
    grid.style.gap = `${scaledGapMm}mm`;
    grid.style.gridTemplateColumns = `repeat(${state.cols}, ${cellWidthMm}mm)`;
    grid.style.gridTemplateRows = `repeat(${state.rows}, ${cellHeightMm}mm)`;
    grid.style.alignContent = "start";
    grid.style.justifyContent = "start";

    return { cellWidthMm, cellHeightMm };
  }

  function getPrintPageMetrics() {
    const printableWidthMm = PAGE_MM.width - PRINT_PAGE_MARGIN_MM * 2;
    const printableHeightMm = PAGE_MM.height - PRINT_PAGE_MARGIN_MM * 2;
    const scale = Math.min(printableWidthMm / PAGE_MM.width, printableHeightMm / PAGE_MM.height);

    return {
      scale,
      pageWidthMm: PAGE_MM.width * scale,
      pageHeightMm: PAGE_MM.height * scale
    };
  }

  function getPrintJsStyle(printMetrics) {
    const pageWidth = printMetrics.pageWidthMm.toFixed(4);
    const pageHeight = printMetrics.pageHeightMm.toFixed(4);

    return `
      @page { size: A4 landscape; margin: 8mm; }
      html, body { margin: 0; padding: 0; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      *, *::before, *::after { box-sizing: border-box; }
      #printRoot { width: 100%; }
      #printRoot .page-preview { width: ${pageWidth}mm; height: ${pageHeight}mm; margin: 0 auto; padding: 0; position: relative; box-sizing: border-box; overflow: hidden; break-after: page; page-break-after: always; }
      #printRoot .page-preview + .page-preview { margin-top: 0; }
      #printRoot .grid { position: absolute; display: grid; min-height: 0; overflow: hidden; }
      #printRoot .tile { position: relative; overflow: hidden; background: #efe8dc; border: 1px solid rgba(40, 28, 20, 0.15); min-width: 0; min-height: 0; }
      #printRoot .tile-number { position: absolute; z-index: 2; border-radius: 999px; padding: 0.16em 0.48em; font-family: Georgia, "Times New Roman", serif; font-weight: 700; letter-spacing: 0.02em; line-height: 1; color: var(--num-color, #ffffff); background-color: var(--num-bg, #111111); }
      #printRoot .tile-number.top-left { top: 0.35em; left: 0.35em; }
      #printRoot .tile-number.top-right { top: 0.35em; right: 0.35em; }
      #printRoot .tile-number.bottom-left { bottom: 0.35em; left: 0.35em; }
      #printRoot .tile-number.bottom-right { bottom: 0.35em; right: 0.35em; }
      #printRoot .tile-number.center { top: 50%; left: 50%; transform: translate(-50%, -50%); }
      #printRoot .tile.selected { outline: none; }
      #printRoot .screen-hidden-page { display: block !important; }
    `;
  }

  async function ingestFiles(fileList) {
    const files = Array.from(fileList || []).filter((file) => file.type.startsWith("image/"));
    if (!files.length) return;

    files.sort((a, b) => {
      const left = (a.webkitRelativePath || a.name).toLowerCase();
      const right = (b.webkitRelativePath || b.name).toLowerCase();
      return left.localeCompare(right);
    });

    clearPhotoUrls();

    const loaded = await Promise.all(
      files.map(async (file) => {
        const src = URL.createObjectURL(file);
        try {
          const dims = await getImageDimensions(src);
          return {
            id: makePhotoId(file),
            transformKey: makeTransformKey(file.name, file.size, file.lastModified),
            name: file.name,
            order: 0,
            src,
            width: dims.width,
            height: dims.height,
            size: file.size,
            lastModified: file.lastModified,
            blob: file
          };
        } catch (_error) {
          URL.revokeObjectURL(src);
          return null;
        }
      })
    );

    state.photos = loaded.filter(Boolean).map((photo, index) => ({
      id: photo.id,
      transformKey: photo.transformKey,
      name: photo.name,
      order: index,
      src: photo.src,
      width: photo.width,
      height: photo.height,
      size: photo.size,
      lastModified: photo.lastModified
    }));
    state.selectedPhotoIndex = null;
    state.startPhoto = clampInt(state.startPhoto, 1, getMaxStartPhoto());
    state.previewPage = 1;

    try {
      await persistPhotos(
        loaded
          .filter(Boolean)
          .map((photo, index) => ({
            id: photo.id,
            transformKey: photo.transformKey,
            name: photo.name,
            order: index,
            width: photo.width,
            height: photo.height,
            size: photo.size,
            lastModified: photo.lastModified,
            transform: resolveExistingTransform(photo) || defaultTransform(),
            blob: photo.blob
          }))
      );
    } catch (_error) {
      ui.imageCount.textContent = "Photos loaded, but browser storage quota prevented offline persistence.";
    }

    ensureTransformsForCurrentPhotos();
    saveTransforms();
    saveSettings();
    render();
  }

  function render() {
    ensureTransformsForCurrentPhotos();

    const pageCount = getPageCount();
    const cellsPerPage = getCellsPerPage();
    const startIndex = state.startPhoto - 1;
    const maxStart = getMaxStartPhoto();

    state.startPhoto = clampInt(state.startPhoto, 1, maxStart);
    state.previewPage = clampInt(state.previewPage, 1, pageCount);

    ui.pagesRoot.innerHTML = "";

    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
      const pageEl = document.createElement("div");
      pageEl.className = "page-preview";
      if (pageIndex + 1 !== state.previewPage) {
        pageEl.classList.add("screen-hidden-page");
      }

      pageEl.style.setProperty("--margin-mm", String(state.marginMm));
      pageEl.style.setProperty("--gap-mm", String(state.gapMm));
      pageEl.style.setProperty("--margin-len", `${state.marginMm}mm`);
      pageEl.style.setProperty("--gap-len", `${state.gapMm}mm`);
      pageEl.style.setProperty("--num-color", state.numColor);
      pageEl.style.setProperty("--num-bg", state.numBg);

      const grid = document.createElement("div");
      grid.className = "grid";
      grid.style.gridTemplateColumns = `repeat(${state.cols}, minmax(0, 1fr))`;
      grid.style.gridTemplateRows = `repeat(${state.rows}, minmax(0, 1fr))`;
      grid.style.gap = `${state.gapMm}mm`;
      grid.style.top = `${state.marginMm}mm`;
      grid.style.right = `${state.marginMm}mm`;
      grid.style.bottom = `${state.marginMm}mm`;
      grid.style.left = `${state.marginMm}mm`;

      for (let cell = 0; cell < cellsPerPage; cell += 1) {
        const photoIndex = startIndex + pageIndex * cellsPerPage + cell;
        const photo = state.photos[photoIndex];

        const tile = document.createElement("div");
        tile.className = "tile";

        if (!photo) {
          tile.classList.add("empty");
          tile.textContent = "No photo";
        } else {
          tile.dataset.photoIndex = String(photoIndex);
          tile.addEventListener("click", onTileClick);
          tile.addEventListener("pointerdown", onTilePointerDown);
          tile.addEventListener("wheel", onTileWheel, { passive: false });

          if (state.selectedPhotoIndex === photoIndex) {
            tile.classList.add("selected");
          }

          const img = document.createElement("img");
          img.src = photo.src;
          img.alt = photo.name;
          applyImageStyle(img, photo);
          tile.appendChild(img);
        }

        const badge = document.createElement("span");
        badge.className = `tile-number ${state.numPosition}`;
        badge.style.fontSize = `${state.numSizeMm}mm`;
        badge.textContent = String(photoIndex + 1);
        tile.appendChild(badge);

        grid.appendChild(tile);
      }

      pageEl.appendChild(grid);
      ui.pagesRoot.appendChild(pageEl);
    }

    const firstVisible = startIndex + 1;
    const lastVisible = Math.min(state.photos.length, startIndex + pageCount * cellsPerPage);
    ui.pageSummary.textContent = state.photos.length
      ? `Showing photos ${firstVisible}-${lastVisible} of ${state.photos.length}. Printing ${pageCount} page${pageCount === 1 ? "" : "s"}.`
      : "No photos loaded.";

    ui.imageCount.textContent = `${state.photos.length} photo${state.photos.length === 1 ? "" : "s"} loaded.`;

    updateSelectedInfo();
    syncInputsFromState();
    highlightSelectedTiles();
  }

  function onTileClick(event) {
    const tile = event.currentTarget;
    const photoIndex = Number(tile.dataset.photoIndex);
    if (!Number.isInteger(photoIndex)) return;
    setSelectedPhoto(photoIndex);
  }

  function onTilePointerDown(event) {
    const tile = event.currentTarget;
    const photoIndex = Number(tile.dataset.photoIndex);
    if (!Number.isInteger(photoIndex)) return;

    const photo = state.photos[photoIndex];
    if (!photo) return;

    setSelectedPhoto(photoIndex);
    const transform = getTransform(photo);

    state.drag = {
      photoIndex,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: transform.x,
      startY: transform.y
    };

    tile.setPointerCapture(event.pointerId);
    tile.addEventListener("pointermove", onTilePointerMove);
    tile.addEventListener("pointerup", onTilePointerUp);
    tile.addEventListener("pointercancel", onTilePointerUp);

  }

  function onTilePointerMove(event) {
    if (!state.drag || state.drag.pointerId !== event.pointerId) return;

    const tile = event.currentTarget;
    const photo = state.photos[state.drag.photoIndex];
    if (!photo) return;

    const rect = tile.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const transform = getTransform(photo);
    const deltaXPct = ((event.clientX - state.drag.startClientX) / rect.width) * 100;
    const deltaYPct = ((event.clientY - state.drag.startClientY) / rect.height) * 100;

    transform.x = state.drag.startX + deltaXPct;
    transform.y = state.drag.startY + deltaYPct;
    clampTransform(photo, transform);

    const img = tile.querySelector("img");
    if (img) {
      applyImageStyle(img, photo);
    }

    updateSelectedInfo();
  }

  function onTilePointerUp(event) {
    if (!state.drag || state.drag.pointerId !== event.pointerId) return;

    const tile = event.currentTarget;
    tile.removeEventListener("pointermove", onTilePointerMove);
    tile.removeEventListener("pointerup", onTilePointerUp);
    tile.removeEventListener("pointercancel", onTilePointerUp);

    state.drag = null;
    saveTransforms();
  }

  function onTileWheel(event) {
    event.preventDefault();

    const tile = event.currentTarget;
    const photoIndex = Number(tile.dataset.photoIndex);
    if (!Number.isInteger(photoIndex)) return;

    const photo = state.photos[photoIndex];
    if (!photo) return;

    setSelectedPhoto(photoIndex);
    const transform = getTransform(photo);
    transform.zoom = clampFloat(transform.zoom - event.deltaY * 0.0015, 1, 3);
    clampTransform(photo, transform);
    saveTransforms();
    updatePhotoTiles(photoIndex);
    updateSelectedInfo();
  }

  function setSelectedPhoto(photoIndex) {
    state.selectedPhotoIndex = photoIndex;
    highlightSelectedTiles();
    updateSelectedInfo();
  }

  function highlightSelectedTiles() {
    const allTiles = ui.pagesRoot.querySelectorAll(".tile[data-photo-index]");
    allTiles.forEach((tile) => {
      const index = Number(tile.dataset.photoIndex);
      tile.classList.toggle("selected", index === state.selectedPhotoIndex);
    });
  }

  function updatePhotoTiles(photoIndex) {
    const photo = state.photos[photoIndex];
    if (!photo) return;
    const imgs = ui.pagesRoot.querySelectorAll(`.tile[data-photo-index="${photoIndex}"] img`);
    imgs.forEach((img) => {
      applyImageStyle(img, photo);
    });
  }

  function applyImageStyle(img, photo) {
    const transform = getTransform(photo);
    const fit = getFitMetrics(photo, transform.zoom);
    img.style.width = `${fit.widthPct}%`;
    img.style.height = `${fit.heightPct}%`;
    img.style.left = `${50 + transform.x}%`;
    img.style.top = `${50 + transform.y}%`;
  }

  function getFitMetrics(photo, zoom) {
    const cellRatio = getCellRatio();
    const imageRatio = photo.width / photo.height;

    let baseWidthPct;
    let baseHeightPct;

    if (imageRatio >= cellRatio) {
      baseHeightPct = 100;
      baseWidthPct = (imageRatio / cellRatio) * 100;
    } else {
      baseWidthPct = 100;
      baseHeightPct = (cellRatio / imageRatio) * 100;
    }

    return {
      widthPct: baseWidthPct * zoom,
      heightPct: baseHeightPct * zoom
    };
  }

  function clampTransform(photo, transform) {
    transform.zoom = clampFloat(transform.zoom, 1, 3);

    const fit = getFitMetrics(photo, transform.zoom);
    const maxX = Math.max(0, (fit.widthPct - 100) / 2);
    const maxY = Math.max(0, (fit.heightPct - 100) / 2);

    transform.x = clampFloat(transform.x, -maxX, maxX);
    transform.y = clampFloat(transform.y, -maxY, maxY);
  }

  function getTransform(photo) {
    const key = getTransformKey(photo);
    if (!state.transforms[key]) {
      const existing = resolveExistingTransform(photo);
      state.transforms[key] = existing || defaultTransform();
    }
    return state.transforms[key];
  }

  function defaultTransform() {
    return { x: 0, y: 0, zoom: 1 };
  }

  function ensureTransformsForCurrentPhotos() {
    const next = {};
    for (const photo of state.photos) {
      const key = getTransformKey(photo);
      const existing = resolveExistingTransform(photo);
      if (existing) {
        next[key] = {
          x: clampFloat(existing.x, -300, 300),
          y: clampFloat(existing.y, -300, 300),
          zoom: clampFloat(existing.zoom, 1, 3)
        };
      } else {
        next[key] = defaultTransform();
      }
      clampTransform(photo, next[key]);
    }
    state.transforms = next;
  }

  function getTransformKey(photo) {
    return photo.transformKey || photo.id || photo.name;
  }

  function resolveExistingTransform(photo) {
    const candidates = [
      getTransformKey(photo),
      photo.id,
      makeTransformKey(photo.name, photo.size, photo.lastModified),
      photo.name
    ].filter(Boolean);

    for (const key of candidates) {
      if (state.transforms[key]) {
        return state.transforms[key];
      }
    }

    return null;
  }

  function getPageCount() {
    if (state.pagesMode === "manual") {
      return clampInt(state.manualPages, 1, 500);
    }
    return getAutoPageCount();
  }

  function getAutoPageCount() {
    const cellsPerPage = getCellsPerPage();
    const remaining = Math.max(0, state.photos.length - (state.startPhoto - 1));
    return Math.max(1, Math.ceil(remaining / cellsPerPage));
  }

  function getCellsPerPage() {
    return Math.max(1, state.rows * state.cols);
  }

  function getCellRatio() {
    const innerW = PAGE_MM.width - state.marginMm * 2 - state.gapMm * (state.cols - 1);
    const innerH = PAGE_MM.height - state.marginMm * 2 - state.gapMm * (state.rows - 1);
    const cellW = Math.max(1, innerW / state.cols);
    const cellH = Math.max(1, innerH / state.rows);
    return cellW / cellH;
  }

  function getMaxStartPhoto() {
    return Math.max(1, state.photos.length || 1);
  }

  function updateSelectedInfo() {
    if (state.selectedPhotoIndex === null) {
      ui.selectedInfo.textContent = "Select a photo tile to adjust crop and position.";
      ui.zoomRange.disabled = true;
      return;
    }

    const photo = state.photos[state.selectedPhotoIndex];
    if (!photo) {
      ui.selectedInfo.textContent = "Selected tile is empty.";
      ui.zoomRange.disabled = true;
      return;
    }

    const transform = getTransform(photo);
    ui.zoomRange.disabled = false;
    ui.zoomRange.value = String(transform.zoom);
    ui.selectedInfo.textContent = `Photo ${state.selectedPhotoIndex + 1}: ${photo.name} | zoom ${transform.zoom.toFixed(2)} | x ${transform.x.toFixed(1)}% y ${transform.y.toFixed(1)}%`;
  }

  function syncInputsFromState() {
    const pageCount = getPageCount();
    ui.rowsInput.value = String(state.rows);
    ui.colsInput.value = String(state.cols);
    ui.marginInput.value = String(state.marginMm);
    ui.gapInput.value = String(state.gapMm);
    ui.startPhotoInput.value = String(state.startPhoto);
    ui.startPhotoInput.max = String(getMaxStartPhoto());
    ui.pagesMode.value = state.pagesMode;
    ui.manualPagesInput.value = String(state.manualPages);
    ui.manualPagesInput.disabled = state.pagesMode !== "manual";
    ui.previewPageInput.value = String(state.previewPage);
    ui.previewPageInput.max = String(pageCount);
    ui.previewPageStatus.textContent = `Page ${state.previewPage} of ${pageCount}`;
    ui.prevPageBtn.disabled = state.previewPage <= 1;
    ui.nextPageBtn.disabled = state.previewPage >= pageCount;
    ui.shuffleBtn.disabled = state.photos.length < 2;
    ui.clearPhotosBtn.disabled = state.photos.length === 0;
    ui.replacePhotoBtn.disabled = state.selectedPhotoIndex === null || !state.photos[state.selectedPhotoIndex];

    const preset = `${state.cols}x${state.rows}`;
    ui.presetSelect.value = ["4x3", "5x3", "6x4"].includes(preset) ? preset : "custom";

    ui.numPosition.value = state.numPosition;
    ui.numSize.value = String(state.numSizeMm);
    ui.numColor.value = state.numColor;
    ui.numBg.value = state.numBg;
  }

  function saveSettings() {
    const snapshot = {
      rows: state.rows,
      cols: state.cols,
      marginMm: state.marginMm,
      gapMm: state.gapMm,
      numPosition: state.numPosition,
      numSizeMm: state.numSizeMm,
      numColor: state.numColor,
      numBg: state.numBg,
      startPhoto: state.startPhoto,
      pagesMode: state.pagesMode,
      manualPages: state.manualPages,
      previewPage: state.previewPage
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(snapshot));
  }

  function saveTransforms() {
    localStorage.setItem(TRANSFORMS_KEY, JSON.stringify(state.transforms));
    persistTransformsToPhotoStore();
  }

  async function persistTransformsToPhotoStore() {
    const db = await getDb();
    if (!db) return;

    runWriteTransaction(db, PHOTO_STORE, (store) => {
      const cursorRequest = store.openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) return;

        const row = cursor.value;
        const key =
          row.transformKey || makeTransformKey(row.name, row.size, row.lastModified) || row.id || row.name;
        const transform = state.transforms[key];
        if (transform) {
          row.transform = {
            x: clampFloat(transform.x, -300, 300),
            y: clampFloat(transform.y, -300, 300),
            zoom: clampFloat(transform.zoom, 1, 3)
          };
          cursor.update(row);
        }

        cursor.continue();
      };
    }).catch(() => {
      // no-op: localStorage remains source of truth when IndexedDB update fails
    });
  }

  async function persistPhotoOrder() {
    const db = await getDb();
    if (!db) return;

    const orderById = new Map(state.photos.map((photo, index) => [photo.id, index]));

    await runWriteTransaction(db, PHOTO_STORE, (store) => {
      const cursorRequest = store.openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) return;

        const row = cursor.value;
        if (orderById.has(row.id)) {
          row.order = orderById.get(row.id);
          cursor.update(row);
        }

        cursor.continue();
      };
    }).catch(() => {
      // no-op: order is still updated for current session
    });
  }

  async function clearAllPhotos() {
    clearPhotoUrls();
    state.photos = [];
    state.transforms = {};
    state.selectedPhotoIndex = null;
    state.drag = null;
    state.startPhoto = 1;
    state.previewPage = 1;

    localStorage.removeItem(TRANSFORMS_KEY);

    const db = await getDb();
    if (db) {
      await runWriteTransaction(db, PHOTO_STORE, (store) => {
        store.clear();
      }).catch(() => {
        // no-op: current session still cleared
      });
    }

    saveSettings();
    render();
  }

  async function restorePhotosFromPersistence() {
    const records = await loadPersistedPhotos();
    if (!records.length) {
      state.persistenceReady = true;
      return;
    }

    clearPhotoUrls();

    state.photos = records.map((record) => ({
      id: record.id,
      transformKey: record.transformKey || makeTransformKey(record.name, record.size, record.lastModified),
      name: record.name,
      order: record.order,
      width: record.width,
      height: record.height,
      size: record.size,
      lastModified: record.lastModified,
      src: URL.createObjectURL(record.blob)
    }));

    for (const record of records) {
      if (!record) continue;
      const key = record.transformKey || makeTransformKey(record.name, record.size, record.lastModified);
      if (!key || !record.transform) continue;
      state.transforms[key] = {
        x: clampFloat(record.transform.x, -300, 300),
        y: clampFloat(record.transform.y, -300, 300),
        zoom: clampFloat(record.transform.zoom, 1, 3)
      };
    }

    state.photos.sort((a, b) => a.order - b.order);
    state.selectedPhotoIndex = null;
    state.startPhoto = clampInt(state.startPhoto, 1, getMaxStartPhoto());
    state.previewPage = clampInt(state.previewPage, 1, getPageCount());
    state.persistenceReady = true;

    ensureTransformsForCurrentPhotos();
    saveTransforms();
    saveSettings();
    render();
  }

  async function persistPhotos(photos) {
    const db = await getDb();
    if (!db) return;

    await runWriteTransaction(db, PHOTO_STORE, (store) => {
      store.clear();
      for (const photo of photos) {
        store.put({
          id: photo.id,
          transformKey: photo.transformKey,
          name: photo.name,
          order: photo.order,
          width: photo.width,
          height: photo.height,
          size: photo.size,
          lastModified: photo.lastModified,
          transform: photo.transform,
          blob: photo.blob
        });
      }
    });
  }

  async function replacePersistedPhoto(previousId, photo, blob) {
    const db = await getDb();
    if (!db) return;

    await runWriteTransaction(db, PHOTO_STORE, (store) => {
      if (previousId && previousId !== photo.id) {
        store.delete(previousId);
      }

      store.put({
        id: photo.id,
        transformKey: photo.transformKey,
        name: photo.name,
        order: photo.order,
        width: photo.width,
        height: photo.height,
        size: photo.size,
        lastModified: photo.lastModified,
        transform: defaultTransform(),
        blob
      });
    });
  }

  async function loadPersistedPhotos() {
    const db = await getDb();
    if (!db) return [];

    return new Promise((resolve) => {
      const tx = db.transaction(PHOTO_STORE, "readonly");
      const store = tx.objectStore(PHOTO_STORE);
      const req = store.getAll();

      req.onsuccess = () => {
        const rows = Array.isArray(req.result) ? req.result : [];
        resolve(
          rows
            .filter((row) => row && row.blob)
            .sort((a, b) => (a.order || 0) - (b.order || 0))
        );
      };

      req.onerror = () => resolve([]);
      tx.onerror = () => resolve([]);
    });
  }

  function runWriteTransaction(db, storeName, writer) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);

      try {
        writer(store);
      } catch (error) {
        reject(error);
        return;
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("IndexedDB write failed"));
      tx.onabort = () => reject(tx.error || new Error("IndexedDB write aborted"));
    });
  }

  function getDb() {
    if (!("indexedDB" in window)) {
      return Promise.resolve(null);
    }

    if (dbPromise) {
      return dbPromise;
    }

    dbPromise = new Promise((resolve) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(PHOTO_STORE)) {
          db.createObjectStore(PHOTO_STORE, { keyPath: "id" });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });

    return dbPromise;
  }

  function loadSettings() {
    return loadJson(SETTINGS_KEY, defaults);
  }

  function loadTransforms() {
    return loadJson(TRANSFORMS_KEY, {});
  }

  function loadJson(key, fallback) {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    try {
      const parsed = JSON.parse(raw);
      if (fallback && typeof fallback === "object" && !Array.isArray(fallback)) {
        return { ...fallback, ...parsed };
      }
      return parsed;
    } catch (_error) {
      return fallback;
    }
  }

  function clampInt(value, min, max) {
    const n = Number.parseInt(value, 10);
    if (Number.isNaN(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  function clampFloat(value, min, max) {
    const n = Number.parseFloat(value);
    if (Number.isNaN(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  function clearPhotoUrls() {
    for (const photo of state.photos) {
      URL.revokeObjectURL(photo.src);
    }
  }

  function getImageDimensions(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = reject;
      image.src = src;
    });
  }

  function makePhotoId(file) {
    const path = file.webkitRelativePath || file.name;
    return `${path}::${file.size}::${file.lastModified}`;
  }

  function makeTransformKey(name, size, lastModified) {
    if (!name) return null;
    const safeSize = Number.isFinite(size) ? size : "na";
    const safeModified = Number.isFinite(lastModified) ? lastModified : "na";
    return `${name}::${safeSize}::${safeModified}`;
  }

  function shufflePhotosInPlace(photos) {
    for (let i = photos.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = photos[i];
      photos[i] = photos[j];
      photos[j] = tmp;
    }
  }
})();
