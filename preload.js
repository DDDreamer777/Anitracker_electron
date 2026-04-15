const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
    openHardwareControl: () => ipcRenderer.invoke('open-hardware-control'),
    onHardwareControlClosed: (callback) => {
        const listener = (_, data) => callback(data)
        ipcRenderer.on('hardware-control-window-closed', listener)
        return () => ipcRenderer.removeListener('hardware-control-window-closed', listener)
    },
    selectVideo: (data) => ipcRenderer.invoke('select-video', data),
    selectFolder: (data) => ipcRenderer.invoke('select-folder', data),
    getFilesInFolder: (folderPath) => ipcRenderer.invoke('get-files-in-folder', folderPath),
    // 添加Python相关API
    runPython: (data) => ipcRenderer.invoke('run-python', data),
    stopPythonScript: (executionId) => ipcRenderer.invoke('stop-python-script', executionId), // 新增
    startPythonServer: (data) => ipcRenderer.invoke('start-python-server', data),
    stopPythonServer: () => ipcRenderer.invoke('stop-python-server'),

    // 新增文件夹操作API
    openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
    saveResultsAs: (sourcePath, targetPath) => ipcRenderer.invoke('save-results-as', sourcePath, targetPath),
    
    // 视频转码API
    convertToH264: (filePath) => ipcRenderer.invoke('convert-to-h264', filePath),

    // 运行时状态同步API
    getRuntimeState: () => ipcRenderer.invoke('get-runtime-state'),
    updateRuntimeState: (statePatch) => ipcRenderer.invoke('update-runtime-state', statePatch),
    onRuntimeState: (callback) => {
        const listener = (_, data) => callback(data)
        ipcRenderer.on('runtime-state', listener)
        return () => ipcRenderer.removeListener('runtime-state', listener)
    },

    // 添加监听Python输出的方法
    onPythonOutput: (callback) => ipcRenderer.on('python-output', (_, data) => callback(data))
})