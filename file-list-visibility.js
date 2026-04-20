(function (globalScope, factory) {
    const api = factory();

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

    if (globalScope) {
        globalScope.FileListVisibility = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    function computePrimaryFileListVisibility(options = {}) {
        return Boolean(options.shouldShowPrimaryFileList);
    }

    function computePrimaryFileListStateFromSourcePath(options = {}) {
        const sourcePath = typeof options.sourcePath === 'string' ? options.sourcePath.trim() : '';
        return Boolean(sourcePath);
    }

    return {
        computePrimaryFileListVisibility,
        computePrimaryFileListStateFromSourcePath
    };
}));
