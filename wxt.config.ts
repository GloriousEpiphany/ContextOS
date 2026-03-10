import { defineConfig } from 'wxt';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  manifest: {
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    version: '4.0.0',
    permissions: [
      'storage',
      'activeTab',
      'scripting',
      'contextMenus',
      'sidePanel',
      'offscreen',
      'notifications',
      'nativeMessaging',
      'tabs',
    ],
    optional_host_permissions: [
      'https://api.openai.com/*',
      'https://api.deepseek.com/*',
      'https://api.anthropic.com/*',
      'https://dashscope.aliyuncs.com/*',
    ],
    commands: {
      'capture-page': {
        suggested_key: {
          default: 'Ctrl+Shift+C',
          mac: 'Command+Shift+C',
        },
        description: 'Capture current page context',
      },
      'generate-prompt': {
        suggested_key: {
          default: 'Ctrl+Shift+P',
          mac: 'Command+Shift+P',
        },
        description: 'Generate and insert prompt',
      },
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
