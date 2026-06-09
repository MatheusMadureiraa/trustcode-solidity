// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title BipTrust
 * @notice escrow temporal com integração iot para locações
 */
contract BipTrust is Ownable, ReentrancyGuard, Pausable {

    // erros customizados
    error InvalidZeroAddress();
    error OnlyOracle();
    error OnlyClient();
    error InvalidStatus();
    error InvalidValue();
    error InspectionDeadlineNotPassed();
    error AbandonmentDeadlineNotPassed();
    error InsufficientBalance();

    // constantes do sistema
    uint256 public constant PRAZO_VISTORIA = 48 hours;
    uint256 public constant PRAZO_ABANDONO = 30 days;

    address public oracleIoT; // endereço autorizado do iot/backend
    uint256 public contadorAlugueis;

    enum Status { Criado, EmAndamento, AguardandoVistoria, Encerrado, Cancelado }

    // struct otimizada em storage -> usar menos slots possíveis
    struct Aluguel {
        uint256 valorCaucao;        // Slot 0: 256 bits
        uint256 multaPorSegundo;    // Slot 1: 256 bits
        address cliente;            // Slot 2: 160 bits
        uint48 timestampRetirada;   // Slot 2: 48 bits
        uint48 timestampDevolucao;  // Slot 2: 48 bits (Slot 2 full: 256 bits)
        uint256 duracaoContratada;  // Slot 3: 256 bits
        Status statusAtual;         // Slot 4: 8 bits
    }

    mapping(uint256 => Aluguel) public alugueis;
    mapping(address => uint256) public saldos; // saldo para saque posterior

    // eventos do sistema
    event OracleAtualizado(address indexed oracleAntigo, address indexed oracleNovo);
    event AluguelCriado(uint256 indexed id, address indexed cliente, uint256 valorCaucao);
    event RetiradaRegistrada(uint256 indexed id, uint256 timestampRetirada);
    event DevolucaoRegistrada(uint256 indexed id, uint256 timestampDevolucao);
    event VistoriaConfirmada(uint256 indexed id, uint256 retidoLocadora, uint256 liberadoCliente);
    event AutoLiberacaoExecutada(uint256 indexed id, address indexed cliente, uint256 valor);
    event AbandonoExecutado(uint256 indexed id, uint256 valorRetido);
    event AluguelCancelado(uint256 indexed id, address indexed cliente);
    event SaqueRealizado(address indexed usuario, uint256 valor);

    // valida oracle
    modifier apenasOracle() {
        if (msg.sender != oracleIoT) revert OnlyOracle();
        _;
    }

    // construtor com oracle inicial
    constructor(address _oracleIoT) Ownable(msg.sender) {
        if (_oracleIoT == address(0)) revert InvalidZeroAddress();
        oracleIoT = _oracleIoT;
    }

    // atualiza oracle
    function atualizarOracle(address _novoOracle) external onlyOwner {
        if (_novoOracle == address(0)) revert InvalidZeroAddress();
        address oracleAntigo = oracleIoT;
        oracleIoT = _novoOracle;
        emit OracleAtualizado(oracleAntigo, _novoOracle);
    }

    // pausa sistema
    function pausarContrato() external onlyOwner { _pause(); }
    function despausarContrato() external onlyOwner { _unpause(); }

    /**
     * cria aluguel com caução
     */
    function criarAluguel(uint256 _duracaoEmSegundos, uint256 _multaPorSegundo)
        external
        payable
        whenNotPaused
        returns (uint256)
    {
        if (msg.value == 0) revert InvalidValue();

        contadorAlugueis++;

        alugueis[contadorAlugueis] = Aluguel({
            valorCaucao: msg.value,
            multaPorSegundo: _multaPorSegundo,
            cliente: msg.sender,
            timestampRetirada: 0,
            timestampDevolucao: 0,
            duracaoContratada: _duracaoEmSegundos,
            statusAtual: Status.Criado
        });

        emit AluguelCriado(contadorAlugueis, msg.sender, msg.value);
        return contadorAlugueis;
    }

    /**
     * registra retirada via iot
     */
    function registrarRetirada(uint256 _id)
        external
        apenasOracle
        whenNotPaused
    {
        Aluguel storage aluguel = alugueis[_id];
        if (aluguel.statusAtual != Status.Criado) revert InvalidStatus();

        aluguel.timestampRetirada = uint48(block.timestamp);
        aluguel.statusAtual = Status.EmAndamento;

        emit RetiradaRegistrada(_id, block.timestamp);
    }

    /**
     * registra devolução via iot
     */
    function registrarDevolucao(uint256 _id)
        external
        apenasOracle
        whenNotPaused
    {
        Aluguel storage aluguel = alugueis[_id];
        if (aluguel.statusAtual != Status.EmAndamento) revert InvalidStatus();

        aluguel.timestampDevolucao = uint48(block.timestamp);
        aluguel.statusAtual = Status.AguardandoVistoria;

        emit DevolucaoRegistrada(_id, block.timestamp);
    }

    /**
     * liquidação da vistoria pela locadora
     */
    function confirmarVistoria(uint256 _id, uint256 _custoDanos)
        external
        onlyOwner
        nonReentrant
    {
        Aluguel storage aluguel = alugueis[_id];
        if (aluguel.statusAtual != Status.AguardandoVistoria) revert InvalidStatus();
        if (_custoDanos > aluguel.valorCaucao) revert InvalidValue();

        uint256 prazoLimite = aluguel.timestampRetirada + aluguel.duracaoContratada;
        uint256 multaAtraso = 0;

        if (aluguel.timestampDevolucao > prazoLimite) {
            uint256 segundosAtraso = aluguel.timestampDevolucao - prazoLimite;
            multaAtraso = segundosAtraso * aluguel.multaPorSegundo;
        }

        uint256 totalRetidoLocadora = multaAtraso + _custoDanos;
        uint256 reembolsoCliente = 0;

        if (totalRetidoLocadora > aluguel.valorCaucao) {
            totalRetidoLocadora = aluguel.valorCaucao;
        } else {
            reembolsoCliente = aluguel.valorCaucao - totalRetidoLocadora;
        }

        aluguel.statusAtual = Status.Encerrado;

        saldos[owner()] += totalRetidoLocadora;
        saldos[aluguel.cliente] += reembolsoCliente;

        emit VistoriaConfirmada(_id, totalRetidoLocadora, reembolsoCliente);
    }

    /**
     * liberação automática após atraso da vistoria
     */
    function autoLiberarCaucao(uint256 _id) external nonReentrant {
        Aluguel storage aluguel = alugueis[_id];

        if (msg.sender != aluguel.cliente) revert OnlyClient();
        if (aluguel.statusAtual != Status.AguardandoVistoria) revert InvalidStatus();
        if (block.timestamp <= aluguel.timestampDevolucao + PRAZO_VISTORIA)
            revert InspectionDeadlineNotPassed();

        aluguel.statusAtual = Status.Encerrado;
        saldos[aluguel.cliente] += aluguel.valorCaucao;

        emit AutoLiberacaoExecutada(_id, msg.sender, aluguel.valorCaucao);
    }

    /**
     * encerramento por abandono do bem
     */
    function encerrarPorAbandono(uint256 _id)
        external
        onlyOwner
        nonReentrant
    {
        Aluguel storage aluguel = alugueis[_id];
        if (aluguel.statusAtual != Status.EmAndamento) revert InvalidStatus();

        uint256 prazoLimite = aluguel.timestampRetirada + aluguel.duracaoContratada;
        if (block.timestamp <= prazoLimite + PRAZO_ABANDONO)
            revert AbandonmentDeadlineNotPassed();

        aluguel.statusAtual = Status.Encerrado;
        saldos[owner()] += aluguel.valorCaucao;

        emit AbandonoExecutado(_id, aluguel.valorCaucao);
    }

    /**
     * cancelamento antes da retirada
     */
    function cancelarAluguel(uint256 _id) external nonReentrant {
        Aluguel storage aluguel = alugueis[_id];

        if (msg.sender != aluguel.cliente) revert OnlyClient();
        if (aluguel.statusAtual != Status.Criado) revert InvalidStatus();

        aluguel.statusAtual = Status.Cancelado;

        uint256 valorReembolso = aluguel.valorCaucao;
        aluguel.valorCaucao = 0;

        saldos[msg.sender] += valorReembolso;

        emit AluguelCancelado(_id, msg.sender);
    }

    /**
     * saque do saldo acumulado
     */
    function sacar() external nonReentrant {
        uint256 valor = saldos[msg.sender];
        if (valor == 0) revert InsufficientBalance();

        saldos[msg.sender] = 0;

        (bool sucesso, ) = payable(msg.sender).call{value: valor}("");
        require(sucesso, "Transfer failed");

        emit SaqueRealizado(msg.sender, valor);
    }
}