document.addEventListener('DOMContentLoaded', () => {
    const video1 = document.getElementById('video1');
    const video2 = document.getElementById('video2');
    const outputDiv = document.getElementById('output');
    const fileList1 = document.getElementById('fileList1');
    const fileList2 = document.getElementById('fileList2');
    const folderPath1 = document.getElementById('folderPath1');
    const folderPath2 = document.getElementById('folderPath2');

    // 视频错误监听
    [video1, video2].forEach((video, index) => {
        if (!video) return;
        video.addEventListener('error', (e) => {
            const error = video.error;
            let errorMessage = '未知视频错误';
            if (error) {
                // 如果是格式不支持 (code 4) 且有原始路径，尝试自动转码
                if (error.code === 4 && video.dataset.originalPath && video.dataset.isConverting !== 'true') {
                     // 防止重复触发
                     if (video.src.includes('_temp')) {
                         logMessage(`<span class="error-message">转码后的视频无法播放，可能是严重损坏或ffmpeg转换失败。</span>`);
                         return;
                     }

                    const originalPath = video.dataset.originalPath;
                    video.dataset.isConverting = 'true'; // 标记正在转码
                    
                    logMessage(`<span class="progress-message">检测到视频编码不兼容 (MEDIA_ERR_SRC_NOT_SUPPORTED)，正在生成兼容预览版...</span>`);
                    logMessage(`<span class="progress-message">这可能需要一小会，取决于视频大小，请稍候...</span>`);

                    window.electronAPI.convertToH264(originalPath).then(result => {
                         // 将后端的调试信息显示在前端
                        if (result.debugInfo) {
                            logMessage(`<span class="debug-message" style="color: gray; font-size: 0.9em;"> ${result.debugInfo}</span>`);
                        }

                        if (result.success) {
                            logMessage(`<span class="output-message">预览版生成成功，即将播放。</span>`);
                            // 添加时间戳防止缓存
                            video.src = `file:///${result.path.replace(/\\/g, '/')}?t=${new Date().getTime()}`;
                        } else {
                            logMessage(`<span class="error-message">自动转码失败: ${result.error}</span>`);
                        }
                    }).catch(err => {
                         logMessage(`<span class="error-message">调用转码服务出错: ${err.message}</span>`);
                    }).finally(() => {
                        video.dataset.isConverting = 'false';
                    });
                    
                    return; // 暂不显示常规错误信息
                }

                switch (error.code) {
                    case 1: errorMessage = '视频加载被中止 (MEDIA_ERR_ABORTED)'; break;
                    case 2: errorMessage = '网络错误导致下载失败 (MEDIA_ERR_NETWORK)'; break;
                    case 3: errorMessage = '视频解码失败 (MEDIA_ERR_DECODE) - 可能是编码格式(如H.265)不支持'; break;
                    case 4: errorMessage = '视频格式不支持或来源无法访问 (MEDIA_ERR_SRC_NOT_SUPPORTED)'; break;
                }
                const fullMsg = `播放器${index + 1} 发生错误: ${errorMessage}`;
                console.error(fullMsg, error);
                logMessage(`<span class="error-message">${fullMsg}</span>`);
            }
        });
    });

    const startAnalysisBtn = document.getElementById('startAnalysisBtn');
    const openResultsBtn = document.getElementById('openResultsBtn');
    const saveAsBtn = document.getElementById('saveAsBtn');
    const stopScriptBtn = document.getElementById('stopScriptBtn');

    folderPath1.textContent = '请选择文件夹路径';
    startAnalysisBtn.disabled = true;
    openResultsBtn.disabled = true;
    saveAsBtn.disabled = true;

    let preprocessFolderPath = '';
    const runningScriptIds = {
        preprocess: null,
        detection: null,
        analysis: null
    };
    let activeScriptType = null;
    const scriptLabelMap = {
        preprocess: '预处理',
        detection: '检测',
        analysis: '分析'
    };

    window.selectVideo = (playerId) => {
        window.electronAPI.selectVideo({ playerId }).then(result => {
            if (result.path) {
                const videoElement = document.getElementById(`video${result.playerId}`);
                // videoElement.src = `file://${result.path}`; // 原有逻辑                
                videoElement.dataset.originalPath = result.path;                
                videoElement.src = `file:///${result.path.replace(/\\/g, '/')}`; // 处理路径分隔符
                logMessage(`播放器${result.playerId}加载视频: ${result.path}`);
            }
        }).catch(err => {
            logMessage(`错误: ${err.message}`);
        });
    };

    window.selectFolder = (playerId) => {
        window.electronAPI.selectFolder({ playerId }).then(result => {
            if (result.path) {
                const folderPathElement = document.getElementById(`folderPath${result.playerId}`);
                folderPathElement.textContent = result.path;
                logMessage(`播放器${result.playerId}设置文件夹: ${result.path}`);
                loadFilesFromFolder(result.path, playerId);
                useFolderPathAsArg(result.path);
            }
        }).catch(err => {
            logMessage(`错误: ${err.message}`);
        });
    };

    function useFolderPathAsArg(folderPath) {
        const scriptArgsInput = document.getElementById('scriptArgs');
        const analysisScriptArgsInput = document.getElementById('analysisScriptArgs');

        if (folderPath) {
            const argString = `--vd ${folderPath} --sd ${folderPath}_output`;

            if (scriptArgsInput) {
                scriptArgsInput.value = argString;
            }

            if (analysisScriptArgsInput) {
                analysisScriptArgsInput.value = argString;
            }

            logMessage(`参数已自动设置为: ${argString}`);

            // 解锁行为学分析功能，无需先运行检测再进行分析
            if (startAnalysisBtn) startAnalysisBtn.disabled = false;
            if (openResultsBtn) openResultsBtn.disabled = false;
            if (saveAsBtn) saveAsBtn.disabled = false;
        }
    }

    function loadFilesFromFolder(folderPath, playerId) {
        window.electronAPI.getFilesInFolder(folderPath).then(files => {
            const fileListElement = document.getElementById(`fileList${playerId}`);
            fileListElement.innerHTML = '';

            if (files.length === 0) {
                fileListElement.innerHTML = '<div>没有找到视频文件</div>';
                return;
            }

            files.forEach(file => {
                const fileItem = document.createElement('div');
                fileItem.className = 'file-item';
                fileItem.textContent = file.name;
                fileItem.addEventListener('click', () => {
                    const videoElement = document.getElementById(`video${playerId}`);
                    // videoElement.src = `file://${file.path}`; // 原有逻辑                    
                    videoElement.dataset.originalPath = file.path;                    
                    videoElement.src = `file:///${file.path.replace(/\\/g, '/')}`; // 处理路径分隔符
                    logMessage(`播放器${playerId}加载视频: ${file.name}`);
                });
                fileListElement.appendChild(fileItem);
            });
        }).catch(err => {
            logMessage(`加载文件列表出错: ${err.message}`);
        });
    }

    function setActiveScript(type) {
        activeScriptType = type;
        if (type) {
            stopScriptBtn.disabled = false;
            stopScriptBtn.textContent = `终止${scriptLabelMap[type]}进程`;
        } else {
            stopScriptBtn.disabled = true;
            stopScriptBtn.textContent = '终止运行中的进程';
        }
    }

    window.executePythonScript = async (type) => {
        if (activeScriptType && runningScriptIds[activeScriptType]) {
            logMessage(`<span class="error-message">错误: 当前已有${scriptLabelMap[activeScriptType]}进程在运行</span>`);
            return;
        }

        let scriptName = null;
        let scriptModel = null;
        let argsString = '';
        let startBtn = null;

        if (type === 'preprocess') {
            const sourcePath = folderPath1.textContent;
            if (!sourcePath || sourcePath === '请选择文件夹路径') {
                logMessage('<span class="error-message">错误: 请先选择源文件夹</span>');
                return;
            }

            logMessage('请选择保存目录');
            const result = await window.electronAPI.selectFolder({ playerId: 'preprocess' });
            if (!result || !result.path) {
                logMessage('<span class="error-message">取消预处理</span>');
                return;
            }

            preprocessFolderPath = result.path;
            scriptName = 'ZebrafishTool'; // 注意这里的脚本名称要和实际Python脚本对应
            scriptModel = 'preprocess';
            argsString = `--vd ${sourcePath} --sd ${preprocessFolderPath}`;
            startBtn = document.getElementById('startPreprocessBtn');
            logMessage(`预处理保存目录: ${preprocessFolderPath}`);
        } else if (type === 'detection') {
            scriptName = 'ZebrafishTool';
            scriptModel = 'track';
            const scriptArgsInput = document.getElementById('scriptArgs');
            argsString = scriptArgsInput ? scriptArgsInput.value.trim() : '';
            if (!argsString && folderPath1.textContent && folderPath1.textContent !== '请选择文件夹路径') {
                argsString = `--vd ${folderPath1.textContent} --sd ${folderPath1.textContent}_output`;
            }
            startBtn = document.getElementById('startDetectionBtn');
        } else if (type === 'analysis') {
            scriptName = 'ZebrafishTool';
            scriptModel = 'anlys';
            const analysisArgsInput = document.getElementById('analysisScriptArgs');
            argsString = analysisArgsInput ? analysisArgsInput.value.trim() : '';
            startBtn = document.getElementById('startAnalysisBtn');
        } else {
            return;
        }

        if (!scriptName || !startBtn) {
            alert('内部错误：脚本配置不完整');
            return;
        }

        const args = argsString.match(/(".*?"|'.*?'|[^"\s][^\s]*)/g) || [];
        if (scriptModel) {
            args.unshift(scriptModel);
        }

        // 添加调试信息，新增
        console.log('发送给Python的参数数组:', args);
        console.log('参数长度:', args.length);
        console.log('第一个参数:', args[0]);
        
        logMessage(`运行脚本: ${scriptName} ${args.join(' ')}`);
        
        // 确保至少有一个参数（模式参数），新增
        if (args.length === 0) {
            logMessage('<span class="error-message">错误: 没有指定任何参数</span>');
            startBtn.disabled = false;
            return;
        }

        logMessage(`运行脚本: ${scriptName} ${args.join(' ')}`);

        startBtn.disabled = true;
        window.electronAPI.runPython({ scriptName, args })
            .then(result => {
                if (result.success) {
                    runningScriptIds[type] = result.executionId;
                    logMessage(`脚本进程已启动, ID: ${result.executionId}`);
                    setActiveScript(type);

                    if (type === 'detection') {
                        startAnalysisBtn.disabled = false;
                        openResultsBtn.disabled = false;
                        saveAsBtn.disabled = false;
                    }

                    if (type === 'preprocess') {
                        logMessage('<span class="progress-message">预处理进行中，完成后将自动更新文件浏览区域...</span>');
                    }
                } else {
                    logMessage(`脚本启动失败: ${result.error}`);
                    startBtn.disabled = false;
                    setActiveScript(null);
                }
            })
            .catch(err => {
                logMessage(`错误: ${err.message || JSON.stringify(err)}`);
                startBtn.disabled = false;
                setActiveScript(null);
            });
    };

    window.stopPythonScript = () => {
        if (!activeScriptType) {
            logMessage('没有正在运行的脚本可供停止。');
            return;
        }

        const executionId = runningScriptIds[activeScriptType];
        if (!executionId) {
            logMessage(`没有正在运行的'${activeScriptType}'脚本可供停止。`);
            setActiveScript(null);
            return;
        }

        logMessage(`正在请求终止${scriptLabelMap[activeScriptType]}进程: ${executionId}`);
        stopScriptBtn.disabled = true;
        stopScriptBtn.textContent = `终止${scriptLabelMap[activeScriptType]}进程中...`;

        window.electronAPI.stopPythonScript(executionId)
            .then(result => {
                if (result.success) {
                    logMessage(result.message);
                } else {
                    logMessage(`终止失败: ${result.message}`);
                    setActiveScript(activeScriptType);
                }
            })
            .catch(err => {
                logMessage(`终止进程时出错: ${err.message}`);
                setActiveScript(activeScriptType);
            });
    };

    window.electronAPI.onPythonOutput((data) => {
        const { type, executionId, code } = data;
        const outputText = typeof data.data === 'string' ? data.data.trim() : '';

        let scriptType = null;
        for (const key in runningScriptIds) {
            if (runningScriptIds[key] === executionId) {
                scriptType = key;
                break;
            }
        }

        switch (type) {
            case 'stdout':
                if (outputText) {
                    logMessage(`输出: [${executionId}] ${outputText}`);
                }
                break;
            case 'stderr':
                if (outputText.includes('%') && (outputText.includes('|') || outputText.includes('it]'))) {
                    logMessage(`进度: [${executionId}] ${outputText}`);
                } else if (outputText) {
                    logMessage(`错误: [${executionId}] ${outputText}`);
                }
                break;
            case 'close': {
                const exitCode = typeof code === 'number' ? code : -1;
                if (exitCode === 0) {
                    logMessage(`进度: [${executionId}] 进程完成，状态码: ${exitCode}`);
                } else if (code === null || code === undefined) {
                    logMessage(`进度: [${executionId}] 进程已被手动终止`);
                } else {
                    logMessage(`错误: [${executionId}] 进程异常退出，状态码: ${exitCode}`);
                }

                if (scriptType) {
                    const btnSuffix = scriptType.charAt(0).toUpperCase() + scriptType.slice(1);
                    const startBtn = document.getElementById(`start${btnSuffix}Btn`);
                    if (startBtn) startBtn.disabled = false;

                    if (scriptType === 'preprocess' && preprocessFolderPath && exitCode === 0) {
                        folderPath1.textContent = preprocessFolderPath;
                        loadFilesFromFolder(preprocessFolderPath, 1);
                        logMessage(`输出: 预处理完成，文件浏览区域已更新为: ${preprocessFolderPath}`);
                    }

                    runningScriptIds[scriptType] = null;
                    if (activeScriptType === scriptType) {
                        setActiveScript(null);
                    }
                }
                break;
            }
            case 'error':
                logMessage(`错误: [${executionId}] ${outputText || '未知错误'}`);
                if (scriptType) {
                    const btnSuffix = scriptType.charAt(0).toUpperCase() + scriptType.slice(1);
                    const startBtn = document.getElementById(`start${btnSuffix}Btn`);
                    if (startBtn) startBtn.disabled = false;
                    runningScriptIds[scriptType] = null;
                    if (activeScriptType === scriptType) {
                        setActiveScript(null);
                    }
                }
                break;
        }
    });

    window.openPreprocessFolder = () => {
        if (!preprocessFolderPath) {
            logMessage('<span class="error-message">错误: 尚未执行预处理或未选择保存目录</span>');
            return;
        }

        logMessage(`打开预处理文件夹: ${preprocessFolderPath}`);
        window.electronAPI.openFolder(preprocessFolderPath)
            .then(result => {
                if (result.success) {
                    logMessage(`<span class="output-message">${result.message}</span>`);
                } else {
                    logMessage(`<span class="error-message">错误: ${result.message}</span>`);
                }
            })
            .catch(err => {
                logMessage(`<span class="error-message">打开文件夹时出错: ${err.message}</span>`);
            });
    };

    window.openResultsFolder = () => {
        const folderPath = document.getElementById('folderPath1').textContent;
        if (folderPath) {
            const outputPath = `${folderPath}_output`;
            logMessage(`尝试打开结果文件夹: ${outputPath}`);
            window.electronAPI.openFolder(outputPath)
                .then(result => {
                    if (!result.success) {
                        logMessage(`错误: ${result.error}`);
                    }
                })
                .catch(err => {
                    logMessage(`打开文件夹时出错: ${err.message}`);
                });
        } else {
            alert('请先选择一个视频文件夹');
        }
    };

    window.saveResultsAs = () => {
        const folderPath = document.getElementById('folderPath1').textContent;
        if (!folderPath) {
            alert('请先选择一个视频文件夹');
            return;
        }

        const sourcePath = `${folderPath}_output`;

        window.electronAPI.selectFolder({ playerId: 'save' })
            .then(result => {
                if (result.path) {
                    const targetPath = result.path;
                    logMessage(`正在将结果保存到: ${targetPath}`);
                    return window.electronAPI.saveResultsAs(sourcePath, targetPath);
                }
            })
            .then(result => {
                if (result && result.success) {
                    logMessage(`结果保存成功!`);
                } else if (result) {
                    logMessage(`保存失败: ${result.error}`);
                }
            })
            .catch(err => {
                logMessage(`保存过程中出错: ${err.message}`);
            });
    };

    logMessage('应用已启动，请选择视频文件或文件夹');

    function logMessage(message) {
        let className = '';

        if (message.startsWith('错误:')) {
            className = 'error-message';
        } else if (message.startsWith('进度:')) {
            className = 'progress-message';
        } else if (message.startsWith('输出:')) {
            className = 'output-message';
        }

        outputDiv.innerHTML += `<div class="${className}"> ${message}</div>`;
        outputDiv.scrollTop = outputDiv.scrollHeight;
    }

    video1.addEventListener('play', () => logMessage('播放器1开始播放'));
    video1.addEventListener('pause', () => logMessage('播放器1暂停播放'));
    video2.addEventListener('play', () => logMessage('播放器2开始播放'));
    video2.addEventListener('pause', () => logMessage('播放器2暂停播放'));

    logMessage('应用已启动，请选择视频文件或文件夹');
});