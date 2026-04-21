document.addEventListener('DOMContentLoaded', () => {
    const stageControlApi = window.StageControls;
    const runtimeBridge = window.stageRuntimeBridge;
    const runtimeStateApi = window.RuntimeState;
    const stageWorkspace = document.getElementById('stageWorkspace');
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

    if (!stageControlApi || !stageWorkspace) {
        return;
    }

    let runtimeSnapshot = {
        sourcePath: '',
        preprocessFolderPath: '',
        activeScriptType: null,
        stageCompletion: {
            preprocess: false,
            detection: false,
            analysis: false
        }
    };

    const actionButtons = {
        startPreprocessBtn,
        startDetectionBtn,
        startAnalysisBtn,
        stopScriptBtn
    };

    let selectedStage = null;
    let unsubscribeRuntime = null;

    function normalizeRuntimeSnapshot(snapshot) {
        if (runtimeStateApi && typeof runtimeStateApi.normalizeRuntimeSnapshot === 'function') {
            return runtimeStateApi.normalizeRuntimeSnapshot(snapshot);
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

    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, (char) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[char]));
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
            activeScriptType: runtimeSnapshot.activeScriptType,
            sourcePath: runtimeSnapshot.sourcePath,
            preprocessFolderPath: runtimeSnapshot.preprocessFolderPath,
            stageCompletion: runtimeSnapshot.stageCompletion
        });

        stageWorkspace.dataset.stageMode = model.mode;
        stageWorkspace.dataset.runningStage = runtimeSnapshot.activeScriptType || '';

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
            primaryButton.disabled = Boolean(detail.primaryAction.disabled);
        }

        if (stopScriptBtn) {
            stopScriptBtn.classList.toggle('is-hidden', !detail.showStopAction);
        }
    }

    function applyRuntimeSnapshot(snapshot) {
        runtimeSnapshot = normalizeRuntimeSnapshot(snapshot);
        if (!selectedStage && runtimeSnapshot.activeScriptType) {
            selectedStage = runtimeSnapshot.activeScriptType;
        }
        renderStageWorkspace();
    }

    if (runtimeBridge && typeof runtimeBridge.subscribe === 'function') {
        unsubscribeRuntime = runtimeBridge.subscribe((snapshot) => {
            applyRuntimeSnapshot(snapshot);
        });
    }

    if (runtimeBridge && typeof runtimeBridge.getSnapshot === 'function') {
        applyRuntimeSnapshot(runtimeBridge.getSnapshot());
    }

    window.addEventListener('resize', () => {
        renderStageWorkspace();
    });

    window.addEventListener('beforeunload', () => {
        if (typeof unsubscribeRuntime === 'function') {
            unsubscribeRuntime();
        }
    }, { once: true });

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
