import {
  HANDLE_SIZE_PX,
  ROTATE_HANDLE_RADIUS_PX,
  getLayerCenter,
  getResizeHandlesLocal,
  getRotateHandlesLocal,
  normalizeRotation,
  pointInLayer,
  toLayerLocal
} from './geometry.js';

const MIN_LAYER_SIZE = 10;

const RESIZE_CURSOR_MAP = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize'
};

function clampSize(value) {
  return Math.max(value, MIN_LAYER_SIZE);
}

function cursorForHandle(handleKey) {
  if (!handleKey) {
    return 'default';
  }
  if (handleKey.startsWith('rotate')) {
    return 'crosshair';
  }
  return RESIZE_CURSOR_MAP[handleKey] || 'move';
}

function getHandleHit(layer, point, zoom) {
  const localPoint = toLayerLocal(layer, point);
  const handleSize = HANDLE_SIZE_PX / zoom;
  const halfHandle = handleSize / 2;

  const resizeHandles = getResizeHandlesLocal(layer);
  for (const handle of resizeHandles) {
    const hx = handle.x + layer.width / 2;
    const hy = handle.y + layer.height / 2;
    if (Math.abs(localPoint.x - hx) <= halfHandle && Math.abs(localPoint.y - hy) <= halfHandle) {
      return { key: handle.key, type: 'resize', cursor: cursorForHandle(handle.key) };
    }
  }

  const rotateHandles = getRotateHandlesLocal(layer, zoom);
  const rotateRadius = ROTATE_HANDLE_RADIUS_PX / zoom;
  for (const handle of rotateHandles) {
    const hx = handle.x + layer.width / 2;
    const hy = handle.y + layer.height / 2;
    const distance = Math.hypot(localPoint.x - hx, localPoint.y - hy);
    if (distance <= rotateRadius) {
      return { key: handle.key, type: 'rotate', cursor: cursorForHandle(handle.key) };
    }
  }

  return null;
}

function computeResizeLocal(handle, pointerLocal, initial) {
  const result = {
    x: initial.x,
    y: initial.y,
    width: initial.width,
    height: initial.height
  };

  const right = initial.x + initial.width;
  const bottom = initial.y + initial.height;

  switch (handle) {
    case 'nw': {
      const nextX = Math.min(pointerLocal.x, right - MIN_LAYER_SIZE);
      const nextY = Math.min(pointerLocal.y, bottom - MIN_LAYER_SIZE);
      result.width = clampSize(right - nextX);
      result.height = clampSize(bottom - nextY);
      result.x = right - result.width;
      result.y = bottom - result.height;
      break;
    }
    case 'n': {
      const nextY = Math.min(pointerLocal.y, bottom - MIN_LAYER_SIZE);
      result.height = clampSize(bottom - nextY);
      result.y = bottom - result.height;
      break;
    }
    case 'ne': {
      const nextX = Math.max(pointerLocal.x, initial.x + MIN_LAYER_SIZE);
      const nextY = Math.min(pointerLocal.y, bottom - MIN_LAYER_SIZE);
      result.width = clampSize(nextX - initial.x);
      result.height = clampSize(bottom - nextY);
      result.y = bottom - result.height;
      break;
    }
    case 'e': {
      const nextX = Math.max(pointerLocal.x, initial.x + MIN_LAYER_SIZE);
      result.width = clampSize(nextX - initial.x);
      break;
    }
    case 'se': {
      const nextX = Math.max(pointerLocal.x, initial.x + MIN_LAYER_SIZE);
      const nextY = Math.max(pointerLocal.y, initial.y + MIN_LAYER_SIZE);
      result.width = clampSize(nextX - initial.x);
      result.height = clampSize(nextY - initial.y);
      break;
    }
    case 's': {
      const nextY = Math.max(pointerLocal.y, initial.y + MIN_LAYER_SIZE);
      result.height = clampSize(nextY - initial.y);
      break;
    }
    case 'sw': {
      const nextX = Math.min(pointerLocal.x, right - MIN_LAYER_SIZE);
      const nextY = Math.max(pointerLocal.y, initial.y + MIN_LAYER_SIZE);
      result.width = clampSize(right - nextX);
      result.height = clampSize(nextY - initial.y);
      result.x = right - result.width;
      break;
    }
    case 'w': {
      const nextX = Math.min(pointerLocal.x, right - MIN_LAYER_SIZE);
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
  let hoverHandle = null;

  function setOverlayCursor(value) {
    overlay.style.cursor = value;
  }

  function updateOverlay(activeHandle = null) {
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
    setOverlayCursor('grabbing');
  }

  function beginResize(pointerId, startPoint, layer, handle) {
    store.commit();
    overlay.setPointerCapture(pointerId);
    operation = {
      type: 'resize',
      pointerId,
      startPoint,
      handle,
      initial: {
        id: layer.id,
        x: layer.x,
        y: layer.y,
        width: layer.width,
        height: layer.height,
        rotation: layer.rotation || 0
      }
    };
    setOverlayCursor(cursorForHandle(handle));
    updateOverlay(handle);
  }

  function beginRotate(pointerId, startPoint, layer, handle) {
    store.commit();
    overlay.setPointerCapture(pointerId);
    const center = getLayerCenter(layer);
    operation = {
      type: 'rotate',
      pointerId,
      handle,
      center,
      startAngle: Math.atan2(startPoint.y - center.y, startPoint.x - center.x),
      initialRotation: layer.rotation || 0,
      layerId: layer.id
    };
    setOverlayCursor('crosshair');
    updateOverlay(handle);
  }

  function finishOperation() {
    if (operation) {
      try {
        overlay.releasePointerCapture(operation.pointerId);
      } catch (error) {
        // ignore pointer release errors
      }
    }
    operation = null;
    hoverHandle = null;
    setOverlayCursor('default');
    updateOverlay(null);
  }

  function handleSelection(point, event) {
    const layers = store.getLayersRef();
    for (let i = layers.length - 1; i >= 0; i -= 1) {
      const layer = layers[i];
      if (!pointInLayer(layer, point)) {
        continue;
      }

      const alreadySelected = store.getSelection().has(layer.id);
      if (!alreadySelected) {
        if (event.shiftKey) {
          store.selectLayer(layer.id, { mode: 'range' });
        } else if (event.ctrlKey || event.metaKey) {
          store.selectLayer(layer.id, { mode: 'toggle' });
        } else {
          store.selectLayer(layer.id, { mode: 'single' });
        }
      }

      const selectedLayers = store.getSelectedLayers();
      beginMove(event.pointerId, point, selectedLayers);
      updateOverlay(null);
      return;
    }

    if (!event.shiftKey && !event.ctrlKey && !event.metaKey) {
      store.clearSelection();
      updateOverlay(null);
    }
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
    const zoom = canvasController.getZoom();

    if (selected.length === 1) {
      const layer = selected[0];
      const handleHit = getHandleHit(layer, point, zoom);
      if (handleHit) {
        if (handleHit.type === 'rotate') {
          beginRotate(event.pointerId, point, layer, handleHit.key);
        } else {
          beginResize(event.pointerId, point, layer, handleHit.key);
        }
        event.preventDefault();
        return;
      }

      if (pointInLayer(layer, point)) {
        beginMove(event.pointerId, point, selected);
        updateOverlay(null);
        event.preventDefault();
        return;
      }
    }

    handleSelection(point, event);
    event.preventDefault();
  }

  function onPointerMove(event) {
    const point = canvasController.screenToDocument(event.clientX, event.clientY);

    if (!operation) {
      const selected = store.getSelectedLayers();
      if (selected.length === 1 && getActiveTool() === 'transform') {
        const layer = selected[0];
        const handleHit = getHandleHit(layer, point, canvasController.getZoom());
        const nextHandle = handleHit?.key || null;
        if (nextHandle !== hoverHandle) {
          hoverHandle = nextHandle;
          updateOverlay(hoverHandle);
        }
        if (handleHit) {
          setOverlayCursor(handleHit.cursor);
        } else if (pointInLayer(layer, point)) {
          setOverlayCursor('move');
        } else {
          setOverlayCursor('default');
        }
      } else {
        if (hoverHandle) {
          hoverHandle = null;
          updateOverlay(null);
        }
        setOverlayCursor('default');
      }
      return;
    }

    if (event.pointerId !== operation.pointerId) {
      return;
    }

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
      setOverlayCursor('grabbing');
      updateOverlay(operation.handle || null);
      return;
    }

    if (operation.type === 'resize') {
      const initial = operation.initial;
      const center = {
        x: initial.x + initial.width / 2,
        y: initial.y + initial.height / 2
      };
      const rotation = initial.rotation || 0;
      const cos = Math.cos(-rotation);
      const sin = Math.sin(-rotation);
      const translatedX = point.x - center.x;
      const translatedY = point.y - center.y;
      const localPointer = {
        x: translatedX * cos - translatedY * sin + initial.width / 2,
        y: translatedX * sin + translatedY * cos + initial.height / 2
      };

      const result = computeResizeLocal(operation.handle, localPointer, {
        x: 0,
        y: 0,
        width: initial.width,
        height: initial.height
      });

      const deltaX = result.x;
      const deltaY = result.y;
      const cosForward = Math.cos(rotation);
      const sinForward = Math.sin(rotation);
      const nextX = initial.x + deltaX * cosForward - deltaY * sinForward;
      const nextY = initial.y + deltaX * sinForward + deltaY * cosForward;

      store.updateLayers(initial.id, () => ({
        x: nextX,
        y: nextY,
        width: result.width,
        height: result.height
      }), { record: false });
      setOverlayCursor(cursorForHandle(operation.handle));
      updateOverlay(operation.handle);
      return;
    }

    if (operation.type === 'rotate') {
      const currentAngle = Math.atan2(point.y - operation.center.y, point.x - operation.center.x);
      const delta = currentAngle - operation.startAngle;
      const nextRotation = normalizeRotation(operation.initialRotation + delta);
      store.updateLayers(operation.layerId, () => ({ rotation: nextRotation }), { record: false });
      setOverlayCursor('crosshair');
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