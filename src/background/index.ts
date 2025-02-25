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

chrome.runtime.onMessage.addListener((request: Request | any, sender: Sender, sendResponse: (response?: any) => void) => {
    if (request.action === "moveToTimestamp") {
      chrome.tabs.query({ url: "*://*.youtube.com/watch*" }, (tabs: chrome.tabs.Tab[]) => {
        for (let tab of tabs) {
          let tabUrlBase = tab.url?.split('&')[0];
          let requestUrlBase = request.url.split('&')[0];
          if (tabUrlBase === requestUrlBase) {
            const timeMatch = request.url.match(/[&?]t=(\d+)s/);
            const time = timeMatch ? timeMatch[1] : null;
            if (time) {
              chrome.tabs.sendMessage(tab.id!, { action: "moveToTimestamp", time: time });
            }
            break;
          }
        }
      });
      return true;
    }

    if (request.action === "saveTimestamp") {
      console.log("Saving timestamp:", request.time, "for URL:", request.url);
      
      // ここでタイムスタンプを保存するロジックを実装
      // 例: ローカルストレージに保存
      chrome.storage.local.get(['timestamps'], (result) => {
        let timestamps = result.timestamps || {};
        if (!timestamps[request.url]) {
          timestamps[request.url] = [];
        }
        
        // 同じ時間が既に保存されていないか確認
        if (!timestamps[request.url].includes(request.time)) {
          timestamps[request.url].push(request.time);
          // 時間順にソート
          timestamps[request.url].sort((a: number, b: number) => a - b);
          
          chrome.storage.local.set({ timestamps }, () => {
            console.log("Timestamp saved successfully");
            sendResponse({ success: true });
          });
        } else {
          sendResponse({ success: false, reason: "Timestamp already exists" });
        }
      });
      
      return true; // 非同期レスポンスのために必要
    }
  });