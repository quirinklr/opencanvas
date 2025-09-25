import { createHistory } from './history.js';

function normalizeLayer(layer) {
  const rotation = Number.isFinite(layer.rotation) ? layer.rotation : 0;
  const opacity = Number.isFinite(layer.opacity) ? layer.opacity : 1;
  const visible = layer.visible !== false;
  return {
    ...layer,
    rotation,
    opacity,
    visible
  };
}

function cloneLayer(layer) {
  return normalizeLayer(layer);
}

function buildSnapshot({ width, height, layers, selection, anchorId }) {
  return {
    width,
    height,
    layers: layers.map(cloneLayer),
    selection: Array.from(selection),
    anchorId: anchorId || null
  };
}

export function createDocumentState() {
  let width = 0;
  let height = 0;
  let layers = [];
  let selection = new Set();
  let anchorId = null;
  const history = createHistory();
  const listeners = new Set();

  function notify(detail) {
    listeners.forEach((listener) => listener(detail));
  }

  function snapshot() {
    return buildSnapshot({ width, height, layers, selection, anchorId });
  }

  function applySnapshot(data, { silent = false } = {}) {
    width = data.width;
    height = data.height;
    layers = data.layers.map(cloneLayer);
    selection = new Set(data.selection);
    anchorId = data.anchorId || null;
    if (!silent) {
      notify({ type: 'snapshot' });
    }
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function getLayerIndex(id) {
    return layers.findIndex((layer) => layer.id === id);
  }

  function setDocumentSize(newWidth, newHeight, { record = true } = {}) {
    if (record) {
      history.commit(snapshot());
    }
    width = newWidth;
    height = newHeight;
    notify({ type: 'document-size' });
  }

  function setLayers(newLayers, { select = false, record = true } = {}) {
    if (record) {
      history.commit(snapshot());
    }
    layers = newLayers.map(cloneLayer);
    if (select && newLayers.length > 0) {
      const lastId = newLayers[newLayers.length - 1].id;
      selection = new Set([lastId]);
      anchorId = lastId;
    } else {
      selection.clear();
      anchorId = null;
    }
    notify({ type: 'layers' });
  }

  function reset(newWidth, newHeight, newLayers = []) {
    width = newWidth;
    height = newHeight;
    layers = newLayers.map(cloneLayer);
    selection.clear();
    anchorId = null;
    history.clear();
    notify({ type: 'reset' });
  }

  function addLayer(layer, { select = true, record = true, position = layers.length } = {}) {
    if (record) {
      history.commit(snapshot());
    }
    const newLayer = cloneLayer(layer);
    let insertIndex = position;
    if (insertIndex < 0) {
      insertIndex = 0;
    }
    if (insertIndex > layers.length) {
      insertIndex = layers.length;
    }
    layers.splice(insertIndex, 0, newLayer);
    if (select) {
      selection = new Set([newLayer.id]);
      anchorId = newLayer.id;
    }
    notify({ type: 'layers' });
  }

  function updateLayers(ids, updater, { record = true } = {}) {
    const targetIds = Array.isArray(ids) ? ids : [ids];
    if (targetIds.length === 0) {
      return;
    }
    if (record) {
      history.commit(snapshot());
    }

    layers = layers.map((layer) => {
      if (!targetIds.includes(layer.id)) {
        return layer;
      }
      const updates = updater(layer) || {};
      return cloneLayer({ ...layer, ...updates });
    });

    notify({ type: 'layers' });
  }

  function removeLayers(ids, { record = true } = {}) {
    const targetIds = Array.isArray(ids) ? ids : [ids];
    if (targetIds.length === 0) {
      return;
    }
    if (record) {
      history.commit(snapshot());
    }

    layers = layers.filter((layer) => !targetIds.includes(layer.id));
    let selectionChanged = false;
    targetIds.forEach((id) => {
      if (selection.delete(id)) {
        selectionChanged = true;
      }
      if (anchorId === id) {
        anchorId = null;
      }
    });
    if (selectionChanged) {
      notify({ type: 'selection' });
    }
    notify({ type: 'layers' });
  }

  function removeSelectedLayers(options = {}) {
    if (selection.size === 0) {
      return;
    }
    removeLayers(Array.from(selection), options);
    selection.clear();
    anchorId = null;
    notify({ type: 'selection' });
  }

  function moveLayers(offset) {
    if (selection.size === 0 || offset === 0) {
      return;
    }
    history.commit(snapshot());
    const orderedIds = layers.map((layer) => layer.id);
    const selectedIds = orderedIds.filter((id) => selection.has(id));

    if (offset > 0) {
      for (let i = selectedIds.length - 1; i >= 0; i -= 1) {
        const id = selectedIds[i];
        const index = getLayerIndex(id);
        if (index >= layers.length - 1) {
          continue;
        }
        const [layer] = layers.splice(index, 1);
        layers.splice(index + 1, 0, layer);
      }
    } else {
      for (let i = 0; i < selectedIds.length; i += 1) {
        const id = selectedIds[i];
        const index = getLayerIndex(id);
        if (index <= 0) {
          continue;
        }
        const [layer] = layers.splice(index, 1);
        layers.splice(index - 1, 0, layer);
      }
    }
    notify({ type: 'layers' });
  }

  function reorderLayer(draggedId, targetId, position = 'before', { record = true } = {}) {
    if (!draggedId || draggedId === targetId) {
      return;
    }
    const byId = new Map(layers.map((layer) => [layer.id, layer]));
    if (!byId.has(draggedId)) {
      return;
    }
    if (targetId && !byId.has(targetId)) {
      return;
    }

    const uiOrder = layers.map((layer) => layer.id).reverse();
    const fromIndex = uiOrder.indexOf(draggedId);
    if (fromIndex === -1) {
      return;
    }
    uiOrder.splice(fromIndex, 1);

    let insertIndex = uiOrder.length;
    if (targetId) {
      const targetIndex = uiOrder.indexOf(targetId);
      if (targetIndex !== -1) {
        insertIndex = position === 'before' ? targetIndex : targetIndex + 1;
      }
    }
    if (insertIndex < 0) {
      insertIndex = 0;
    }
    if (insertIndex > uiOrder.length) {
      insertIndex = uiOrder.length;
    }
    uiOrder.splice(insertIndex, 0, draggedId);

    if (record) {
      history.commit(snapshot());
    }

    const newOrderIds = uiOrder.slice().reverse();
    layers = newOrderIds.map((id) => byId.get(id));
    notify({ type: 'layers' });
  }

  function clearSelection({ silent = false } = {}) {
    if (selection.size === 0) {
      return;
    }
    selection.clear();
    anchorId = null;
    if (!silent) {
      notify({ type: 'selection' });
    }
  }

  function setSelection(ids, { silent = false } = {}) {
    selection = new Set(ids);
    if (ids.length > 0) {
      anchorId = ids[ids.length - 1];
    }
    if (!silent) {
      notify({ type: 'selection' });
    }
  }

  function selectLayer(id, { mode = 'single' } = {}) {
    const index = getLayerIndex(id);
    if (index === -1) {
      return;
    }

    if (mode === 'toggle') {
      if (selection.has(id)) {
        selection.delete(id);
      } else {
        selection.add(id);
        anchorId = id;
      }
    } else if (mode === 'range' && anchorId !== null) {
      const anchorIndex = getLayerIndex(anchorId);
      if (anchorIndex === -1) {
        selection = new Set([id]);
        anchorId = id;
      } else {
        const start = Math.min(anchorIndex, index);
        const end = Math.max(anchorIndex, index);
        const idsInRange = [];
        for (let i = start; i <= end; i += 1) {
          idsInRange.push(layers[i].id);
        }
        selection = new Set(idsInRange);
      }
    } else {
      selection = new Set([id]);
      anchorId = id;
    }

    notify({ type: 'selection' });
  }

  function getDocumentSize() {
    return { width, height };
  }

  function getLayers() {
    return layers.map(cloneLayer);
  }

  function getLayersRef() {
    return layers;
  }

  function getSelection() {
    return new Set(selection);
  }

  function getSelectedLayers() {
    return layers.filter((layer) => selection.has(layer.id));
  }

  function hasSelection() {
    return selection.size > 0;
  }

  function ensureAnchor() {
    if (anchorId && getLayerIndex(anchorId) !== -1) {
      return anchorId;
    }
    if (layers.length === 0) {
      anchorId = null;
      return null;
    }
    anchorId = layers[layers.length - 1].id;
    return anchorId;
  }

  function commit() {
    history.commit(snapshot());
  }

  function undo() {
    const current = snapshot();
    const previous = history.undo(current);
    if (!previous) {
      return false;
    }
    applySnapshot(previous);
    notify({ type: 'undo' });
    return true;
  }

  function redo() {
    const current = snapshot();
    const next = history.redo(current);
    if (!next) {
      return false;
    }
    applySnapshot(next);
    notify({ type: 'redo' });
    return true;
  }

  return {
    subscribe,
    reset,
    setDocumentSize,
    setLayers,
    addLayer,
    updateLayers,
    removeLayers,
    removeSelectedLayers,
    moveLayers,
    reorderLayer,
    clearSelection,
    setSelection,
    selectLayer,
    ensureAnchor,
    getDocumentSize,
    getLayers,
    getLayersRef,
    getSelection,
    getSelectedLayers,
    hasSelection,
    commit,
    undo,
    redo,
    snapshot
  };
}