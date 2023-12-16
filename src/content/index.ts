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
