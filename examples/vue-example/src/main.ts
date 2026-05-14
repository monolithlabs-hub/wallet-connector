import { createApp } from 'vue'

import App from './App.vue'

const root = document.getElementById('app')
if (!root) throw new Error('#app element missing')

// Intentionally NOT installing the WalletConnectPlugin at the app level.
// Each demo component creates its own `WalletManager` via
// `createWalletManager(config)` and provides it via the
// `WalletConnectInjectionKey`, so the four scenarios are fully isolated
// (one manager per active route, destroyed on route change).
createApp(App).mount(root)
