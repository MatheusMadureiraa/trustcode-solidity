import { useEffect, useState } from 'react'
import { Wifi } from 'lucide-react'

export default function TotemIoTView({
  keyId,
  setKeyId,
  registrarRetirada,
  registrarDevolucao,
  loading,
  isOracleAccount,
  oracleAddress,
  playBeep,
}) {
  const [waveActive, setWaveActive] = useState(false)

  useEffect(() => {
    if (!waveActive) return undefined
    const timeout = window.setTimeout(() => setWaveActive(false), 600)
    return () => window.clearTimeout(timeout)
  }, [waveActive])

  const dispatchAction = async (action) => {
    setWaveActive(true)
    playBeep()
    await action()
  }

  return (
    <div className="glass-card totem-card">
      <div className="section-header">
        <div>
          <h2 className="section-title">Totem IoT</h2>
          <p className="section-subtitle">
            Painel de parede para o check-in e check-out físico do carro.
          </p>
        </div>
        <Wifi className="icon-small text-cyan-300" />
      </div>

      <div className="glass-panel-inner totem-body">
        <div className="scanner-hub">
          <div className={`scanner-ring ${waveActive ? 'active' : ''}`} />
          <div className="scanner-core" />
          <span className="scanner-label">Passe o objeto aqui</span>
        </div>

        <label className="label-text">ID da Reserva</label>
        <input
          type="text"
          className="input input-terminal"
          value={keyId}
          onChange={(event) => setKeyId(event.target.value)}
          placeholder="0001"
        />

        <div className="totem-buttons">
          <button
            type="button"
            className="button button-cyan button-block"
            onClick={() => dispatchAction(registrarRetirada)}
            disabled={loading || !isOracleAccount}
          >
            Bipar Check-in
          </button>
          <button
            type="button"
            className="button button-warning button-block"
            onClick={() => dispatchAction(registrarDevolucao)}
            disabled={loading || !isOracleAccount}
          >
            Bipar Check-out
          </button>
        </div>

        {!isOracleAccount && (
          <div className="kiosk-warning">
            <strong>Conta não autorizada</strong>
            <p>
              O Totem exige a conta Oracle IoT. Conecte a carteira {oracleAddress || 'certa'}.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
