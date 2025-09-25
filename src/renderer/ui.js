import { createCanvasController } from './canvas.js';
import { createModalController } from './modal.js';
import { createDocumentState } from './state.js';
import { createLayersPanel } from './layersPanel.js';
import { createToolManager } from './tools.js';
import { createTransformController } from './transform.js';
import { registerDropTarget } from './dropzone.js';

const DEFAULT_FILE_NAME = 'untitled.ocp';
const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

function createNotifier() {
  const element = document.createElement('div');
  element.className = 'alert';
  document.body.appendChild(element);
  let timeoutId = null;

  function show(message, type = 'info', duration = 3500) {
    element.textContent = message;
    element.classList.add('visible');
    element.classList.toggle('error', type === 'error');
    element.classList.toggle('success', type === 'success');

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      element.classList.remove('visible');
      element.classList.remove('error');
      element.classList.remove('success');
    }, duration);
  }

  return {
    info: (message) => show(message, 'info'),
    success: (message) => show(message, 'success'),
    error: (message) => show(message, 'error', 4500)
  };
}

function createDocumentMeta(existing = {}) {
  const now = new Date().toISOString();
  const createdAt = typeof existing.createdAt === 'string' ? existing.createdAt : now;
  const modifiedAt = typeof existing.modifiedAt === 'string' ? existing.modifiedAt : now;
  const app = typeof existing.app === 'string' ? existing.app : 'OpenCanvas';
  return { createdAt, modifiedAt, app };
}

function generateLayerId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `layer-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

async function base64ToImageBitmap(base64) {
  const binary = atob(base64);
  const length = binary.length;
  const buffer = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) {
    buffer[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([buffer], { type: 'image/png' });
  return createImageBitmap(blob);
}

async function fileToImageBitmap(file) {
  return createImageBitmap(file);
}

function isImageFile(file) {
  return ACCEPTED_IMAGE_TYPES.includes(file.type) || file.type.startsWith('image/');
}

function nearestZoomOption(value, options) {
  let closest = options[0];
  let smallestDiff = Math.abs(parseFloat(options[0]) - value);
  for (let i = 1; i < options.length; i += 1) {
    const candidate = parseFloat(options[i]);
    const diff = Math.abs(candidate - value);
    if (diff < smallestDiff) {
      smallestDiff = diff;
      closest = options[i];
    }
  }
  return closest;
}

export function setupUI() {
  const canvasElement = document.getElementById('canvas');
  const overlayElement = document.getElementById('overlay');
  const stageElement = document.getElementById('canvas-stage');
  const viewportElement = document.getElementById('viewport');

  const fileNameLabel = document.getElementById('file-name');
  const newButton = document.getElementById('btn-new');
  const openButton = document.getElementById('btn-open');
  const saveButton = document.getElementById('btn-save');
  const exportButton = document.getElementById('btn-export');
  const zoomSelect = document.getElementById('zoom-select');
  const toolList = document.getElementById('tool-list');
  const layerList = document.getElementById('layer-list');
  const layerUpButton = document.getElementById('btn-layer-up');
  const layerDownButton = document.getElementById('btn-layer-down');
  const leftPanel = document.querySelector('.left-panel');

  const notifier = createNotifier();
  const modalController = createModalController();
  const toolManager = createToolManager({ container: toolList });
  toolManager.setActive('transform');

  const store = createDocumentState();
  const canvasController = createCanvasController({
    canvas: canvasElement,
    overlay: overlayElement,
    stage: stageElement,
    viewport: viewportElement
  });

  const layersPanel = createLayersPanel({
    listElement: layerList,
    upButton: layerUpButton,
    downButton: layerDownButton,
    store
  });

  if (!window.api) {
    notifier.error('Bridge not available. Please restart the application.');
    throw new Error('window.api is undefined');
  }
  createTransformController({
    overlay: overlayElement,
    store,
    canvasController,
    getActiveTool: () => toolManager.getActive()
  });

  const appState = {
    fileName: 'No project',
    filePath: null,
    meta: createDocumentMeta(),
    hasDocument: false,
    zoomMode: 'fit',
    busy: false
  };

  function setBusy(value) {
    appState.busy = value;
    [newButton, openButton, saveButton, exportButton, zoomSelect].forEach((element) => {
      element.disabled = value;
    });
  }

  function updateTitle() {
    const label = appState.hasDocument ? appState.fileName : 'No project';
    fileNameLabel.textContent = label;
    document.title = appState.hasDocument ? `OpenCanvas - ${label}` : 'OpenCanvas';
  }

  function ensureDocumentExists() {
    if (!appState.hasDocument) {
      notifier.error('Please create or open a document first.');
      return false;
    }
    const { width, height } = store.getDocumentSize();
    if (width <= 0 || height <= 0) {
      notifier.error('Document has invalid dimensions.');
      return false;
    }
    return true;
  }

  function refreshLayers() {
    canvasController.renderLayers(store.getLayersRef());
    layersPanel.render();
    canvasController.drawOverlay(store.getSelectedLayers());
  }

  function updateOverlay() {
    canvasController.drawOverlay(store.getSelectedLayers());
  }

  function updateZoomSelect() {
    if (appState.zoomMode === 'fit') {
      zoomSelect.value = 'fit';
      return;
    }
    const zoomValue = canvasController.getZoom();
    const numericOptions = Array.from(zoomSelect.options)
      .map((option) => option.value)
      .filter((value) => value !== 'fit');
    const closest = nearestZoomOption(zoomValue, numericOptions);
    zoomSelect.value = closest;
  }

  function fitAndCenter() {
    const zoom = canvasController.fitToView();
    appState.zoomMode = 'fit';
    updateZoomSelect();
    return zoom;
  }

  function markDocumentModified() {
    appState.meta = {
      ...appState.meta,
      modifiedAt: new Date().toISOString()
    };
  }

  function initializeDocument(width, height) {
    store.reset(width, height, []);
    canvasController.setDocumentSize(width, height);
    canvasController.renderLayers([]);
    fitAndCenter();
    updateOverlay();
    appState.hasDocument = true;
    appState.fileName = DEFAULT_FILE_NAME;
    appState.filePath = null;
    appState.meta = createDocumentMeta();
    updateTitle();
  }

  async function handleNewDocument() {
    if (appState.busy) {
      return;
    }
    setBusy(true);
    try {
      const defaults = appState.hasDocument ? store.getDocumentSize() : { width: 1920, height: 1080 };
      const dimensions = await modalController.open(defaults);
      if (!dimensions) {
        return;
      }
      const response = await window.api.newDocument(dimensions.width, dimensions.height);
      initializeDocument(response.width, response.height);
      notifier.success('New document created.');
    } catch (error) {
      console.error(error);
      notifier.error(error.message || 'Could not create document.');
    } finally {
      setBusy(false);
    }
  }

  async function handleOpenDocument() {
    if (appState.busy) {
      return;
    }
    setBusy(true);
    try {
      const result = await window.api.openOCP();
      if (!result || result.canceled) {
        if (result?.error) {
          notifier.error(result.error);
        }
        return;
      }

      const bitmap = await base64ToImageBitmap(result.pngBase64);
      initializeDocument(result.width, result.height);
      const layer = {
        id: generateLayerId(),
        name: result.fileName || 'Imported Layer',
        image: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        x: 0,
        y: 0,
        opacity: 1,
        visible: true
      };
      store.addLayer(layer, { select: true, record: false });
      canvasController.renderLayers(store.getLayersRef());
      canvasController.drawOverlay(store.getSelectedLayers());
      appState.fileName = result.fileName || DEFAULT_FILE_NAME;
      appState.filePath = result.filePath || null;
      appState.meta = createDocumentMeta(result.meta);
      updateTitle();
      notifier.success(`Loaded ${appState.fileName}`);
    } catch (error) {
      console.error(error);
      notifier.error(error.message || 'Could not open project.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveDocument(options = {}) {
    if (appState.busy) {
      return;
    }
    if (!ensureDocumentExists()) {
      return;
    }
    setBusy(true);
    try {
      canvasController.renderLayers(store.getLayersRef());
      const pngBase64 = canvasController.capturePNGBase64();
      markDocumentModified();
      const payload = {
        width: store.getDocumentSize().width,
        height: store.getDocumentSize().height,
        pngBase64,
        meta: appState.meta,
        saveAs: Boolean(options.saveAs)
      };

      const result = await window.api.saveOCP(payload);
      if (!result || result.canceled) {
        if (result?.error) {
          notifier.error(result.error);
        }
        return;
      }

      appState.filePath = result.filePath;
      appState.fileName = result.fileName;
      updateTitle();
      notifier.success(`Saved ${appState.fileName}`);
    } catch (error) {
      console.error(error);
      notifier.error(error.message || 'Could not save project.');
    } finally {
      setBusy(false);
    }
  }

  async function handleExportPNG() {
    if (appState.busy) {
      return;
    }
    if (!ensureDocumentExists()) {
      return;
    }
    setBusy(true);
    try {
      canvasController.renderLayers(store.getLayersRef());
      const pngBase64 = canvasController.capturePNGBase64();
      const result = await window.api.exportPNG(pngBase64);
      if (!result || result.canceled) {
        if (result?.error) {
          notifier.error(result.error);
        }
        return;
      }
      notifier.success('PNG exported.');
    } catch (error) {
      console.error(error);
      notifier.error(error.message || 'Could not export PNG.');
    } finally {
      setBusy(false);
    }
  }

  async function addImageLayerFromBitmap(bitmap, name) {
    const { width: docWidth, height: docHeight } = store.getDocumentSize();
    if (!appState.hasDocument || docWidth === 0 || docHeight === 0) {
      initializeDocument(bitmap.width, bitmap.height);
    }

    const { width, height } = store.getDocumentSize();
    const layer = {
      id: generateLayerId(),
      name,
      image: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      x: (width - bitmap.width) / 2,
      y: (height - bitmap.height) / 2,
      opacity: 1,
      visible: true
    };
    store.addLayer(layer, { select: true, record: true });
    canvasController.renderLayers(store.getLayersRef());
    canvasController.drawOverlay(store.getSelectedLayers());
    notifier.success(`Added ${name}`);
  }

  async function handleDroppedFiles(files) {
    const imageFiles = files.filter(isImageFile);
    if (imageFiles.length === 0) {
      notifier.error('No supported image files found.');
      return;
    }

    for (const file of imageFiles) {
      try {
        const bitmap = await fileToImageBitmap(file);
        await addImageLayerFromBitmap(bitmap, file.name || 'Layer');
      } catch (error) {
        console.error(error);
        notifier.error(`Failed to import ${file.name}: ${error.message}`);
      }
    }
  }

  registerDropTarget(viewportElement, handleDroppedFiles);
  if (leftPanel) {
    registerDropTarget(leftPanel, handleDroppedFiles);
  }

  store.subscribe((detail) => {
    if (detail.type === 'layers' || detail.type === 'reset' || detail.type === 'snapshot' || detail.type === 'undo' || detail.type === 'redo') {
      refreshLayers();
      if (detail.type === 'layers') {
        markDocumentModified();
      }
    }
    if (detail.type === 'selection' || detail.type === 'layers' || detail.type === 'reset' || detail.type === 'snapshot' || detail.type === 'undo' || detail.type === 'redo') {
      updateOverlay();
    }
    if (detail.type === 'document-size') {
      const { width, height } = store.getDocumentSize();
      canvasController.setDocumentSize(width, height);
      fitAndCenter();
      updateOverlay();
    }
  });

  newButton.addEventListener('click', handleNewDocument);
  openButton.addEventListener('click', handleOpenDocument);
  saveButton.addEventListener('click', () => handleSaveDocument({ saveAs: false }));
  exportButton.addEventListener('click', handleExportPNG);

  zoomSelect.addEventListener('change', (event) => {
    const value = event.target.value;
    if (value === 'fit') {
      fitAndCenter();
      appState.zoomMode = 'fit';
      return;
    }
    const targetZoom = parseFloat(value);
    if (!Number.isFinite(targetZoom) || targetZoom <= 0) {
      return;
    }
    const { width, height } = store.getDocumentSize();
    const focusPoint = { x: width / 2, y: height / 2 };
    canvasController.setZoom(targetZoom, focusPoint);
    appState.zoomMode = 'fixed';
    updateZoomSelect();
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Delete') {
      if (store.hasSelection()) {
        store.removeSelectedLayers();
        notifier.info('Layer(s) removed.');
      }
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) {
        if (!store.redo()) {
          notifier.info('Nothing to redo.');
        }
      } else if (!store.undo()) {
        notifier.info('Nothing to undo.');
      }
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      if (!store.redo()) {
        notifier.info('Nothing to redo.');
      }
      return;
    }

    if (event.key.toLowerCase() === 'v') {
      toolManager.setActive('transform');
    }
  });

  let panSession = null;

  function beginPan(event) {
    panSession = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      pan: canvasController.getTransform()
    };
    viewportElement.setPointerCapture(event.pointerId);
  }

  function updatePan(event) {
    if (!panSession) {
      return;
    }
    const dx = event.clientX - panSession.startX;
    const dy = event.clientY - panSession.startY;
    canvasController.setPan(panSession.pan.panX + dx, panSession.pan.panY + dy);
    appState.zoomMode = 'fixed';
  }

  function endPan(event) {
    if (!panSession || panSession.pointerId !== event.pointerId) {
      return;
    }
    try {
      viewportElement.releasePointerCapture(event.pointerId);
    } catch (_) {
      // Ignore release errors
    }
    panSession = null;
  }

  viewportElement.addEventListener('pointerdown', (event) => {
    if (event.button === 1) {
      event.preventDefault();
      beginPan(event);
    }
  });

  viewportElement.addEventListener('pointermove', (event) => {
    if (panSession && event.pointerId === panSession.pointerId) {
      event.preventDefault();
      updatePan(event);
    }
  });

  viewportElement.addEventListener('pointerup', endPan);
  viewportElement.addEventListener('pointercancel', endPan);

  viewportElement.addEventListener('wheel', (event) => {
    if (!appState.hasDocument) {
      return;
    }
    event.preventDefault();
    const zoomFactor = event.deltaY < 0 ? 1.1 : 0.9;
    const focusPoint = canvasController.screenToDocument(event.clientX, event.clientY);
    const nextZoom = canvasController.getZoom() * zoomFactor;
    canvasController.setZoom(clamp(nextZoom, 0.05, 8), focusPoint);
    appState.zoomMode = 'fixed';
    updateZoomSelect();
  }, { passive: false });

  const unsubscribeMenu = window.addEventListener ? null : null;

  window.addEventListener('app-menu', (event) => {
    const detail = event.detail || {};
    switch (detail.type) {
      case 'new':
        handleNewDocument();
        break;
      case 'open':
        handleOpenDocument();
        break;
      case 'save':
        handleSaveDocument({ saveAs: detail.saveAs });
        break;
      case 'export':
        handleExportPNG();
        break;
      default:
        break;
    }
  });

  layersPanel.render();
  updateTitle();
  updateZoomSelect();
}