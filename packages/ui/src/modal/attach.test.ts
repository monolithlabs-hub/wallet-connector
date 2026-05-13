import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { attachModal } from './attach'
import { __resetScrollLockForTests } from './scroll-lock'

let trigger: HTMLButtonElement
let root: HTMLDivElement

beforeEach(() => {
  __resetScrollLockForTests()
  trigger = document.createElement('button')
  trigger.id = 'trigger'
  document.body.appendChild(trigger)

  root = document.createElement('div')
  root.innerHTML = `
    <button id="close" aria-label="Close">×</button>
    <button id="action">Action</button>
  `
  document.body.appendChild(root)
})

afterEach(() => {
  __resetScrollLockForTests()
  trigger.remove()
  root.remove()
})

function dispatchKey(key: string, opts: { shiftKey?: boolean } = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    shiftKey: opts.shiftKey ?? false,
    bubbles: true,
    cancelable: true,
  })
  document.dispatchEvent(event)
  return event
}

describe('attachModal', () => {
  it('moves initial focus to the first focusable descendant by default', () => {
    trigger.focus()
    expect(document.activeElement).toBe(trigger)

    const handle = attachModal({ root, onRequestClose: () => undefined })

    expect(document.activeElement).toBe(root.querySelector('#close'))
    handle.destroy()
  })

  it('respects an explicit initialFocus element', () => {
    const action = root.querySelector<HTMLButtonElement>('#action')!
    const handle = attachModal({
      root,
      onRequestClose: () => undefined,
      initialFocus: action,
    })

    expect(document.activeElement).toBe(action)
    handle.destroy()
  })

  it('does NOT move focus when initialFocus is false', () => {
    trigger.focus()
    const handle = attachModal({
      root,
      onRequestClose: () => undefined,
      initialFocus: false,
    })

    expect(document.activeElement).toBe(trigger)
    handle.destroy()
  })

  it('locks body scroll on attach and restores on destroy', () => {
    expect(document.body.style.overflow).toBe('')
    const handle = attachModal({ root, onRequestClose: () => undefined })
    expect(document.body.style.overflow).toBe('hidden')

    handle.destroy()
    expect(document.body.style.overflow).toBe('')
  })

  it('skips scroll lock when scrollLock: false', () => {
    const handle = attachModal({
      root,
      onRequestClose: () => undefined,
      scrollLock: false,
    })

    expect(document.body.style.overflow).toBe('')
    handle.destroy()
  })

  it('fires onRequestClose on Escape', () => {
    let closed = 0
    const handle = attachModal({
      root,
      onRequestClose: () => closed++,
    })

    dispatchKey('Escape')
    expect(closed).toBe(1)
    handle.destroy()
  })

  it('traps Tab inside the dialog (last → first wrap)', () => {
    const handle = attachModal({ root, onRequestClose: () => undefined })

    const action = root.querySelector<HTMLButtonElement>('#action')!
    const close = root.querySelector<HTMLButtonElement>('#close')!

    action.focus()
    dispatchKey('Tab')

    expect(document.activeElement).toBe(close)
    handle.destroy()
  })

  it('restores focus to the previously-focused element on destroy', () => {
    trigger.focus()
    expect(document.activeElement).toBe(trigger)

    const handle = attachModal({ root, onRequestClose: () => undefined })
    // Focus moved into the dialog.
    expect(document.activeElement).not.toBe(trigger)

    handle.destroy()
    expect(document.activeElement).toBe(trigger)
  })

  it('skips focus restoration when restoreFocus: false', () => {
    trigger.focus()
    const handle = attachModal({
      root,
      onRequestClose: () => undefined,
      restoreFocus: false,
    })

    handle.destroy()
    // Focus is wherever the dialog left it, not the trigger.
    expect(document.activeElement).not.toBe(trigger)
  })

  it('destroy() is idempotent — second call is a no-op', () => {
    trigger.focus()
    const handle = attachModal({ root, onRequestClose: () => undefined })

    handle.destroy()
    expect(document.body.style.overflow).toBe('')
    expect(document.activeElement).toBe(trigger)

    // Second destroy should not throw, should not re-decrement the
    // scroll lock counter, should not re-focus the trigger.
    expect(() => handle.destroy()).not.toThrow()
    expect(document.body.style.overflow).toBe('')
  })

  it('returns a no-op handle when `document` is undefined (SSR)', () => {
    vi.stubGlobal('document', undefined)
    try {
      const handle = attachModal({ root, onRequestClose: () => undefined })
      expect(() => handle.destroy()).not.toThrow()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('composes — two nested modals each lock + release scroll exactly once', () => {
    const root2 = document.createElement('div')
    root2.innerHTML = '<button>inner</button>'
    document.body.appendChild(root2)

    const outer = attachModal({ root, onRequestClose: () => undefined })
    expect(document.body.style.overflow).toBe('hidden')

    const inner = attachModal({ root: root2, onRequestClose: () => undefined })
    expect(document.body.style.overflow).toBe('hidden')

    inner.destroy()
    // Outer still holds the scroll lock.
    expect(document.body.style.overflow).toBe('hidden')

    outer.destroy()
    expect(document.body.style.overflow).toBe('')

    root2.remove()
  })
})
