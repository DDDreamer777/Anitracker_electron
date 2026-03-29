// Electron主进程，负责创建窗口、控制应用生命周期
const { app, BrowserWindow } = require('electron');
const path = require('path');

// 保持窗口实例，防止被垃圾回收
let mainWindow;

// 创建GUI窗口
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,          // 窗口宽度
    height: 700,         // 窗口高度
    resizable: false,    // 禁止缩放（实验时避免误操作）
    title: "斑马鱼行为学实验-树莓派LED/音频控制器",
    webPreferences: {
      nodeIntegration: true,    // 允许前端HTML使用Node.js模块（核心：TCP通信）
      contextIsolation: false,  // 配合上面的配置，简化开发
      enableRemoteModule: true
    }
  });

  // 加载GUI界面文件
  mainWindow.loadFile('index.html');

  // 关闭窗口时销毁实例
  mainWindow.on('closed', function () {
    mainWindow = null;
  });

  // 禁止开发者工具（可选，实验时关闭，开发时可打开）
  // mainWindow.webContents.openDevTools();
}

// Electron初始化完成后创建窗口
app.whenReady().then(() => {
  createWindow();

  // Mac系统下，关闭窗口后保留应用，点击dock重新打开
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// 所有窗口关闭后退出应用（Mac除外）
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});