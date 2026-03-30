# OpenClaw Desktop Pet 🐱

OpenClaw 桌面宠物 — Live2D 猫咪 + 像素风气泡 + AI 对话

<img width="414" height="782" alt="image" src="https://github.com/user-attachments/assets/1683d77a-d251-4c7a-9dfd-ab47d32252c8" />

把你的 [OpenClaw](https://openclaw.ai) 变成一只住在桌面上的小猫咪。

![preview](https://img.shields.io/badge/Electron-transparent-blue) ![live2d](https://img.shields.io/badge/Live2D-Cubism4-pink) ![openclaw](https://img.shields.io/badge/OpenClaw-Gateway-orange)

## 功能

- **Live2D 猫咪形象** — 支持多套皮肤切换，物理模拟（耳朵、铃铛、蝴蝶结跟随晃动）
- **像素风对话气泡** — 白底浅灰边框，像素尾巴，长文本截断 + 点击展开完整内容
- **AI 对话** — 对接 OpenClaw Gateway，可自定义 Agent 人格（默认：喵喵助手）
- **语音输入** — 腾讯云 ASR 语音识别，快捷键触发（默认 `Cmd+Q`），识别后自动发送
- **猫叫音效** — 猫咪回复时播放喵叫声
- **桌面融合** — 透明无边框窗口，置顶显示，拖拽移动，输入框 hover 显隐
- **右键菜单** — 切换皮肤、蹦/摇/滚动作、置顶开关、语音快捷键设置、退出

## 前置条件

1. **OpenClaw** — 已安装并完成 `openclaw onboard`，Gateway 在本地运行
2. **Node.js** v18+
3. **API Keys**（在 `~/.zshrc` 或环境变量中配置）：
   - `ELEVENLABS_API_KEY` — 用于生成猫叫音效（可选）
   - `TENCENT_SECRET_ID` / `TENCENT_SECRET_KEY` — 腾讯云语音识别（可选）

## 快速开始

```bash
# 克隆
git clone https://github.com/xiaotian283829691-dotcom/openclaw-desktop-pet.git
cd openclaw-desktop-pet

# 安装依赖
npm install

# 准备素材（见下方说明）

# 启动
npm start
```

## 素材准备

项目不包含 Live2D 模型和音效文件，需要自行准备：

### Live2D 模型

在项目根目录下创建模型文件夹，每个模型需要：
- `.moc3` — 模型文件
- `.model3.json` — 模型配置
- `texture_00.png` — 贴图
- `.physics3.json` — 物理模拟（可选）

**获取素材**：淘宝/闲鱼搜索 "Live2D 模型"，几块钱就能买到。需要 Cubism 3.0+ 格式（`.moc3`）。

在 `index.html` 中修改 `CATS` 数组指向你的模型路径：

```javascript
const CATS = [
    { id: 'cat1', name: '我的猫咪', path: '模型文件夹/model.model3.json', watermark: null },
];
```

### 猫叫音效

在项目根目录放一个 `meow.mp3` 文件。可以用 ElevenLabs Sound Generation API 生成：

```bash
curl -X POST "https://api.elevenlabs.io/v1/sound-generation" \
  -H "xi-api-key: YOUR_KEY" -H "Content-Type: application/json" \
  -d '{"text":"a cute small kitten meowing softly","duration_seconds":1.5}' \
  --output meow.mp3
```

或者从 [freesound.org](https://freesound.org) 下载免费猫叫音效。

## 自定义 Agent 人格

默认使用 OpenClaw 的 `main` agent + 喵喵助手人格。你可以在 OpenClaw workspace 中创建自己的 Agent：

1. 创建 `~/openclaw-workspace/agents/companion/neko-assistant.md`
2. 定义猫咪人格（参考项目中的示例）
3. 在 `main.js` 中修改调用命令

## 操作说明

| 操作 | 效果 |
|------|------|
| 鼠标移入 | 显示输入框 |
| 输入文字 + 回车 | 发送消息给猫咪 |
| 点击猫咪 | 蹦一下 |
| 拖拽猫咪 | 移动窗口位置 |
| 右键 | 打开菜单（切换皮肤/动作/设置） |
| `Cmd+Q` | 语音输入（再按一次结束，自动发送） |
| 点击气泡 `..▸` | 展开完整回复 |

## 技术栈

- **Electron** — 透明无边框桌面窗口
- **PixiJS 6** + **pixi-live2d-display** — Live2D Cubism 4 渲染
- **OpenClaw CLI** — AI 对话后端
- **腾讯云 ASR** — 语音识别
- **ElevenLabs** — 音效生成

## License

MIT
