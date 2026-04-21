(function (root, factory) {
    const api = factory(root && root.StageDefinition);

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

    if (root) {
        root.StageControls = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (sharedStageDefinition) {
    const stageDefinition = sharedStageDefinition || require('./stage-definition');
    const { STAGE_KEYS, STAGE_CONFIG } = stageDefinition;

    function getStageOutputPath(sourcePath) {
        return sourcePath ? sourcePath + '_output' : '待生成';
    }

    function getStatusPresentation(stageKey, context) {
        const activeScriptType = context.activeScriptType || null;
        const completion = context.stageCompletion || {};
        const sourceReady = Boolean(context.sourcePath);
        const preprocessReady = Boolean(context.preprocessFolderPath);

        if (activeScriptType === stageKey) {
            return { tone: 'running', text: '运行中' };
        }

        if (completion[stageKey]) {
            return { tone: 'complete', text: '已完成' };
        }

        if (stageKey === 'preprocess') {
            return sourceReady ? { tone: 'ready', text: '待执行' } : { tone: 'blocked', text: '待选择输入' };
        }

        if (stageKey === 'detection') {
            if (!sourceReady) {
                return { tone: 'blocked', text: '待选择输入' };
            }

            return preprocessReady
                ? { tone: 'ready', text: '可开始追踪' }
                : { tone: 'ready', text: '可直接执行' };
        }

        if (stageKey === 'analysis') {
            if (!sourceReady) {
                return { tone: 'blocked', text: '待选择输入' };
            }

            return completion.detection
                ? { tone: 'ready', text: '可生成分析' }
                : { tone: 'ready', text: '可提前查看参数' };
        }

        return { tone: 'idle', text: '未开始' };
    }

    function buildGlobalStatus(context) {
        if (context.activeScriptType) {
            return {
                label: '当前运行',
                value: STAGE_CONFIG[context.activeScriptType].label,
                tone: 'running'
            };
        }

        const completion = context.stageCompletion || {};
        const completedCount = STAGE_KEYS.filter((stageKey) => completion[stageKey]).length;

        if (completedCount > 0) {
            return {
                label: '最近状态',
                value: '已有阶段完成',
                tone: 'complete'
            };
        }

        return {
            label: '当前运行',
            value: '无',
            tone: 'idle'
        };
    }

    function buildStageDetails(stageKey, context, statusInfo) {
        if (stageKey === 'preprocess') {
            return [
                { label: '输入', value: context.sourcePath || '尚未选择视频目录' },
                { label: '输出', value: context.preprocessFolderPath || '运行时选择预处理目录' }
            ];
        }

        if (stageKey === 'detection') {
            return [
                { label: '输入', value: context.sourcePath || '尚未选择输入目录' },
                { label: '输出', value: getStageOutputPath(context.sourcePath) },
                { label: '依赖', value: context.preprocessFolderPath ? '已检测到预处理目录' : '可直接执行，或先完成预处理' }
            ];
        }

        return [
            { label: '输入', value: context.sourcePath || '尚未选择输入目录' },
            { label: '输出', value: getStageOutputPath(context.sourcePath) },
            { label: '依赖', value: context.stageCompletion && context.stageCompletion.detection ? '检测结果已生成' : '建议先完成检测追踪' }
        ];
    }

    function buildStageWorkspaceModel(context) {
        const selectedStageKey = context.selectedStage || null;
        const globalStatus = buildGlobalStatus(context);
        const stages = STAGE_KEYS.map((stageKey) => {
            const statusInfo = getStatusPresentation(stageKey, context);
            const config = STAGE_CONFIG[stageKey];

            return {
                key: stageKey,
                label: config.label,
                statusTone: statusInfo.tone,
                statusText: statusInfo.text,
                isSelected: stageKey === selectedStageKey,
                isVisible: !selectedStageKey || stageKey === selectedStageKey
            };
        });

        const model = {
            mode: selectedStageKey ? 'detail' : 'overview',
            stageOrder: STAGE_KEYS.slice(),
            globalStatus,
            stages,
            selectedStage: null
        };

        if (!selectedStageKey) {
            return model;
        }

        const selectedConfig = STAGE_CONFIG[selectedStageKey];
        const selectedStatus = getStatusPresentation(selectedStageKey, context);
        const isAnotherStageRunning = Boolean(context.activeScriptType && context.activeScriptType !== selectedStageKey);

        model.selectedStage = {
            key: selectedStageKey,
            label: selectedConfig.label,
            title: selectedConfig.title,
            description: selectedConfig.description,
            statusTone: selectedStatus.tone,
            statusText: selectedStatus.text,
            details: buildStageDetails(selectedStageKey, context, selectedStatus),
            primaryAction: {
                id: selectedConfig.actionId,
                label: selectedConfig.actionLabel,
                disabled: isAnotherStageRunning
            },
            showStopAction: context.activeScriptType === selectedStageKey,
            showBackAction: true,
            contextNote: isAnotherStageRunning
                ? '当前已有其他阶段在运行，请等待完成或终止后再切换执行。'
                : '点击返回可回到阶段选择器，已完成状态会被保留。'
        };

        return model;
    }

    return {
        STAGE_KEYS,
        STAGE_CONFIG,
        buildStageWorkspaceModel
    };
}));
