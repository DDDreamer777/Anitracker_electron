(function (root, factory) {
    const api = factory();

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

    if (root) {
        root.RendererStageController = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const SCRIPT_NAME = 'ZebrafishTool';
    const SCRIPT_MODELS = {
        preprocess: 'preprocess',
        detection: 'track',
        analysis: 'anlys'
    };
    const SCRIPT_LABELS = {
        preprocess: '预处理',
        detection: '检测',
        analysis: '分析'
    };

    function buildPythonArgs(argsString, scriptModel) {
        const args = String(argsString || '').match(/(".*?"|'.*?'|[^"\s][^\s]*)/g) || [];
        if (scriptModel) {
            args.unshift(scriptModel);
        }
        return args;
    }

    function buildSourceArgs(sourcePath) {
        const safeSourcePath = String(sourcePath || '').trim();
        if (!safeSourcePath) {
            return '';
        }
        return `--vd ${safeSourcePath} --sd ${safeSourcePath}_output`;
    }

    function buildExecutionRequest({
        type,
        sourcePath,
        preprocessFolderPath,
        preprocessArgsString,
        analysisArgsString
    }) {
        if (!SCRIPT_MODELS[type]) {
            throw new Error(`Unsupported stage type: ${type}`);
        }

        const safeSourcePath = String(sourcePath || '').trim();
        const safePreprocessFolderPath = String(preprocessFolderPath || '').trim();
        let argsString = '';

        if (type === 'preprocess') {
            if (!safeSourcePath) {
                throw new Error('Preprocess execution requires a source path');
            }
            if (!safePreprocessFolderPath) {
                throw new Error('Preprocess execution requires a preprocess folder path');
            }
            argsString = `--vd ${safeSourcePath} --sd ${safePreprocessFolderPath}`;
        } else if (type === 'detection') {
            argsString = String(preprocessArgsString || '').trim() || buildSourceArgs(safeSourcePath);
        } else if (type === 'analysis') {
            argsString = String(analysisArgsString || '').trim();
        }

        return {
            scriptName: SCRIPT_NAME,
            scriptModel: SCRIPT_MODELS[type],
            argsString,
            args: buildPythonArgs(argsString, SCRIPT_MODELS[type])
        };
    }

    function createStageController({
        electronAPI,
        runtimeClient,
        logMessage,
        actionButtons,
        getSourcePath,
        getScriptArgs,
        getAnalysisArgs,
        requestPreprocessFolder,
        onPreprocessStarted,
        onPreprocessCompleted,
        onStageProcessExit,
        onExecutionStateChange
    } = {}) {
        const stopScriptBtn = actionButtons ? actionButtons.stopScriptBtn : null;
        const startButtons = {
            preprocess: actionButtons ? actionButtons.startPreprocessBtn : null,
            detection: actionButtons ? actionButtons.startDetectionBtn : null,
            analysis: actionButtons ? actionButtons.startAnalysisBtn : null
        };
        const executionStageMap = new Map();

        function getSnapshot() {
            if (runtimeClient && typeof runtimeClient.getSnapshot === 'function') {
                return runtimeClient.getSnapshot();
            }
            return {
                sourcePath: '',
                preprocessFolderPath: '',
                activeScriptType: null,
                runningExecutions: {
                    preprocess: null,
                    detection: null,
                    analysis: null
                },
                stageCompletion: {
                    preprocess: false,
                    detection: false,
                    analysis: false
                }
            };
        }

        function applyActiveScriptUi(type) {
            if (!stopScriptBtn) {
                return;
            }

            if (type) {
                stopScriptBtn.disabled = false;
                stopScriptBtn.textContent = `终止${SCRIPT_LABELS[type]}进程`;
            } else {
                stopScriptBtn.disabled = true;
                stopScriptBtn.textContent = '终止运行中的进程';
            }
        }

        async function updateRuntime(patch) {
            if (runtimeClient && typeof runtimeClient.update === 'function') {
                return runtimeClient.update(patch);
            }
            return getSnapshot();
        }

        async function setActiveScript(type) {
            const snapshot = await updateRuntime({ activeScriptType: type });
            applyActiveScriptUi(snapshot.activeScriptType);
            if (typeof onExecutionStateChange === 'function') {
                onExecutionStateChange(snapshot);
            }
            return snapshot;
        }

        function getRunningExecutionId(type) {
            const snapshot = getSnapshot();
            return snapshot.runningExecutions && snapshot.runningExecutions[type]
                ? snapshot.runningExecutions[type]
                : null;
        }

        async function executePythonScript(type) {
            const snapshot = getSnapshot();
            const activeScriptType = snapshot.activeScriptType;
            const runningExecutions = snapshot.runningExecutions || {};
            if (activeScriptType && runningExecutions[activeScriptType]) {
                if (typeof logMessage === 'function') {
                    logMessage(`<span class="error-message">错误: 当前已有${SCRIPT_LABELS[activeScriptType]}进程在运行</span>`);
                }
                return null;
            }

            let preprocessFolderPath = snapshot.preprocessFolderPath || '';
            const sourcePath = typeof getSourcePath === 'function' ? getSourcePath() : snapshot.sourcePath || '';

            if (type === 'preprocess') {
                if (!sourcePath) {
                    if (typeof logMessage === 'function') {
                        logMessage('<span class="error-message">错误: 请先选择源文件夹</span>');
                    }
                    return null;
                }

                if (typeof logMessage === 'function') {
                    logMessage('请选择保存目录');
                }
                const folderResult = typeof requestPreprocessFolder === 'function'
                    ? await requestPreprocessFolder()
                    : await electronAPI.selectFolder({ playerId: 'preprocess' });
                if (!folderResult || !folderResult.path) {
                    if (typeof logMessage === 'function') {
                        logMessage('<span class="error-message">取消预处理</span>');
                    }
                    return null;
                }
                preprocessFolderPath = folderResult.path;
                await updateRuntime({ preprocessFolderPath });
                if (typeof onPreprocessStarted === 'function') {
                    await onPreprocessStarted(preprocessFolderPath);
                }
                if (typeof logMessage === 'function') {
                    logMessage(`预处理保存目录: ${preprocessFolderPath}`);
                }
            }

            const executionRequest = buildExecutionRequest({
                type,
                sourcePath,
                preprocessFolderPath,
                preprocessArgsString: typeof getScriptArgs === 'function' ? getScriptArgs() : '',
                analysisArgsString: typeof getAnalysisArgs === 'function' ? getAnalysisArgs() : ''
            });
            const startButton = startButtons[type];

            if (typeof logMessage === 'function') {
                logMessage(`运行脚本: ${executionRequest.scriptName} ${executionRequest.args.join(' ')}`);
            }

            if (executionRequest.args.length === 0) {
                if (typeof logMessage === 'function') {
                    logMessage('<span class="error-message">错误: 没有指定任何参数</span>');
                }
                return null;
            }

            if (startButton) {
                startButton.disabled = true;
            }

            try {
                const result = await electronAPI.runPython({
                    scriptName: executionRequest.scriptName,
                    args: executionRequest.args
                });
                if (!result.success) {
                    if (typeof logMessage === 'function') {
                        logMessage(`脚本启动失败: ${result.error}`);
                    }
                    if (startButton) {
                        startButton.disabled = false;
                    }
                    await setActiveScript(null);
                    return result;
                }

                executionStageMap.set(result.executionId, type);
                const nextRunningExecutions = {
                    ...(getSnapshot().runningExecutions || {}),
                    [type]: result.executionId
                };
                await updateRuntime({ runningExecutions: nextRunningExecutions, activeScriptType: type });
                applyActiveScriptUi(type);

                if (typeof logMessage === 'function') {
                    logMessage(`脚本进程已启动, ID: ${result.executionId}`);
                }
                if (type === 'preprocess' && typeof logMessage === 'function') {
                    logMessage('<span class="progress-message">预处理进行中，完成后将自动更新文件浏览区域...</span>');
                }
                if (typeof onExecutionStateChange === 'function') {
                    onExecutionStateChange(getSnapshot());
                }
                return result;
            } catch (error) {
                if (typeof logMessage === 'function') {
                    logMessage(`错误: ${error.message || JSON.stringify(error)}`);
                }
                if (startButton) {
                    startButton.disabled = false;
                }
                await setActiveScript(null);
                return null;
            }
        }

        async function stopPythonScript() {
            const snapshot = getSnapshot();
            const activeScriptType = snapshot.activeScriptType;
            if (!activeScriptType) {
                if (typeof logMessage === 'function') {
                    logMessage('没有正在运行的脚本可供停止。');
                }
                return null;
            }

            const executionId = snapshot.runningExecutions ? snapshot.runningExecutions[activeScriptType] : null;
            if (!executionId) {
                if (typeof logMessage === 'function') {
                    logMessage(`没有正在运行的'${activeScriptType}'脚本可供停止。`);
                }
                await setActiveScript(null);
                return null;
            }

            if (typeof logMessage === 'function') {
                logMessage(`正在请求终止${SCRIPT_LABELS[activeScriptType]}进程: ${executionId}`);
            }
            if (stopScriptBtn) {
                stopScriptBtn.disabled = true;
                stopScriptBtn.textContent = `终止${SCRIPT_LABELS[activeScriptType]}进程中...`;
            }

            try {
                const result = await electronAPI.stopPythonScript(executionId);
                if (result.success) {
                    if (typeof logMessage === 'function') {
                        logMessage(result.message);
                    }
                } else {
                    if (typeof logMessage === 'function') {
                        logMessage(`终止失败: ${result.message}`);
                    }
                    applyActiveScriptUi(activeScriptType);
                }
                return result;
            } catch (error) {
                if (typeof logMessage === 'function') {
                    logMessage(`终止进程时出错: ${error.message}`);
                }
                applyActiveScriptUi(activeScriptType);
                return null;
            }
        }

        async function handlePythonOutput(data) {
            const { type, executionId, code } = data;
            const outputText = typeof data.data === 'string' ? data.data.trim() : '';
            let scriptType = executionStageMap.get(executionId) || null;
            if (!scriptType) {
                scriptType = Object.keys(getSnapshot().runningExecutions || {}).find((key) => getRunningExecutionId(key) === executionId) || null;
            }

            if (type === 'stdout') {
                if (outputText && typeof logMessage === 'function') {
                    logMessage(`输出: [${executionId}] ${outputText}`);
                }
                return;
            }

            if (type === 'stderr') {
                if (!outputText || typeof logMessage !== 'function') {
                    return;
                }
                if (outputText.includes('%') && (outputText.includes('|') || outputText.includes('it]'))) {
                    logMessage(`进度: [${executionId}] ${outputText}`);
                } else {
                    logMessage(`错误: [${executionId}] ${outputText}`);
                }
                return;
            }

            if (!scriptType) {
                return;
            }

            const currentSnapshot = getSnapshot();
            const nextRunningExecutions = {
                ...(currentSnapshot.runningExecutions || {}),
                [scriptType]: null
            };
            const nextStageCompletion = { ...(currentSnapshot.stageCompletion || {}) };
            const shouldClearActive = currentSnapshot.activeScriptType === scriptType;
            const exitCode = typeof code === 'number' ? code : -1;
            const startButton = startButtons[scriptType];
            if (startButton) {
                startButton.disabled = false;
            }

            if (type === 'close') {
                if (typeof logMessage === 'function') {
                    if (exitCode === 0) {
                        logMessage(`进度: [${executionId}] 进程完成，状态码: ${exitCode}`);
                    } else if (code === null || code === undefined) {
                        logMessage(`进度: [${executionId}] 进程已被手动终止`);
                    } else {
                        logMessage(`错误: [${executionId}] 进程异常退出，状态码: ${exitCode}`);
                    }
                }
                if (exitCode === 0) {
                    nextStageCompletion[scriptType] = true;
                }
            } else if (type === 'error' && typeof logMessage === 'function') {
                logMessage(`错误: [${executionId}] ${outputText || '未知错误'}`);
            }

            await updateRuntime({
                runningExecutions: nextRunningExecutions,
                stageCompletion: nextStageCompletion,
                activeScriptType: shouldClearActive ? null : currentSnapshot.activeScriptType
            });
            executionStageMap.delete(executionId);
            applyActiveScriptUi(shouldClearActive ? null : currentSnapshot.activeScriptType);

            if (scriptType === 'preprocess' && type === 'close' && exitCode === 0 && typeof onPreprocessCompleted === 'function') {
                await onPreprocessCompleted(getSnapshot().preprocessFolderPath || currentSnapshot.preprocessFolderPath || '');
            }
            if (typeof onStageProcessExit === 'function') {
                await onStageProcessExit({
                    scriptType,
                    executionId,
                    eventType: type,
                    code,
                    snapshot: getSnapshot()
                });
            }
            if (typeof onExecutionStateChange === 'function') {
                onExecutionStateChange(getSnapshot());
            }
        }

        return {
            applyActiveScriptUi,
            executePythonScript,
            stopPythonScript,
            handlePythonOutput,
            setActiveScript
        };
    }

    return {
        buildPythonArgs,
        buildSourceArgs,
        buildExecutionRequest,
        createStageController
    };
}));
