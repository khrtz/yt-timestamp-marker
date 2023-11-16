document.addEventListener('keydown', (event) => {
    if (event.altKey && event.key === 'o') {
        let video = document.querySelector('video');
        if (video) {
            let message = {
                action: 'save_timestamp',
                url: window.location.href,
                title: document.title,
                time: video.currentTime
            };
            chrome.runtime.sendMessage(message, function(response) {
                if (chrome.runtime.lastError) {
                    console.error("Error sending message:", chrome.runtime.lastError);
                    return;
                }
                console.log("Received response:", response);
            });
        }
    }
});


chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === "moveToTimestamp") {
        let video = document.querySelector('video');
        if (video) {
            let time = parseInt(request.time.replace('s', ''));
            console.log("Moving video to time:", time);
            video.currentTime = time;
        }
    }
});

function parseTime(timeString) {
    let timeParts = timeString.split('s')[0].split('m');
    return parseInt(timeParts[0]) * 60 + parseInt(timeParts[1]);
}
