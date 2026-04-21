(function (root, factory) {
    const api = factory(
        root && root.RuntimeState,
        typeof module !== 'undefined' && module.exports ? require('../runtime-state') : null
    );

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

    if (root) {
        root.RendererRuntimeClient = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (browserRuntimeState, nodeRuntimeState) {
    const fallbackRuntimeStateApi = browserRuntimeState || nodeRuntimeState;

    function createRuntimeClient({ runtimeStateApi: providedRuntimeStateApi, electronAPI }) {
        const runtimeStateApi = providedRuntimeStateApi || fallbackRuntimeStateApi;
        let snapshot = runtimeStateApi.createRuntimeState();
        const subscribers = new Set();
        let unsubscribeRuntimeState = null;

        function getSnapshot() {
            return runtimeStateApi.cloneRuntimeState(snapshot);
        }

        function notify() {
            const nextSnapshot = getSnapshot();
            subscribers.forEach((listener) => {
                try {
                    listener(nextSnapshot);
                } catch (error) {
                    console.error('运行状态订阅回调执行失败:', error);
                }
            });
            return nextSnapshot;
        }

        async function syncToMain(nextSnapshot) {
            if (!electronAPI || typeof electronAPI.updateRuntimeState !== 'function') {
                return;
            }

            await electronAPI.updateRuntimeState(nextSnapshot);
        }

        async function setSnapshot(nextSnapshot, options = {}) {
            snapshot = runtimeStateApi.normalizeRuntimeSnapshot(nextSnapshot);
            const publishedSnapshot = notify();
            if (!options.skipMainSync) {
                await syncToMain(publishedSnapshot);
            }
            return publishedSnapshot;
        }

        async function update(patch, options = {}) {
            return setSnapshot({
                ...snapshot,
                ...patch,
                runningExecutions: patch && patch.runningExecutions ? patch.runningExecutions : snapshot.runningExecutions,
                stageCompletion: patch && patch.stageCompletion ? patch.stageCompletion : snapshot.stageCompletion
            }, options);
        }

        function subscribe(listener) {
            if (typeof listener !== 'function') {
                return () => {};
            }

            subscribers.add(listener);
            listener(getSnapshot());
            return () => subscribers.delete(listener);
        }

        async function hydrateFromMain() {
            if (!electronAPI || typeof electronAPI.getRuntimeState !== 'function') {
                notify();
                return getSnapshot();
            }

            try {
                const nextSnapshot = await electronAPI.getRuntimeState();
                return setSnapshot(nextSnapshot, { skipMainSync: true });
            } catch (error) {
                console.error('获取主进程运行状态失败:', error);
                notify();
                return getSnapshot();
            }
        }

        function attachMainListener() {
            if (!electronAPI || typeof electronAPI.onRuntimeState !== 'function') {
                return () => {};
            }

            unsubscribeRuntimeState = electronAPI.onRuntimeState((nextSnapshot) => {
                setSnapshot(nextSnapshot, { skipMainSync: true }).catch((error) => {
                    console.error('应用主进程运行状态失败:', error);
                });
            });

            return () => {
                if (typeof unsubscribeRuntimeState === 'function') {
                    unsubscribeRuntimeState();
                    unsubscribeRuntimeState = null;
                }
            };
        }

        return {
            getSnapshot,
            subscribe,
            update,
            setSnapshot,
            hydrateFromMain,
            attachMainListener
        };
    }

    return {
        createRuntimeClient
    };
}));
