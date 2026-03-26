const { app, BrowserWindow, ipcMain, screen, globalShortcut } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');

let win;
let voiceShortcut = 'CommandOrControl+Q';

function createWindow() {
    const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize;

    win = new BrowserWindow({
        width: 400,
        height: 420,
        x: screenW - 420,
        y: screenH - 440,
        transparent: true,
        frame: false,
        alwaysOnTop: true,
        hasShadow: false,
        resizable: false,
        skipTaskbar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
        },
    });

    win.loadFile('index.html');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    // 注册语音快捷键
    registerVoiceShortcut(voiceShortcut);
}

function registerVoiceShortcut(shortcut) {
    globalShortcut.unregisterAll();
    try {
        globalShortcut.register(shortcut, () => {
            win.webContents.send('voice-toggle');
        });
        voiceShortcut = shortcut;
    } catch (e) {
        console.error('快捷键注册失败:', e.message);
    }
}

// ===== OpenClaw 调用 =====
ipcMain.handle('chat-stream', async (event, message) => {
    return new Promise((resolve) => {
        const args = ['agent', '--agent', 'main', '-m', `用喵喵助手的身份回复：${message}`];
        const child = spawn('/opt/homebrew/bin/openclaw', args, {
            timeout: 60000, env: { ...process.env },
        });
        let fullOutput = '';
        child.stdout.on('data', (chunk) => { fullOutput += chunk.toString(); });
        child.stderr.on('data', () => {});
        child.on('close', () => {
            const final = cleanOutput(fullOutput) || '喵~';
            win.webContents.send('chat-done', final);
            resolve(final);
        });
        child.on('error', () => {
            win.webContents.send('chat-done', '喵...连不上了 >_<');
            resolve('喵...连不上了 >_<');
        });
    });
});

function cleanOutput(raw) {
    const lines = raw.split('\n')
        .filter(l => !l.match(/^\x1b?\[?\d*m?\[?(plugins|tools|agent|gateway)\b/) && l.trim())
        .join('\n').trim();
    return lines.replace(/^.*?\*\*[^*]+\*\*[：:]\s*/s, '').trim();
}

// ===== 腾讯云 ASR =====
ipcMain.handle('asr-recognize', async (event, audioBase64) => {
    const secretId = process.env.TENCENT_SECRET_ID;
    const secretKey = process.env.TENCENT_SECRET_KEY;
    if (!secretId || !secretKey) return { error: 'no key' };

    const host = 'asr.tencentcloudapi.com';
    const timestamp = Math.floor(Date.now() / 1000);
    const date = new Date(timestamp * 1000).toISOString().split('T')[0];

    const payload = JSON.stringify({
        EngSerViceType: '16k_zh',
        SourceType: 1,
        VoiceFormat: 'wav',
        Data: audioBase64,
        DataLen: audioBase64.length,
    });

    const hashedPayload = crypto.createHash('sha256').update(payload).digest('hex');
    const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\nx-tc-action:sentencerecognition\n`;
    const signedHeaders = 'content-type;host;x-tc-action';
    const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${hashedPayload}`;

    const credentialScope = `${date}/asr/tc3_request`;
    const hashedCR = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
    const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${credentialScope}\n${hashedCR}`;

    function hmac(key, msg) { return crypto.createHmac('sha256', key).update(msg).digest(); }
    const sig = crypto.createHmac('sha256', hmac(hmac(hmac(`TC3${secretKey}`, date), 'asr'), 'tc3_request')).update(stringToSign).digest('hex');
    const auth = `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${sig}`;

    return new Promise((resolve) => {
        const req = https.request({
            hostname: host, path: '/', method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Host': host, 'X-TC-Action': 'SentenceRecognition',
                'X-TC-Version': '2019-06-14', 'X-TC-Timestamp': String(timestamp),
                'X-TC-Region': 'ap-shanghai', 'Authorization': auth,
            },
        }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve({ text: JSON.parse(data).Response?.Result || '' }); }
                catch { resolve({ error: 'parse error' }); }
            });
        });
        req.on('error', e => resolve({ error: e.message }));
        req.write(payload); req.end();
    });
});

// ===== 快捷键更新 =====
ipcMain.on('update-shortcut', (event, shortcut) => {
    registerVoiceShortcut(shortcut);
});
ipcMain.handle('get-shortcut', () => voiceShortcut);

// ===== 窗口控制 =====
ipcMain.on('drag-start', (event, { x, y }) => {
    const [wx, wy] = win.getPosition();
    win._dragOffset = { x, y, wx, wy };
});
ipcMain.on('drag-move', (event, { x, y }) => {
    if (win._dragOffset) {
        win.setPosition(win._dragOffset.wx + (x - win._dragOffset.x), win._dragOffset.wy + (y - win._dragOffset.y));
    }
});
ipcMain.on('drag-end', () => { win._dragOffset = null; });
ipcMain.on('quit-app', () => app.quit());
ipcMain.on('toggle-top', () => {
    const t = win.isAlwaysOnTop();
    win.setAlwaysOnTop(!t);
    win.webContents.send('topmost-changed', !t);
});

app.whenReady().then(createWindow);
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
