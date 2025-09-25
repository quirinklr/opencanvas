const { Menu, app } = require('electron');

function sendToRenderer(mainWindow, detail) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send('app-menu', detail);
}

function createAppMenu(mainWindow) {
  const isMac = process.platform === 'darwin';

  const fileSubmenu = [
    {
      label: 'Neu',
      accelerator: 'Ctrl+N',
      click: () => sendToRenderer(mainWindow, { type: 'new' })
    },
    {
      label: 'Oeffnen...',
      accelerator: 'Ctrl+O',
      click: () => sendToRenderer(mainWindow, { type: 'open' })
    },
    { type: 'separator' },
    {
      label: 'Speichern',
      accelerator: 'Ctrl+S',
      click: () => sendToRenderer(mainWindow, { type: 'save', saveAs: false })
    },
    {
      label: 'Speichern unter...',
      accelerator: 'Ctrl+Shift+S',
      click: () => sendToRenderer(mainWindow, { type: 'save', saveAs: true })
    },
    { type: 'separator' },
    {
      label: 'Export als PNG...',
      accelerator: 'Ctrl+E',
      click: () => sendToRenderer(mainWindow, { type: 'export' })
    }
  ];

  if (isMac) {
    fileSubmenu.push({ type: 'separator' }, { role: 'close' });
  } else {
    fileSubmenu.push({ type: 'separator' }, { role: 'quit' });
  }

  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' }
            ]
          }
        ]
      : []),
    {
      label: 'Datei',
      submenu: fileSubmenu
    },
    { label: 'Bearbeiten', role: 'editMenu' },
    {
      label: 'Ansicht',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    }
  ];

  return Menu.buildFromTemplate(template);
}

module.exports = {
  createAppMenu
};