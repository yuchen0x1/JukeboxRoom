function assertTrustedRendererRequest(event, { mainWindow, origin }) {
  if (!mainWindow || mainWindow.isDestroyed() || event?.sender !== mainWindow.webContents) {
    throw new Error('Untrusted window request');
  }
  if (event.senderFrame !== event.sender.mainFrame) {
    throw new Error('Window controls are only available to the main frame');
  }
  try {
    if (new URL(event.senderFrame.url).origin !== origin) throw new Error('Unexpected renderer origin');
  } catch {
    throw new Error('Unexpected renderer origin');
  }
}

module.exports = { assertTrustedRendererRequest };
