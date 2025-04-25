import { defineManifest } from '@crxjs/vite-plugin'
import packageData from '../package.json'

export default defineManifest({
  name: packageData.name,
  description: packageData.description,
  version: packageData.version,
  manifest_version: 3,
  icons: {
    128: 'img/icon128.png',
  },
  action: {
    default_popup: 'src/popup/popup.html',
    default_icon: 'img/icon128.png',
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ["*://www.youtube.com/*"],
      js: ['src/content/index.ts'],
    },
  ],
  permissions: ['storage', 'activeTab', 'scripting'],
})