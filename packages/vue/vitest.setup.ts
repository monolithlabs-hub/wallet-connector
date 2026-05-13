import { enableAutoUnmount } from '@vue/test-utils'
import { afterEach } from 'vitest'

// `@vue/test-utils`' `mount()` returns a wrapper that doesn't auto-clean
// up between tests. `enableAutoUnmount(afterEach)` calls `wrapper.unmount()`
// after each test so components from prior tests don't linger (manager
// subscriptions stay registered, watchers stay attached, etc.). Mirrors
// the React package's `cleanup()` setup file.
//
// vitest.shared.ts sets `globals: false`, so we have to pass an
// explicit `afterEach` import — the auto-register variant of `enableAutoUnmount`
// keys off the global hook.
enableAutoUnmount(afterEach)
