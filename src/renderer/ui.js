import { createCanvasController } from './canvas.js';
import { createModalController } from './modal.js';

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

export function setupUI() {
  const canvasElement = document.getElementById('canvas');
  const fileNameLabel = document.getElementById('file-name');
  const newButton = document.getElementById('btn-new');
  const openButton = document.getElementById('btn-open');
  const saveButton = document.getElementById('btn-save');
  const exportButton = document.getElementById('btn-export');
  const zoomSelect = document.getElementById('zoom-select');

  const canvasController = createCanvasController(canvasElement);
  const modalController = createModalController();
  const notifier = createNotifier();

  const state = {
    fileName: 'untitled.ocp',
    filePath: null,
    width: 0,
    height: 0,
    meta: {
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString()
    },
    zoomMode: 'fit',
    busy: false
  };

  function setBusy(value) {
    state.busy = value;
    [newButton, openButton, saveButton, exportButton, zoomSelect].forEach((element) => {
      element.disabled = value;
    });
  }

  function updateTitle() {
    fileNameLabel.textContent = state.fileName;
    document.title = `OpenCanvas - ${state.fileName}`;
  }

  function ensureDocumentExists() {
    if (state.width > 0 && state.height > 0) {
      return true;
    }
    notifier.error('Please create or open a document first.');
    return false;
  }

  async function handleNewDocument() {
    if (state.busy) return;
    setBusy(true);
    try {
      const dimensions = await modalController.open({ width: state.width || 1920, height: state.height || 1080 });
      if (!dimensions) {
        return;
      }

      const response = await window.api.newDocument(dimensions.width, dimensions.height);
      const normalizedWidth = response.width;
      const normalizedHeight = response.height;

      canvasController.resize(normalizedWidth, normalizedHeight);
      canvasController.clear();
      state.width = normalizedWidth;
      state.height = normalizedHeight;
      state.meta = {
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString()
      };
      state.fileName = response.fileName || 'untitled.ocp';
      state.filePath = null;
      state.zoomMode = 'fit';
      canvasController.fitToContainer();
      zoomSelect.value = 'fit';
      updateTitle();
      notifier.success('New document created.');
    } catch (error) {
      console.error(error);
      notifier.error(error.message || 'Could not create document.');
    } finally {
      setBusy(false);
    }
  }

  async function handleOpenDocument() {
    if (state.busy) return;
    setBusy(true);
    try {
      const result = await window.api.openOCP();
      if (!result || result.canceled) {
        if (result?.error) {
          notifier.error(result.error);
        }
        return;
      }

      await canvasController.drawFromBase64(result.pngBase64);
      state.width = result.width;
      state.height = result.height;
      state.meta = result.meta || state.meta;
      state.fileName = result.fileName || 'untitled.ocp';
      state.filePath = result.filePath || null;
      state.zoomMode = 'fit';
      zoomSelect.value = 'fit';
      canvasController.fitToContainer();
      updateTitle();
      notifier.success(`Loaded ${state.fileName}`);
    } catch (error) {
      console.error(error);
      notifier.error(error.message || 'Could not open project.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveDocument(options = {}) {
    if (state.busy) return;
    if (!ensureDocumentExists()) {
      return;
    }
    setBusy(true);
    try {
      const pngBase64 = canvasController.getPNGBase64();
      const payload = {
        width: state.width,
        height: state.height,
        pngBase64,
        meta: state.meta,
        saveAs: Boolean(options.saveAs)
      };

      const result = await window.api.saveOCP(payload);
      if (!result || result.canceled) {
        if (result?.error) {
          notifier.error(result.error);
        }
        return;
      }

      state.filePath = result.filePath;
      state.fileName = result.fileName;
      state.meta = {
        ...state.meta,
        modifiedAt: new Date().toISOString()
      };
      updateTitle();
      notifier.success(`Saved ${state.fileName}`);
    } catch (error) {
      console.error(error);
      notifier.error(error.message || 'Could not save project.');
    } finally {
      setBusy(false);
    }
  }

  async function handleExportPNG() {
    if (state.busy) return;
    if (!ensureDocumentExists()) {
      return;
    }
    setBusy(true);
    try {
      const pngBase64 = canvasController.getPNGBase64();
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

  function applyZoom(value) {
    if (value === 'fit') {
      state.zoomMode = 'fit';
      canvasController.fitToContainer();
      return;
    }

    const scale = parseFloat(value);
    if (!Number.isFinite(scale) || scale <= 0) {
      return;
    }

    state.zoomMode = 'fixed';
    canvasController.setZoom(scale);
  }

  function handleZoomChange(event) {
    applyZoom(event.target.value);
  }

  function handleResize() {
    if (state.zoomMode === 'fit') {
      canvasController.fitToContainer();
    }
  }

  function handleMenuEvent(event) {
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
  }

  newButton.addEventListener('click', handleNewDocument);
  openButton.addEventListener('click', handleOpenDocument);
  saveButton.addEventListener('click', () => handleSaveDocument({ saveAs: false }));
  exportButton.addEventListener('click', handleExportPNG);
  zoomSelect.addEventListener('change', handleZoomChange);
  window.addEventListener('resize', handleResize);
  window.addEventListener('app-menu', handleMenuEvent);

  updateTitle();
  zoomSelect.value = 'fit';
  applyZoom('fit');
}
