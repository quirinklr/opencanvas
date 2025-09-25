function base64ToBlob(pngBase64) {
  const byteString = atob(pngBase64);
  const arrayBuffer = new ArrayBuffer(byteString.length);
  const uintArray = new Uint8Array(arrayBuffer);
  for (let i = 0; i < byteString.length; i += 1) {
    uintArray[i] = byteString.charCodeAt(i);
  }
  return new Blob([uintArray], { type: 'image/png' });
}

export function createCanvasController(canvasElement) {
  if (!canvasElement) {
    throw new Error('Canvas element missing.');
  }

  const stage = canvasElement.parentElement;
  const container = stage?.parentElement;
  const context = canvasElement.getContext('2d', { willReadFrequently: false });

  let width = canvasElement.width;
  let height = canvasElement.height;
  let zoom = 1;

  function updateStageSize() {
    if (!stage) return;
    stage.style.width = `${width}px`;
    stage.style.height = `${height}px`;
  }

  function resize(newWidth, newHeight) {
    width = newWidth;
    height = newHeight;
    canvasElement.width = width;
    canvasElement.height = height;
    updateStageSize();
  }

  function clear() {
    context.clearRect(0, 0, width, height);
  }

  async function drawFromBase64(pngBase64) {
    const blob = base64ToBlob(pngBase64);
    const image = await createImageBitmap(blob);
    resize(image.width, image.height);
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0);
    return { width, height };
  }

  function setZoom(scale) {
    if (!stage) return;
    zoom = scale;
    stage.style.transform = `scale(${zoom})`;
  }

  function fitToContainer() {
    if (!container || width === 0 || height === 0) {
      setZoom(1);
      return 1;
    }

    const availableWidth = container.clientWidth - 16;
    const availableHeight = container.clientHeight - 16;
    const scale = Math.min(availableWidth / width, availableHeight / height, 1);
    setZoom(scale > 0 ? scale : 1);
    return zoom;
  }

  function getPNGBase64() {
    const dataUrl = canvasElement.toDataURL('image/png');
    return dataUrl.replace(/^data:image\/png;base64,/, '');
  }

  function getDimensions() {
    return { width, height };
  }

  function getZoom() {
    return zoom;
  }

  return {
    resize,
    clear,
    drawFromBase64,
    setZoom,
    fitToContainer,
    getPNGBase64,
    getDimensions,
    getZoom
  };
}