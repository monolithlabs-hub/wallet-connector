import { useWallet } from '@monolithlabs/wallet-connect-react'

/**
 * Read-only inline display of the live wallet state — surfaces the
 * connected public key + SIWS signature + flow state + error directly
 * on the page (the `<ConnectButton>`'s modal already shows the public
 * key when the user clicks the connected button, but having it inline
 * makes the demo behavior obvious without a click).
 */
export function WalletInfo() {
  const { state, publicKey, signature, error, wallet } = useWallet()
  if (state === 'idle') return null

  return (
    <dl
      style={{
        margin: 0,
        display: 'grid',
        gridTemplateColumns: 'max-content 1fr',
        gap: '4px 12px',
        fontSize: 14,
        wordBreak: 'break-all',
      }}
    >
      <dt style={dtStyle}>state</dt>
      <dd style={ddStyle}>
        <code>{state}</code>
      </dd>

      {wallet ? (
        <>
          <dt style={dtStyle}>wallet</dt>
          <dd style={ddStyle}>{wallet.name}</dd>
        </>
      ) : null}

      {publicKey ? (
        <>
          <dt style={dtStyle}>publicKey</dt>
          <dd style={{ ...ddStyle, fontFamily: 'monospace' }}>{publicKey}</dd>
        </>
      ) : null}

      {signature ? (
        <>
          <dt style={dtStyle}>signature</dt>
          <dd style={{ ...ddStyle, fontFamily: 'monospace' }}>{signature}</dd>
        </>
      ) : null}

      {error ? (
        <>
          <dt style={dtStyle}>error</dt>
          <dd style={{ ...ddStyle, color: 'rgb(185, 28, 28)' }}>{error.message}</dd>
        </>
      ) : null}
    </dl>
  )
}

const dtStyle: React.CSSProperties = {
  margin: 0,
  fontWeight: 600,
  color: 'rgba(0,0,0,0.6)',
}

const ddStyle: React.CSSProperties = {
  margin: 0,
}
