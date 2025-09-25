export const HANDLE_SIZE_PX = 10;
export const ROTATE_HANDLE_OFFSET_PX = 32;
export const ROTATE_HANDLE_RADIUS_PX = 6;

export function getLayerCenter(layer) {
  return {
    x: layer.x + layer.width / 2,
    y: layer.y + layer.height / 2
  };
}

export function normalizeRotation(value) {
  const pi = Math.PI;
  let angle = value % (2 * pi);
  if (angle <= -pi) {
    angle += 2 * pi;
  } else if (angle > pi) {
    angle -= 2 * pi;
  }
  return angle;
}

export function toLayerLocal(layer, point) {
  const rotation = layer.rotation || 0;
  const center = getLayerCenter(layer);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const cos = Math.cos(-rotation);
  const sin = Math.sin(-rotation);
  return {
    x: dx * cos - dy * sin + layer.width / 2,
    y: dx * sin + dy * cos + layer.height / 2
  };
}

export function fromLayerLocal(layer, localPoint) {
  const rotation = layer.rotation || 0;
  const center = getLayerCenter(layer);
  const dx = localPoint.x - layer.width / 2;
  const dy = localPoint.y - layer.height / 2;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos
  };
}

export function getResizeHandlesLocal(layer) {
  const halfWidth = layer.width / 2;
  const halfHeight = layer.height / 2;
  return [
    { key: 'nw', x: -halfWidth, y: -halfHeight },
    { key: 'n', x: 0, y: -halfHeight },
    { key: 'ne', x: halfWidth, y: -halfHeight },
    { key: 'e', x: halfWidth, y: 0 },
    { key: 'se', x: halfWidth, y: halfHeight },
    { key: 's', x: 0, y: halfHeight },
    { key: 'sw', x: -halfWidth, y: halfHeight },
    { key: 'w', x: -halfWidth, y: 0 }
  ];
}

export function getRotateHandlesLocal(layer, zoom) {
  const offset = ROTATE_HANDLE_OFFSET_PX / zoom;
  const resizeHandles = getResizeHandlesLocal(layer).filter((handle) => handle.key.length === 2);
  return resizeHandles.map((handle) => {
    const length = Math.hypot(handle.x, handle.y) || 1;
    const scale = (length + offset) / length;
    return {
      key: `rotate-${handle.key}`,
      x: handle.x * scale,
      y: handle.y * scale
    };
  });
}

export function pointInLayer(layer, point) {
  const local = toLayerLocal(layer, point);
  return local.x >= 0 && local.x <= layer.width && local.y >= 0 && local.y <= layer.height;
}