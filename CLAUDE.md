# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

这是一个基于 Electron 的桌面版番茄钟应用，支持专注计时、短休息和长休息三种模式。

## Architecture

### File Structure
- `main.js` - Electron 主进程，负责窗口管理、系统托盘、桌面通知
- `renderer.js` - 渲染进程，包含计时器逻辑、UI 交互、状态管理
- `index.html` - 主界面 HTML 结构
- `styles.css` - 样式文件，使用 CSS 变量定义主题色
- `assets/` - 图标资源目录

### Key Technical Details

**计时器状态管理** (`renderer.js`):
- 状态集中存储在 `state` 对象（模式、剩余时间、设置等）
- 使用 `setInterval` 实现每秒倒计时
- SVG 圆形进度环通过 `stroke-dashoffset` 控制进度显示

**主进程与渲染进程通信**:
- `ipcRenderer.send('show-notification', title, body)` - 发送桌面通知
- `ipcRenderer.send('update-tray-tooltip', text)` - 更新托盘提示文字

**音效系统**:
- 使用 Web Audio API 生成提示音（无需外部音频文件）
- 播放 C5 + E5 双音调提示音

**主题系统**:
- CSS 变量定义在 `:root`，支持通过修改变量切换主题
- 不同模式通过 `.mode-shortBreak`、`.mode-longBreak` 类切换进度环颜色

## Development Commands

```bash
# 安装依赖
npm install

# 启动应用（开发模式）
npm start

# 构建应用（生成安装包）
npm run build
```

## Configuration

**默认时间设置** (分钟):
- 专注 (pomodoro): 25
- 短休息 (shortBreak): 5
- 长休息 (longBreak): 15

用户可通过设置面板修改，数值范围限制：专注/长休息 1-60分钟，短休息 1-30分钟。

## Keyboard Shortcuts

- `Space` - 开始/暂停计时（设置面板打开时无效）
- `Escape` - 关闭设置面板

## Notes

- 应用关闭时会隐藏到系统托盘，不会真正退出（macOS 行为）
- 计时器运行期间禁止切换模式
- 完成 4 个番茄钟后自动进入长休息（如启用自动休息）
