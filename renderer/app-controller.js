(function (root, factory) {
    const api = factory();

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

    if (root) {
        root.RendererAppController = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    function getFolderText(folderPathElement, placeholderText) {
        if (!folderPathElement) {
            return '';
        }

        const value = folderPathElement.textContent ? folderPathElement.textContent.trim() : '';
        if (!value || value === placeholderText) {
            return '';
        }

        return value;
    }

    function createAppController({
        electronAPI,
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
        placeholderText
    } = {}) {
        const primaryFolderPathElement = folderPathElements ? folderPathElements[1] : null;
        const startAnalysisBtn = actionButtons ? actionButtons.startAnalysisBtn : null;
        const openResultsBtn = actionButtons ? actionButtons.openResultsBtn : null;
        const saveAsBtn = actionButtons ? actionButtons.saveAsBtn : null;
        const stopScriptBtn = actionButtons ? actionButtons.stopScriptBtn : null;
        const toolDrawerToggleBtn = toolDrawerElements ? toolDrawerElements.toolDrawerToggleBtn : null;
        const toolDrawerPanel = toolDrawerElements ? toolDrawerElements.toolDrawerPanel : null;
        const toolboxHint = toolDrawerElements ? toolDrawerElements.toolboxHint : null;
        const documentRef = toolDrawerElements ? toolDrawerElements.documentRef : null;
        const windowRef = toolDrawerElements ? toolDrawerElements.windowRef : null;
        const teardownCallbacks = [];
        let detachMainListener = null;

        function getCurrentSourcePath() {
            const folderText = getFolderText(primaryFolderPathElement, placeholderText);
            if (folderText) {
                return folderText;
            }

            if (runtimeClient && typeof runtimeClient.getSnapshot === 'function') {
                return runtimeClient.getSnapshot().sourcePath || '';
            }

            return '';
        }

        function getResultsFolderPath() {
            const sourcePath = getCurrentSourcePath();
            return sourcePath ? `${sourcePath}_output` : '';
        }

        function setActionButtonsEnabled(isEnabled) {
            if (startAnalysisBtn) {
                startAnalysisBtn.disabled = !isEnabled;
            }
            if (openResultsBtn) {
                openResultsBtn.disabled = !isEnabled;
            }
            if (saveAsBtn) {
                saveAsBtn.disabled = !isEnabled;
            }
        }

        async function handlePrimarySourceChanged(sourcePath, options = {}) {
            const safeSourcePath = String(sourcePath || '').trim();
            const argsString = safeSourcePath
                ? `--vd ${safeSourcePath} --sd ${safeSourcePath}_output`
                : '';

            if (primaryFolderPathElement) {
                primaryFolderPathElement.textContent = safeSourcePath || placeholderText;
            }

            if (scriptArgsInput) {
                scriptArgsInput.value = argsString;
            }
            if (analysisScriptArgsInput) {
                analysisScriptArgsInput.value = argsString;
            }

            setActionButtonsEnabled(Boolean(safeSourcePath));

            if (!options.silent && safeSourcePath && typeof logMessage === 'function') {
                logMessage(`参数已自动设置为: ${argsString}`);
            }

            if (runtimeClient && typeof runtimeClient.update === 'function') {
                await runtimeClient.update({ sourcePath: safeSourcePath });
            }
        }

        async function openPreprocessFolder() {
            if (!runtimeClient || typeof runtimeClient.getSnapshot !== 'function') {
                return;
            }

            const snapshot = runtimeClient.getSnapshot();
            const preprocessFolderPath = snapshot.preprocessFolderPath || '';
            if (!preprocessFolderPath) {
                if (typeof logMessage === 'function') {
                    logMessage('<span class="error-message">错误: 尚未执行预处理或未选择保存目录</span>');
                }
                return;
            }

            if (typeof logMessage === 'function') {
                logMessage(`打开预处理文件夹: ${preprocessFolderPath}`);
            }
            const result = await electronAPI.openFolder(preprocessFolderPath);
            if (typeof logMessage === 'function') {
                if (result && result.success) {
                    logMessage(`<span class="output-message">${result.message || '已打开文件夹'}</span>`);
                } else {
                    logMessage(`<span class="error-message">错误: ${(result && (result.message || result.error)) || '打开失败'}</span>`);
                }
            }
        }

        async function openResultsFolder() {
            const resultsFolderPath = getResultsFolderPath();
            if (!resultsFolderPath) {
                if (typeof logMessage === 'function') {
                    logMessage('<span class="error-message">错误: 请先选择一个视频文件夹</span>');
                }
                return null;
            }

            if (typeof logMessage === 'function') {
                logMessage(`尝试打开结果文件夹: ${resultsFolderPath}`);
            }
            const result = await electronAPI.openFolder(resultsFolderPath);
            if (result && !result.success && typeof logMessage === 'function') {
                logMessage(`错误: ${result.error || result.message}`);
            }
            return result;
        }

        async function saveResultsAs() {
            const sourcePath = getResultsFolderPath();
            if (!sourcePath) {
                if (typeof logMessage === 'function') {
                    logMessage('<span class="error-message">错误: 请先选择一个视频文件夹</span>');
                }
                return null;
            }

            const folderResult = await electronAPI.selectFolder({ playerId: 'save' });
            if (!folderResult || !folderResult.path) {
                return null;
            }

            if (typeof logMessage === 'function') {
                logMessage(`正在将结果保存到: ${folderResult.path}`);
            }

            const result = await electronAPI.saveResultsAs(sourcePath, folderResult.path);
            if (typeof logMessage === 'function') {
                if (result && result.success) {
                    logMessage('结果保存成功!');
                } else if (result) {
                    logMessage(`保存失败: ${result.error}`);
                }
            }
            return result;
        }

        function setToolDrawerOpen(isOpen) {
            if (!toolboxHint || !toolDrawerToggleBtn || !toolDrawerPanel) {
                return;
            }

            toolboxHint.classList.toggle('is-open', isOpen);
            toolDrawerToggleBtn.setAttribute('aria-expanded', String(isOpen));
            toolDrawerPanel.setAttribute('aria-hidden', String(!isOpen));
        }

        function syncToolDrawerButtonWidth() {
            if (!toolDrawerPanel) {
                return;
            }

            const drawerButtons = Array.from(toolDrawerPanel.querySelectorAll('.tool-drawer-btn'));
            if (drawerButtons.length === 0) {
                return;
            }

            const maxCharCount = drawerButtons.reduce((maxLen, button) => {
                const text = button.textContent ? button.textContent.trim() : '';
                return Math.max(maxLen, text.length);
            }, 0);

            const targetWidth = Math.max(68, Math.min(124, (maxCharCount * 13) + 12));
            toolDrawerPanel.style.setProperty('--tool-drawer-btn-width', `${targetWidth}px`);
        }

        function initializeToolDrawer() {
            if (!toolboxHint || !toolDrawerToggleBtn || !toolDrawerPanel || !documentRef || !windowRef) {
                return;
            }

            syncToolDrawerButtonWidth();

            const handleToggleClick = (event) => {
                event.stopPropagation();
                const isOpen = toolboxHint.classList.contains('is-open');
                setToolDrawerOpen(!isOpen);
            };
            const handlePanelClick = (event) => {
                event.stopPropagation();
            };
            const handleDocumentClick = (event) => {
                if (toolboxHint.classList.contains('is-open') && !toolboxHint.contains(event.target)) {
                    setToolDrawerOpen(false);
                }
            };
            const handleDocumentKeydown = (event) => {
                if (event.key === 'Escape' && toolboxHint.classList.contains('is-open')) {
                    setToolDrawerOpen(false);
                }
            };
            const handleWindowResize = () => {
                syncToolDrawerButtonWidth();
            };

            toolDrawerToggleBtn.addEventListener('click', handleToggleClick);
            toolDrawerPanel.addEventListener('click', handlePanelClick);
            documentRef.addEventListener('click', handleDocumentClick);
            documentRef.addEventListener('keydown', handleDocumentKeydown);
            windowRef.addEventListener('resize', handleWindowResize);

            teardownCallbacks.push(() => toolDrawerToggleBtn.removeEventListener('click', handleToggleClick));
            teardownCallbacks.push(() => toolDrawerPanel.removeEventListener('click', handlePanelClick));
            teardownCallbacks.push(() => documentRef.removeEventListener('click', handleDocumentClick));
            teardownCallbacks.push(() => documentRef.removeEventListener('keydown', handleDocumentKeydown));
            teardownCallbacks.push(() => windowRef.removeEventListener('resize', handleWindowResize));
        }

        function initialize() {
            setActionButtonsEnabled(false);
            if (stopScriptBtn) {
                stopScriptBtn.disabled = true;
                stopScriptBtn.textContent = '终止运行中的进程';
            }
            if (fileBrowser && typeof fileBrowser.initialize === 'function') {
                fileBrowser.initialize();
            }
            initializeToolDrawer();
            if (runtimeClient && typeof runtimeClient.attachMainListener === 'function') {
                detachMainListener = runtimeClient.attachMainListener();
            }
            return detachMainListener;
        }

        function destroy() {
            while (teardownCallbacks.length > 0) {
                const teardown = teardownCallbacks.pop();
                teardown();
            }
            if (typeof detachMainListener === 'function') {
                detachMainListener();
                detachMainListener = null;
            }
        }

        return {
            initialize,
            destroy,
            getCurrentSourcePath,
            handlePrimarySourceChanged,
            openPreprocessFolder,
            openResultsFolder,
            saveResultsAs,
            setToolDrawerOpen,
            syncToolDrawerButtonWidth
        };
    }

    return {
        createAppController
    };
}));
