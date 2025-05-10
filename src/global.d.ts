/// <reference types="svelte" />
/// <reference types="vite/client" />


declare global {
    const chrome: typeof chrome;
    
    // YouTubeのPlayer APIをグローバルに定義
    interface Window {
        YT?: {
            Player?: any;
            PlayerState?: any;
        };
    }
}
  
declare const __APP_VERSION__: string