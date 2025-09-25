export function createLayersPanel({ listElement, store }) {
  if (!listElement || !store) {
    throw new Error('Layers panel requires list element and store.');
  }

  let draggedId = null;

  function clearDropIndicators() {
    listElement.querySelectorAll('.drop-before, .drop-after').forEach((item) => {
      item.classList.remove('drop-before', 'drop-after');
      delete item.dataset.dropPosition;
    });
  }

  function render() {
    const layers = store.getLayers();
    const selection = store.getSelection();
    const fragment = document.createDocumentFragment();

    for (let i = layers.length - 1; i >= 0; i -= 1) {
      const layer = layers[i];
      const item = document.createElement('li');
      item.dataset.layerId = layer.id;
      item.draggable = true;
      item.classList.toggle('selected', selection.has(layer.id));

      const nameSpan = document.createElement('span');
      nameSpan.textContent = layer.name || `Layer ${layers.length - i}`;

      const metaSpan = document.createElement('span');
      metaSpan.className = 'meta';
      metaSpan.textContent = `${Math.round(layer.width)}x${Math.round(layer.height)}`;

      item.appendChild(nameSpan);
      item.appendChild(metaSpan);

      item.addEventListener('dragstart', handleDragStart);
      item.addEventListener('dragover', handleDragOver);
      item.addEventListener('dragleave', handleDragLeave);
      item.addEventListener('drop', handleDrop);
      item.addEventListener('dragend', handleDragEnd);

      fragment.appendChild(item);
    }

    listElement.innerHTML = '';
    listElement.appendChild(fragment);
  }

  function handleClick(event) {
    const item = event.target.closest('li');
    if (!item) {
      return;
    }
    const layerId = item.dataset.layerId;
    if (!layerId) {
      return;
    }

    if (event.shiftKey) {
      store.selectLayer(layerId, { mode: 'range' });
    } else if (event.ctrlKey || event.metaKey) {
      store.selectLayer(layerId, { mode: 'toggle' });
    } else {
      store.selectLayer(layerId, { mode: 'single' });
    }
  }

  function handleDragStart(event) {
    const item = event.currentTarget;
    draggedId = item.dataset.layerId;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', draggedId);
  }

  function handleDragOver(event) {
    if (!draggedId) {
      return;
    }
    event.preventDefault();
    const item = event.currentTarget;
    if (item.dataset.layerId === draggedId) {
      clearDropIndicators();
      return;
    }
    const rect = item.getBoundingClientRect();
    const before = event.clientY < rect.top + rect.height / 2;
    clearDropIndicators();
    item.classList.add(before ? 'drop-before' : 'drop-after');
    item.dataset.dropPosition = before ? 'before' : 'after';
  }

  function handleDragLeave(event) {
    const item = event.currentTarget;
    const related = event.relatedTarget;
    if (!related || !item.contains(related)) {
      item.classList.remove('drop-before', 'drop-after');
      delete item.dataset.dropPosition;
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    const item = event.currentTarget;
    const targetId = item.dataset.layerId;
    const position = item.dataset.dropPosition || 'before';
    clearDropIndicators();
    if (draggedId && draggedId !== targetId) {
      store.reorderLayer(draggedId, targetId, position);
    }
    draggedId = null;
  }

  function handleDragEnd() {
    clearDropIndicators();
    draggedId = null;
  }

  listElement.addEventListener('click', handleClick);
  listElement.addEventListener('dragover', (event) => {
    if (!draggedId) {
      return;
    }
    event.preventDefault();
  });
  listElement.addEventListener('drop', (event) => {
    if (!draggedId) {
      return;
    }
    event.preventDefault();
    clearDropIndicators();
    store.reorderLayer(draggedId, null, 'after');
    draggedId = null;
  });

  return {
    render
  };
}