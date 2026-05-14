import { createRoot } from 'react-dom/client'

import { App } from './App'

const root = document.getElementById('root')
if (!root) throw new Error('#root element missing')

// NOTE: Intentionally NOT wrapping in `<StrictMode>`. The Provider's
// `useEffect` cleanup destroys the manager during StrictMode's
// dev-only mount→unmount→remount cycle, and the next render then
// touches the destroyed manager (`WalletManager has been destroyed`).
// Known limitation documented in CLAUDE.md TASK-202 + Phase 2 review.
// The eventual `<WalletConnectProvider manager={...}>` API (planned
// post-Phase 7) will let consumers construct the manager outside the
// component and dodge this entirely.
createRoot(root).render(<App />)
