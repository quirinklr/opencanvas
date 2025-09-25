const { contextBridge, ipcRenderer } = require('electron');
const { validateDimensions, validateSavePayload, ensurePNGBase64 } = require('./schema');
const { decodeOCP } = require('../shared/ocp');

const DEFAULT_FILE_NAME = 'untitled.ocp';
const MENU_CHANNEL = 'app-menu';

function dispatchMenuEvent(detail) {
  try {
    window.dispatchEvent(new CustomEvent(MENU_CHANNEL, { detail }));
  } catch (error) {
    console.error('Menu event dispatch failed', error);
  }
}

ipcRenderer.on(MENU_CHANNEL, (_event, detail) => {
  if (detail && typeof detail === 'object') {
    dispatchMenuEvent(detail);
  }
});

contextBridge.exposeInMainWorld('api', {
  async newDocument(width, height) {
    const dimensions = validateDimensions(width, height);
    const response = await ipcRenderer.invoke('document:new', dimensions);
    return {
      width: dimensions.width,
      height: dimensions.height,
      fileName: response?.fileName || DEFAULT_FILE_NAME
    };
  },

  async openOCP() {
    const result = await ipcRenderer.invoke('dialog:openOCP');
    if (!result || result.canceled) {
      return { canceled: true, error: result?.error };
    }

    try {
      const document = decodeOCP(result.content);
      return {
        canceled: false,
        filePath: result.filePath,
        fileName: result.fileName,
        width: document.width,
        height: document.height,
        pngBase64: document.pngBase64,
        meta: document.meta
      };
    } catch (error) {
      return { canceled: true, error: error.message };
    }
  },

  async saveOCP(data) {
    const payload = validateSavePayload(data);
    const result = await ipcRenderer.invoke('dialog:saveOCP', payload);
    if (!result || result.canceled) {
      return { canceled: true, error: result?.error };
    }

    return {
      canceled: false,
      filePath: result.filePath,
      fileName: result.fileName
    };
  },

  async exportPNG(pngBase64) {
    const payload = ensurePNGBase64(pngBase64);
    const result = await ipcRenderer.invoke('dialog:exportPNG', { pngBase64: payload });
    if (!result || result.canceled) {
      return { canceled: true, error: result?.error };
    }

    return { canceled: false, filePath: result.filePath };
  }
});