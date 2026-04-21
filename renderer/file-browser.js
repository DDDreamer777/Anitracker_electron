(function (root, factory) {
    const api = factory();

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

    if (root) {
        root.RendererFileBrowser = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    function getFolderPathFromFilePath(filePath) {
        return String(filePath || '').replace(/[/\\][^/\\]+$/, '');
    }

    function createFileBrowser({
        electronAPI,
        fileListVisibilityApi,
        folderPathElements,
        folderPathShell1,
        fileListElements,
        fileListRegion1,
        placeholderText,
        mediaPreview,
        logMessage,
        onPrimarySourceChanged,
        onPrimaryFileSelected
    }) {
        let shouldShowPrimaryFileList = false;

        function syncFolderPathVisualState(pathElement, shellElement) {
            if (!pathElement || !shellElement) {
                return false;
            }

            const value = pathElement.textContent ? pathElement.textContent.trim() : '';
            const isEmpty = !value || value === placeholderText;
            shellElement.classList.toggle('is-empty', isEmpty);
            shellElement.classList.toggle('is-active', !isEmpty);
            pathElement.title = isEmpty ? placeholderText : value;
            return !isEmpty;
        }

        function syncFileListRegionVisibility(regionElement, isVisible) {
            if (!regionElement) {
                return;
            }

            regionElement.classList.toggle('is-collapsed', !isVisible);
            regionElement.setAttribute('aria-hidden', String(!isVisible));
        }

        function syncPrimaryFileListStateFromSourcePath(sourcePath) {
            shouldShowPrimaryFileList = fileListVisibilityApi
                ? fileListVisibilityApi.computePrimaryFileListStateFromSourcePath({ sourcePath })
                : Boolean(sourcePath && sourcePath.trim());
        }

        function syncPrimaryFileListRegionVisibility(forceVisible = null) {
            if (forceVisible !== null) {
                shouldShowPrimaryFileList = forceVisible;
            }

            const isVisible = fileListVisibilityApi
                ? fileListVisibilityApi.computePrimaryFileListVisibility({ shouldShowPrimaryFileList })
                : Boolean(shouldShowPrimaryFileList);
            syncFileListRegionVisibility(fileListRegion1, isVisible);
        }

        function syncFileListVisualRows(fileListElement, itemCount) {
            if (!fileListElement) {
                return;
            }

            const safeCount = Number.isFinite(itemCount) ? itemCount : 0;
            const visibleRows = Math.max(1, Math.min(2, safeCount));
            fileListElement.style.setProperty('--file-list-visible-rows', String(visibleRows));
        }

        async function loadFilesFromFolder(folderPath, playerId) {
            const fileListElement = fileListElements[playerId];
            if (!fileListElement) {
                return;
            }

            try {
                const files = await electronAPI.getFilesInFolder(folderPath);
                fileListElement.innerHTML = '';

                if (files.length === 0) {
                    fileListElement.innerHTML = '<div class="file-empty-state">没有找到视频文件</div>';
                    syncFileListVisualRows(fileListElement, 0);
                    if (Number(playerId) === 1) {
                        syncPrimaryFileListRegionVisibility();
                    }
                    return;
                }

                files.forEach((file) => {
                    const fileItem = document.createElement('div');
                    fileItem.className = 'file-item';
                    fileItem.textContent = file.name;
                    fileItem.addEventListener('click', () => {
                        mediaPreview.setPreviewSource(playerId, file.path);
                        if (Number(playerId) === 1) {
                            syncPrimaryFileListRegionVisibility(true);
                            if (typeof onPrimaryFileSelected === 'function') {
                                onPrimaryFileSelected(file.path);
                            }
                        }
                        logMessage(`播放器${playerId}加载视频: ${file.name}`);
                    });
                    fileListElement.appendChild(fileItem);
                });

                syncFileListVisualRows(fileListElement, files.length);
                if (Number(playerId) === 1) {
                    syncPrimaryFileListRegionVisibility();
                }
            } catch (err) {
                logMessage(`加载文件列表出错: ${err.message}`);
                syncFileListVisualRows(fileListElement, 0);
                if (Number(playerId) === 1) {
                    syncPrimaryFileListRegionVisibility();
                }
            }
        }

        async function selectVideo(playerId) {
            try {
                const result = await electronAPI.selectVideo({ playerId });
                if (!result.path) {
                    return;
                }

                mediaPreview.setPreviewSource(result.playerId, result.path);
                if (Number(result.playerId) === 1) {
                    const folderPath = getFolderPathFromFilePath(result.path);
                    const folderPathElement = folderPathElements[1];
                    folderPathElement.textContent = folderPath;
                    syncFolderPathVisualState(folderPathElement, folderPathShell1);
                    syncPrimaryFileListStateFromSourcePath(folderPath);
                    await loadFilesFromFolder(folderPath, 1);
                    if (typeof onPrimarySourceChanged === 'function') {
                        await onPrimarySourceChanged(folderPath, { resetPreview: false, publishRuntimeState: false });
                    }
                }
                logMessage(`播放器${result.playerId}加载视频: ${result.path}`);
            } catch (err) {
                logMessage(`错误: ${err.message}`);
            }
        }

        async function selectFolder(playerId) {
            try {
                const result = await electronAPI.selectFolder({ playerId });
                if (!result.path) {
                    return;
                }

                const folderPathElement = folderPathElements[result.playerId];
                if (folderPathElement) {
                    folderPathElement.textContent = result.path;
                }

                if (result.playerId === 1 || result.playerId === '1') {
                    syncFolderPathVisualState(folderPathElement, folderPathShell1);
                    syncPrimaryFileListStateFromSourcePath(result.path);
                    mediaPreview.resetPreview(1);
                    const primaryFileList = fileListElements[1];
                    if (primaryFileList) {
                        primaryFileList.innerHTML = '';
                        syncFileListVisualRows(primaryFileList, 0);
                    }
                    syncPrimaryFileListRegionVisibility();
                    if (typeof onPrimarySourceChanged === 'function') {
                        await onPrimarySourceChanged(result.path);
                    }
                }

                logMessage(`播放器${result.playerId}设置文件夹: ${result.path}`);
                await loadFilesFromFolder(result.path, playerId);
            } catch (err) {
                logMessage(`错误: ${err.message}`);
            }
        }

        function initialize() {
            const folderPathElement = folderPathElements[1];
            if (folderPathElement) {
                folderPathElement.textContent = placeholderText;
                syncFolderPathVisualState(folderPathElement, folderPathShell1);
            }
            syncPrimaryFileListRegionVisibility();
            syncFileListVisualRows(fileListElements[1], 0);
        }

        return {
            initialize,
            selectVideo,
            selectFolder,
            loadFilesFromFolder,
            syncPrimaryFileListRegionVisibility,
            syncPrimaryFileListStateFromSourcePath,
            syncFileListVisualRows,
            syncFolderPathVisualState
        };
    }

    return {
        getFolderPathFromFilePath,
        createFileBrowser
    };
}));
