(function (root, factory) {
    const api = factory();

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

    if (root) {
        root.RendererMediaPreview = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    function buildFileUrl(filePath, options = {}) {
        const normalizedPath = String(filePath || '').replace(/\\/g, '/');
        const cacheSuffix = options.cacheBust !== undefined ? `?t=${options.cacheBust}` : '';
        return `file:///${normalizedPath}${cacheSuffix}`;
    }

    function createMediaPreview({ videos, logMessage, electronAPI, onPrimaryPreviewVisibilityChange }) {
        const videoMap = videos || {};

        function syncVideoEmptyState(videoElement) {
            if (!videoElement) {
                return;
            }

            const playerShell = videoElement.closest('.video-player');
            if (!playerShell) {
                return;
            }

            const currentSrc = videoElement.currentSrc || videoElement.src || '';
            const hasSource = Boolean(currentSrc.trim());
            const isReady = videoElement.readyState >= 2;
            playerShell.classList.toggle('is-empty', !(hasSource && isReady));
        }

        function notifyPrimaryVisibility(videoElement) {
            if (typeof onPrimaryPreviewVisibilityChange === 'function' && videoElement === videoMap[1]) {
                onPrimaryPreviewVisibilityChange(videoElement);
            }
        }

        function setPreviewSource(playerId, filePath, options = {}) {
            const videoElement = videoMap[playerId];
            if (!videoElement || !filePath) {
                return;
            }

            videoElement.dataset.originalPath = filePath;
            videoElement.src = buildFileUrl(filePath, options.cacheBust !== undefined ? { cacheBust: options.cacheBust } : {});
            syncVideoEmptyState(videoElement);
            notifyPrimaryVisibility(videoElement);
        }

        function resetPreview(playerId) {
            const videoElement = videoMap[playerId];
            if (!videoElement) {
                return;
            }

            videoElement.removeAttribute('src');
            delete videoElement.dataset.originalPath;
            videoElement.load();
            syncVideoEmptyState(videoElement);
            notifyPrimaryVisibility(videoElement);
        }

        function attachVideo(videoElement, index) {
            if (!videoElement) {
                return;
            }

            syncVideoEmptyState(videoElement);
            ['loadeddata', 'loadedmetadata', 'canplay', 'emptied', 'suspend', 'error'].forEach((eventName) => {
                videoElement.addEventListener(eventName, () => {
                    syncVideoEmptyState(videoElement);
                    notifyPrimaryVisibility(videoElement);
                });
            });

            videoElement.addEventListener('error', () => {
                const error = videoElement.error;
                let errorMessage = '未知视频错误';
                if (!error) {
                    return;
                }

                if (error.code === 4 && videoElement.dataset.originalPath && videoElement.dataset.isConverting !== 'true') {
                    if (videoElement.src.includes('_temp')) {
                        logMessage('<span class="error-message">转码后的视频无法播放，可能是严重损坏或ffmpeg转换失败。</span>');
                        return;
                    }

                    const originalPath = videoElement.dataset.originalPath;
                    videoElement.dataset.isConverting = 'true';

                    logMessage('<span class="progress-message">检测到视频编码不兼容 (MEDIA_ERR_SRC_NOT_SUPPORTED)，正在生成兼容预览版...</span>');
                    logMessage('<span class="progress-message">这可能需要一小会，取决于视频大小，请稍候...</span>');

                    electronAPI.convertToH264(originalPath).then((result) => {
                        if (result.debugInfo) {
                            logMessage(`<span class="debug-message" style="color: gray; font-size: 0.9em;"> ${result.debugInfo}</span>`);
                        }

                        if (result.success) {
                            logMessage('<span class="output-message">预览版生成成功，即将播放。</span>');
                            setPreviewSource(index, result.path, { cacheBust: Date.now() });
                        } else {
                            logMessage(`<span class="error-message">自动转码失败: ${result.error}</span>`);
                        }
                    }).catch((err) => {
                        logMessage(`<span class="error-message">调用转码服务出错: ${err.message}</span>`);
                    }).finally(() => {
                        videoElement.dataset.isConverting = 'false';
                        syncVideoEmptyState(videoElement);
                        notifyPrimaryVisibility(videoElement);
                    });

                    return;
                }

                switch (error.code) {
                    case 1: errorMessage = '视频加载被中止 (MEDIA_ERR_ABORTED)'; break;
                    case 2: errorMessage = '网络错误导致下载失败 (MEDIA_ERR_NETWORK)'; break;
                    case 3: errorMessage = '视频解码失败 (MEDIA_ERR_DECODE) - 可能是编码格式(如H.265)不支持'; break;
                    case 4: errorMessage = '视频格式不支持或来源无法访问 (MEDIA_ERR_SRC_NOT_SUPPORTED)'; break;
                }

                const fullMsg = `播放器${index} 发生错误: ${errorMessage}`;
                console.error(fullMsg, error);
                logMessage(`<span class="error-message">${fullMsg}</span>`);
            });
        }

        Object.entries(videoMap).forEach(([key, videoElement]) => {
            attachVideo(videoElement, Number(key));
        });

        return {
            syncVideoEmptyState,
            setPreviewSource,
            resetPreview
        };
    }

    return {
        buildFileUrl,
        createMediaPreview
    };
}));
