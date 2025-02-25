<script lang="ts">
    import { onMount } from 'svelte';

    interface VideoData {
        [url: string]: {
            title: string;
            timestamps: number[];
        };
    }

    let videoData: VideoData = {};
    let currentTabUrl: string = '';
    let loading: boolean = true;
    let noData: boolean = false;

    onMount(async () => {
        console.log("Popup mounted");
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            currentTabUrl = tabs[0].url as string;

            chrome.storage.local.get('videoData', (result: { videoData?: VideoData }) => {
                if (result.videoData) {
                    console.log("Received videoData from storage:", result.videoData)
                    videoData = result.videoData;
                    noData = Object.keys(result.videoData).length === 0;
                } else {
                    noData = true;
                }
                loading = false;
            });
        });

        chrome.runtime.onMessage.addListener((message: { action: string; videoData?: VideoData }, sender, sendResponse) => {
            if (message.action === "update_popup" && message.videoData) {
                console.log("Received message in popup:", message);
                videoData = message.videoData;
                noData = Object.keys(message.videoData).length === 0;
                loading = false;
            }
        });
    });

    function handleClick(e: MouseEvent) {
        e.preventDefault();
        const target = e.target as HTMLAnchorElement;
        console.log("Clicked:", target.className);
        let videoUrl = target.href;
        console.log("Generated URL:", videoUrl);
        chrome.runtime.sendMessage({action: "moveToTimestamp", url: videoUrl}, (response) => {
            console.log("Message sent to background script", response);
        });
    }

    function formatTime(seconds: number): string {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    function isCurrentVideo(url: string): boolean {
        return url === currentTabUrl || currentTabUrl.startsWith(url.split('&')[0]);
    }
</script>

<template>
    <div class="container">
        <h1>動画タイムスタンプ</h1>
        
        {#if loading}
            <div class="loading">
                <div class="spinner"></div>
                <p>読み込み中...</p>
            </div>
        {:else if noData}
            <div class="no-data">
                <p>保存されたタイムスタンプがありません。</p>
                <p class="hint">動画を視聴中に「T」キーを押すとタイムスタンプが保存されます。</p>
            </div>
        {:else}
            <div id="timestamps">
                {#each Object.entries(videoData) as [url, data]}
                <div class="video-item" class:current={isCurrentVideo(url)}>
                    <div class="title-section">
                        <a class="video-title" class:active={isCurrentVideo(url)}
                           href={isCurrentVideo(url) ? null : url}
                           target={isCurrentVideo(url) ? null : '_blank'}
                           aria-current={isCurrentVideo(url) ? 'page' : undefined}>
                            {data.title}
                            {#if isCurrentVideo(url)}<span class="current-badge">現在視聴中</span>{/if}
                        </a>
                    </div>
                    <div class="timestamp-section">
                        <h2>タイムスタンプ ({data.timestamps.length})</h2>
                        <div class="timestamp-grid">
                            {#each data.timestamps.sort((a, b) => a - b) as time}
                                <a href={`${url}&t=${Math.floor(time)}s`} 
                                   class="timestamp-link" 
                                   on:click={handleClick}
                                   title={`${formatTime(time)}に移動`}
                                   aria-label={`${formatTime(time)}に移動`}>
                                    {formatTime(time)}
                                </a>
                            {/each}
                        </div>
                    </div>
                </div>
                {/each}
            </div>
        {/if}
    </div>
</template>

<style>
	:global(body) {
		font-family: 'Arial', sans-serif;
		margin: 0;
		padding: 0;
		width: 350px;
		color: rgb(33, 33, 33);
        background-color: #f9f9f9;
	}
    
    .container {
        padding: 15px;
    }
    
    h1 {
        font-size: 18px;
        margin: 0 0 15px 0;
        padding-bottom: 10px;
        border-bottom: 1px solid #e0e0e0;
        color: #333;
        text-align: center;
    }
    
    h2 {
        font-size: 14px;
        margin: 0 0 8px 0;
        color: #555;
    }
    
    .loading, .no-data {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 150px;
        text-align: center;
    }
    
    .spinner {
        width: 30px;
        height: 30px;
        border: 3px solid rgba(0, 0, 0, 0.1);
        border-radius: 50%;
        border-top-color: #0056b3;
        animation: spin 1s ease-in-out infinite;
        margin-bottom: 10px;
    }
    
    @keyframes spin {
        to { transform: rotate(360deg); }
    }
    
    .hint {
        font-size: 13px;
        color: #666;
        font-style: italic;
        margin-top: 5px;
    }

    .video-item {
        margin-bottom: 25px;
        padding: 12px;
        border-radius: 8px;
        background-color: white;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        transition: transform 0.2s;
	}
    
    .video-item.current {
        border-left: 4px solid #0056b3;
        background-color: #f0f7ff;
    }
    
    .video-item:hover {
        transform: translateY(-2px);
        box-shadow: 0 3px 6px rgba(0,0,0,0.15);
    }

	.title-section {
        margin-bottom: 12px;
	}

	.video-title {
		display: block;
		font-size: 15px;
		color: #0279d3;
		text-decoration: none;
		font-weight: normal;
		margin-bottom: 8px;
        line-height: 1.4;
	}
    
    .video-title.active {
        font-weight: bold;
        color: #0f0f0f;
    }
    
    .current-badge {
        display: inline-block;
        font-size: 11px;
        background-color: #0056b3;
        color: white;
        padding: 2px 6px;
        border-radius: 10px;
        margin-left: 8px;
        vertical-align: middle;
    }
    
    .timestamp-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }

	.timestamp-link {
        display: inline-block;
        padding: 5px 8px;
        font-size: 13px;
        background-color: #e9f0f7;
        color: #0056b3;
        text-decoration: none;
        border-radius: 5px;
        transition: all 0.2s;
        border: 1px solid #d0e0f0;
	}

	.timestamp-link:hover, .timestamp-link:focus {
        background-color: #0056b3;
        color: white;
        transform: scale(1.05);
	}

	.timestamp-link:focus {
        outline: none;
        box-shadow: 0 0 0 2px rgba(0, 86, 179, 0.4);
	}
</style>