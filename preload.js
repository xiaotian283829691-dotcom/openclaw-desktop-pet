const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('openclaw', {
    chatStream: (msg) => ipcRenderer.invoke('chat-stream', msg),
    chatCancel: () => ipcRenderer.send('chat-cancel'),
    onChunk: (cb) => ipcRenderer.on('chat-chunk', (_, delta) => cb(delta)),
    onDone: (cb) => ipcRenderer.on('chat-done', (_, text) => cb(text)),
    onError: (cb) => ipcRenderer.on('chat-error', (_, err) => cb(err)),
    onFocusChat: (cb) => ipcRenderer.on('focus-chat', () => cb()),
    onTopmostChanged: (cb) => ipcRenderer.on('topmost-changed', (_, val) => cb(val)),
    onVoiceToggle: (cb) => ipcRenderer.on('voice-toggle', () => cb()),
    asrRecognize: (base64) => ipcRenderer.invoke('asr-recognize', base64),
    getShortcut: () => ipcRenderer.invoke('get-shortcut'),
    updateShortcut: (s) => ipcRenderer.send('update-shortcut', s),
    dragStart: (pos) => ipcRenderer.send('drag-start', pos),
    dragMove: (pos) => ipcRenderer.send('drag-move', pos),
    dragEnd: () => ipcRenderer.send('drag-end'),
    quit: () => ipcRenderer.send('quit-app'),
    toggleTop: () => ipcRenderer.send('toggle-top'),
    showContextMenu: (opts) => ipcRenderer.send('show-context-menu', opts),
    onMenuAction: (cb) => ipcRenderer.on('menu-action', (_, action) => cb(action)),
});
