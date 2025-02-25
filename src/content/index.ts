document.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.altKey && event.key === 'o') {
        console.log("Saving timestamp...", "o");
        let video = document.querySelector('video');
        if (video) {
            let videoUrl = window.location.href;
            let videoIdMatch = videoUrl.match(/[?&]v=([^&]+)/);

            if (videoIdMatch) {
                let videoId = videoIdMatch[1];
                let formattedUrl = `https://www.youtube.com/watch?v=${videoId}`;
                let message = {
                    action: 'save_timestamp',
                    url: formattedUrl,
                    title: document.title,
                    time: video.currentTime
                };
                chrome.runtime.sendMessage(message, (response: any) => {
                    if (chrome.runtime.lastError) {
                        console.error("Error sending message:", chrome.runtime.lastError);
                        return;
                    }
                    console.log("Received response:", response);
                });
            }
        }
    }
});

// キーボードショートカットのイベントリスナーを追加
document.addEventListener('keydown', (e: KeyboardEvent) => {
    // Alt+Oが押されたかチェック
    if (e.altKey && e.key === 'o') {
        e.preventDefault(); // デフォルトの動作を防止
        console.log('Alt+O pressed, saving timestamp...');
        
        // 現在のビデオ要素を取得
        const video = document.querySelector('video');
        if (video) {
            // 現在の再生時間を取得
            const currentTime = Math.floor(video.currentTime);
            
            // 現在のURLを取得
            const currentUrl = window.location.href;
            
            // バックグラウンドスクリプトにメッセージを送信
            chrome.runtime.sendMessage({
                action: 'saveTimestamp',
                url: currentUrl,
                time: currentTime
            }, (response) => {
                console.log('Timestamp saved response:', response);
            });
        }
    }
});

chrome.runtime.onMessage.addListener((request: any, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) => {
    if (request.action === "moveToTimestamp") {
        let video = document.querySelector('video');
        if (video) {
            let time = parseInt(request.time.replace('s', ''));
            console.log("Moving video to time:", time);
            video.currentTime = time;
        }
    }
});
