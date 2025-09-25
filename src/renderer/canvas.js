import {
  HANDLE_SIZE_PX,
  ROTATE_HANDLE_RADIUS_PX,
  getLayerCenter,
  getResizeHandlesLocal,
  getRotateHandlesLocal
} from './geometry.js';

const ROTATE_HANDLE_DIAMETER_PX = ROTATE_HANDLE_RADIUS_PX * 2;

export function createCanvasController({ canvas, overlay, stage, viewport }) {
  if (!canvas || !overlay || !stage || !viewport) {
    throw new Error('Canvas controller requires canvas, overlay, stage, and viewport elements.');
  }

  const ctx = canvas.getContext('2d');
  const overlayCtx = overlay.getContext('2d');

  let documentWidth = canvas.width;
  let documentHeight = canvas.height;
  let zoom = 1;
  let panX = 0;
  let panY = 0;

  function applyTransform() {
    stage.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  }

  function setDocumentSize(width, height) {
    documentWidth = width;
    documentHeight = height;
    canvas.width = width;
    canvas.height = height;
    overlay.width = width;
    overlay.height = height;
    stage.style.width = `${width}px`;
    stage.style.height = `${height}px`;
    overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
    applyTransform();
  }

  function renderLayers(layers) {
    ctx.clearRect(0, 0, documentWidth, documentHeight);
    layers.forEach((layer) => {
      if (layer.visible === false || !layer.image) {
        return;
      }
      const alpha = typeof layer.opacity === 'number' ? layer.opacity : 1;
      const rotation = layer.rotation || 0;
      const center = getLayerCenter(layer);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(center.x, center.y);
      ctx.rotate(rotation);
      ctx.drawImage(layer.image, -layer.width / 2, -layer.height / 2, layer.width, layer.height);
      ctx.restore();
    });
  }

  function drawHandles(layer, { activeHandle } = {}) {
    const center = getLayerCenter(layer);
    const rotation = layer.rotation || 0;
    const handleSize = HANDLE_SIZE_PX / zoom;
    const rotateRadius = ROTATE_HANDLE_RADIUS_PX / zoom;
    overlayCtx.save();
    overlayCtx.translate(center.x, center.y);
    overlayCtx.rotate(rotation);

    overlayCtx.lineWidth = 1 / zoom;
    overlayCtx.setLineDash([6 / zoom, 4 / zoom]);
    overlayCtx.strokeStyle = '#4a90e2';
    overlayCtx.strokeRect(-layer.width / 2, -layer.height / 2, layer.width, layer.height);
    overlayCtx.setLineDash([]);

    const halfHandle = handleSize / 2;
    const resizeHandles = getResizeHandlesLocal(layer);
    resizeHandles.forEach((handle) => {
      overlayCtx.beginPath();
      overlayCtx.rect(handle.x - halfHandle, handle.y - halfHandle, handleSize, handleSize);
      const isActive = activeHandle === handle.key;
      overlayCtx.fillStyle = isActive ? '#4a90e2' : '#0b1828';
      overlayCtx.strokeStyle = isActive ? '#ffffff' : '#4a90e2';
      overlayCtx.fill();
      overlayCtx.stroke();
    });

    const rotateHandles = getRotateHandlesLocal(layer, zoom);
    rotateHandles.forEach((handle) => {
      overlayCtx.beginPath();
      overlayCtx.arc(handle.x, handle.y, rotateRadius, 0, Math.PI * 2);
      const isActive = activeHandle === handle.key;
      overlayCtx.fillStyle = isActive ? '#ffffff' : '#4a90e2';
      overlayCtx.strokeStyle = '#0b1828';
      overlayCtx.lineWidth = 1 / zoom;
      overlayCtx.fill();
      overlayCtx.stroke();
    });

    overlayCtx.restore();
  }

  function drawOverlay(layers, { activeHandle = null } = {}) {
    overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
    if (!layers || layers.length === 0) {
      return;
    }

    layers.forEach((layer) => {
      drawHandles(layer, { activeHandle });
    });
  }

  function getDocumentSize() {
    return { width: documentWidth, height: documentHeight };
  }

  function setZoom(scale, focusPoint) {
    const nextZoom = Math.min(Math.max(scale, 0.05), 8);
    if (focusPoint) {
      const screenX = focusPoint.x * zoom + panX;
      const screenY = focusPoint.y * zoom + panY;
      panX = screenX - focusPoint.x * nextZoom;
      panY = screenY - focusPoint.y * nextZoom;
    }
    zoom = nextZoom;
    applyTransform();
    return zoom;
  }

  function translatePan(deltaX, deltaY) {
    panX += deltaX;
    panY += deltaY;
    applyTransform();
  }

  function setPan(x, y) {
    panX = x;
    panY = y;
    applyTransform();
  }

  function fitToView() {
    if (!documentWidth || !documentHeight) {
      return zoom;
    }
    const rect = viewport.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return zoom;
    }
    const scale = Math.min(rect.width / documentWidth, rect.height / documentHeight, 1);
    zoom = scale > 0 ? scale : 1;
    const scaledWidth = documentWidth * zoom;
    const scaledHeight = documentHeight * zoom;
    panX = (rect.width - scaledWidth) / 2;
    panY = (rect.height - scaledHeight) / 2;
    applyTransform();
    return zoom;
  }

  function getZoom() {
    return zoom;
  }

  function getTransform() {
    return { zoom, panX, panY };
  }

  function screenToDocument(clientX, clientY) {
    const rect = overlay.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / zoom,
      y: (clientY - rect.top) / zoom
    };
  }

  function documentToScreen(x, y) {
    const rect = overlay.getBoundingClientRect();
    return {
      x: rect.left + x * zoom,
      y: rect.top + y * zoom
    };
  }

  function capturePNGBase64() {
    const dataUrl = canvas.toDataURL('image/png');
    return dataUrl.replace(/^data:image\/png;base64,/, '');
  }

  function setTransform(nextPanX, nextPanY, nextZoom) {
    panX = nextPanX;
    panY = nextPanY;
    zoom = nextZoom;
    applyTransform();
  }

  return {
    setDocumentSize,
    renderLayers,
    drawOverlay,
    getDocumentSize,
    fitToView,
    setZoom,
    setPan,
    translatePan,
    getZoom,
    getTransform,
    screenToDocument,
    documentToScreen,
    capturePNGBase64,
    setTransform
  };
}