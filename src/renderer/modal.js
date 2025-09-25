export function createModalController() {
  let overlay = null;
  let form = null;
  let widthInput = null;
  let heightInput = null;
  let cancelButton = null;
  let resolver = null;

  async function ensureModal() {
    if (overlay) {
      return;
    }

    const response = await fetch('modal.html', { cache: 'no-store' });
    const html = await response.text();
    const template = document.createElement('template');
    template.innerHTML = html.trim();

    overlay = template.content.querySelector('[data-modal]');
    if (!overlay) {
      throw new Error('Modal markup missing.');
    }

    overlay.removeAttribute('hidden');
    document.body.appendChild(overlay);

    form = overlay.querySelector('#new-document-form');
    widthInput = overlay.querySelector('#modal-width');
    heightInput = overlay.querySelector('#modal-height');
    cancelButton = overlay.querySelector('#modal-cancel');

    form.addEventListener('submit', handleSubmit);
    cancelButton.addEventListener('click', () => close(null));
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        close(null);
      }
    });
    document.addEventListener('keydown', handleKeyDown);
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape' && isVisible()) {
      close(null);
    }
  }

  function isVisible() {
    return overlay && overlay.classList.contains('visible');
  }

  function handleSubmit(event) {
    event.preventDefault();
    const width = parseInt(widthInput.value, 10);
    const height = parseInt(heightInput.value, 10);

    if (!Number.isInteger(width) || !Number.isInteger(height)) {
      return;
    }

    close({ width, height });
  }

  function show(initial = {}) {
    const defaultWidth = Number.isInteger(initial.width) ? initial.width : 1920;
    const defaultHeight = Number.isInteger(initial.height) ? initial.height : 1080;

    widthInput.value = String(defaultWidth);
    heightInput.value = String(defaultHeight);

    overlay.classList.add('visible');
    overlay.removeAttribute('hidden');

    requestAnimationFrame(() => {
      widthInput.focus();
      widthInput.select();
    });
  }

  function hide() {
    overlay.classList.remove('visible');
    overlay.setAttribute('hidden', 'hidden');
  }

  function close(result) {
    if (!resolver) {
      return;
    }
    hide();
    const resolve = resolver;
    resolver = null;
    resolve(result);
  }

  async function open(initial = {}) {
    await ensureModal();

    if (resolver) {
      resolver(null);
      resolver = null;
    }

    show(initial);

    return new Promise((resolve) => {
      resolver = resolve;
    });
  }

  return {
    open
  };
}