const { contextBridge, ipcRenderer } = require('electron');

const MIN_SIZE = 1;
const MAX_SIZE = 16384;
const DEFAULT_FILE_NAME = 'untitled.ocp';

function toInteger(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`${label} must be a number.`);
  }
  const integer = Math.floor(number);
  if (!Number.isInteger(integer)) {
    throw new Error(`${label} must be an integer.`);
  }
  return integer;
}

function validateDimensions(width, height) {
  const normalizedWidth = toInteger(width, 'Width');
  const normalizedHeight = toInteger(height, 'Height');

  if (normalizedWidth < MIN_SIZE || normalizedWidth > MAX_SIZE) {
    throw new Error(`Width must be between ${MIN_SIZE} and ${MAX_SIZE}.`);
  }
  if (normalizedHeight < MIN_SIZE || normalizedHeight > MAX_SIZE) {
    throw new Error(`Height must be between ${MIN_SIZE} and ${MAX_SIZE}.`);
  }

  return { width: normalizedWidth, height: normalizedHeight };
}

function decodeBase64(input) {
  if (typeof globalThis.atob === 'function') {
    return globalThis.atob(input);
  }
  if (globalThis.Buffer && typeof globalThis.Buffer.from === 'function') {
    return globalThis.Buffer.from(input, 'base64').toString('binary');
  }
  throw new Error('Base64 decoder not available.');
}

function ensurePNGBase64(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('PNG data must not be empty.');
  }

  const base64 = value.replace(/\s/g, '');
  try {
    const binary = decodeBase64(base64);
    if (!binary || binary.length === 0) {
      throw new Error('PNG data is empty.');
    }
  } catch (_error) {
    throw new Error('PNG data must be Base64 encoded.');
  }

  return base64;
}

function sanitizeMeta(meta = {}) {
  if (meta === null || typeof meta !== 'object' || Array.isArray(meta)) {
    return {};
  }

  const result = {};
  if (typeof meta.createdAt === 'string') {
    result.createdAt = meta.createdAt;
  }
  if (typeof meta.modifiedAt === 'string') {
    result.modifiedAt = meta.modifiedAt;
  }
  if (typeof meta.app === 'string') {
    result.app = meta.app;
  }
  return result;
}

function validateSavePayload(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Save payload must be an object.');
  }

  const { width, height } = validateDimensions(data.width, data.height);
  const pngBase64 = ensurePNGBase64(data.pngBase64);
  const meta = sanitizeMeta(data.meta);
  const saveAs = Boolean(data.saveAs);

  return { width, height, pngBase64, meta, saveAs };
}

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

    const document = result.document;
    if (!document || typeof document !== 'object') {
      return { canceled: true, error: 'Invalid document payload.' };
    }

    return {
      canceled: false,
      filePath: result.filePath,
      fileName: result.fileName,
      width: document.width,
      height: document.height,
      pngBase64: document.pngBase64,
      meta: document.meta
    };
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