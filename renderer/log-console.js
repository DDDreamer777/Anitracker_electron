(function (root, factory) {
    const api = factory();

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

    if (root) {
        root.RendererLogConsole = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    function classifyLogMessage(message) {
        if (typeof message !== 'string') {
            return '';
        }

        if (message.startsWith('错误:')) {
            return 'error-message';
        }

        if (message.startsWith('进度:')) {
            return 'progress-message';
        }

        if (message.startsWith('输出:')) {
            return 'output-message';
        }

        return '';
    }

    function createLogConsole({ outputElement }) {
        function logMessage(message) {
            if (!outputElement) {
                return;
            }

            const className = classifyLogMessage(message);
            outputElement.innerHTML += `<div class="${className}"> ${message}</div>`;
            outputElement.scrollTop = outputElement.scrollHeight;
        }

        return {
            logMessage
        };
    }

    return {
        classifyLogMessage,
        createLogConsole
    };
}));
