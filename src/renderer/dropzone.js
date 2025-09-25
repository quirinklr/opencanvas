export function registerDropTarget(element, handleFiles) {
  if (!element || typeof handleFiles !== 'function') {
    throw new Error('registerDropTarget requires element and file handler.');
  }

  function isFileDrag(event) {
    if (!event.dataTransfer) {
      return false;
    }
    return Array.from(event.dataTransfer.types).includes('Files');
  }

  function onDragOver(event) {
    if (!isFileDrag(event)) {
      return;
    }
    event.preventDefault();
    element.classList.add('drag-over');
  }

  function onDragLeave(event) {
    const nextTarget = event.relatedTarget;
    if (!nextTarget || !element.contains(nextTarget)) {
      element.classList.remove('drag-over');
    }
  }

  async function onDrop(event) {
    if (!isFileDrag(event)) {
      return;
    }
    event.preventDefault();
    element.classList.remove('drag-over');
    const files = [];
    const { dataTransfer } = event;
    if (dataTransfer.items) {
      for (const item of dataTransfer.items) {
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) {
            files.push(file);
          }
        }
      }
    } else if (dataTransfer.files) {
      for (const file of dataTransfer.files) {
        files.push(file);
      }
    }
    if (files.length > 0) {
      handleFiles(files, event);
    }
  }

  element.addEventListener('dragover', onDragOver);
  element.addEventListener('dragleave', onDragLeave);
  element.addEventListener('drop', onDrop);

  return () => {
    element.removeEventListener('dragover', onDragOver);
    element.removeEventListener('dragleave', onDragLeave);
    element.removeEventListener('drop', onDrop);
  };
}