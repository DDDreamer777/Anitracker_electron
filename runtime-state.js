(function (root, factory) {
    const api = factory(
        root && root.StageDefinition,
        typeof module !== 'undefined' && module.exports ? require('./stage-definition') : null
    );

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

    if (root) {
        root.RuntimeState = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (browserStageDefinition, nodeStageDefinition) {
    const stageDefinition = browserStageDefinition || nodeStageDefinition;
    const { STAGE_KEYS } = stageDefinition;

    function createRuntimeState() {
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

    function normalizeStageCompletion(value) {
        const completion = value && typeof value === 'object' ? value : {};
        return {
            preprocess: Boolean(completion.preprocess),
            detection: Boolean(completion.detection),
            analysis: Boolean(completion.analysis)
        };
    }

    function normalizeRunningExecutions(value) {
        const runningExecutions = value && typeof value === 'object' ? value : {};
        return {
            preprocess: typeof runningExecutions.preprocess === 'string' ? runningExecutions.preprocess : null,
            detection: typeof runningExecutions.detection === 'string' ? runningExecutions.detection : null,
            analysis: typeof runningExecutions.analysis === 'string' ? runningExecutions.analysis : null
        };
    }

    function normalizeRuntimeSnapshot(snapshot) {
        const source = snapshot && typeof snapshot === 'object' ? snapshot : {};

        return {
            sourcePath: typeof source.sourcePath === 'string' ? source.sourcePath : '',
            preprocessFolderPath: typeof source.preprocessFolderPath === 'string' ? source.preprocessFolderPath : '',
            activeScriptType: source.activeScriptType === null || STAGE_KEYS.includes(source.activeScriptType)
                ? source.activeScriptType
                : null,
            runningExecutions: normalizeRunningExecutions(source.runningExecutions),
            stageCompletion: normalizeStageCompletion(source.stageCompletion)
        };
    }

    function applyRuntimePatch(state, patch) {
        if (!state || typeof state !== 'object' || !patch || typeof patch !== 'object') {
            return state;
        }

        if (typeof patch.sourcePath === 'string') {
            state.sourcePath = patch.sourcePath;
        }

        if (typeof patch.preprocessFolderPath === 'string') {
            state.preprocessFolderPath = patch.preprocessFolderPath;
        }

        if (patch.activeScriptType === null || STAGE_KEYS.includes(patch.activeScriptType)) {
            state.activeScriptType = patch.activeScriptType;
        }

        if (patch.runningExecutions && typeof patch.runningExecutions === 'object') {
            state.runningExecutions = normalizeRunningExecutions(patch.runningExecutions);
        }

        if (patch.stageCompletion && typeof patch.stageCompletion === 'object') {
            state.stageCompletion = normalizeStageCompletion(patch.stageCompletion);
        }

        return state;
    }

    function inferStageFromArgs(args) {
        if (!Array.isArray(args) || args.length === 0) {
            return null;
        }

        if (args[0] === 'preprocess') {
            return 'preprocess';
        }

        if (args[0] === 'track') {
            return 'detection';
        }

        if (args[0] === 'anlys') {
            return 'analysis';
        }

        return null;
    }

    function resetDownstreamCompletion(state, stageKey) {
        if (!state || !state.stageCompletion) {
            return;
        }

        if (stageKey === 'preprocess') {
            state.stageCompletion.preprocess = false;
            state.stageCompletion.detection = false;
            state.stageCompletion.analysis = false;
            return;
        }

        if (stageKey === 'detection') {
            state.stageCompletion.detection = false;
            state.stageCompletion.analysis = false;
            return;
        }

        if (stageKey === 'analysis') {
            state.stageCompletion.analysis = false;
        }
    }

    function cloneRuntimeState(state) {
        const source = state || createRuntimeState();

        return {
            sourcePath: typeof source.sourcePath === 'string' ? source.sourcePath : '',
            preprocessFolderPath: typeof source.preprocessFolderPath === 'string' ? source.preprocessFolderPath : '',
            activeScriptType: source.activeScriptType === null || STAGE_KEYS.includes(source.activeScriptType)
                ? source.activeScriptType
                : null,
            runningExecutions: normalizeRunningExecutions(source.runningExecutions),
            stageCompletion: normalizeStageCompletion(source.stageCompletion)
        };
    }

    return {
        STAGE_KEYS,
        createRuntimeState,
        normalizeRuntimeSnapshot,
        applyRuntimePatch,
        inferStageFromArgs,
        resetDownstreamCompletion,
        cloneRuntimeState
    };
}));
