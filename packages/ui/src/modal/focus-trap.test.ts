import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createFocusTrap, getFocusableElements } from './focus-trap'

let root: HTMLDivElement

beforeEach(() => {
  root = document.createElement('div')
  document.body.appendChild(root)
})

afterEach(() => {
  root.remove()
})

describe('getFocusableElements', () => {
  it('returns focusable descendants in DOM order', () => {
    root.innerHTML = `
      <button id="b1">b1</button>
      <a id="a1" href="#">a1</a>
      <input id="i1" />
      <select id="s1"><option /></select>
      <textarea id="t1"></textarea>
      <div id="d1" tabindex="0"></div>
    `
    const ids = getFocusableElements(root).map((el) => el.id)
    expect(ids).toEqual(['b1', 'a1', 'i1', 's1', 't1', 'd1'])
  })

  it('excludes disabled form controls', () => {
    root.innerHTML = `
      <button id="b1">b1</button>
      <button id="b2" disabled>b2</button>
      <input id="i1" disabled />
    `
    const ids = getFocusableElements(root).map((el) => el.id)
    expect(ids).toEqual(['b1'])
  })

  it('excludes elements with tabindex="-1"', () => {
    root.innerHTML = `
      <button id="b1">b1</button>
      <div id="d1" tabindex="-1"></div>
      <div id="d2" tabindex="0"></div>
    `
    const ids = getFocusableElements(root).map((el) => el.id)
    expect(ids).toEqual(['b1', 'd2'])
  })

  it('returns an empty array for null or undefined-like roots', () => {
    expect(getFocusableElements(null)).toEqual([])
  })

  it('returns an empty array when the root has no focusable descendants', () => {
    root.innerHTML = '<div>no focus</div><span>here</span>'
    expect(getFocusableElements(root)).toEqual([])
  })

  it('includes anchors with href and area[href]', () => {
    root.innerHTML = `
      <a id="a1" href="#anchor">a1</a>
      <a id="a2">a2 (no href)</a>
      <area id="ar1" href="#" />
    `
    const ids = getFocusableElements(root).map((el) => el.id)
    expect(ids).toEqual(['a1', 'ar1'])
  })

  it('includes contenteditable elements (and excludes contenteditable="false")', () => {
    root.innerHTML = `
      <div id="c1" contenteditable></div>
      <div id="c2" contenteditable="true"></div>
      <div id="c3" contenteditable="false"></div>
    `
    const ids = getFocusableElements(root).map((el) => el.id)
    expect(ids).toEqual(['c1', 'c2'])
  })

  it('includes audio[controls] and video[controls]', () => {
    root.innerHTML = `
      <audio id="a1" controls></audio>
      <audio id="a2"></audio>
      <video id="v1" controls></video>
      <video id="v2"></video>
    `
    const ids = getFocusableElements(root).map((el) => el.id)
    expect(ids).toEqual(['a1', 'v1'])
  })

  it('includes details > summary', () => {
    root.innerHTML = `
      <details>
        <summary id="s1">Click</summary>
        <p>body</p>
      </details>
    `
    const ids = getFocusableElements(root).map((el) => el.id)
    expect(ids).toEqual(['s1'])
  })

  it('includes iframe', () => {
    root.innerHTML = `<iframe id="f1" title="x"></iframe>`
    const ids = getFocusableElements(root).map((el) => el.id)
    expect(ids).toEqual(['f1'])
  })
})

describe('createFocusTrap', () => {
  beforeEach(() => {
    root.innerHTML = `
      <button id="first">first</button>
      <button id="middle">middle</button>
      <button id="last">last</button>
    `
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

  it('cycles Tab from the last focusable back to the first', () => {
    const trap = createFocusTrap({ root })
    const first = root.querySelector<HTMLButtonElement>('#first')!
    const last = root.querySelector<HTMLButtonElement>('#last')!

    last.focus()
    const event = dispatchKey('Tab')

    expect(event.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(first)
    trap.destroy()
  })

  it('cycles Shift+Tab from the first focusable back to the last', () => {
    const trap = createFocusTrap({ root })
    const first = root.querySelector<HTMLButtonElement>('#first')!
    const last = root.querySelector<HTMLButtonElement>('#last')!

    first.focus()
    const event = dispatchKey('Tab', { shiftKey: true })

    expect(event.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(last)
    trap.destroy()
  })

  it('does NOT preventDefault on Tab when focus is on a middle element', () => {
    const trap = createFocusTrap({ root })
    const middle = root.querySelector<HTMLButtonElement>('#middle')!

    middle.focus()
    const event = dispatchKey('Tab')

    // Native browser handles Tab → next; we don't interfere.
    expect(event.defaultPrevented).toBe(false)
    trap.destroy()
  })

  it('brings focus back into the trap when Tab fires from outside', () => {
    const trap = createFocusTrap({ root })
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    const first = root.querySelector<HTMLButtonElement>('#first')!

    outside.focus()
    dispatchKey('Tab')

    expect(document.activeElement).toBe(first)
    outside.remove()
    trap.destroy()
  })

  it('blocks Tab entirely when the trap has no focusable elements', () => {
    root.innerHTML = '<p>nothing focusable</p>'
    const trap = createFocusTrap({ root })

    const event = dispatchKey('Tab')

    expect(event.defaultPrevented).toBe(true)
    trap.destroy()
  })

  it('fires onEscape on Escape and preventDefaults the event', () => {
    let escaped = 0
    const trap = createFocusTrap({ root, onEscape: () => escaped++ })

    const event = dispatchKey('Escape')

    expect(escaped).toBe(1)
    expect(event.defaultPrevented).toBe(true)
    trap.destroy()
  })

  it('ignores Escape when no onEscape is provided', () => {
    const trap = createFocusTrap({ root })

    const event = dispatchKey('Escape')

    expect(event.defaultPrevented).toBe(false)
    trap.destroy()
  })

  it('ignores non-Tab non-Escape keys', () => {
    const trap = createFocusTrap({ root })
    const middle = root.querySelector<HTMLButtonElement>('#middle')!

    middle.focus()
    const event = dispatchKey('Enter')

    expect(event.defaultPrevented).toBe(false)
    expect(document.activeElement).toBe(middle)
    trap.destroy()
  })

  it('destroy() is idempotent and removes the keydown listener', () => {
    let escaped = 0
    const trap = createFocusTrap({ root, onEscape: () => escaped++ })

    trap.destroy()
    trap.destroy() // second call no-ops

    dispatchKey('Escape')
    expect(escaped).toBe(0)
  })

  it('returns a no-op trap when `document` is undefined (SSR)', () => {
    vi.stubGlobal('document', undefined)
    try {
      const trap = createFocusTrap({ root })
      // The destroy function should exist and be idempotent.
      expect(() => trap.destroy()).not.toThrow()
      expect(() => trap.destroy()).not.toThrow()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('reads the focusable list LIVE on each keydown', () => {
    // Add another button AFTER attach; the trap should still know about it.
    const trap = createFocusTrap({ root })
    const newLast = document.createElement('button')
    newLast.id = 'newLast'
    root.appendChild(newLast)

    newLast.focus()
    dispatchKey('Tab')

    expect(document.activeElement?.id).toBe('first')
    trap.destroy()
  })
})
