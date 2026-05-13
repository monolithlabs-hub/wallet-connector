import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// vitest.shared.ts sets `globals: false`, so `@testing-library/react`'s
// auto-cleanup hook (which keys off the GLOBAL `afterEach`) never registers.
// Without this, every test that uses `render()` leaks its DOM into the next
// test — `screen.getByRole(...)` then trips over leftover nodes from prior
// cases. Calling `cleanup()` here pins the lifecycle for every React test
// in this package.
afterEach(() => {
  cleanup()
})
