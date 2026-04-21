(function (root, factory) {
    const api = factory();

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

    if (root) {
        root.StageDefinition = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const STAGE_KEYS = ['preprocess', 'detection', 'analysis'];

    const STAGE_CONFIG = {
        preprocess: {
            key: 'preprocess',
            label: '预处理',
            title: '预处理',
            description: '预处理视频，为后续检测追踪准备输入',
            actionId: 'startPreprocessBtn',
            actionLabel: '开始预处理'
        },
        detection: {
            key: 'detection',
            label: '检测追踪',
            title: '检测追踪',
            description: '运行目标检测与追踪，生成后续分析所需结果',
            actionId: 'startDetectionBtn',
            actionLabel: '启动检测'
        },
        analysis: {
            key: 'analysis',
            label: '智能分析',
            title: '智能分析',
            description: '统计分析检测结果，生成可视化图表',
            actionId: 'startAnalysisBtn',
            actionLabel: '启动分析'
        }
    };

    return {
        STAGE_KEYS,
        STAGE_CONFIG
    };
}));
