const { app, BrowserWindow, dialog, ipcMain, screen, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const { spawn, exec  } = require('child_process')
const iconv = require('iconv-lite')
const {
  createRuntimeState,
  applyRuntimePatch,
  inferStageFromArgs,
  resetDownstreamCompletion,
  cloneRuntimeState
} = require('./runtime-state')

// [HW-INTEGRATION v2026.03.17] 硬件控制窗口实例（资源隔离：独立渲染进程）
let hardwareControlWindow = null
let hardwareRouteWindow = null
let isAppQuitting = false

// 处理 Windows 安装/卸载时的启动事件
if (require('electron-squirrel-startup')) {
  app.quit();
}

// 解码 Buffer，尝试 UTF-8，如果失败则回退到 GBK
function decodeBuffer(data) {
  if (!Buffer.isBuffer(data)) return data
  // 尝试用 UTF-8 解码
  const utf8 = data.toString('utf8')
  // 如果包含无效字符（通常是），则尝试用 GBK 解码
  // 这是因为 Windows 的命令行（特别是 .exe 的输出）通常使用本地代码页（如 GBK）
  return utf8.includes('\uFFFD') ? iconv.decode(data, 'gbk') : utf8
}

function createWindow() {
  // 获取屏幕尺寸
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  
  // 计算窗口尺寸为屏幕的一半
  const windowWidth = Math.floor(width * 0.7)
  const windowHeight = Math.floor(height * 0.7)
  
  const win = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true, 
      preload: path.join(__dirname, 'preload.js')
    }
  })

  // 窗口居中显示
  win.center()
  
  win.loadFile('home.html')
}

// [HW-INTEGRATION v2026.03.17] 创建树莓派硬件控制窗口
function createHardwareControlWindow() {
  if (hardwareControlWindow && !hardwareControlWindow.isDestroyed()) {
    console.info('[HW_OP] Hardware control window already exists, focusing existing window.')
    hardwareControlWindow.focus()
    return
  }

  hardwareControlWindow = new BrowserWindow({
    width: 900,
    height: 700,
    title: 'Anithrack Hardware Control',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: true
    }
  })

  const hardwareIndexPath = path.join(__dirname, 'hardware', 'pc', 'zebrafish_raspi_gui', 'index.html')
  hardwareControlWindow.loadFile(hardwareIndexPath)

  console.info(`[HW_OP] Hardware control window opened: ${hardwareIndexPath}`)

  hardwareControlWindow.on('closed', () => {
    console.info('[HW_OP] Hardware control window closed.')

    if (!isAppQuitting && hardwareRouteWindow && !hardwareRouteWindow.isDestroyed()) {
      hardwareRouteWindow.webContents.send('hardware-control-window-closed', {
        closedAt: Date.now(),
        reason: 'user-closed'
      })
    }

    hardwareControlWindow = null
  })
}

app.whenReady().then(() => {
  createWindow()
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  isAppQuitting = true
})

// [HW-INTEGRATION v2026.03.17] 渲染进程请求打开硬件控制界面
ipcMain.handle('open-hardware-control', async (event) => {
  try {
    console.info('[USER_OP] Request received: open hardware control window.')

    const routeWindow = BrowserWindow.fromWebContents(event.sender)
    if (routeWindow && !routeWindow.isDestroyed()) {
      hardwareRouteWindow = routeWindow
    }

    createHardwareControlWindow()
    return { success: true }
  } catch (error) {
    console.error('[HW_OP] Failed to open hardware control window:', error)
    return { success: false, error: error.message }
  }
})

// 处理视频文件选择
ipcMain.handle('select-video', async (event, { playerId }) => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Videos', extensions: ['mp4', 'mov', 'avi', 'mkv'] }]
  })
  
  if (!result.canceled && result.filePaths.length > 0) {
    return { playerId, path: result.filePaths[0] } // 只返回第一个选择的文件
  }
  return { playerId, path: null }
})

// 处理文件夹选择
ipcMain.handle('select-folder', async (event, { playerId }) => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  })
  
  if (!result.canceled && result.filePaths.length > 0) {
    return { playerId, path: result.filePaths[0] }
  }
  return { playerId, path: null }
})

// 获取文件夹中的视频文件
ipcMain.handle('get-files-in-folder', async (event, folderPath) => {
  try {
    const files = fs.readdirSync(folderPath)
    // 过滤掉临时文件夹中的视频，避免在列表中显示重复文件
    if (folderPath.endsWith('_temp')) {
        return []
    }
    const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv']
    
    const videoFiles = files
      .filter(file => {
        const ext = path.extname(file).toLowerCase()
        return videoExtensions.includes(ext)
      })
      .map(file => {
        return {
          name: file,
          path: path.join(folderPath, file)
        }
      })
    
    return videoFiles
  } catch (error) {
    console.error('Error reading directory:', error)
    return []
  }
})
// 处理视频转码请求
ipcMain.handle('convert-to-h264', async (event, sourcePath) => {
  const dirName = path.dirname(sourcePath);
  const fileName = path.basename(sourcePath);
  // 在原文件夹名后添加 _temp 后缀，作为临时文件夹
  const tempDir = `${dirName}_temp`; 
  
  // 确保临时文件夹存在
  if (!fs.existsSync(tempDir)) {
      try {
          fs.mkdirSync(tempDir, { recursive: true });
      } catch (err) {
          return { success: false, error: `创建临时文件夹失败: ${err.message}` };
      }
  }
  
  const outputPath = path.join(tempDir, fileName);

  console.log(`正在转码: ${sourcePath} -> ${outputPath}`);

  // 确定 ffmpeg 路径，首先区分打包环境和开发环境（有无resources目录）
  const distPath = app.isPackaged 
      ? path.join(process.resourcesPath, 'dist') 
      : path.join(__dirname, 'dist');
  const localFfmpeg = path.join(distPath, 'ffmpeg.exe');

  // 检查本地 ffmpeg 是否存在，否则使用全局命令
  const ffmpegCommand = fs.existsSync(localFfmpeg) 
      ? (console.log('使用应用自带的 ffmpeg:', localFfmpeg), `"${localFfmpeg}"`) 
      : (console.log('使用全局 ffmpeg 命令'), 'ffmpeg');
  
  const debugInfo = fs.existsSync(localFfmpeg) 
      ? `使用自带 FFmpeg: ${localFfmpeg}` 
      : `使用全局 FFmpeg 命令`;

  return new Promise((resolve) => {
      // 尝试构建一个使用 Windows 原生编码器的命令
      const command = `${ffmpegCommand} -i "${sourcePath}" -c:v h264_mf -b:v 10M -c:a aac -y "${outputPath}"`;
      
      exec(command, (error, stdout, stderr) => {
          if (error) {
              console.error('h264_mf 转码失败，尝试降级到 mpeg4:', error);
              // 如果 h264_mf 失败，尝试 mpeg4
              const fallbackCommand = `${ffmpegCommand} -i "${sourcePath}" -c:v mpeg4 -q:v 2 -c:a aac -y "${outputPath}"`;
              exec(fallbackCommand, (error2, stdout2, stderr2) => {
                   if (error2) {
                        console.error('所有转码尝试均失败:', error2);
                        resolve({ success: false, error: '所有转码尝试均失败，请安装完整版 FFmpeg。' + error2.message, debugInfo });
                   } else {
                        resolve({ success: true, path: outputPath, debugInfo });
                   }
              })
          } else {
              resolve({ success: true, path: outputPath, debugInfo });
          }
      });
  });
});


// 存储和管理正在运行的脚本进程
const runningScripts = new Map();
const executionStageMap = new Map();
const runtimeState = createRuntimeState();

function getSoftwareWindows() {
  return BrowserWindow.getAllWindows().filter((win) => {
    if (!win || win.isDestroyed()) {
      return false
    }

    const url = win.webContents.getURL() || ''
    return url.includes('software.html')
  })
}

function sendToSoftwareWindows(channel, payload) {
  const softwareWindows = getSoftwareWindows()
  softwareWindows.forEach((win) => {
    win.webContents.send(channel, payload)
  })
}

function broadcastRuntimeState() {
  sendToSoftwareWindows('runtime-state', cloneRuntimeState(runtimeState))
}

ipcMain.handle('get-runtime-state', async () => {
  return cloneRuntimeState(runtimeState)
})

ipcMain.handle('update-runtime-state', async (event, patch = {}) => {
  applyRuntimePatch(runtimeState, patch)
  broadcastRuntimeState()
  return { success: true, state: cloneRuntimeState(runtimeState) }
})

ipcMain.handle('run-python', async (event, { scriptName, args = [] }) => {
  try {
    const pythonPath = 'python';
    const stageKey = inferStageFromArgs(args)

    // 确定 dist 目录的路径
    // 如果是打包应用，dist 在 resources 目录下
    // 如果是开发环境，dist 在当前目录下
    const distPath = app.isPackaged 
      ? path.join(process.resourcesPath, 'dist') 
      : path.join(__dirname, 'dist');

    const exePath = path.join(distPath, `${scriptName}.exe`);
    
    // 此处的路径根据实际情况修改
    // const pyPath = path.join('C:\\Self\\GraduateLife\\Codebase\\Zebrafish\\v31', `${scriptName}.py`);
    const pyPath = path.join('D:\\ultralytics\\251202_Anitrack\\v31', `main_cli.py`);

    let command;
    let commandArgs;
    
    // 确定工作目录
    const workingDirectory = app.isPackaged ? process.resourcesPath : __dirname;

    if (fs.existsSync(exePath)) {
      console.log(`Found executable: ${exePath}`);
      command = exePath;
      commandArgs = args;
    } else if (fs.existsSync(pyPath)) {
      console.log(`Executable not found, falling back to python script: ${pyPath}`);
      command = pythonPath;
      commandArgs = ['-u', pyPath, ...args];
    } else {
      return { success: false, error: `未找到 ${scriptName} 的可执行文件或脚本。` };
    }

    const executionId = `${scriptName}-${Date.now()}`;
    const pythonProcess = spawn(command, commandArgs, {
      cwd: workingDirectory, // 显式指定工作目录
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    if (stageKey) {
      resetDownstreamCompletion(runtimeState, stageKey)
      runtimeState.activeScriptType = stageKey
      runtimeState.runningExecutions[stageKey] = executionId
      executionStageMap.set(executionId, stageKey)
      broadcastRuntimeState()
    }

    // 存储进程
    runningScripts.set(executionId, pythonProcess);
    
    // 收集标准输出并实时发送
    pythonProcess.stdout.on('data', (data) => {
      const output = decodeBuffer(data);
      // 实时发送输出到渲染进程
      sendToSoftwareWindows('python-output', {
        type: 'stdout',
        executionId,
        data: output
      });
    });
    
    // 收集错误输出并实时发送
    pythonProcess.stderr.on('data', (data) => {
      const output = decodeBuffer(data);
      // 实时发送错误输出到渲染进程
      sendToSoftwareWindows('python-output', {
        type: 'stderr',
        executionId,
        data: output
      });
    });

    // 进程结束时处理
    pythonProcess.on('close', (code) => {
      const stage = executionStageMap.get(executionId)
      runningScripts.delete(executionId); // 从Map中移除

      if (stage) {
        if (code === 0) {
          runtimeState.stageCompletion[stage] = true
        }
        if (runtimeState.activeScriptType === stage) {
          runtimeState.activeScriptType = null
        }
        runtimeState.runningExecutions[stage] = null
        executionStageMap.delete(executionId)
        broadcastRuntimeState()
      }

      // 发送进程结束信号
      sendToSoftwareWindows('python-output', {
        type: 'close',
        executionId,
        code
      });
    });
      
    // 进程启动错误处理
    pythonProcess.on('error', (err) => {
      const stage = executionStageMap.get(executionId)
      runningScripts.delete(executionId); // 从Map中移除

      if (stage) {
        if (runtimeState.activeScriptType === stage) {
          runtimeState.activeScriptType = null
        }
        runtimeState.runningExecutions[stage] = null
        executionStageMap.delete(executionId)
        broadcastRuntimeState()
      }

      sendToSoftwareWindows('python-output', {
        type: 'error',
        executionId,
        data: `启动Python进程失败: ${err.message}`
      });
    });

    // 立即返回成功和executionId，不等待脚本执行完毕
    return { success: true, executionId };

  } catch (error) {
    // 这个catch主要捕获spawn之前的错误
    return { success: false, error: error.message };
  }
});

// 新增：终止指定的Python脚本
ipcMain.handle('stop-python-script', async (event, executionId) => {
  const processToKill = runningScripts.get(executionId);
  if (processToKill && processToKill.pid) {
    const pid = processToKill.pid;
    // 在Windows上，使用taskkill命令来终止进程及其所有子进程
    // /T 终止指定的进程和由它启动的任何子进程。
    // /F 指定强制终止进程。
    exec(`taskkill /PID ${pid} /T /F`, (error, stdout, stderr) => {
      runningScripts.delete(executionId); // 从Map中移除
      if (error) {
        // 如果进程已经不存在，taskkill会报错，这通常不是问题
        if (stderr.includes('找不到')) {
          console.log(`进程 ${executionId} (PID: ${pid}) 在尝试终止时已不存在。`);
        } else {
          console.error(`终止进程 ${executionId} (PID: ${pid}) 时出错: ${error.message}`);
          console.error(`taskkill stderr: ${stderr}`);
        }
      } else {
        console.log(`成功终止进程 ${executionId} (PID: ${pid}) 及其子进程。`);
      }
    });
    return { success: true, message: `已发送终止进程 ${executionId} 的请求。` };
  }
  return { success: false, message: `未找到正在运行的进程 ${executionId}。` };
});

// 启动/停止Python服务
let pythonServer = null

ipcMain.handle('start-python-server', async (event, { scriptName, port = 5000 }) => {
  try {
    // 如果已存在进程，先停止
    if (pythonServer) {
      pythonServer.kill()
      pythonServer = null
    }
    
    const pythonPath = 'python'
    const distPath = app.isPackaged 
      ? path.join(process.resourcesPath, 'dist') 
      : path.join(__dirname, 'dist');
      
    const exePath = path.join(distPath, `${scriptName}.exe`);
    // const scriptPath = path.join(__dirname, 'scripts', `${scriptName}.py`)
    const scriptPath = path.join('D:\\ultralytics\\251202_Anitrack\\v31', `main_cli.py`)

    
    // 获取当前环境变量的副本，避免直接使用process.env
    const env = Object.assign({}, process.env);
    env.PYTHONIOENCODING = 'utf-8';
    
    // 确定工作目录
    const workingDirectory = app.isPackaged ? process.resourcesPath : __dirname;

    if (fs.existsSync(exePath)) {
       // 使用打包好的exe启动服务器
       pythonServer = spawn(exePath, ['--port', port.toString()], {
        cwd: workingDirectory, // 显式指定工作目录
        env: env
      })
    } else {
      // 启动Python作为服务器
      pythonServer = spawn(pythonPath, [scriptPath, '--port', port.toString()], {
        cwd: workingDirectory, // 显式指定工作目录
        env: env
      })
    }
    
    // 设置输出流的编码
    
    // 设置输出流的编码
    pythonServer.stdout.setEncoding('utf-8');
    pythonServer.stderr.setEncoding('utf-8');
    
    let output = ''
    
    return new Promise((resolve, reject) => {
      // 设置超时，等待服务器启动
      const timeout = setTimeout(() => {
        resolve({ success: true, message: '服务器启动中...', output })
      }, 2000)
      
      pythonServer.stdout.on('data', (data) => {
        output += data.toString()
        // 如果输出中包含特定消息，表示服务器已启动
        if (output.includes('Server started') || output.includes('Running on')) {
          clearTimeout(timeout)
          resolve({ success: true, message: '服务器已启动', output })
        }
      })
      
      pythonServer.stderr.on('data', (data) => {
        output += data.toString()
      })
      
      pythonServer.on('error', (err) => {
        clearTimeout(timeout)
        reject({ success: false, error: `启动Python服务器失败: ${err.message}` })
      })
      
      pythonServer.on('close', (code) => {
        if (code !== 0 && !timeout._destroyed) {
          clearTimeout(timeout)
          reject({ success: false, error: `Python服务器异常退出，状态码: ${code}` })
        }
      })
    })
  } catch (error) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('stop-python-server', async () => {
  if (pythonServer) {
    pythonServer.kill()
    pythonServer = null
    return { success: true, message: '服务器已停止' }
  }
  return { success: false, message: '没有运行中的服务器' }
})

// 处理打开文件夹请求
ipcMain.handle('open-folder', async (event, folderPath) => {
  try {
    if (fs.existsSync(folderPath)) {
      await shell.openPath(folderPath);
      return { success: true };
    } else {
      return { success: false, error: '文件夹不存在' };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 处理另存为请求
ipcMain.handle('save-results-as', async (event, sourcePath, targetPath) => {
  try {
    // 如果源路径不存在，返回错误
    if (!fs.existsSync(sourcePath)) {
      return { success: false, error: '源文件夹不存在' };
    }
    
    // 如果目标路径不存在，创建它
    if (!fs.existsSync(targetPath)) {
      fs.mkdirSync(targetPath, { recursive: true });
    }
    
    // 复制文件夹内容
    copyFolderSync(sourcePath, targetPath);
    
    return { success: true, message: '保存成功' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 工具函数：复制文件夹内容
function copyFolderSync(source, target) {
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }

  const files = fs.readdirSync(source);
  
  files.forEach(file => {
    const currentSource = path.join(source, file);
    const currentTarget = path.join(target, file);
    
    if (fs.lstatSync(currentSource).isDirectory()) {
      copyFolderSync(currentSource, currentTarget); // 递归小巧思
    } else {
      fs.copyFileSync(currentSource, currentTarget);
    }
  });
}

// 应用退出时确保Python进程也被终止
app.on('will-quit', () => {
  if (pythonServer) {
    pythonServer.kill()
    pythonServer = null
  }
  // 终止所有通过 run-python 启动的脚本
  for (const [executionId, processToKill] of runningScripts.entries()) {
    if (processToKill && processToKill.pid) {
      exec(`taskkill /PID ${processToKill.pid} /T /F`);
    }
  }
})

