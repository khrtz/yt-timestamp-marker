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

    onMount(async () => {
        console.log("Popup mounted");
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            currentTabUrl = tabs[0].url as string;

            chrome.storage.local.get('videoData', (result: { videoData?: VideoData }) => {
                if (result.videoData) {
                    console.log("Received videoData from storage:", result.videoData)
                    videoData = result.videoData;
                }
            });
        });

        chrome.runtime.onMessage.addListener((message: { action: string; videoData?: VideoData }, sender, sendResponse) => {
            if (message.action === "update_popup" && message.videoData) {
                console.log("Received message in popup:", message);
                videoData = message.videoData;
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

// ... existing code ...
</script>

<template>
    <div id="timestamps">
        {#each Object.entries(videoData) as [url, data]}
        <div class="video-item">
            <div class="title-section">
                <a class={url === currentTabUrl || currentTabUrl.startsWith(url.split('&')[0]) ? 'video-title active' : 'video-title'}
                   href={url === currentTabUrl || currentTabUrl.startsWith(url.split('&')[0]) ? null : url}
                   target={url === currentTabUrl || currentTabUrl.startsWith(url.split('&')[0]) ? null : '_blank'}
                   style={url === currentTabUrl || currentTabUrl.startsWith(url.split('&')[0]) ? 'font-weight: bold; color: #0f0f0f;' : ''}>
                    {data.title}
                </a>
            </div>
            <div class="timestamp-section">
                {#each data.timestamps.sort((a, b) => a - b) as time}
                    <a href={`${url}&t=${Math.floor(time)}s`} class="timestamp-link" on:click={handleClick}>
                        {`${Math.floor(time / 3600).toString().padStart(2, '0')}:${Math.floor((time % 3600) / 60).toString().padStart(2, '0')}:${Math.floor(time % 60).toString().padStart(2, '0')}`}
                    </a>
                {/each}
            </div>
        </div>
        {/each}
    </div>
</template>

<style>
	:global(body) {
		font-family: 'Arial', sans-serif;
		margin: 0;
		padding: 10px;
		width: 300px;
		color: rgb(33, 33, 33);
	}
  .video-item {
    margin-bottom: 25px;
	}

	.title-section {
    margin-bottom: 15px;
	}

	.video-title {
		display: block;
		font-size: 15px;
		color: #0279d3;
		text-decoration: none;
		font-weight: bold;
		margin-bottom: 8px;
	}

	.timestamp-link {
			display: inline-block;
			margin: 3px 6px 3px 0;
			padding: 4px 8px;
			font-size: 14px;
			background-color: #0056b3;
			color: white;
			text-decoration: none;
			border-radius: 5px;
			transition: background-color 0.3s, color 0.3s;
	}

	.timestamp-link:hover, .timestamp-link:focus {
			background-color: #007bff;
			color: white;
			text-decoration: underline;
	}

	.timestamp-link:focus {
			outline: 2px solid #0056b3;
	}

</style>