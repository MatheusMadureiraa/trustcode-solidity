import { useEffect, useState } from 'react'
import { ethers } from 'ethers'
import { Cpu, Sparkles, Users, Wallet } from 'lucide-react'
import ClienteView from './components/ClienteView.jsx'
import LocadoraView from './components/LocadoraView.jsx'
import TotemIoTView from './components/TotemIoTView.jsx'
import { ABI, CONTRACT_ADDRESS } from './config.js'

const viewOptions = [
  { id: 'Cliente', label: 'Cliente', icon: Sparkles },
  { id: 'Totem IoT', label: 'Totem IoT', icon: Cpu },
  { id: 'Locadora', label: 'Locadora', icon: Users },
]

const periodOptions = [
  {
    label: '4 Horas',
    seconds: 14400,
    description: 'Rápido e efetivo para uso diário.',
    price: '0.05',
  },
  {
    label: '1 Final de Semana',
    seconds: 172800,
    description: 'Viagem curta com entrega no domingo.',
    price: '0.05',
  },
]

const statusLabels = {
  0: 'Caução Travada',
  1: 'Dirigindo',
  2: 'Encerrado',
}

function App() {
  const [account, setAccount] = useState('')
  const [view, setView] = useState('Cliente')
  const [selectedPeriod, setSelectedPeriod] = useState(periodOptions[0])
  const [clientBalance, setClientBalance] = useState('0')
  const [activeRent, setActiveRent] = useState(null)
  const [pendingReservation, setPendingReservation] = useState(null)
  const [totemBookingId, setTotemBookingId] = useState('')
  const [inspectorBookingId, setInspectorBookingId] = useState('')
  const [inspectionData, setInspectionData] = useState(null)
  const [damageCost, setDamageCost] = useState('0')
  const [contract, setContract] = useState(null)
  const [oracleAddress, setOracleAddress] = useState('')
  const [ownerAddress, setOwnerAddress] = useState('')
  const [loading, setLoading] = useState(false)
  const [toasts, setToasts] = useState([])
  const [now, setNow] = useState(Date.now())

  const isOracleAccount =
    account && oracleAddress && account.toLowerCase() === oracleAddress.toLowerCase()

  const isOwnerAccount =
    account && ownerAddress && account.toLowerCase() === ownerAddress.toLowerCase()

  useEffect(() => {
    if (!window.ethereum) return

    // Lê conta inicial
    window.ethereum
      .request({ method: 'eth_accounts' })
      .then((accounts) => {
        if (accounts.length > 0) initializeConnection(accounts[0])
      })
      .catch((error) => console.error(error))

    // Listener para mudanças de conta
    const handleAccountsChanged = (accounts) => {
      console.log('Contas mudaram no MetaMask:', accounts)
      if (accounts.length === 0) {
        setAccount('')
        setContract(null)
        setOwnerAddress('')
        setOracleAddress('')
      } else {
        // Aguarda um tick para garantir que MetaMask atualizou tudo
        setTimeout(() => initializeConnection(accounts[0]), 100)
      }
    }

    window.ethereum.on('accountsChanged', handleAccountsChanged)
    return () => window.ethereum?.removeListener('accountsChanged', handleAccountsChanged)
  }, [])

  useEffect(() => {
    if (!activeRent) return undefined
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [activeRent])

  useEffect(() => {
    if (!contract) return undefined

    const handleAluguelCriado = (id, cliente, valorCaucao) => {
      const rentId = String(id)
      const clientAddress = String(cliente).toLowerCase()
      const depositEth = ethers.formatEther(valorCaucao)

      if (account && account.toLowerCase() === clientAddress) {
        setPendingReservation({
          id: rentId,
          durationSeconds: selectedPeriod.seconds,
          label: selectedPeriod.label,
          depositEth,
        })
      }

      addToast('success', `Reserva criada: ${rentId}`)
    }

    const handleRetiradaRegistrada = (id, timestampRetirada) => {
      const rentId = String(id)
      const startTimestamp = Number(timestampRetirada) * 1000
      const reservation = pendingReservation
      const durationSeconds = reservation?.durationSeconds ?? selectedPeriod.seconds
      const label = reservation?.label ?? selectedPeriod.label
      const depositEth = reservation?.depositEth ?? '0.05'

      setActiveRent({
        id: rentId,
        status: 'Dirigindo',
        startTimestamp,
        durationSeconds,
        endTimestamp: startTimestamp + durationSeconds * 1000,
        label,
        depositEth,
      })
      setPendingReservation(null)
      addToast('info', `Check-in registrado: ${rentId}`)
    }

    const handleDevolucaoRegistrada = (id) => {
      const rentId = String(id)
      if (activeRent?.id === rentId) {
        setActiveRent((current) => ({ ...current, status: 'Aguardando Inspeção' }))
      }
      addToast('info', `Check-out registrado: ${rentId}`)
    }

    const handleAutoLiberacao = (id) => {
      const rentId = String(id)
      if (activeRent?.id === rentId) {
        setActiveRent((current) => ({ ...current, status: 'Encerrado' }))
      }
      refreshBalance(contract, account)
      addToast('success', `Liberação automática processada: ${rentId}`)
    }

    contract.on('AluguelCriado', handleAluguelCriado)
    contract.on('RetiradaRegistrada', handleRetiradaRegistrada)
    contract.on('DevolucaoRegistrada', handleDevolucaoRegistrada)
    contract.on('AutoLiberacaoExecutada', handleAutoLiberacao)

    return () => {
      contract.off('AluguelCriado', handleAluguelCriado)
      contract.off('RetiradaRegistrada', handleRetiradaRegistrada)
      contract.off('DevolucaoRegistrada', handleDevolucaoRegistrada)
      contract.off('AutoLiberacaoExecutada', handleAutoLiberacao)
    }
  }, [contract, account, pendingReservation, selectedPeriod])

  const addToast = (type, message) => {
    const id = `${Date.now()}-${Math.random()}`
    setToasts((current) => [...current, { id, type, message }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, 4200)
  }

  const initializeConnection = async (selectedAccount) => {
    try {
      if (!window.ethereum) {
        addToast('error', 'MetaMask não está disponível no navegador.')
        return
      }

      // Limpa estados antigos ao trocar de conta
      setActiveRent(null)
      setPendingReservation(null)
      setTotemBookingId('')
      setInspectorBookingId('')
      setInspectionData(null)
      setDamageCost('0')
      setClientBalance('0')

      const provider = new ethers.BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()
      const contractInstance = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer)
      
      // Lê oracle e owner ANTES de settar a conta
      let oracleAddr = ''
      let ownerAddr = ''
      
      try {
        const oracle = await contractInstance.oracleIoT()
        oracleAddr = String(oracle).toLowerCase()
      } catch (oracleError) {
        console.warn('Erro ao ler oracle:', oracleError)
      }
      
      try {
        const owner = await contractInstance.owner()
        ownerAddr = String(owner).toLowerCase()
        console.log('Owner lido do contrato:', ownerAddr)
        console.log('Conta atual:', selectedAccount.toLowerCase())
      } catch (ownerError) {
        console.warn('Erro ao ler owner do contrato:', ownerError)
      }

      // Agora setta tudo junto
      setContract(contractInstance)
      setOracleAddress(oracleAddr)
      setOwnerAddress(ownerAddr)
      setAccount(selectedAccount)
      
      await refreshBalance(contractInstance, selectedAccount)
    } catch (error) {
      console.error(error)
      addToast('error', 'Falha ao inicializar a conexão.')
    }
  }

  const connectWallet = async () => {
    try {
      if (!window.ethereum) {
        addToast('error', 'Instale MetaMask para continuar.')
        return
      }
      const [selectedAccount] = await window.ethereum.request({ method: 'eth_requestAccounts' })
      await initializeConnection(selectedAccount)
    } catch (error) {
      console.error(error)
      addToast('error', 'Erro ao conectar carteira.')
    }
  }

  const disconnectWallet = () => {
    setAccount('')
    setContract(null)
    setOracleAddress('')
    setOwnerAddress('')
    setActiveRent(null)
    setPendingReservation(null)
    setTotemBookingId('')
    setInspectorBookingId('')
    setInspectionData(null)
    setDamageCost('0')
    setClientBalance('0')
    addToast('info', 'Carteira desconectada. Conecte outra conta para simular novos cenários.')
  }

  const refreshBalance = async (contractInstance, address) => {
    try {
      const rawBalance = await contractInstance.saldos(address)
      const formatted = ethers.formatEther(rawBalance ?? 0n)
      setClientBalance(formatted)
    } catch (error) {
      console.warn('Falha ao buscar saldo:', error)
    }
  }

  const createAluguel = async () => {
    if (!contract) {
      addToast('error', 'Conecte a carteira antes de criar o aluguel.')
      return
    }

    try {
      setLoading(true)
      const depositValue = ethers.parseEther('0.05')
      const penaltyPerSecond = ethers.parseUnits('1', 'gwei')
      const tx = await contract.criarAluguel(selectedPeriod.seconds, penaltyPerSecond, {
        value: depositValue,
      })
      const receipt = await tx.wait()
      let createdId = null

      for (const log of receipt.logs) {
        try {
          const parsed = contract.interface.parseLog(log)
          if (parsed.name === 'AluguelCriado') {
            createdId = String(parsed.args.id)
            break
          }
        } catch (error) {
          // ignora logs que não batem com o evento
        }
      }

      setPendingReservation({
        id: createdId,
        durationSeconds: selectedPeriod.seconds,
        label: selectedPeriod.label,
        depositEth: selectedPeriod.price,
      })

      addToast(
        'success',
        createdId
          ? `Reserva criada: ${createdId}. Aproxime a chave no Totem para iniciar.`
          : 'Reserva criada. Aproxime a chave no Totem para iniciar.'
      )
    } catch (error) {
      console.error(error)
      addToast('error', 'Falha ao reservar.')
    } finally {
      setLoading(false)
    }
  }

  const sacar = async () => {
    if (!contract) {
      addToast('error', 'Conecte a carteira para sacar.')
      return
    }
    try {
      setLoading(true)
      const tx = await contract.sacar()
      await tx.wait()
      await refreshBalance(contract, account)
      addToast('success', 'Saque enviado para a carteira.')
    } catch (error) {
      console.error(error)
      addToast('error', 'Falha ao sacar.')
    } finally {
      setLoading(false)
    }
  }

  const autoLiberarCaucao = async () => {
    if (!contract) {
      addToast('error', 'Conecte a carteira para liberar a caução.')
      return
    }
    if (!activeRent?.id) {
      addToast('error', 'Não há aluguel ativo para liberar.')
      return
    }

    try {
      setLoading(true)
      // Tenta chamar autoLiberarCaucao (apenas no contrato original, não no Test)
      if (contract.autoLiberarCaucao) {
        const tx = await contract.autoLiberarCaucao(BigInt(activeRent.id))
        await tx.wait()
        await refreshBalance(contract, account)
        addToast('success', 'Pedido de liberação enviado. O contrato libera se o prazo já passou.')
      } else {
        addToast('info', 'Auto-liberação não disponível. Use o tablet da Locadora para confirmar a vistoria.')
      }
    } catch (error) {
      console.error(error)
      addToast('error', 'Falha ao solicitar auto-liberação.')
    } finally {
      setLoading(false)
    }
  }

  const ensureOracle = () => {
    if (!account) {
      addToast('error', 'Conecte a carteira Oracle IoT para usar o Totem.')
      return false
    }
    if (!oracleAddress) {
      addToast('error', 'Aguarde a leitura do endereço Oracle IoT.')
      return false
    }
    if (!isOracleAccount) {
      addToast('error', `Use a conta Oracle IoT: ${oracleAddress}`)
      return false
    }
    return true
  }

  const parseBookingId = (value) => {
    const trimmed = value.trim()
    if (!/^[0-9]+$/.test(trimmed)) {
      addToast('error', 'Use um ID de reserva numérico válido.')
      return null
    }
    return BigInt(trimmed)
  }

  const registrarRetirada = async () => {
    if (!ensureOracle()) return
    const id = parseBookingId(totemBookingId)
    if (id === null) return

    try {
      setLoading(true)
      const tx = await contract.registrarRetirada(id)
      await tx.wait()
      setTotemBookingId('')
      addToast('success', 'Check-in IoT registrado com sucesso.')
    } catch (error) {
      console.error(error)
      addToast('error', 'Falha ao registrar retirada.')
    } finally {
      setLoading(false)
    }
  }

  const registrarDevolucao = async () => {
    if (!ensureOracle()) return
    const id = parseBookingId(totemBookingId)
    if (id === null) return

    try {
      setLoading(true)
      const tx = await contract.registrarDevolucao(id)
      await tx.wait()
      setTotemBookingId('')
      addToast('success', 'Check-out IoT registrado com sucesso.')
    } catch (error) {
      console.error(error)
      addToast('error', 'Falha ao registrar devolução.')
    } finally {
      setLoading(false)
    }
  }

  const fetchRentalStatus = async (bookingId) => {
    if (!contract) {
      addToast('error', 'Conecte a carteira antes de consultar reserva.')
      return null
    }

    try {
      const rent = await contract.alugueis(bookingId)
      return {
        id: String(bookingId),
        status: Number(rent.statusAtual ?? 0n),
        statusLabel: statusLabels[Number(rent.statusAtual ?? 0n)] || 'Desconhecido',
        client: String(rent.cliente),
        depositEth: ethers.formatEther(rent.valorCaucao ?? 0n),
        rentedForSeconds: Number(rent.duracaoContratada ?? 0n),
        startTimestamp: Number(rent.timestampRetirada ?? 0n) * 1000,
        endTimestamp: Number(rent.timestampDevolucao ?? 0n) * 1000,
      }
    } catch (error) {
      console.error(error)
      addToast('error', 'Reserva não encontrada no contrato.')
      return null
    }
  }

  const searchRental = async () => {
    const id = parseBookingId(inspectorBookingId)
    if (id === null) return
    const data = await fetchRentalStatus(id)
    if (data) {
      setInspectionData(data)
    }
  }

  const confirmVistoria = async () => {
    const id = parseBookingId(inspectorBookingId)
    if (id === null) return
    if (!contract) {
      addToast('error', 'Conecte a carteira para confirmar vistoria.')
      return
    }
    if (!isOwnerAccount) {
      addToast('error', `Use a conta owner para confirmar a vistoria: ${ownerAddress || 'desconhecida'}`)
      return
    }
    if (Number(damageCost) < 0) {
      addToast('error', 'O custo de danos não pode ser negativo.')
      return
    }

    try {
      setLoading(true)
      const amount = ethers.parseEther(damageCost || '0')
      const tx = await contract.confirmarVistoria(id, amount)
      await tx.wait()
      addToast('success', 'Assinatura da vistoria enviada para a blockchain.')
      setInspectionData((current) => current && { ...current, statusLabel: 'Encerrado' })
      setDamageCost('0')
    } catch (error) {
      const reason =
        error?.data?.message || error?.reason || error?.message || error?.error?.message || String(error)
      console.error('confirmVistoria error', error)
      addToast('error', `Falha ao assinar vistoria: ${reason}`)
    } finally {
      setLoading(false)
    }
  }

  const playBeep = () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext
      const audioCtx = new AudioContext()
      const oscillator = audioCtx.createOscillator()
      const gain = audioCtx.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(900, audioCtx.currentTime)
      gain.gain.setValueAtTime(0.14, audioCtx.currentTime)
      oscillator.connect(gain)
      gain.connect(audioCtx.destination)
      oscillator.start()
      oscillator.stop(audioCtx.currentTime + 0.08)
    } catch (error) {
      console.warn('Áudio não disponível', error)
    }
  }

  return (
    <div className="app-shell">
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast-card toast-${toast.type}`}>
            <p>{toast.message}</p>
          </div>
        ))}
      </div>

      <header className="topbar">
        <div>
          <p className="eyebrow">BipTrust</p>
          <h1 className="page-title">Bipou, alugou. Bipou, recebeu.</h1>
          <p className="page-copy">
            O fluxo de caução instantâneo para aluguéis premium. A blockchain registra o tempo de retirada e devolução sem confiar em ninguém.
          </p>
        </div>

        <div className="topbar-actions">
          {account ? (
            <>
              <button className="button button-secondary topbar-button" type="button" onClick={disconnectWallet}>
                Desconectar
              </button>
              <span className="status-pill">{`${account.slice(0, 6)}...${account.slice(-4)}`}</span>
            </>
          ) : (
            <button className="button button-cyan topbar-button" type="button" onClick={connectWallet}>
              <Wallet className="icon-small" />
              Conectar MetaMask
            </button>
          )}
          <span className="status-pill">{account ? 'Carteira conectada' : 'Carteira desconectada'}</span>
        </div>
      </header>

      <nav className="topnav" aria-label="Modo de visão">
        {viewOptions.map((option) => {
          const Icon = option.icon
          return (
            <button
              key={option.id}
              type="button"
              className={`topnav-button ${view === option.id ? 'active' : ''}`}
              onClick={() => setView(option.id)}
            >
              <Icon className="icon-small" />
              {option.label}
            </button>
          )
        })}
      </nav>

      <main className="page-content">
        {view === 'Cliente' && (
          <ClienteView
            activeRent={activeRent}
            pendingReservation={pendingReservation}
            clientBalance={clientBalance}
            selectedPeriod={selectedPeriod}
            periodOptions={periodOptions}
            setSelectedPeriod={setSelectedPeriod}
            createAluguel={createAluguel}
            sacar={sacar}
            autoLiberarCaucao={autoLiberarCaucao}
            loading={loading}
            now={now}
          />
        )}

        {view === 'Totem IoT' && (
          <TotemIoTView
            keyId={totemBookingId}
            setKeyId={setTotemBookingId}
            registrarRetirada={registrarRetirada}
            registrarDevolucao={registrarDevolucao}
            loading={loading}
            isOracleAccount={isOracleAccount}
            oracleAddress={oracleAddress}
            playBeep={playBeep}
          />
        )}

        {view === 'Locadora' && (
          <LocadoraView
            bookingId={inspectorBookingId}
            setBookingId={setInspectorBookingId}
            inspectionData={inspectionData}
            searchRental={searchRental}
            damageCost={damageCost}
            setDamageCost={setDamageCost}
            confirmVistoria={confirmVistoria}
            loading={loading}
            isOwnerAccount={isOwnerAccount}
            ownerAddress={ownerAddress}
          />
        )}
      </main>
    </div>
  )
}

export default App
