# 斑马鱼实验控制器

> Author: ji
> Last Modified: 2026-03-16

基于 Electron 的桌面应用，通过局域网控制树莓派的 LED 灯光和音频播放。

## 功能

- **LED 控制**：红、绿、蓝、白四色切换 + 关闭
- **音频播放**：远程触发树莓派播放 WAV 文件

## 快速开始

```bash
# 安装依赖
npm install

# 运行
npm start

# 打包
npm run package-win    # Windows
npm run package-mac    # macOS
npm run package-linux  # Linux
```

## 使用说明

### 1. 配置 IP
在输入框中填写树莓派的局域网 IP 地址。

### 2. LED 控制
点击颜色按钮，向树莓派 9999 端口发送指令（red/green/blue/white/off）。

### 3. 播放音频
输入 WAV 文件名（如：test.wav），点击播放，向树莓派 9998 端口发送指令。

> 音频文件需放在树莓派的 `./audio_files/` 目录下

## 树莓派端要求

- LED 服务：监听 9999 端口
- 音频服务：监听 9998 端口，接收文件名后执行 `aplay` 播放
