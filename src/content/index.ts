// YouTubeタイムスタンプメーカー - コンテンツスクリプト
export {};

// ページ読み込み完了後にYouTubeプレイヤーが利用可能であることを確認
function ensurePlayerIsReady() {
    console.log("Ensuring YouTube player is ready");
    if (document.querySelector('video')) {
        console.log("Video element found");
        setupEventListeners();
    } else {
        console.log("Video element not found yet, waiting...");
        setTimeout(ensurePlayerIsReady, 1000);
    }
}

// イベントリスナーをセットアップ
function setupEventListeners() {
    console.log("Setting up event listeners");
    
    // 既存のリスナーを削除（重複防止）
    document.removeEventListener('keydown', handleAltOKeypress);
    
    // Alt+Oキーのイベントリスナーを追加
    document.addEventListener('keydown', handleAltOKeypress);
    
    // ページを離れる前にクリーンアップ
    window.addEventListener('beforeunload', () => {
        document.removeEventListener('keydown', handleAltOKeypress);
    });
    
    console.log("Event listeners set up successfully");
}

// Alt+Oキーを処理する関数
function handleAltOKeypress(event: KeyboardEvent) {
    if (event.altKey && event.key === 'o') {
        event.preventDefault();
        console.log("Alt+O pressed, saving timestamp...");
        
        try {
            const video = document.querySelector('video');
            if (!video) {
                console.error("No video element found for saving timestamp");
                showErrorNotification("動画が見つかりません");
                return;
            }
            
            const currentTime = video.currentTime;
            const currentUrl = window.location.href;
            const title = document.title || 'YouTube動画';
            
            // 動画IDを取得して正規化されたURLを作成
            const videoId = extractVideoIdFromUrl(currentUrl);
            if (!videoId) {
                console.error("Could not extract video ID from URL:", currentUrl);
                showErrorNotification("動画IDが取得できません");
                return;
            }
            
            // 標準化されたURLを使用
            const cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;
            
            console.log("Saving timestamp with clean URL:", {
                original: currentUrl,
                clean: cleanUrl,
                videoId: videoId,
                time: currentTime,
                title: title
            });
            
            chrome.runtime.sendMessage({
                action: 'save_timestamp',
                url: cleanUrl,
                title: title,
                time: currentTime
            }, (response) => {
                // エラーチェック
                if (chrome.runtime.lastError) {
                    console.error("Error sending message:", chrome.runtime.lastError);
                    showErrorNotification("保存中にエラーが発生しました");
                    return;
                }
                
                console.log('Timestamp saved response:', response);
                
                // 成功した場合、視覚的なフィードバックを表示
                if (response && response.status === 'success') {
                    showSavedNotification(currentTime);
                } else if (response && response.status === 'duplicate') {
                    showInfoNotification(`既に保存済み: ${formatTime(currentTime)}`);
                } else {
                    showErrorNotification("保存に失敗しました");
                }
            });
        } catch (error) {
            console.error("Error saving timestamp:", error);
            showErrorNotification("タイムスタンプの保存中にエラーが発生しました");
        }
    }
}

// タイムスタンプ保存成功の通知を表示
function showSavedNotification(time: number) {
    const formattedTime = formatTime(time);
    showNotification(`タイムスタンプ保存: ${formattedTime}`, "#3ea6ff");
}

// エラー通知を表示
function showErrorNotification(message: string) {
    showNotification(message, "#e53935");
}

// 情報通知を表示
function showInfoNotification(message: string) {
    showNotification(message, "#fb8c00");
}

// 通知を表示する共通関数
function showNotification(message: string, bgColor: string) {
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background-color: ${bgColor};
        color: white;
        padding: 10px 20px;
        border-radius: 8px;
        z-index: 9999;
        font-family: 'Segoe UI', -apple-system, sans-serif;
        font-size: 14px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 3000);
}

// 時間をフォーマットする
function formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// URLから動画IDを抽出
function extractVideoIdFromUrl(url: string): string | null {
    if (!url) return null;
    
    try {
        // 通常のYouTube URL
        const normalMatch = url.match(/[?&]v=([^&]+)/);
        if (normalMatch) return normalMatch[1];
        
        // 短縮URL
        const shortMatch = url.match(/youtu\.be\/([^?&]+)/);
        if (shortMatch) return shortMatch[1];
        
        // 埋め込み
        const embedMatch = url.match(/\/embed\/([^/?&]+)/);
        if (embedMatch) return embedMatch[1];
        
        console.log("Could not extract video ID from URL:", url);
        return null;
    } catch (error) {
        console.error("Error extracting video ID:", error);
        return null;
    }
}

// メッセージハンドラをセットアップ
chrome.runtime.onMessage.addListener((request: any, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) => {
    console.log("Content script received message:", request.action);
    
    // タイムスタンプに移動
    if (request.action === "moveToTimestamp") {
        console.log("moveToTimestamp received with time:", request.time);
        
        try {
            let time = parseInt(request.time.replace('s', ''));
            console.log("Moving to time:", time, "seconds");
            
            // 動画を特定して時間を設定する関数
            const setVideoTime = (retry = 0, maxRetries = 10) => {
                const video = document.querySelector('video');
                
                if (video) {
                    // 準備ができているか確認
                    if (video.readyState >= 2) {
                        try {
                            console.log("Setting video time to:", time, "Current time was:", video.currentTime);
                            video.currentTime = time;
                            
                            // 時間を設定した後に確認
                            setTimeout(() => {
                                const v = document.querySelector('video');
                                if (v) {
                                    console.log("After setting, current time is:", v.currentTime);
                                    // 許容範囲内かチェック
                                    if (Math.abs(v.currentTime - time) > 1) {
                                        console.warn("Time setting may have failed, retrying...");
                                        if (retry < maxRetries) {
                                            v.currentTime = time;  // 再設定
                                        }
                                    }
                                    
                                    // 再生
                                    v.play()
                                      .then(() => {
                                          console.log("Playback started at timestamp");
                                          sendResponse({ success: true });
                                      })
                                      .catch(err => {
                                          console.error("Error starting playback:", err);
                                          // 自動再生に失敗してもエラーにしない（YouTube側の制限かもしれない）
                                          sendResponse({ success: true, playbackError: err.message });
                                      });
                                }
                            }, 100);
                        } catch (error) {
                            console.error("Error setting video time:", error);
                            if (retry < maxRetries) {
                                console.log(`Retrying (${retry + 1}/${maxRetries})...`);
                                setTimeout(() => setVideoTime(retry + 1, maxRetries), 300);
                            } else {
                                sendResponse({ success: false, error: "Failed to set video time after multiple attempts" });
                            }
                        }
                    } else {
                        // 動画の読み込みを待つ
                        if (retry < maxRetries) {
                            console.log(`Video not ready yet (state ${video.readyState}), retrying (${retry + 1}/${maxRetries})...`);
                            setTimeout(() => setVideoTime(retry + 1, maxRetries), 500);
                        } else {
                            console.error("Video never became ready");
                            sendResponse({ success: false, error: "Video never became ready" });
                        }
                    }
                } else {
                    // 動画要素がない場合
                    if (retry < maxRetries) {
                        console.log(`Video element not found, retrying (${retry + 1}/${maxRetries})...`);
                        setTimeout(() => setVideoTime(retry + 1, maxRetries), 500);
                    } else {
                        console.error("Failed to find video element after multiple attempts");
                        sendResponse({ success: false, error: "Video element not found" });
                    }
                }
            };
            
            // YouTubeプレーヤーの確認（型安全な方法で）
            if (window['YT'] !== undefined) {
                console.log("YouTube API found, using enhanced seeking");
                setVideoTime();
            } else {
                console.log("Using direct video element seeking");
                setVideoTime();
            }
        } catch (error: any) {
            console.error("Error in moveToTimestamp handler:", error);
            sendResponse({ success: false, error: error.message || "Unknown error" });
        }
        
        return true;
    }
    
    // 現在の時間を取得するリクエスト
    if (request.action === "getCurrentTime") {
        console.log("getCurrentTime requested");
        const video = document.querySelector('video');
        if (video) {
            const currentTime = video.currentTime;
            console.log("Returning current time:", currentTime);
            sendResponse({ currentTime: currentTime });
        } else {
            console.log("No video element found!");
            sendResponse({ currentTime: null });
        }
        return true;
    }
    
    // プレイヤーの状態を取得
    if (request.action === "getPlayerState") {
        console.log("getPlayerState requested");
        const video = document.querySelector('video');
        if (video) {
            const response = {
                currentTime: video.currentTime,
                duration: video.duration,
                isPlaying: !video.paused
            };
            console.log("Player state:", response);
            sendResponse(response);
        } else {
            console.log("No video element found");
            sendResponse({ 
                currentTime: 0, 
                duration: 0, 
                isPlaying: false 
            });
        }
        return true;
    }
    
    // 再生/一時停止の切り替え
    if (request.action === "playPause") {
        console.log("playPause requested");
        const video = document.querySelector('video');
        if (video) {
            try {
                if (video.paused) {
                    console.log("Playing video");
                    video.play()
                    .then(() => {
                        console.log("Video playing");
                        sendResponse({ success: true, isPlaying: true });
                    })
                    .catch((error: Error) => {
                        console.error("Error playing video:", error.message);
                        sendResponse({ success: false, error: error.message });
                    });
                } else {
                    console.log("Pausing video");
                    video.pause();
                    sendResponse({ success: true, isPlaying: false });
                }
            } catch (error) {
                console.error("Error toggling play state:", error);
                sendResponse({ success: false, error: "Failed to control video playback" });
            }
        } else {
            console.log("No video element found for playPause");
            sendResponse({ success: false, error: "No video element found" });
        }
        return true;
    }
    
    // シーク（早送り・巻き戻し）
    if (request.action === "seek") {
        console.log("seek requested, seconds:", request.seconds);
        const video = document.querySelector('video');
        if (video && request.seconds) {
            try {
                const newTime = video.currentTime + request.seconds;
                console.log("Current time:", video.currentTime, "New time:", newTime);
                video.currentTime = newTime;
                sendResponse({ success: true, currentTime: video.currentTime });
            } catch (error) {
                console.error("Error seeking video:", error);
                sendResponse({ success: false, error: "Failed to seek video" });
            }
        } else {
            console.log("No video element found for seek");
            sendResponse({ success: false, error: "No video element or seconds not provided" });
        }
        return true;
    }
    
    return false;
});

// コンテンツスクリプト初期化
console.log("YouTube timestamp maker content script loaded");
ensurePlayerIsReady(); 