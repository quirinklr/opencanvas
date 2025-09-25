export function createLayersPanel({ listElement, upButton, downButton, store }) {
  if (!listElement || !store) {
    throw new Error('Layers panel requires list element and store.');
  }

  function render() {
    const layers = store.getLayers();
    const selection = store.getSelection();
    const fragments = document.createDocumentFragment();

    for (let i = layers.length - 1; i >= 0; i -= 1) {
      const layer = layers[i];
      const item = document.createElement('li');
      item.dataset.layerId = layer.id;
      item.className = selection.has(layer.id) ? 'selected' : '';

      const nameSpan = document.createElement('span');
      nameSpan.textContent = layer.name || `Layer ${layers.length - i}`;

      const sizeSpan = document.createElement('span');
      sizeSpan.textContent = `${Math.round(layer.width)}x${Math.round(layer.height)}`;
      sizeSpan.style.opacity = '0.7';
      sizeSpan.style.fontSize = '0.75rem';

      item.appendChild(nameSpan);
      item.appendChild(sizeSpan);
      fragments.appendChild(item);
    }

    listElement.innerHTML = '';
    listElement.appendChild(fragments);
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

  listElement.addEventListener('click', handleClick);

  if (upButton) {
    upButton.addEventListener('click', () => {
      store.moveLayers(1);
    });
  }

  if (downButton) {
    downButton.addEventListener('click', () => {
      store.moveLayers(-1);
    });
  }

  return {
    render
  };
}