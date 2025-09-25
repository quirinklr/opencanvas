export const HANDLE_SIZE_PX = 10;

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
      if (layer.visible === false) {
        return;
      }
      const alpha = typeof layer.opacity === 'number' ? layer.opacity : 1;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.drawImage(layer.image, layer.x, layer.y, layer.width, layer.height);
      ctx.restore();
    });
  }

  function drawOverlay(layers, { activeHandle = null } = {}) {
    overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
    if (!layers || layers.length === 0) {
      return;
    }

    overlayCtx.save();
    overlayCtx.lineWidth = 1;
    overlayCtx.setLineDash([6, 4]);
    overlayCtx.strokeStyle = '#4a90e2';

    layers.forEach((layer) => {
      overlayCtx.strokeRect(layer.x, layer.y, layer.width, layer.height);
    });

    overlayCtx.restore();

    if (layers.length === 1) {
      const layer = layers[0];
      const handleSize = HANDLE_SIZE_PX / zoom;
      const handles = [
        { key: 'nw', x: layer.x, y: layer.y },
        { key: 'n', x: layer.x + layer.width / 2, y: layer.y },
        { key: 'ne', x: layer.x + layer.width, y: layer.y },
        { key: 'e', x: layer.x + layer.width, y: layer.y + layer.height / 2 },
        { key: 'se', x: layer.x + layer.width, y: layer.y + layer.height },
        { key: 's', x: layer.x + layer.width / 2, y: layer.y + layer.height },
        { key: 'sw', x: layer.x, y: layer.y + layer.height },
        { key: 'w', x: layer.x, y: layer.y + layer.height / 2 }
      ];

      overlayCtx.save();
      overlayCtx.lineWidth = 1 / zoom;

      handles.forEach((handle) => {
        const handleX = handle.x - handleSize / 2;
        const handleY = handle.y - handleSize / 2;
        overlayCtx.beginPath();
        overlayCtx.rect(handleX, handleY, handleSize, handleSize);
        overlayCtx.fillStyle = handle.key === activeHandle ? '#4a90e2' : '#0b1828';
        overlayCtx.strokeStyle = handle.key === activeHandle ? '#ffffff' : '#4a90e2';
        overlayCtx.fill();
        overlayCtx.stroke();
      });
      overlayCtx.restore();
    }
  }

  function getDocumentSize() {
    return { width: documentWidth, height: documentHeight };
  }

  function setZoom(scale, focusPoint) {
    const nextZoom = Math.min(Math.max(scale, 0.05), 8);
    if (focusPoint) {
      const { x, y } = focusPoint;
      const screenX = x * zoom + panX;
      const screenY = y * zoom + panY;
      panX = screenX - x * nextZoom;
      panY = screenY - y * nextZoom;
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
    const x = (clientX - rect.left) / zoom;
    const y = (clientY - rect.top) / zoom;
    return { x, y };
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