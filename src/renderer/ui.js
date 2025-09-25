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

  function show(message, type = 'error', duration = 4500) {
    element.textContent = message;
    element.classList.add('visible');
    element.classList.toggle('error', type === 'error');

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      element.classList.remove('visible');
      element.classList.remove('error');
    }, duration);
  }

  return {
    error: (message) => show(message, 'error')
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

async function base64ToImageBitmap(base64) {
  const binary = atob(base64);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
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
  const toolList = document.getElementById('tool-list');
  const layerList = document.getElementById('layer-list');
  const leftPanel = document.querySelector('.left-panel');

  const notifier = createNotifier();
  const modalController = createModalController();
  const toolManager = createToolManager({ container: toolList });
  toolManager.setActive('transform');

  if (!window.api) {
    notifier.error('Bridge not available. Please restart the application.');
    throw new Error('window.api is undefined');
  }

  const store = createDocumentState();
  const canvasController = createCanvasController({
    canvas: canvasElement,
    overlay: overlayElement,
    stage: stageElement,
    viewport: viewportElement
  });

  const layersPanel = createLayersPanel({
    listElement: layerList,
    store
  });

  createTransformController({
    overlay: overlayElement,
    store,
    canvasController,
    getActiveTool: () => toolManager.getActive()
  });

  overlayElement.style.cursor = 'default';

  const appState = {
    fileName: 'No project',
    filePath: null,
    meta: createDocumentMeta(),
    hasDocument: false,
    busy: false
  };

  function setBusy(value) {
    appState.busy = value;
    [newButton, openButton, saveButton, exportButton].forEach((element) => {
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

  function refreshCanvas() {
    canvasController.renderLayers(store.getLayersRef());
    updateOverlay();
    layersPanel.render();
  }

  function updateOverlay(handle) {
    canvasController.drawOverlay(store.getSelectedLayers(), { activeHandle: handle || null });
  }

  function fitAndCenter() {
    canvasController.fitToView();
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
    canvasController.drawOverlay([]);
    fitAndCenter();
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
        visible: true,
        rotation: 0
      };
      store.addLayer(layer, { select: true, record: false });
      refreshCanvas();
      appState.fileName = result.fileName || DEFAULT_FILE_NAME;
      appState.filePath = result.filePath || null;
      appState.meta = createDocumentMeta(result.meta);
      updateTitle();
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
      }
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
      visible: true,
      rotation: 0
    };
    store.addLayer(layer, { select: true, record: true });
    refreshCanvas();
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
      refreshCanvas();
      if (detail.type === 'layers') {
        markDocumentModified();
      }
    }
    if (detail.type === 'selection') {
      layersPanel.render();
      updateOverlay();
    }
    if (detail.type === 'document-size') {
      const size = store.getDocumentSize();
      canvasController.setDocumentSize(size.width, size.height);
      fitAndCenter();
      updateOverlay();
    }
  });

  newButton.addEventListener('click', handleNewDocument);
  openButton.addEventListener('click', handleOpenDocument);
  saveButton.addEventListener('click', () => handleSaveDocument({ saveAs: false }));
  exportButton.addEventListener('click', handleExportPNG);

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Delete') {
      if (store.hasSelection()) {
        store.removeSelectedLayers();
      }
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) {
        store.redo();
      } else {
        store.undo();
      }
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      store.redo();
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
    viewportElement.style.cursor = 'grabbing';
  }

  function updatePan(event) {
    if (!panSession) {
      return;
    }
    const dx = event.clientX - panSession.startX;
    const dy = event.clientY - panSession.startY;
    canvasController.setPan(panSession.pan.panX + dx, panSession.pan.panY + dy);
  }

  function endPan(event) {
    if (!panSession || panSession.pointerId !== event.pointerId) {
      return;
    }
    try {
      viewportElement.releasePointerCapture(event.pointerId);
    } catch (error) {
      // ignore pointer release errors
    }
    panSession = null;
    viewportElement.style.cursor = 'default';
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
    canvasController.setZoom(Math.min(Math.max(nextZoom, 0.05), 8), focusPoint);
  }, { passive: false });

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
  canvasController.drawOverlay([]);
}