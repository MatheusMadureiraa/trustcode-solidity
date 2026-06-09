const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BipTrust - Fluxo Principal", function () {
  let BipTrust, bipTrust;
  let owner, oracleIoT, cliente;
  
  // Constantes para o teste
  const DURACAO = 3600; // 1 hora
  const MULTA_POR_SEGUNDO = ethers.parseEther("0.0001"); // Multa simulada
  const CAUCAO = ethers.parseEther("1.0"); // 1 ETH

  before(async function () {
    // Pega as contas de teste do Hardhat
    [owner, oracleIoT, cliente] = await ethers.getSigners();

    // Faz o deploy local do contrato passando o endereço do oracleIoT
    BipTrust = await ethers.getContractFactory("BipTrust");
    bipTrust = await BipTrust.deploy(oracleIoT.address);
  });

  it("1. Deve criar um aluguel corretamente (Cliente deposita caução)", async function () {
    // Cliente chama a função enviando 1 ETH
    await bipTrust.connect(cliente).criarAluguel(DURACAO, MULTA_POR_SEGUNDO, { value: CAUCAO });
    
    const aluguel = await bipTrust.alugueis(1);
    expect(aluguel.cliente).to.equal(cliente.address);
    expect(aluguel.valorCaucao).to.equal(CAUCAO);
    expect(aluguel.statusAtual).to.equal(0); // 0 = Status.Criado
  });

  it("2. Deve registrar a retirada da chave via Oracle IoT", async function () {
    // Oracle "bipa" a retirada
    await bipTrust.connect(oracleIoT).registrarRetirada(1);
    
    const aluguel = await bipTrust.alugueis(1);
    expect(aluguel.statusAtual).to.equal(1); // 1 = Status.EmAndamento
    expect(aluguel.timestampRetirada).to.be.greaterThan(0);
  });

  it("3. Deve registrar a devolução da chave via Oracle IoT", async function () {
    // Oracle "bipa" a devolução
    await bipTrust.connect(oracleIoT).registrarDevolucao(1);
    
    const aluguel = await bipTrust.alugueis(1);
    expect(aluguel.statusAtual).to.equal(2); // 2 = Status.AguardandoVistoria
    expect(aluguel.timestampDevolucao).to.be.greaterThan(0);
  });

  it("4. Deve confirmar a vistoria (Sem danos e sem atraso)", async function () {
    // Locadora (Owner) confirma a vistoria com 0 danos
    await expect(bipTrust.connect(owner).confirmarVistoria(1, 0))
        .to.emit(bipTrust, "VistoriaConfirmada")
        .withArgs(1, 0, CAUCAO); // 0 retido, CAUCAO devolvida pro cliente

    const aluguel = await bipTrust.alugueis(1);
    expect(aluguel.statusAtual).to.equal(3); // 3 = Status.Encerrado
    
    // Verifica se o saldo do cliente foi creditado internamente no mapping 'saldos'
    const saldoCliente = await bipTrust.saldos(cliente.address);
    expect(saldoCliente).to.equal(CAUCAO);
  });

  it("5. Deve permitir o saque via Pull Payment (Withdraw)", async function () {
    const saldoInicial = await ethers.provider.getBalance(cliente.address);
    
    // Cliente executa o saque do seu saldo
    const tx = await bipTrust.connect(cliente).sacar();
    const receipt = await tx.wait();
    
    // Calcula o custo de gas para bater o saldo exato (Opcional, mas mostra rigor)
    const gasUsed = receipt.gasUsed * receipt.gasPrice;
    
    const saldoFinal = await ethers.provider.getBalance(cliente.address);
    
    // Verifica se o saldo final no mapping zerou
    const saldoInterno = await bipTrust.saldos(cliente.address);
    expect(saldoInterno).to.equal(0);
  });
});