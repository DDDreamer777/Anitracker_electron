document.addEventListener('DOMContentLoaded', () => {
    const stageControlApi = window.StageControls;
    const electronAPI = window.electronAPI;
    const stageWorkspace = document.getElementById('stageWorkspace');
    const folderPath1 = document.getElementById('folderPath1');
    const startPreprocessBtn = document.getElementById('startPreprocessBtn');
    const startDetectionBtn = document.getElementById('startDetectionBtn');
    const startAnalysisBtn = document.getElementById('startAnalysisBtn');
    const stopScriptBtn = document.getElementById('stopScriptBtn');
    const stageGlobalStatus = document.getElementById('stageGlobalStatus');
    const stageDetailPanel = document.getElementById('stageDetailPanel');
    const stageBackBtn = document.getElementById('stageBackBtn');
    const stageMetaList = document.getElementById('stageMetaList');
    const stageDetailDescription = document.getElementById('stageDetailDescription');
    const stageButtons = Array.from(document.querySelectorAll('[data-stage-select]'));

    if (!stageControlApi || !electronAPI || !stageWorkspace || !folderPath1) {
        return;
    }

    const stageCompletion = {
        preprocess: false,
        detection: false,
        analysis: false
    };

    const actionButtons = {
        startPreprocessBtn,
        startDetectionBtn,
        startAnalysisBtn,
        stopScriptBtn
    };

    const executionStageMap = new Map();
    let selectedStage = null;
    let activeScriptType = null;
    let preprocessFolderPath = '';

    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, (char) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[char]));
    }

    function getCurrentSourcePath() {
        const value = folderPath1.textContent ? folderPath1.textContent.trim() : '';
        return value && !value.includes('请选择') ? value : '';
    }

    function inferStageFromRunPayload(payload) {
        if (!payload || !Array.isArray(payload.args) || payload.args.length === 0) {
            return null;
        }

        if (payload.args[0] === 'preprocess') {
            return 'preprocess';
        }

        if (payload.args[0] === 'track') {
            return 'detection';
        }

        if (payload.args[0] === 'anlys') {
            return 'analysis';
        }

        return null;
    }

    function resetDownstreamCompletion(stageKey) {
        if (stageKey === 'preprocess') {
            stageCompletion.preprocess = false;
            stageCompletion.detection = false;
            stageCompletion.analysis = false;
            return;
        }

        if (stageKey === 'detection') {
            stageCompletion.detection = false;
            stageCompletion.analysis = false;
            return;
        }

        if (stageKey === 'analysis') {
            stageCompletion.analysis = false;
        }
    }

    function setSelectedStage(stageKey) {
        selectedStage = stageKey;
        renderStageWorkspace();
    }

    function isPathLikeMeta(item) {
        if (!item || typeof item.value !== 'string') {
            return false;
        }

        if (item.label !== '输入' && item.label !== '输出') {
            return false;
        }

        return item.value.includes('\\') || item.value.includes('/') || item.value.includes(':');
    }

    function renderStageWorkspace() {
        const model = stageControlApi.buildStageWorkspaceModel({
            selectedStage,
            activeScriptType,
            sourcePath: getCurrentSourcePath(),
            preprocessFolderPath,
            stageCompletion
        });

        stageWorkspace.dataset.stageMode = model.mode;

        if (stageGlobalStatus) {
            stageGlobalStatus.dataset.tone = model.globalStatus.tone;
            const labelNode = stageGlobalStatus.querySelector('.stage-global-status-label');
            const valueNode = stageGlobalStatus.querySelector('.stage-global-status-value');
            if (labelNode) labelNode.textContent = model.globalStatus.label;
            if (valueNode) valueNode.textContent = model.globalStatus.value;
        }

        stageButtons.forEach((button) => {
            const stageKey = button.dataset.stageSelect;
            const stageModel = model.stages.find((stage) => stage.key === stageKey);
            if (!stageModel) {
                return;
            }

            button.dataset.tone = stageModel.statusTone;
            button.classList.toggle('is-selected', stageModel.isSelected);
            button.classList.toggle('is-collapsed', !stageModel.isVisible);
            button.setAttribute('aria-pressed', String(stageModel.isSelected));

            const mainNode = button.querySelector('.stage-selector-main');
            const metaNode = button.querySelector('.stage-selector-meta');
            if (mainNode) mainNode.textContent = stageModel.label;
            if (metaNode) metaNode.textContent = stageModel.statusText;
        });

        const shouldShowDetail = model.mode === 'detail' && model.selectedStage;
        if (stageDetailPanel) {
            stageDetailPanel.hidden = !shouldShowDetail;
        }

        Object.values(actionButtons).forEach((button) => {
            if (button) {
                button.classList.add('is-hidden');
            }
        });

        if (!shouldShowDetail) {
            return;
        }

        const detail = model.selectedStage;
        if (stageDetailDescription) {
            stageDetailDescription.textContent = detail.description;
        }
        if (stageMetaList) {
            stageMetaList.innerHTML = detail.details.map((item) => `
                <div class="stage-meta-item${isPathLikeMeta(item) ? ' is-scrollable' : ''}">
                    <span class="stage-meta-label">${escapeHtml(item.label)}</span>
                    ${isPathLikeMeta(item) ? `
                        <div class="stage-meta-content" data-meta-scrollable>
                            <div class="stage-meta-scroll-shell">
                                <div class="stage-meta-scroll-track" data-meta-scroll-track>
                                    <span class="stage-meta-value">${escapeHtml(item.value)}</span>
                                </div>
                            </div>
                        </div>
                    ` : `
                        <span class="stage-meta-value">${escapeHtml(item.value)}</span>
                    `}
                </div>
            `).join('');
        }

        const primaryButton = actionButtons[detail.primaryAction.id];
        if (primaryButton) {
            primaryButton.classList.remove('is-hidden');
        }

        if (stopScriptBtn) {
            stopScriptBtn.classList.toggle('is-hidden', !detail.showStopAction);
        }
    }

    const originalSelectFolder = electronAPI.selectFolder.bind(electronAPI);
    electronAPI.selectFolder = async (payload) => {
        const result = await originalSelectFolder(payload);

        if (payload && payload.playerId === 'preprocess' && result && result.path) {
            preprocessFolderPath = result.path;
        }

        if (payload && (payload.playerId === 1 || payload.playerId === '1') && result && result.path) {
            stageCompletion.detection = false;
            stageCompletion.analysis = false;

            if (!preprocessFolderPath || result.path !== preprocessFolderPath) {
                stageCompletion.preprocess = false;
            }
        }

        renderStageWorkspace();
        return result;
    };

    const originalRunPython = electronAPI.runPython.bind(electronAPI);
    electronAPI.runPython = async (payload) => {
        const stageKey = inferStageFromRunPayload(payload);
        if (stageKey) {
            resetDownstreamCompletion(stageKey);
        }

        renderStageWorkspace();

        const result = await originalRunPython(payload);
        if (result && result.success && result.executionId && stageKey) {
            executionStageMap.set(result.executionId, stageKey);
            activeScriptType = stageKey;

            if (!selectedStage) {
                selectedStage = stageKey;
            }
        }

        renderStageWorkspace();
        return result;
    };

    electronAPI.onPythonOutput((data) => {
        const stageKey = executionStageMap.get(data.executionId);
        if (!stageKey) {
            return;
        }

        if (data.type === 'close') {
            if (data.code === 0) {
                stageCompletion[stageKey] = true;
            }

            activeScriptType = null;
            executionStageMap.delete(data.executionId);
        }

        if (data.type === 'error') {
            activeScriptType = null;
            executionStageMap.delete(data.executionId);
        }

        renderStageWorkspace();
    });

    if (typeof MutationObserver !== 'undefined') {
        const folderObserver = new MutationObserver(() => {
            renderStageWorkspace();
        });

        folderObserver.observe(folderPath1, {
            childList: true,
            characterData: true,
            subtree: true
        });
    }

    window.addEventListener('resize', () => {
        renderStageWorkspace();
    });

    stageButtons.forEach((button) => {
        button.addEventListener('click', () => {
            setSelectedStage(button.dataset.stageSelect || null);
        });
    });

    if (stageBackBtn) {
        stageBackBtn.addEventListener('click', () => {
            setSelectedStage(null);
        });
    }

    renderStageWorkspace();
});
