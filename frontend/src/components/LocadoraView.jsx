import { ShieldCheck } from 'lucide-react'

export default function LocadoraView({
  bookingId,
  setBookingId,
  inspectionData,
  searchRental,
  damageCost,
  setDamageCost,
  confirmVistoria,
  loading,
  isOwnerAccount,
  ownerAddress,
}) {
  const isReady = Boolean(inspectionData)

  return (
    <div className="glass-card inspector-card">
      <div className="section-header">
        <div>
          <h2 className="section-title">Tablet da Locadora</h2>
          <p className="section-subtitle">
            Verifique o retorno, assine a vistoria e libere a caução do cliente.
          </p>
        </div>
        <ShieldCheck className="icon-small text-cyan-300" />
      </div>

      <div className="glass-panel-inner inspector-body">
        <label className="label-text">Buscar reserva</label>
        <div className="inspector-search">
          <input
            type="text"
            className="input input-terminal"
            value={bookingId}
            onChange={(event) => setBookingId(event.target.value)}
            placeholder="Digite o ID da reserva"
          />
          <button
            type="button"
            className="button button-primary"
            onClick={searchRental}
            disabled={loading || !bookingId}
          >
            Buscar
          </button>
        </div>

        {inspectionData ? (
          <div className="inspection-card">
            {!isOwnerAccount && ownerAddress && (
              <div className="alert-panel warning-panel">
                <p>
                  Use a conta owner para confirmar a vistoria. Conta owner esperada:
                  <strong>{ownerAddress.slice(0, 6)}...{ownerAddress.slice(-4)}</strong>
                </p>
              </div>
            )}
            <div className="inspection-banner">
              <div>
                <p className="status-small">Reserva {inspectionData.id}</p>
                <h3 className="status-title">{inspectionData.statusLabel}</h3>
              </div>
              <span className="status-pill status-info">{inspectionData.statusLabel}</span>
            </div>

            <div className="status-grid">
              <div className="status-item">
                <span>Cliente</span>
                <strong>{inspectionData.client.slice(0, 8)}...{inspectionData.client.slice(-6)}</strong>
              </div>
              <div className="status-item">
                <span>Caução</span>
                <strong>{inspectionData.depositEth} ETH</strong>
              </div>
              <div className="status-item">
                <span>Duração</span>
                <strong>{Math.floor(inspectionData.rentedForSeconds / 3600)}h</strong>
              </div>
            </div>

            <label className="label-text">Custo por danos</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="input input-terminal"
              value={damageCost}
              onChange={(event) => setDamageCost(event.target.value)}
              placeholder="0.00"
            />

            <button
              type="button"
              className="button button-success button-block"
              onClick={confirmVistoria}
              disabled={loading || !isReady || !isOwnerAccount}
            >
              {loading ? 'Confirmando...' : 'Confirmar Vistoria'}
            </button>
          </div>
        ) : (
          <div className="empty-state">
            <p>Use o ID de reserva para carregar os detalhes da vistoria.</p>
          </div>
        )}
      </div>
    </div>
  )
}
