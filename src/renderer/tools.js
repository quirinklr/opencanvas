export function createToolManager({ container }) {
  if (!container) {
    throw new Error('Tool manager requires a container element.');
  }

  let activeTool = null;
  const listeners = new Set();

  function notify() {
    listeners.forEach((listener) => listener(activeTool));
  }

  function setActive(toolId) {
    if (activeTool === toolId) {
      return;
    }
    activeTool = toolId;
    container.querySelectorAll('.tool-button').forEach((button) => {
      const isActive = button.dataset.tool === toolId;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
    notify();
  }

  container.addEventListener('click', (event) => {
    const button = event.target.closest('.tool-button');
    if (!button) {
      return;
    }
    const toolId = button.dataset.tool;
    if (toolId) {
      setActive(toolId);
    }
  });

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return {
    getActive: () => activeTool,
    setActive,
    subscribe
  };
}