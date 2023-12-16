interface VideoData {
    [url: string]: {
        title: string;
        timestamps: number[];
    };
}

interface Request {
    action: string;
    readonly url: string;
}

interface Sender {
    tab?: chrome.tabs.Tab;
}

  let videoData: VideoData = {};
  
chrome.runtime.onStartup.addListener(() => {
    chrome.storage.local.get('videoData', (result: { videoData?: VideoData }) => {
        if (!result.videoData) {
            chrome.storage.local.set({ videoData: {} });
        } else {
            videoData = result.videoData;
        }
    });
});
  
chrome.runtime.onMessage.addListener((message: any, sender: any, sendResponse: any) => {
if (message.action === 'save_timestamp') {
    chrome.storage.local.get('videoData', (result: { videoData?: VideoData }) => {
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

chrome.runtime.onMessage.addListener((request: Request, sender: Sender, sendResponse: (response?: any) => void) => {
    if (request.action === "moveToTimestamp") {
      chrome.tabs.query({ url: "*://*.youtube.com/watch*" }, (tabs: chrome.tabs.Tab[]) => {
        for (let tab of tabs) {
          let tabUrlBase = tab.url?.split('&')[0];
          let requestUrlBase = request.url.split('&')[0];
          if (tabUrlBase === requestUrlBase) {
            chrome.tabs.sendMessage(tab.id!, { action: "moveToTimestamp", time: request.url.split('&t=')[1] });
            break;
          }
        }
      });
    }
  });