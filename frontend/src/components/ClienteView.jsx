import { CheckCircle2 } from 'lucide-react'

export default function ClienteView({
  activeRent,
  pendingReservation,
  clientBalance,
  selectedPeriod,
  periodOptions,
  setSelectedPeriod,
  createAluguel,
  sacar,
  autoLiberarCaucao,
  loading,
  now,
}) {
  const hasActive = Boolean(activeRent)
  const hasPending = Boolean(pendingReservation) && !hasActive

  const elapsedSeconds = hasActive
    ? Math.floor((now - activeRent.startTimestamp) / 1000)
    : 0
  const remainingSeconds = hasActive
    ? Math.max(0, activeRent.durationSeconds - elapsedSeconds)
    : 0
  const progress = hasActive
    ? Math.min(100, (elapsedSeconds / activeRent.durationSeconds) * 100)
    : 0

  const formatTimer = (seconds) => {
    const hours = String(Math.floor(seconds / 3600)).padStart(2, '0')
    const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')
    const secs = String(seconds % 60).padStart(2, '0')
    return `${hours}:${minutes}:${secs}`
  }

  const formattedEnd = hasActive
    ? new Date(activeRent.endTimestamp).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : ''

  return (
    <div className="glass-card showroom-card">
      <div className="section-header">
        <div>
          <h2 className="section-title">Showroom do Cliente</h2>
          <p className="section-subtitle">
            Trave a caução, libere o carro com um bip e receba o saldo de volta automaticamente.
          </p>
        </div>
        <CheckCircle2 className="icon-small text-cyan-300" />
      </div>

      {!hasActive && !hasPending ? (
        <div className="showroom-body">
          <div className="car-card">
            <div className="car-art" />
            <div className="car-meta">
              <span className="tag tag-glow">Experiência Premium</span>
              <h3>Alugue um veículo premium sem burocracia.</h3>
              <p>A blockchain bloqueia sua caução, o Totem registra o check-in e a devolução é automática.</p>
            </div>
          </div>

          <div className="glass-panel-inner showroom-actions">
            <label className="label-text">Duração do aluguel</label>
            <div className="period-grid">
              {periodOptions.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  className={`period-pill ${selectedPeriod.label === option.label ? 'active' : ''}`}
                  onClick={() => setSelectedPeriod(option)}
                >
                  <span>{option.label}</span>
                  <small>{option.description}</small>
                </button>
              ))}
            </div>

            <div className="vault-summary">
              <div>
                <p className="label-text">Escrow obrigatório</p>
                <strong>0.05 ETH</strong>
              </div>
              <div>
                <p className="label-text">Late fee</p>
                <strong>Calculado pelo contrato</strong>
              </div>
            </div>

            <button
              className="button button-primary button-block"
              type="button"
              onClick={createAluguel}
              disabled={loading}
            >
              {loading ? 'Processando...' : `Bloquear caução e reservar (${selectedPeriod.price} ETH)`}
            </button>
          </div>
        </div>
      ) : hasPending ? (
        <div className="glass-panel-inner pending-state">
          <div className="status-banner status-active">
            <div>
              <p className="status-small">Reserva ativa</p>
              <h3 className="status-title">Aguardando IoT Check-in</h3>
            </div>
            <span className="status-pill status-info">{pendingReservation.label}</span>
          </div>

          <div className="status-grid">
            <div className="status-item">
              <span>ID da reserva</span>
              <strong>{pendingReservation.id ?? 'Aguardando evento'}</strong>
            </div>
            <div className="status-item">
              <span>Caução bloqueada</span>
              <strong>{pendingReservation.depositEth} ETH</strong>
            </div>
            <div className="status-item">
              <span>Prazo</span>
              <strong>{pendingReservation.label}</strong>
            </div>
          </div>

          <p className="helper-text">
            A reserva foi criada. Passe o chaveiro no Totem para registrar o início no blockchain.
          </p>
        </div>
      ) : (
        <div className="glass-panel-inner digital-key-state">
          <div className="status-banner status-driving">
            <div>
              <p className="status-small">Digital Key</p>
              <h3 className="status-title">{activeRent.label}</h3>
            </div>
            <span className="status-pill status-success">{activeRent.status}</span>
          </div>

          <div className="countdown-card">
            <span className="countdown-label">Tempo restante</span>
            <strong className="countdown-value">{formatTimer(remainingSeconds)}</strong>
            <span className="countdown-note">Fim do aluguel: {formattedEnd}</span>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>

          <div className="status-grid">
            <div className="status-item">
              <span>Depósito</span>
              <strong>{activeRent.depositEth} ETH</strong>
            </div>
            <div className="status-item">
              <span>Check-in</span>
              <strong>{new Date(activeRent.startTimestamp).toLocaleString('pt-BR')}</strong>
            </div>
            <div className="status-item">
              <span>Late fee</span>
              <strong>Automático no contrato</strong>
            </div>
          </div>

          {activeRent.status === 'Aguardando Inspeção' && (
            <div className="alert-panel info-panel">
              <p>
                O carro já saiu, mas a caução só é liberada quando a locadora confirmar a vistoria ou quando o prazo de 48h expirar.
              </p>
              <button
                className="button button-secondary button-block"
                type="button"
                onClick={autoLiberarCaucao}
                disabled={loading}
              >
                {loading ? 'Aguardando...' : 'Solicitar auto-liberação 48h'}
              </button>
            </div>
          )}
        </div>
      )}

      {Number(clientBalance) > 0 && (
        <div className="vault-card">
          <div className="cofre-copy">
            <p className="cofre-title">Seu Cofre</p>
            <p className="cofre-subtitle">Saldo liberado pronto para retirar.</p>
          </div>
          <div className="cofre-action">
            <strong>{clientBalance} ETH</strong>
            <button
              className="button button-success"
              type="button"
              onClick={sacar}
              disabled={loading}
            >
              {loading ? 'Processando...' : 'Retirar caução liberada'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
