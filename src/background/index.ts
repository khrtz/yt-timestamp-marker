// インターフェース定義
interface VideoMetadata {
  title: string;
  timestamps: number[];
  thumbnail?: string;
}

interface ExtRequest {
  action: string;
  url?: string;
  time?: number;
  title?: string;
}

// データストレージ型
type VideoDataMap = Record<string, VideoMetadata>;

// グローバル変数
let videoData: VideoDataMap = {};

// 初期化
chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed, initializing storage");
  
  chrome.storage.local.get('videoData', (result: { videoData?: VideoDataMap }) => {
    if (!result.videoData) {
      chrome.storage.local.set({ videoData: {} });
      console.log("Initialized empty videoData storage");
    } else {
      videoData = result.videoData;
      console.log("Loaded existing videoData:", Object.keys(result.videoData).length, "videos");
    }
  });
  
  injectContentScripts();
});

chrome.runtime.onStartup.addListener(() => {
  console.log("Extension starting up, loading data");
  
  chrome.storage.local.get('videoData', (result: { videoData?: VideoDataMap }) => {
    if (!result.videoData) {
      chrome.storage.local.set({ videoData: {} });
      console.log("Initialized empty videoData storage on startup");
    } else {
      videoData = result.videoData;
      console.log("Loaded videoData on startup:", Object.keys(result.videoData).length, "videos");
    }
  });
});

// タイムスタンプ保存処理
chrome.runtime.onMessage.addListener((message: any, sender: any, sendResponse: any) => {
  if (message.action === 'save_timestamp') {
    if (!message.url || message.title === undefined || message.time === undefined) {
      console.error("Invalid save_timestamp request:", message);
      sendResponse({ status: 'error', message: 'Missing required parameters' });
      return false;
    }
    
    console.log("Saving timestamp:", message);
    
    chrome.storage.local.get('videoData', (result: { videoData?: VideoDataMap }) => {
      videoData = result.videoData || {};
      
      // 動画IDの取得と正規化されたURLの作成
      const videoId = getVideoIdFromUrl(message.url);
      if (!videoId) {
        console.error("Invalid video ID in save_timestamp request:", message.url);
        sendResponse({ status: 'error', message: 'Invalid video ID' });
        return;
      }
      
      // 標準化されたURLを使用
      const cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;
      
      // videoDataにエントリが存在しない場合は新規作成
      if (!videoData[cleanUrl]) {
        console.log("Creating new video entry:", cleanUrl);
        videoData[cleanUrl] = {
          title: message.title,
          timestamps: []
        };
      }

      // タイムスタンプを追加（重複がない場合）
      const time = message.time;
      const existingIndex = videoData[cleanUrl].timestamps.findIndex(t => Math.abs(t - time) < 1);
      
      if (existingIndex === -1) {
        console.log("Adding new timestamp:", time);
        videoData[cleanUrl].timestamps.push(time);
        videoData[cleanUrl].timestamps.sort((a, b) => a - b);
        
        chrome.storage.local.set({ videoData }, () => {
          // ポップアップに更新を通知
          chrome.runtime.sendMessage({
            action: "update_popup",
            videoData: videoData
          });
          console.log("Timestamp saved successfully");
          sendResponse({ status: 'success' });
        });
      } else {
        console.log("Timestamp already exists (within 1 second):", videoData[cleanUrl].timestamps[existingIndex]);
        sendResponse({ status: 'duplicate' });
      }
    });
    
    return true;
  }
  
  if (message.action === "moveToTimestamp") {
    console.log("Moving to timestamp in:", message.url);
    
    // 動画IDの取得
    const requestVideoId = getVideoIdFromUrl(message.url || '');
    if (!requestVideoId) {
      console.error("Invalid video ID in moveToTimestamp request:", message.url);
      sendResponse({ success: false, error: 'Invalid video ID' });
      return true;
    }
    
    chrome.tabs.query({ url: "*://*.youtube.com/watch*" }, (tabs: chrome.tabs.Tab[]) => {
      let tabFound = false;
      
      for (let tab of tabs) {
        // YouTube動画IDで比較する
        const tabVideoId = getVideoIdFromUrl(tab.url || '');
        
        if (tabVideoId && tabVideoId === requestVideoId) {
          console.log("Found matching tab:", tab.id, "Video ID:", tabVideoId);
          const timeMatch = message.url.match(/[&?]t=(\d+)s/);
          const time = timeMatch ? timeMatch[1] : null;
          
          if (time && tab.id) {
            console.log("Sending moveToTimestamp message with time:", time);
            chrome.tabs.sendMessage(tab.id, { 
              action: "moveToTimestamp", 
              time: time 
            }, (response) => {
              if (chrome.runtime.lastError) {
                console.error("Error sending message to tab:", chrome.runtime.lastError);
              } else {
                console.log("Timestamp move response:", response);
                tabFound = true;
                sendResponse({ success: true });
              }
            });
            
            // タブをアクティブにする
            chrome.tabs.update(tab.id, { active: true });
            chrome.windows.update(tab.windowId, { focused: true });
            return true;
          }
          break;
        }
      }
      
      // 一致するタブが見つからない場合は新しいタブを開く
      if (!tabFound) {
        console.log("No matching tab found, opening new tab with URL:", message.url);
        chrome.tabs.create({ url: message.url }, (tab) => {
          sendResponse({ success: true, newTab: true });
        });
      }
    });
    return true;
  }
  
  return false;
});

// URLから動画IDを抽出するユーティリティ関数
function getVideoIdFromUrl(url: string): string | null {
  if (!url) return null;
  
  try {
    // 通常のYouTube URL (例: https://www.youtube.com/watch?v=VIDEO_ID)
    const normalMatch = url.match(/[?&]v=([^&]+)/);
    if (normalMatch) return normalMatch[1];
    
    // 短縮URL (例: https://youtu.be/VIDEO_ID)
    const shortMatch = url.match(/youtu\.be\/([^?&]+)/);
    if (shortMatch) return shortMatch[1];
    
    // 埋め込み (例: https://www.youtube.com/embed/VIDEO_ID)
    const embedMatch = url.match(/\/embed\/([^/?&]+)/);
    if (embedMatch) return embedMatch[1];
    
    console.log("Could not extract video ID from URL:", url);
    return null;
  } catch (error) {
    console.error("Error extracting video ID:", error);
    return null;
  }
}

// コンテンツスクリプト挿入関数
function injectContentScripts() {
  chrome.tabs.query({ url: "*://*.youtube.com/watch*" }, (tabs) => {
    for (const tab of tabs) {
      if (tab.id) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content.js"]
        }).catch(error => {
          console.error("Error injecting content script to tab", tab.id, error);
        });
      }
    }
  });
}

// タブ更新時にコンテンツスクリプトを挿入
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('youtube.com/watch')) {
    chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    }).catch(error => {
      console.error("Error injecting content script on tab update", tabId, error);
    });
  }
}); 