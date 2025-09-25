const MIN_SIZE = 1;
const MAX_SIZE = 16384;

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

function ensurePNGBase64(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('PNG data must not be empty.');
  }

  try {
    const buffer = Buffer.from(value, 'base64');
    if (!buffer || buffer.length === 0) {
      throw new Error('PNG data is empty.');
    }
    return value;
  } catch (_error) {
    throw new Error('PNG data must be Base64 encoded.');
  }
}

function sanitizeMeta(meta = {}) {
  if (meta === null || typeof meta !== 'object' || Array.isArray(meta)) {
    throw new Error('Meta information must be an object.');
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

module.exports = {
  MIN_SIZE,
  MAX_SIZE,
  validateDimensions,
  validateSavePayload,
  ensurePNGBase64
};