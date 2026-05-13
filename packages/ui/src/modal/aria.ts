/**
 * Standard ARIA attributes for a modal dialog. Spread onto the element
 * that the consumer renders as the dialog box (NOT the backdrop).
 *
 * @example
 * ```tsx
 * <div {...getDialogAttributes(titleId)} ref={dialogRef}>
 *   <h2 id={titleId}>Select a wallet</h2>
 *   ...
 * </div>
 * ```
 *
 * @example
 * ```vue
 * <div v-bind="getDialogAttributes(titleId)" ref="dialog">
 *   <h2 :id="titleId">Select a wallet</h2>
 *   ...
 * </div>
 * ```
 */
export interface DialogAriaAttributes {
  role: 'dialog'
  'aria-modal': 'true'
  'aria-labelledby': string
}

/**
 * Build the standard ARIA attribute bag for a modal dialog. `titleId`
 * must match the `id` of the element that names the dialog (typically
 * the `<h2>` title inside).
 */
export function getDialogAttributes(titleId: string): DialogAriaAttributes {
  return {
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': titleId,
  }
}
