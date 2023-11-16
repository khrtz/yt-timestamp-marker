let videoData = {};

chrome.runtime.onStartup.addListener(() => {
    chrome.storage.local.get('videoData', (result) => {
        if (!result.videoData) {
            chrome.storage.local.set({ videoData: {} });
        } else {
            videoData = result.videoData;
        }
    });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'save_timestamp') {
        chrome.storage.local.get('videoData', (result) => {
            videoData = result.videoData || {};

            if (!videoData[message.url]) {
                videoData[message.url] = {
                    title: message.title,
                    timestamps: []
                };
            }

            if (!videoData[message.url].timestamps.includes(message.time)) {
                videoData[message.url].timestamps.push(message.time);
                videoData[message.url].timestamps.sort((a, b) => a - b);
                chrome.storage.local.set({ videoData });
            }
        });

        sendResponse({ status: 'success' });
        return true;
    }
});


chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === "moveToTimestamp") {
        chrome.tabs.query({url: "*://*.youtube.com/watch*"}, function(tabs) {
            for (let tab of tabs) {
                let tabUrlBase = tab.url.split('&')[0];
                let requestUrlBase = request.url.split('&')[0];
                if (tabUrlBase === requestUrlBase) {
                    chrome.tabs.sendMessage(tab.id, {action: "moveToTimestamp", time: request.url.split('&t=')[1]});
                    break;
                }
            }
        });
    }
});
