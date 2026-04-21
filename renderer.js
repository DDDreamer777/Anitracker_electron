document.addEventListener('DOMContentLoaded', () => {
    const runtimeStateApi = window.RuntimeState;
    const fileListVisibilityApi = window.FileListVisibility;
    const runtimeClientApi = window.RendererRuntimeClient;
    const logConsoleApi = window.RendererLogConsole;
    const mediaPreviewApi = window.RendererMediaPreview;
    const fileBrowserApi = window.RendererFileBrowser;
    const stageControllerApi = window.RendererStageController;
    const appControllerApi = window.RendererAppController;

    if (!runtimeStateApi || !runtimeClientApi || !logConsoleApi || !mediaPreviewApi || !fileBrowserApi || !stageControllerApi || !appControllerApi) {
        console.error('Renderer modules are not fully available.');
        return;
    }

    const FOLDER_PATH_PLACEHOLDER = '请选择文件夹路径';
    const videos = {
        1: document.getElementById('video1'),
        2: document.getElementById('video2')
    };
    const outputElement = document.getElementById('output');
    const folderPathElements = {
        1: document.getElementById('folderPath1'),
        2: document.getElementById('folderPath2')
    };
    const fileListElements = {
        1: document.getElementById('fileList1'),
        2: document.getElementById('fileList2')
    };
    const actionButtons = {
        startPreprocessBtn: document.getElementById('startPreprocessBtn'),
        startDetectionBtn: document.getElementById('startDetectionBtn'),
        startAnalysisBtn: document.getElementById('startAnalysisBtn'),
        openResultsBtn: document.getElementById('openResultsBtn'),
        saveAsBtn: document.getElementById('saveAsBtn'),
        stopScriptBtn: document.getElementById('stopScriptBtn')
    };
    const toolDrawerElements = {
        toolDrawerToggleBtn: document.getElementById('toolDrawerToggleBtn'),
        toolDrawerPanel: document.getElementById('toolDrawerPanel'),
        toolboxHint: document.getElementById('toolDrawerToggleBtn')
            ? document.getElementById('toolDrawerToggleBtn').closest('.toolbox-hint')
            : null,
        documentRef: document,
        windowRef: window
    };
    const scriptArgsInput = document.getElementById('scriptArgs');
    const analysisScriptArgsInput = document.getElementById('analysisScriptArgs');
    const folderPathShell1 = document.getElementById('folderPathShell1');
    const fileListRegion1 = document.getElementById('fileListRegion1');

    const logConsole = logConsoleApi.createLogConsole({ outputElement });
    const { logMessage } = logConsole;

    const runtimeClient = runtimeClientApi.createRuntimeClient({
        runtimeStateApi,
        electronAPI: window.electronAPI
    });

    let appController = null;
    let fileBrowser = null;
    let stageController = null;

    const mediaPreview = mediaPreviewApi.createMediaPreview({
        videos,
        logMessage,
        electronAPI: window.electronAPI,
        onPrimaryPreviewVisibilityChange() {
            if (fileBrowser && typeof fileBrowser.syncPrimaryFileListRegionVisibility === 'function') {
                fileBrowser.syncPrimaryFileListRegionVisibility();
            }
        }
    });

    async function handlePrimarySourceChanged(sourcePath, options = {}) {
        if (appController && typeof appController.handlePrimarySourceChanged === 'function') {
            await appController.handlePrimarySourceChanged(sourcePath, options);
        }
    }

    fileBrowser = fileBrowserApi.createFileBrowser({
        electronAPI: window.electronAPI,
        fileListVisibilityApi,
        folderPathElements,
        folderPathShell1,
        fileListElements,
        fileListRegion1,
        placeholderText: FOLDER_PATH_PLACEHOLDER,
        mediaPreview,
        logMessage,
        onPrimarySourceChanged: handlePrimarySourceChanged,
        onPrimaryFileSelected() {
            if (fileBrowser && typeof fileBrowser.syncPrimaryFileListRegionVisibility === 'function') {
                fileBrowser.syncPrimaryFileListRegionVisibility(true);
            }
        }
    });

    function getCurrentSourcePath() {
        if (appController && typeof appController.getCurrentSourcePath === 'function') {
            return appController.getCurrentSourcePath();
        }
        return '';
    }

    stageController = stageControllerApi.createStageController({
        electronAPI: window.electronAPI,
        runtimeClient,
        logMessage,
        actionButtons,
        getSourcePath: getCurrentSourcePath,
        getScriptArgs() {
            return scriptArgsInput ? scriptArgsInput.value.trim() : '';
        },
        getAnalysisArgs() {
            return analysisScriptArgsInput ? analysisScriptArgsInput.value.trim() : '';
        },
        async onPreprocessStarted(preprocessFolderPath) {
            await runtimeClient.update({ preprocessFolderPath });
        },
        async onPreprocessCompleted(preprocessFolderPath) {
            if (!preprocessFolderPath) {
                return;
            }
            if (folderPathElements[1]) {
                folderPathElements[1].textContent = preprocessFolderPath;
                fileBrowser.syncFolderPathVisualState(folderPathElements[1], folderPathShell1);
            }
            mediaPreview.resetPreview(1);
            fileBrowser.syncPrimaryFileListStateFromSourcePath(preprocessFolderPath);
            fileBrowser.syncPrimaryFileListRegionVisibility();
            await fileBrowser.loadFilesFromFolder(preprocessFolderPath, 1);
            await handlePrimarySourceChanged(preprocessFolderPath);
            const snapshot = runtimeClient.getSnapshot();
            await runtimeClient.update({
                stageCompletion: {
                    ...snapshot.stageCompletion,
                    detection: false,
                    analysis: false
                }
            });
            logMessage(`输出: 预处理完成，文件浏览区域已更新为: ${preprocessFolderPath}`);
        }
    });

    appController = appControllerApi.createAppController({
        electronAPI: window.electronAPI,
        runtimeClient,
        fileBrowser,
        mediaPreview,
        stageController,
        videos,
        logMessage,
        folderPathElements,
        actionButtons,
        toolDrawerElements,
        scriptArgsInput,
        analysisScriptArgsInput,
        placeholderText: FOLDER_PATH_PLACEHOLDER
    });

    window.selectVideo = (playerId) => fileBrowser.selectVideo(playerId);
    window.selectFolder = (playerId) => fileBrowser.selectFolder(playerId);
    window.executePythonScript = (type) => stageController.executePythonScript(type);
    window.stopPythonScript = () => stageController.stopPythonScript();
    window.openPreprocessFolder = () => appController.openPreprocessFolder();
    window.openResultsFolder = () => appController.openResultsFolder();
    window.saveResultsAs = () => appController.saveResultsAs();

    window.stageRuntimeBridge = {
        getSnapshot: () => runtimeClient.getSnapshot(),
        subscribe: (listener) => runtimeClient.subscribe(listener)
    };

    window.electronAPI.onPythonOutput((data) => {
        stageController.handlePythonOutput(data).catch((error) => {
            logMessage(`错误: ${error.message}`);
        });
    });

    [videos[1], videos[2]].forEach((videoElement, index) => {
        if (!videoElement) {
            return;
        }
        videoElement.addEventListener('play', () => logMessage(`播放器${index + 1}开始播放`));
        videoElement.addEventListener('pause', () => logMessage(`播放器${index + 1}暂停播放`));
    });

    appController.initialize();

    window.addEventListener('beforeunload', () => {
        appController.destroy();
    }, { once: true });

    runtimeClient.hydrateFromMain().then((snapshot) => {
        if (snapshot.sourcePath) {
            if (folderPathElements[1]) {
                folderPathElements[1].textContent = snapshot.sourcePath;
                fileBrowser.syncFolderPathVisualState(folderPathElements[1], folderPathShell1);
            }
            fileBrowser.syncPrimaryFileListStateFromSourcePath(snapshot.sourcePath);
            fileBrowser.loadFilesFromFolder(snapshot.sourcePath, 1).catch((error) => {
                logMessage(`加载文件列表出错: ${error.message}`);
            });
            handlePrimarySourceChanged(snapshot.sourcePath, { silent: true }).catch((error) => {
                logMessage(`错误: ${error.message}`);
            });
        }
        stageController.applyActiveScriptUi(snapshot.activeScriptType);
    }).catch((error) => {
        logMessage(`错误: ${error.message}`);
    });

    logMessage('应用已启动，请选择视频文件或文件夹');
});
