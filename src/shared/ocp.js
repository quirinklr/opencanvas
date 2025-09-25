const FORMAT = 'OCP-1';
const VERSION = 1;
const COLOR_SPACE = 'sRGB';
const COMPRESSION = 'png';
const APP_NAME = 'OpenCanvas';

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function isIsoString(value) {
  if (typeof value !== 'string') {
    return false;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp);
}

function requireBase64Png(pngBase64) {
  if (typeof pngBase64 !== 'string' || pngBase64.trim().length === 0) {
    throw new Error('PNG payload is missing.');
  }

  let buffer;
  try {
    buffer = Buffer.from(pngBase64, 'base64');
  } catch (_error) {
    throw new Error('PNG payload must be Base64 encoded.');
  }

  if (!buffer || buffer.length === 0) {
    throw new Error('PNG payload is empty.');
  }

  return pngBase64;
}

function encodeOCP({ width, height, pngBase64, meta = {} }) {
  if (!isPositiveInteger(width) || !isPositiveInteger(height)) {
    throw new Error('Width and height must be positive integers.');
  }

  const payload = requireBase64Png(pngBase64);
  const now = new Date().toISOString();
  const createdAt = isIsoString(meta.createdAt) ? meta.createdAt : now;

  const document = {
    format: FORMAT,
    version: VERSION,
    width,
    height,
    colorSpace: COLOR_SPACE,
    compression: COMPRESSION,
    payload,
    meta: {
      createdAt,
      modifiedAt: now,
      app: APP_NAME
    }
  };

  return JSON.stringify(document, null, 2);
}

function decodeOCP(jsonString) {
  if (typeof jsonString !== 'string') {
    throw new Error('OCP file must be a string.');
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonString);
  } catch (_error) {
    throw new Error('OCP file is not valid JSON.');
  }

  if (parsed.format !== FORMAT) {
    throw new Error(`Invalid format: ${parsed.format}`);
  }

  if (parsed.version !== VERSION) {
    throw new Error(`Invalid version: ${parsed.version}`);
  }

  if (!isPositiveInteger(parsed.width) || !isPositiveInteger(parsed.height)) {
    throw new Error('Document width/height are invalid.');
  }

  if (parsed.colorSpace !== COLOR_SPACE) {
    throw new Error(`Unsupported color space: ${parsed.colorSpace}`);
  }

  if (parsed.compression !== COMPRESSION) {
    throw new Error(`Unsupported compression: ${parsed.compression}`);
  }

  const payload = requireBase64Png(parsed.payload);
  const meta = parsed.meta && typeof parsed.meta === 'object' ? parsed.meta : {};

  const createdAt = isIsoString(meta.createdAt) ? meta.createdAt : new Date().toISOString();
  const modifiedAt = isIsoString(meta.modifiedAt) ? meta.modifiedAt : createdAt;
  const app = typeof meta.app === 'string' ? meta.app : APP_NAME;

  return {
    width: parsed.width,
    height: parsed.height,
    pngBase64: payload,
    meta: {
      createdAt,
      modifiedAt,
      app
    }
  };
}

module.exports = {
  encodeOCP,
  decodeOCP,
  FORMAT,
  VERSION,
  APP_NAME
};