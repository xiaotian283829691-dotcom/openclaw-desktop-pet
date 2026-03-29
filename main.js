const { app, BrowserWindow, ipcMain, screen, globalShortcut, Menu } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');

let win;
let voiceShortcut = 'CommandOrControl+Q';
const chatFocusShortcut = 'CommandOrControl+Shift+P';
const posFile = path.join(app.getPath('userData'), 'window-pos.json');

function loadWindowPos(defaultX, defaultY) {
    try {
        const data = JSON.parse(fs.readFileSync(posFile, 'utf8'));
        if (typeof data.x === 'number' && typeof data.y === 'number') return data;
    } catch {}
    return { x: defaultX, y: defaultY };
}

function saveWindowPos() {
    if (!win) return;
    const [x, y] = win.getPosition();
    try { fs.writeFileSync(posFile, JSON.stringify({ x, y })); } catch {}
}

function createWindow() {
    const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize;
    const pos = loadWindowPos(Math.floor((screenW - 400) / 2), Math.floor((screenH - 420) / 2));

    win = new BrowserWindow({
        width: 400,
        height: 420,
        x: pos.x,
        y: pos.y,
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

    // 注册快捷键
    registerVoiceShortcut(voiceShortcut);
    registerChatFocusShortcut();
}

function registerVoiceShortcut(shortcut) {
    // 只注销语音快捷键，保留其他
    if (voiceShortcut) {
        try { globalShortcut.unregister(voiceShortcut); } catch {}
    }
    try {
        globalShortcut.register(shortcut, () => {
            win.webContents.send('voice-toggle');
        });
        voiceShortcut = shortcut;
    } catch (e) {
        console.error('快捷键注册失败:', e.message);
    }
}

function registerChatFocusShortcut() {
    try {
        globalShortcut.register(chatFocusShortcut, () => {
            win.show();
            win.focus();
            win.webContents.send('focus-chat');
        });
    } catch (e) {
        console.error('聊天快捷键注册失败:', e.message);
    }
}

// ===== OpenClaw 调用 =====
let currentChild = null;

function findOpenClaw() {
    if (process.platform === 'win32') {
        // Windows: 常见安装路径
        const candidates = [
            path.join(process.env.LOCALAPPDATA || '', 'Programs', 'openclaw', 'openclaw.exe'),
            path.join(process.env.PROGRAMFILES || '', 'openclaw', 'openclaw.exe'),
            path.join(process.env.USERPROFILE || '', 'AppData', 'Local', 'Programs', 'openclaw', 'openclaw.exe'),
            'openclaw.exe', // PATH 中
            'openclaw',
        ];
        for (const p of candidates) {
            if (p && p !== 'openclaw.exe' && p !== 'openclaw') {
                try { if (fs.existsSync(p)) return p; } catch {}
            }
        }
        // 尝试 where 命令找
        try {
            const result = require('child_process').execSync('where openclaw', { encoding: 'utf8', timeout: 5000 }).trim();
            if (result) return result.split('\n')[0].trim();
        } catch {}
        return null;
    } else {
        // macOS / Linux
        const candidates = [
            '/opt/homebrew/bin/openclaw',
            '/usr/local/bin/openclaw',
            path.join(process.env.HOME || '', '.local', 'bin', 'openclaw'),
        ];
        for (const p of candidates) {
            try { if (fs.existsSync(p)) return p; } catch {}
        }
        try {
            const result = require('child_process').execSync('which openclaw', { encoding: 'utf8', timeout: 5000 }).trim();
            if (result) return result;
        } catch {}
        return null;
    }
}

ipcMain.handle('chat-stream', async (event, message) => {
    return new Promise((resolve) => {
        const openclawPath = findOpenClaw();
        if (!openclawPath) {
            const err = '喵...找不到 OpenClaw，请先安装 >_<';
            win.webContents.send('chat-error', { type: 'not-installed', message: err });
            return resolve(err);
        }

        const args = ['agent', '--agent', 'companion/neko-assistant', '-m', message];
        const child = spawn(openclawPath, args, {
            timeout: 60000, env: { ...process.env },
            shell: process.platform === 'win32',
        });
        currentChild = child;
        let fullOutput = '';
        let lastSent = '';
        let timedOut = false;

        const timeoutId = setTimeout(() => {
            timedOut = true;
            child.kill();
            const err = '喵...想太久超时了，再问一次？';
            win.webContents.send('chat-error', { type: 'timeout', message: err });
            resolve(err);
        }, 60000);

        child.stdout.on('data', (chunk) => {
            fullOutput += chunk.toString();
            const cleaned = cleanOutput(fullOutput);
            if (cleaned.length > lastSent.length) {
                const delta = cleaned.substring(lastSent.length);
                lastSent = cleaned;
                win.webContents.send('chat-chunk', delta);
            }
        });
        child.stderr.on('data', () => {});
        child.on('close', (code) => {
            clearTimeout(timeoutId);
            currentChild = null;
            if (timedOut) return;
            if (code !== 0 && !fullOutput.trim()) {
                const err = '喵...OpenClaw 好像没启动，检查一下 Gateway？';
                win.webContents.send('chat-error', { type: 'gateway-down', message: err });
                return resolve(err);
            }
            const final = cleanOutput(fullOutput) || '喵~';
            win.webContents.send('chat-done', final);
            resolve(final);
        });
        child.on('error', (e) => {
            clearTimeout(timeoutId);
            currentChild = null;
            const err = '喵...连不上了 >_<';
            win.webContents.send('chat-error', { type: 'network', message: err });
            resolve(err);
        });
    });
});

// 取消当前对话
ipcMain.on('chat-cancel', () => {
    if (currentChild) {
        currentChild.kill();
        currentChild = null;
    }
});

function cleanOutput(raw) {
    // 1. 去除所有 ANSI 转义码
    let text = raw.replace(/\x1b\[[0-9;]*m/g, '');
    // 2. 按行过滤 OpenClaw 内部日志
    const lines = text.split('\n')
        .filter(l => {
            const t = l.trim();
            if (!t) return false;
            if (/^\[?(plugins|tools|agent|gateway|skill|extension)\b/i.test(t)) return false;
            if (/^(assistant|user)\s+to=/i.test(t)) return false;
            if (/^\{"(file_path|function|tool)"/i.test(t)) return false;
            return true;
        })
        .join('\n').trim();
    // 3. 去除开头的角色标识（如 **喵喵助手**：）
    let result = lines.replace(/^.*?\*\*[^*]+\*\*[：:]\s*/s, '').trim();
    // 4. 去除末尾的乱码/残留（JSON片段、function call、非中英日常字符结尾）
    result = result.replace(/[\]\}】。]*\s*(assistant|user)\s+to=.*$/si, '').trim();
    result = result.replace(/\s*\{"\w+":.*$/s, '').trim();
    return result;
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
ipcMain.on('drag-end', () => {
    win._dragOffset = null;
    // 边缘吸附
    const SNAP = 20;
    const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize;
    const [wx, wy] = win.getPosition();
    const [ww, wh] = win.getSize();
    let nx = wx, ny = wy;
    if (wx < SNAP) nx = 0;
    else if (wx + ww > screenW - SNAP) nx = screenW - ww;
    if (wy < SNAP) ny = 0;
    else if (wy + wh > screenH - SNAP) ny = screenH - wh;
    if (nx !== wx || ny !== wy) win.setPosition(nx, ny);
    saveWindowPos();
});
ipcMain.on('quit-app', () => app.quit());
ipcMain.on('toggle-top', () => {
    const t = win.isAlwaysOnTop();
    win.setAlwaysOnTop(!t);
    win.webContents.send('topmost-changed', !t);
});

// ===== 原生右键菜单 =====
ipcMain.on('show-context-menu', (event, options) => {
    const template = [
        { label: '切换猫咪', click: () => win.webContents.send('menu-action', 'switchCat') },
        { type: 'separator' },
        {
            label: '动作',
            submenu: [
                { label: '蹦', click: () => win.webContents.send('menu-action', 'bounce') },
                { label: '摇', click: () => win.webContents.send('menu-action', 'shake') },
                { label: '翻滚', click: () => win.webContents.send('menu-action', 'roll') },
                { label: '呼噜', click: () => win.webContents.send('menu-action', 'purr') },
            ],
        },
        {
            label: '计时器',
            submenu: [
                { label: '番茄钟 25 分钟', click: () => win.webContents.send('menu-action', 'timer25') },
                { label: '休息 5 分钟', click: () => win.webContents.send('menu-action', 'timer5') },
                { label: '自定义…', click: () => win.webContents.send('menu-action', 'timerCustom') },
            ],
        },
        { type: 'separator' },
        { label: '对话历史', click: () => win.webContents.send('menu-action', 'history') },
        { label: options.isTop ? '取消置顶' : '置顶', click: () => win.webContents.send('menu-action', 'toggleTop') },
        { label: '语音快捷键设置…', click: () => win.webContents.send('menu-action', 'shortcut') },
        { type: 'separator' },
        { label: '退出', accelerator: 'CmdOrCtrl+W', click: () => app.quit() },
    ];
    const menu = Menu.buildFromTemplate(template);
    menu.popup({ window: win });
});

// ===== 自动安装喵喵助手 Agent =====
function installNekoAgent() {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    const agentDir = path.join(home, 'openclaw-workspace', 'agents', 'companion');
    const agentFile = path.join(agentDir, 'neko-assistant.md');

    // 已存在则跳过
    if (fs.existsSync(agentFile)) return;

    // 确保目录存在
    try { fs.mkdirSync(agentDir, { recursive: true }); } catch {}

    // 从应用内置资源复制
    const bundled = path.join(__dirname, 'agents', 'neko-assistant.md');
    if (fs.existsSync(bundled)) {
        try {
            fs.copyFileSync(bundled, agentFile);
            console.log('喵喵助手 agent 已安装到:', agentFile);
        } catch (e) {
            console.error('安装喵喵助手失败:', e.message);
        }
    }
}

app.whenReady().then(() => {
    installNekoAgent();
    createWindow();
});
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
