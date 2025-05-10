<script lang="ts">
    import { onMount } from 'svelte';

    interface VideoData {
        [url: string]: {
            title: string;
            timestamps: number[];
            thumbnail?: string;
        };
    }

    let videoData: VideoData = {};
    let currentTabUrl: string = '';
    let loading: boolean = true;
    let noData: boolean = false;
    let activeVideoUrl: string | null = null;
    let currentTime: number = 0;
    let isPlaying: boolean = false;
    let activeTabId: number | null = null;
    let showDeleteDialog: boolean = false;
    let deleteTargetUrl: string | null = null;

    onMount(async () => {
        console.log("Popup mounted");
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            currentTabUrl = tabs[0].url as string;
            activeTabId = tabs[0].id || null;

            loadVideoData();
            
            // 現在再生中の情報を取得
            if (isYouTubeUrl(currentTabUrl)) {
                console.log("YouTube URL detected, initializing player state");
                setTimeout(() => {
                    updateCurrentPlayerState();
                    // 0.5秒ごとに更新
                    setInterval(updateCurrentPlayerState, 500);
                }, 500);
            }
            
            // データを定期的に更新（3秒ごと）
            setInterval(loadVideoData, 3000);
        });

        chrome.runtime.onMessage.addListener((message: { action: string; videoData?: VideoData }, sender, sendResponse) => {
            if (message.action === "update_popup" && message.videoData) {
                console.log("Received message in popup:", message);
                // 新しいオブジェクトとして代入してリアクティブな更新を確実にする
                videoData = {...message.videoData};
                noData = Object.keys(message.videoData).length === 0;
                loading = false;
                
                // サムネイル情報を更新
                updateThumbnails();

                // アクティブなビデオが存在しない場合、最初のビデオをアクティブに設定
                if (!activeVideoUrl || !videoData[activeVideoUrl]) {
                    const entries = getSortedEntries();
                    if (entries.length > 0) {
                        activeVideoUrl = entries[0][0];
                    }
                }
            }
        });
    });

    function handleClick(e: MouseEvent) {
        e.preventDefault();
        const target = e.target as HTMLElement;
        const link = target.closest('a') as HTMLAnchorElement;
        if (!link) return;
        
        console.log("Clicked timestamp link:", link.className);
        let videoUrl = link.href;
        console.log("Generated URL:", videoUrl);
        
        // 現在のタブで既に開いている場合はメッセージを送信するだけ
        if (isCurrentVideo(link.href.split('&t=')[0])) {
            const timeMatch = link.href.match(/[&?]t=(\d+)s/);
            const time = timeMatch ? timeMatch[1] : null;
            
            if (time && activeTabId) {
                console.log("Moving to timestamp in current tab:", time);
                chrome.tabs.sendMessage(activeTabId, {
                    action: 'moveToTimestamp',
                    time: time
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error("Error sending message to current tab:", chrome.runtime.lastError);
                        // エラーの場合はバックグラウンドスクリプト経由で試す
                        chrome.runtime.sendMessage({
                            action: "moveToTimestamp", 
                            url: videoUrl
                        }, (response) => {
                            console.log("Fallback message sent to background script:", response);
                        });
                    } else {
                        console.log("Successfully moved to timestamp in current tab:", response);
                    }
                });
            } else {
                // 時間が取得できない場合はバックグラウンドスクリプト経由で処理
                chrome.runtime.sendMessage({
                    action: "moveToTimestamp", 
                    url: videoUrl
                }, (response) => {
                    console.log("Message sent to background script:", response);
                });
            }
        } else {
            // 異なる動画の場合はバックグラウンドスクリプト経由で処理
            chrome.runtime.sendMessage({
                action: "moveToTimestamp", 
                url: videoUrl
            }, (response) => {
                console.log("Message sent to background script:", response);
            });
        }
    }

    function formatTime(seconds: number): string {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    function isCurrentVideo(url: string): boolean {
        if (!currentTabUrl || !url) return false;
        
        // YouTube動画IDで比較
        const currentVideoId = getVideoId(currentTabUrl);
        const urlVideoId = getVideoId(url);
        
        console.log("Comparing video IDs:", {
            current: currentVideoId,
            target: urlVideoId,
            currentUrl: currentTabUrl,
            targetUrl: url
        });
        
        return currentVideoId !== null && urlVideoId !== null && currentVideoId === urlVideoId;
    }
    
    // 現在視聴中のビデオを先頭に表示するためのソート関数
    function getSortedEntries() {
        // 最新のvideoDataを使用
        const entries = Object.entries(videoData);
        return entries.sort((a, b) => {
            if (isCurrentVideo(a[0]) && !isCurrentVideo(b[0])) return -1;
            if (!isCurrentVideo(a[0]) && isCurrentVideo(b[0])) return 1;
            return 0;
        });
    }
    
    // 現在のタイムスタンプを保存する関数
    function saveCurrentTimestamp() {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            const activeTabId = tabs[0].id;
            const tabUrl = tabs[0].url || '';
            const tabTitle = tabs[0].title || 'YouTube動画';
            
            // YouTube URLかどうか確認
            if (!isYouTubeUrl(tabUrl)) {
                console.error("Not a YouTube URL:", tabUrl);
                return;
            }
            
            // 動画IDを取得
            const videoId = getVideoId(tabUrl);
            if (!videoId) {
                console.error("Could not extract video ID from URL:", tabUrl);
                return;
            }
            
            console.log("Saving timestamp for video:", {
                tabId: activeTabId,
                url: tabUrl,
                title: tabTitle,
                videoId: videoId
            });
            
            if (activeTabId) {
                chrome.tabs.sendMessage(activeTabId, {
                    action: 'getCurrentTime'
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error("Error getting current time:", chrome.runtime.lastError);
                        return;
                    }
                    
                    if (response && response.currentTime !== null) {
                        // 標準化されたURLを作成 (parameters are removed except video ID)
                        const cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;
                        
                        chrome.runtime.sendMessage({
                            action: 'save_timestamp',
                            url: cleanUrl, // 標準化されたURLを使用
                            title: tabTitle,
                            time: response.currentTime
                        }, (response) => {
                            // 保存後にストレージから最新データを取得して表示を更新
                            if (response && response.status === 'success') {
                                console.log("Timestamp saved successfully");
                                chrome.storage.local.get('videoData', (result: { videoData?: VideoData }) => {
                                    if (result.videoData) {
                                        videoData = {...result.videoData};
                                        
                                        // 現在視聴中の動画の最新状態をログ表示
                                        const savedVideo = result.videoData[cleanUrl];
                                        if (savedVideo) {
                                            console.log("Updated video data:", {
                                                url: cleanUrl,
                                                title: savedVideo.title,
                                                timestamps: savedVideo.timestamps
                                            });
                                        } else {
                                            console.error("Video data not found after saving:", cleanUrl);
                                        }
                                        
                                        // サムネイル情報の更新
                                        updateThumbnails();
                                    }
                                });
                            } else {
                                console.error("Failed to save timestamp:", response);
                            }
                        });
                    } else {
                        console.error("No valid current time returned:", response);
                    }
                });
            }
        });
    }
    
    async function setActiveVideo(url: string) {
        activeVideoUrl = url;
        
        // 選択した動画が既に開いているタブを探す
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
            if (tab.url && isMatchingUrl(tab.url, url)) {
                console.log("Found matching tab:", tab.id, tab.url);
                // 既存のタブがあればアクティブにする
                chrome.tabs.update(tab.id!, { active: true });
                chrome.windows.update(tab.windowId, { focused: true });
                return;
            }
        }
        
        // 開いているタブがなければ新しいタブで開く
        if (!isCurrentVideo(url)) {
            chrome.tabs.create({ url });
        }
    }
    
    // URLが同じYouTube動画を指しているか判定
    function isMatchingUrl(url1: string, url2: string): boolean {
        const id1 = getVideoId(url1);
        const id2 = getVideoId(url2);
        return id1 !== null && id2 !== null && id1 === id2;
    }
    
    // YouTubeのURLかどうかを判定
    function isYouTubeUrl(url: string): boolean {
        return url.includes('youtube.com/watch') || url.includes('youtu.be/');
    }
    
    // YouTubeのビデオIDを取得（より堅牢なバージョン）
    function getVideoId(url: string): string | null {
        if (!url) return null;
        
        try {
            // パターン1: 通常のYouTube URL (例: https://www.youtube.com/watch?v=VIDEO_ID)
            const normalMatch = url.match(/[?&]v=([^&]+)/);
            if (normalMatch) return normalMatch[1];
            
            // パターン2: 短縮URL (例: https://youtu.be/VIDEO_ID)
            const shortMatch = url.match(/youtu\.be\/([^?&]+)/);
            if (shortMatch) return shortMatch[1];
            
            // パターン3: 埋め込み (例: https://www.youtube.com/embed/VIDEO_ID)
            const embedMatch = url.match(/\/embed\/([^/?&]+)/);
            if (embedMatch) return embedMatch[1];
            
            console.log("Could not extract video ID from URL:", url);
            return null;
        } catch (error) {
            console.error("Error extracting video ID:", error);
            return null;
        }
    }
    
    // 現在のプレイヤー状態を更新
    function updateCurrentPlayerState() {
        if (!isCurrentVideo(activeVideoUrl || '')) return;
        
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            const tabId = tabs[0].id;
            if (!tabId) return;
            
            chrome.tabs.sendMessage(tabId, {
                action: 'getPlayerState'
            }, (response) => {
                console.log("Got player state:", response);
                if (chrome.runtime.lastError) {
                    console.error("Error getting player state:", chrome.runtime.lastError);
                    return;
                }
                
                if (response) {
                    currentTime = response.currentTime || 0;
                    isPlaying = response.isPlaying || false;
                }
            });
        });
    }
    
    // プレイヤーコントロール関数
    function playPause() {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            const tabId = tabs[0].id;
            if (!tabId) return;
            
            console.log("Sending playPause command to tab:", tabId);
            chrome.tabs.sendMessage(tabId, {
                action: 'playPause'
            }, (response) => {
                console.log("playPause response:", response);
                if (chrome.runtime.lastError) {
                    console.error("Error in playPause:", chrome.runtime.lastError);
                    return;
                }
                
                if (response && response.success) {
                    isPlaying = response.isPlaying;
                }
            });
        });
    }
    
    function seekBackward() {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            const tabId = tabs[0].id;
            if (!tabId) return;
            
            console.log("Seeking backward on tab:", tabId);
            chrome.tabs.sendMessage(tabId, {
                action: 'seek',
                seconds: -10
            }, (response) => {
                console.log("seek response:", response);
                if (chrome.runtime.lastError) {
                    console.error("Error in seekBackward:", chrome.runtime.lastError);
                    return;
                }
                
                if (response && response.success) {
                    currentTime = response.currentTime;
                }
            });
        });
    }
    
    function seekForward() {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            const tabId = tabs[0].id;
            if (!tabId) return;
            
            console.log("Seeking forward on tab:", tabId);
            chrome.tabs.sendMessage(tabId, {
                action: 'seek',
                seconds: 10
            }, (response) => {
                console.log("seek response:", response);
                if (chrome.runtime.lastError) {
                    console.error("Error in seekForward:", chrome.runtime.lastError);
                    return;
                }
                
                if (response && response.success) {
                    currentTime = response.currentTime;
                }
            });
        });
    }

    // 削除確認ダイアログを表示
    function showDeleteConfirmation(url: string) {
        deleteTargetUrl = url;
        showDeleteDialog = true;
    }
    
    // 削除を実行
    function confirmDelete() {
        if (deleteTargetUrl) {
            // videoDataから削除
            chrome.storage.local.get('videoData', (result: { videoData?: VideoData }) => {
                const data = result.videoData || {};
                if (data[deleteTargetUrl!]) {
                    delete data[deleteTargetUrl!];
                    chrome.storage.local.set({ videoData: data }, () => {
                        console.log("Video deleted from storage");
                        // UIを更新するために変数を再代入
                        videoData = {...data};
                        // 次の動画を選択
                        const entries = Object.entries(videoData);
                        if (entries.length > 0) {
                            activeVideoUrl = entries[0][0];
                        } else {
                            activeVideoUrl = null;
                            noData = true;
                        }
                    });
                }
            });
        }
        // ダイアログを閉じる
        closeDeleteDialog();
    }
    
    // 削除ダイアログを閉じる
    function closeDeleteDialog() {
        showDeleteDialog = false;
        deleteTargetUrl = null;
    }

    // ストレージからビデオデータを読み込む関数
    function loadVideoData() {
        chrome.storage.local.get('videoData', (result: { videoData?: VideoData }) => {
            if (result.videoData) {
                console.log("Loaded videoData from storage:", result.videoData);
                videoData = {...result.videoData};
                noData = Object.keys(result.videoData).length === 0;
                
                // 現在のURLの状態をログ出力（デバッグ用）
                const currentVideoId = getVideoId(currentTabUrl);
                console.log("Current tab info:", {
                    url: currentTabUrl,
                    videoId: currentVideoId
                });
                
                // 保存されている各動画のIDをログ出力（デバッグ用）
                Object.keys(videoData).forEach(url => {
                    console.log("Stored video:", {
                        url: url,
                        videoId: getVideoId(url),
                        isCurrent: isCurrentVideo(url),
                        title: videoData[url].title,
                        timestamps: videoData[url].timestamps.length
                    });
                });
                
                // サムネイル情報を更新
                updateThumbnails();
                
                // 最初のビデオをアクティブに設定（まだ設定されていない場合）
                if (!activeVideoUrl) {
                    const entries = getSortedEntries();
                    if (entries.length > 0) {
                        activeVideoUrl = entries[0][0];
                    }
                }
            } else {
                noData = true;
            }
            loading = false;
        });
    }
    
    // サムネイル情報を更新する関数
    function updateThumbnails() {
        Object.keys(videoData).forEach(url => {
            if (!videoData[url].thumbnail) {
                const videoId = getVideoId(url);
                if (videoId) {
                    videoData[url].thumbnail = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
                }
            }
        });
    }
</script>

    <div class="container">
    <header>
        <div class="logo-section">
            <div class="logo">
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
            </div>
            <h1>タイムスタンプ</h1>
        </div>
        <div class="keyboard-hint">
            <kbd>Alt</kbd>+<kbd>O</kbd> でタイムスタンプ保存
        </div>
    </header>
        
        {#if loading}
            <div class="loading">
                <div class="spinner"></div>
                <p>読み込み中...</p>
            </div>
        {:else if noData}
            <div class="no-data">
            <div class="icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
            </div>
            <p>保存されたタイムスタンプがありません</p>
            <p class="hint">動画視聴中に <kbd>Alt</kbd>+<kbd>O</kbd> を押して<br>お気に入りの瞬間を保存</p>
            </div>
        {:else}
        <main>
            <div class="sidebar">
                {#each getSortedEntries() as [url, data], i}
                    <div class="video-selector-container">
                        <div 
                            class="video-selector" 
                            class:active={activeVideoUrl === url}
                            class:current={isCurrentVideo(url)}
                            on:click={() => setActiveVideo(url)}
                        >
                            <div class="thumbnail-wrapper">
                                <img 
                                    src={data.thumbnail || 'https://via.placeholder.com/120x68/1a1a1a/3ea6ff?text=YouTube'} 
                                    alt={data.title}
                                    class="thumbnail"
                                />
                                {#if isCurrentVideo(url)}
                                    <div class="current-indicator"></div>
                                {/if}
                            </div>
                        </div>
                        <button 
                            class="delete-btn" 
                            title="リストから削除"
                            on:click={(e) => {
                                e.stopPropagation();
                                showDeleteConfirmation(url);
                            }}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                <line x1="10" y1="11" x2="10" y2="17"></line>
                                <line x1="14" y1="11" x2="14" y2="17"></line>
                            </svg>
                        </button>
                    </div>
                {/each}
            </div>
            
            <div class="content">
                {#each getSortedEntries() as [url, data]}
                    {#if url === activeVideoUrl}
                <div class="video-item" class:current={isCurrentVideo(url)}>
                    <div class="title-section">
                                {#if isCurrentVideo(url)}
                                    <div class="badge-container">
                                        <span class="current-badge">現在視聴中</span>
                                    </div>
                                {/if}
                        <a class="video-title" class:active={isCurrentVideo(url)}
                           href={isCurrentVideo(url) ? null : url}
                           target={isCurrentVideo(url) ? null : '_blank'}
                           aria-current={isCurrentVideo(url) ? 'page' : undefined}>
                            {data.title}
                        </a>
                    </div>
                            
                            {#if isCurrentVideo(url)}
                                <div class="player-controls">
                                    <div class="time-display">{formatTime(currentTime)}</div>
                                    <div class="controls">
                                        <button class="control-btn" on:click={seekBackward} title="10秒戻る">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                <polyline points="11 17 6 12 11 7"></polyline>
                                                <polyline points="18 17 13 12 18 7"></polyline>
                                            </svg>
                                        </button>
                                        <button class="control-btn play-btn" on:click={playPause} title={isPlaying ? '一時停止' : '再生'}>
                                            {#if isPlaying}
                                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                    <rect x="6" y="4" width="4" height="16"></rect>
                                                    <rect x="14" y="4" width="4" height="16"></rect>
                                                </svg>
                                            {:else}
                                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                                                </svg>
                                            {/if}
                                        </button>
                                        <button class="control-btn" on:click={seekForward} title="10秒進む">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                <polyline points="13 17 18 12 13 7"></polyline>
                                                <polyline points="6 17 11 12 6 7"></polyline>
                                            </svg>
                                        </button>
                                    </div>
                                    <button class="add-timestamp-btn" title="現在の時間を保存" on:click={saveCurrentTimestamp}>
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                            <line x1="12" y1="5" x2="12" y2="19"></line>
                                            <line x1="5" y1="12" x2="19" y2="12"></line>
                                        </svg>
                                    </button>
                                </div>
                            {/if}
                            
                    <div class="timestamp-section">
                                <div class="timestamp-header">
                                    <div class="header-left">
                                        <h2>タイムスタンプ</h2>
                                        <span class="count">({data.timestamps.length})</span>
                                    </div>
                                </div>
                                
                        <div class="timestamp-grid">
                            {#each data.timestamps.sort((a, b) => a - b) as time}
                                <a href={`${url}&t=${Math.floor(time)}s`} 
                                   class="timestamp-link" 
                                   on:click={handleClick}
                                   title={`${formatTime(time)}に移動`}
                                   aria-label={`${formatTime(time)}に移動`}>
                                            <div class="timestamp-icon">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                                                </svg>
                                            </div>
                                            <span>{formatTime(time)}</span>
                                </a>
                            {/each}
                        </div>
                    </div>
                </div>
                    {/if}
                {/each}
            </div>
        </main>
    {/if}
    
    {#if showDeleteDialog}
        <div class="dialog-overlay">
            <div class="dialog">
                <h3>動画を削除しますか？</h3>
                <p>この動画のすべてのタイムスタンプが削除されます。</p>
                <div class="dialog-buttons">
                    <button class="dialog-btn cancel-btn" on:click={closeDeleteDialog}>キャンセル</button>
                    <button class="dialog-btn delete-btn" on:click={confirmDelete}>削除</button>
                </div>
            </div>
            </div>
        {/if}
    </div>

<style>
	:global(body) {
		font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
		margin: 0;
		padding: 0;
		width: 380px;
		color: #e1e1e1;
        background-color: #121212;
	}
    
    .container {
        max-height: 600px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        height: 100%;
    }
    
    header {
        position: sticky;
        top: 0;
        background-color: #121212;
        padding: 12px 15px;
        z-index: 10;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    .logo-section {
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 6px;
    }
    
    .logo {
        color: #3ea6ff;
        margin-right: 8px;
    }
    
    h1 {
        font-size: 18px;
        margin: 0;
        color: #fff;
        font-weight: 500;
    }
    
    .keyboard-hint {
        font-size: 11px;
        color: rgba(255, 255, 255, 0.5);
        text-align: center;
        background-color: rgba(255, 255, 255, 0.05);
        border-radius: 4px;
        padding: 4px;
        margin-top: 5px;
    }
    
    h2 {
        font-size: 14px;
        margin: 0;
        color: #e1e1e1;
        font-weight: 500;
    }
    
    main {
        display: flex;
        height: 100%;
        overflow: hidden;
    }
    
    .sidebar {
        width: 80px;
        background-color: #1a1a1a;
        border-right: 1px solid rgba(255, 255, 255, 0.08);
        overflow-y: auto;
        padding: 10px 0;
    }
    
    .content {
        flex: 1;
        overflow-y: auto;
        padding: 15px;
    }
    
    .video-selector {
        margin: 0 auto 10px;
        display: flex;
        flex-direction: column;
        align-items: center;
        cursor: pointer;
        position: relative;
        transition: all 0.2s ease;
        padding: 0 8px;
    }
    
    .thumbnail-wrapper {
        position: relative;
        width: 100%;
        border-radius: 6px;
        overflow: hidden;
        box-shadow: 0 2px 5px rgba(0,0,0,0.3);
        border: 2px solid transparent;
        transition: all 0.2s ease;
    }
    
    .video-selector.active .thumbnail-wrapper {
        border-color: #3ea6ff;
        box-shadow: 0 0 0 2px rgba(62, 166, 255, 0.3), 0 4px 8px rgba(0,0,0,0.4);
        transform: translateY(-2px);
    }
    
    .thumbnail {
        width: 100%;
        height: auto;
        display: block;
        object-fit: cover;
        aspect-ratio: 16/9;
    }
    
    .current-indicator {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 3px;
        background-color: #3ea6ff;
    }
    
    .loading, .no-data {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 300px;
        text-align: center;
        color: rgba(255, 255, 255, 0.7);
        padding: 0 20px;
    }
    
    .spinner {
        width: 30px;
        height: 30px;
        border: 2px solid rgba(255, 255, 255, 0.1);
        border-radius: 50%;
        border-top-color: #3ea6ff;
        animation: spin 1s ease-in-out infinite;
        margin-bottom: 20px;
    }
    
    @keyframes spin {
        to { transform: rotate(360deg); }
    }
    
    .icon {
        margin-bottom: 20px;
        color: rgba(255, 255, 255, 0.4);
    }
    
    kbd {
        background-color: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 4px;
        box-shadow: 0 1px 1px rgba(0,0,0,0.2);
        color: #fff;
        display: inline-block;
        font-size: 10px;
        font-family: monospace;
        line-height: 1;
        padding: 3px 5px;
        margin: 0 2px;
    }
    
    .hint {
        font-size: 13px;
        color: rgba(255, 255, 255, 0.5);
        margin-top: 10px;
        line-height: 1.5;
    }

    .video-item {
        background-color: #181818;
        border-radius: 10px;
        overflow: hidden;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        transition: all 0.3s;
	}
    
    .video-item.current {
        background-color: #1e2233;
        box-shadow: 0 4px 15px rgba(0,0,0,0.3);
    }
    
    .video-item:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(0,0,0,0.4);
    }

	.title-section {
        padding: 15px 15px 12px;
        background: linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0) 100%);
	}
    
    .badge-container {
        margin-bottom: 8px;
	}

	.video-title {
		display: block;
		font-size: 15px;
		color: #fff;
		text-decoration: none;
		font-weight: normal;
        line-height: 1.4;
        transition: color 0.2s;
	}
    
    .video-title:hover {
        color: #3ea6ff;
	}
    
    .video-title.active {
        font-weight: 500;
        color: #fff;
    }
    
    .current-badge {
        display: inline-block;
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        background-color: #3ea6ff;
        color: #0f0f0f;
        padding: 3px 8px;
        border-radius: 4px;
        font-weight: 600;
    }
    
    .player-controls {
        display: flex;
        align-items: center;
        justify-content: space-between;
        background-color: rgba(0, 0, 0, 0.3);
        margin: 0 15px 15px;
        padding: 10px 15px;
        border-radius: 8px;
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(5px);
    }
    
    .time-display {
        font-family: monospace;
        font-size: 14px;
        color: #fff;
    }
    
    .controls {
        display: flex;
        align-items: center;
        gap: 10px;
    }
    
    .control-btn {
        background: none;
        border: none;
        color: #fff;
        cursor: pointer;
        opacity: 0.8;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 5px;
        border-radius: 50%;
    }
    
    .control-btn:hover {
        opacity: 1;
        background-color: rgba(255, 255, 255, 0.1);
    }
    
    .play-btn {
        width: 40px;
        height: 40px;
        background-color: rgba(255, 255, 255, 0.1);
        border-radius: 50%;
    }
    
    .play-btn:hover {
        background-color: rgba(255, 255, 255, 0.2);
        transform: scale(1.05);
    }
    
    .timestamp-section {
        padding: 0 15px 15px;
    }
    
    .timestamp-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
    }
    
    .header-left {
        display: flex;
        align-items: center;
    }
    
    .count {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.5);
        margin-left: 5px;
    }
    
    .add-timestamp-btn {
        background-color: #3ea6ff;
        color: #0f0f0f;
        border: none;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    }
    
    .add-timestamp-btn:hover {
        background-color: #66b8ff;
        transform: scale(1.1);
        box-shadow: 0 4px 8px rgba(0,0,0,0.3);
    }
    
    .timestamp-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
        gap: 8px;
    }

	.timestamp-link {
        display: flex;
        align-items: center;
        padding: 8px 10px;
        font-size: 13px;
        background-color: rgba(255, 255, 255, 0.06);
        color: #fff;
        text-decoration: none;
        border-radius: 6px;
        transition: all 0.3s;
        backdrop-filter: blur(5px);
	}

	.timestamp-link:hover, .timestamp-link:focus {
        background-color: #3ea6ff;
        color: #121212;
        transform: translateY(-2px);
        box-shadow: 0 2px 8px rgba(62, 166, 255, 0.3);
	}
    
    .timestamp-icon {
        margin-right: 7px;
        color: inherit;
        opacity: 0.9;
	}

	.timestamp-link:focus {
        outline: none;
        box-shadow: 0 0 0 2px rgba(62, 166, 255, 0.4), 0 2px 8px rgba(62, 166, 255, 0.3);
	}
    
    ::-webkit-scrollbar {
        width: 4px;
    }
    
    ::-webkit-scrollbar-track {
        background: transparent;
    }
    
    ::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
        border-radius: 4px;
    }
    
    ::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.3);
    }

    /* 削除ボタンのスタイル */
    .video-selector-container {
        position: relative;
        margin-bottom: 10px;
    }
    
    .delete-btn {
        position: absolute;
        top: -6px;
        right: -6px;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background-color: rgba(255, 0, 0, 0.7);
        color: white;
        border: none;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        opacity: 0;
        transition: opacity 0.2s, transform 0.2s;
        transform: scale(0.8);
        z-index: 5;
        padding: 0;
    }
    
    .video-selector-container:hover .delete-btn {
        opacity: 1;
        transform: scale(1);
    }
    
    .delete-btn:hover {
        background-color: rgba(255, 0, 0, 0.9);
        transform: scale(1.1);
    }
    
    /* ダイアログのスタイル */
    .dialog-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 100;
        backdrop-filter: blur(3px);
    }
    
    .dialog {
        background-color: #242424;
        border-radius: 10px;
        padding: 20px;
        width: 300px;
        max-width: 90%;
        box-shadow: 0 5px 20px rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    .dialog h3 {
        margin-top: 0;
        margin-bottom: 10px;
        color: #fff;
        font-size: 16px;
    }
    
    .dialog p {
        margin-bottom: 20px;
        color: rgba(255, 255, 255, 0.8);
        font-size: 14px;
    }
    
    .dialog-buttons {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
    }
    
    .dialog-btn {
        padding: 8px 15px;
        border-radius: 5px;
        font-size: 13px;
        cursor: pointer;
        border: none;
        transition: all 0.2s;
    }
    
    .cancel-btn {
        background-color: rgba(255, 255, 255, 0.1);
        color: #fff;
    }
    
    .cancel-btn:hover {
        background-color: rgba(255, 255, 255, 0.2);
    }
    
    .dialog .delete-btn {
        position: static;
        width: auto;
        height: auto;
        background-color: #e53935;
        color: white;
        opacity: 1;
        transform: none;
    }
    
    .dialog .delete-btn:hover {
        background-color: #f44336;
        transform: translateY(-2px);
	}
</style>