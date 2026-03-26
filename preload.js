const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('openclaw', {
    chatStream: (msg) => ipcRenderer.invoke('chat-stream', msg),
    onDone: (cb) => ipcRenderer.on('chat-done', (_, text) => cb(text)),
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
});
