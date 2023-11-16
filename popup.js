document.addEventListener('DOMContentLoaded', function () {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        let currentTabUrl = tabs[0].url;

        chrome.storage.local.get('videoData', (result) => {
            if (result.videoData) {
                renderTimestamps(result.videoData, currentTabUrl);
            }
        });
    });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "update_popup") {
        renderTimestamps(message.videoData);
    }
});

document.addEventListener('click', function(e) {
    if (e.target && e.target.className === 'timestamp-link') {
        e.preventDefault();
        let videoUrl = e.target.getAttribute('href');
        console.log("Sending message from popup to background:", videoUrl);
        chrome.runtime.sendMessage({action: "moveToTimestamp", url: videoUrl});
    }
});

function renderTimestamps(videoData, currentTabUrl) {
    let container = document.getElementById('timestamps');
    container.innerHTML = '';

    for (let [url, data] of Object.entries(videoData)) {
        let videoDiv = document.createElement('div');
        videoDiv.className = 'video-item';

        let titleSection = document.createElement('div');
        titleSection.className = 'title-section';

        let titleLink = document.createElement('a');
        titleLink.className = 'video-title';
        titleLink.textContent = data.title;

        // 現在のタブのURLと一致する場合、タイトルを赤くする
        if (url === currentTabUrl) {
            titleLink.style.color = 'red';
        } else {
            titleLink.href = url;
            titleLink.target = '_blank';
        }

        titleSection.appendChild(titleLink);
        videoDiv.appendChild(titleSection);

        let timestampSection = document.createElement('div');
        timestampSection.className = 'timestamp-section';

        data.timestamps.sort((a, b) => a - b).forEach(time => {
            let timeLink = document.createElement('a');
            timeLink.className = 'timestamp-link';
            timeLink.spellcheck = false;
            timeLink.dir = "auto";
            
            let videoUrl = new URL(url);
            videoUrl.searchParams.set('t', `${Math.floor(time)}s`);
            timeLink.href = videoUrl.href;

            let hours = Math.floor(time / 3600).toString().padStart(2, '0');
            let minutes = Math.floor((time % 3600) / 60).toString().padStart(2, '0');
            let seconds = Math.floor(time % 60).toString().padStart(2, '0');
            timeLink.textContent = `${hours}:${minutes}:${seconds}`;

            timestampSection.appendChild(timeLink);
        });

        videoDiv.appendChild(timestampSection);
        container.appendChild(videoDiv);
    }
}
