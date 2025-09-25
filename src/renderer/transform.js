import { HANDLE_SIZE_PX } from './canvas.js';

const MIN_LAYER_SIZE = 10;

function pointInRect(point, rect) {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function createHandleRects(layer, zoom) {
  const size = HANDLE_SIZE_PX / zoom;
  const half = size / 2;
  const rects = [
    { key: 'nw', x: layer.x, y: layer.y },
    { key: 'n', x: layer.x + layer.width / 2, y: layer.y },
    { key: 'ne', x: layer.x + layer.width, y: layer.y },
    { key: 'e', x: layer.x + layer.width, y: layer.y + layer.height / 2 },
    { key: 'se', x: layer.x + layer.width, y: layer.y + layer.height },
    { key: 's', x: layer.x + layer.width / 2, y: layer.y + layer.height },
    { key: 'sw', x: layer.x, y: layer.y + layer.height },
    { key: 'w', x: layer.x, y: layer.y + layer.height / 2 }
  ];
  return rects.map((handle) => ({
    key: handle.key,
    x: handle.x - half,
    y: handle.y - half,
    width: size,
    height: size
  }));
}

function clampSize(value) {
  return Math.max(value, MIN_LAYER_SIZE);
}

function computeResize(handle, pointer, initial) {
  const result = { x: initial.x, y: initial.y, width: initial.width, height: initial.height };
  const right = initial.x + initial.width;
  const bottom = initial.y + initial.height;

  switch (handle) {
    case 'nw': {
      const nextX = Math.min(pointer.x, right - MIN_LAYER_SIZE);
      const nextY = Math.min(pointer.y, bottom - MIN_LAYER_SIZE);
      result.width = clampSize(right - nextX);
      result.height = clampSize(bottom - nextY);
      result.x = right - result.width;
      result.y = bottom - result.height;
      break;
    }
    case 'n': {
      const nextY = Math.min(pointer.y, bottom - MIN_LAYER_SIZE);
      result.height = clampSize(bottom - nextY);
      result.y = bottom - result.height;
      break;
    }
    case 'ne': {
      const nextY = Math.min(pointer.y, bottom - MIN_LAYER_SIZE);
      const nextX = Math.max(pointer.x, initial.x + MIN_LAYER_SIZE);
      result.height = clampSize(bottom - nextY);
      result.y = bottom - result.height;
      result.width = clampSize(nextX - initial.x);
      break;
    }
    case 'e': {
      const nextX = Math.max(pointer.x, initial.x + MIN_LAYER_SIZE);
      result.width = clampSize(nextX - initial.x);
      break;
    }
    case 'se': {
      const nextX = Math.max(pointer.x, initial.x + MIN_LAYER_SIZE);
      const nextY = Math.max(pointer.y, initial.y + MIN_LAYER_SIZE);
      result.width = clampSize(nextX - initial.x);
      result.height = clampSize(nextY - initial.y);
      break;
    }
    case 's': {
      const nextY = Math.max(pointer.y, initial.y + MIN_LAYER_SIZE);
      result.height = clampSize(nextY - initial.y);
      break;
    }
    case 'sw': {
      const nextX = Math.min(pointer.x, right - MIN_LAYER_SIZE);
      const nextY = Math.max(pointer.y, initial.y + MIN_LAYER_SIZE);
      result.width = clampSize(right - nextX);
      result.x = right - result.width;
      result.height = clampSize(nextY - initial.y);
      break;
    }
    case 'w': {
      const nextX = Math.min(pointer.x, right - MIN_LAYER_SIZE);
      result.width = clampSize(right - nextX);
      result.x = right - result.width;
      break;
    }
    default:
      break;
  }

  return result;
}

export function createTransformController({ overlay, store, canvasController, getActiveTool }) {
  if (!overlay || !store || !canvasController || typeof getActiveTool !== 'function') {
    throw new Error('Transform controller requires overlay, store, canvas controller, and tool getter.');
  }

  let operation = null;

  function getLayersRef() {
    return store.getLayersRef();
  }

  function hitTestLayers(point, { onlySelected = false } = {}) {
    const layers = getLayersRef();
    for (let i = layers.length - 1; i >= 0; i -= 1) {
      const layer = layers[i];
      if (onlySelected && !store.getSelection().has(layer.id)) {
        continue;
      }
      const rect = {
        x: layer.x,
        y: layer.y,
        width: layer.width,
        height: layer.height
      };
      if (pointInRect(point, rect)) {
        return layer;
      }
    }
    return null;
  }

  function detectHandle(point, layer) {
    const zoom = canvasController.getZoom();
    const handles = createHandleRects(layer, zoom);
    return handles.find((handle) => pointInRect(point, handle));
  }

  function updateOverlay(activeHandle) {
    const selectedLayers = store.getSelectedLayers();
    canvasController.drawOverlay(selectedLayers, { activeHandle });
  }

  function beginMove(pointerId, startPoint, selectedLayers) {
    if (selectedLayers.length === 0) {
      return;
    }
    store.commit();
    overlay.setPointerCapture(pointerId);
    operation = {
      type: 'move',
      pointerId,
      startPoint,
      layerOrigins: selectedLayers.map((layer) => ({
        id: layer.id,
        x: layer.x,
        y: layer.y
      }))
    };
  }

  function beginResize(pointerId, startPoint, layer, handleKey) {
    store.commit();
    overlay.setPointerCapture(pointerId);
    operation = {
      type: 'resize',
      pointerId,
      startPoint,
      layerId: layer.id,
      handle: handleKey,
      initial: {
        x: layer.x,
        y: layer.y,
        width: layer.width,
        height: layer.height
      }
    };
    updateOverlay(handleKey);
  }

  function finishOperation() {
    if (operation) {
      try {
        overlay.releasePointerCapture(operation.pointerId);
      } catch (_) {
        // Ignore release errors (e.g. pointer already released)
      }
    }
    operation = null;
    updateOverlay(null);
  }

  function onPointerDown(event) {
    if (getActiveTool() !== 'transform') {
      return;
    }

    if (event.button !== 0) {
      return;
    }

    const point = canvasController.screenToDocument(event.clientX, event.clientY);
    const selected = store.getSelectedLayers();

    if (selected.length === 1) {
      const handle = detectHandle(point, selected[0]);
      if (handle) {
        beginResize(event.pointerId, point, selected[0], handle.key);
        event.preventDefault();
        return;
      }
    }

    const layerUnderPointer = hitTestLayers(point);

    if (!layerUnderPointer) {
      if (!event.shiftKey && !event.ctrlKey && !event.metaKey) {
        store.clearSelection();
        updateOverlay(null);
      }
      return;
    }

    const selectionHasLayer = store.getSelection().has(layerUnderPointer.id);
    if (!selectionHasLayer) {
      if (event.shiftKey) {
        store.selectLayer(layerUnderPointer.id, { mode: 'range' });
      } else if (event.ctrlKey || event.metaKey) {
        store.selectLayer(layerUnderPointer.id, { mode: 'toggle' });
      } else {
        store.selectLayer(layerUnderPointer.id, { mode: 'single' });
      }
    }

    const nextSelected = store.getSelectedLayers();
    beginMove(event.pointerId, point, nextSelected);
    event.preventDefault();
  }

  function onPointerMove(event) {
    if (!operation) {
      return;
    }
    const point = canvasController.screenToDocument(event.clientX, event.clientY);

    if (operation.type === 'move') {
      const dx = point.x - operation.startPoint.x;
      const dy = point.y - operation.startPoint.y;
      const idSet = operation.layerOrigins.map((entry) => entry.id);
      const lookup = new Map(operation.layerOrigins.map((entry) => [entry.id, entry]));
      store.updateLayers(idSet, (layer) => {
        const origin = lookup.get(layer.id);
        return {
          x: origin.x + dx,
          y: origin.y + dy
        };
      }, { record: false });
      updateOverlay(null);
    } else if (operation.type === 'resize') {
      const result = computeResize(operation.handle, point, operation.initial);
      store.updateLayers(operation.layerId, () => result, { record: false });
      updateOverlay(operation.handle);
    }
  }

  function onPointerUp(event) {
    if (!operation || event.pointerId !== operation.pointerId) {
      return;
    }
    finishOperation();
  }

  function onPointerCancel(event) {
    if (!operation || event.pointerId !== operation.pointerId) {
      return;
    }
    finishOperation();
  }

  overlay.addEventListener('pointerdown', onPointerDown);
  overlay.addEventListener('pointermove', onPointerMove);
  overlay.addEventListener('pointerup', onPointerUp);
  overlay.addEventListener('pointercancel', onPointerCancel);

  return {
    dispose() {
      overlay.removeEventListener('pointerdown', onPointerDown);
      overlay.removeEventListener('pointermove', onPointerMove);
      overlay.removeEventListener('pointerup', onPointerUp);
      overlay.removeEventListener('pointercancel', onPointerCancel);
    }
  };
}