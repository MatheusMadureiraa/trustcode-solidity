const hre = require("hardhat");
require("dotenv").config(); // Garante o carregamento do .env

async function main() {
  console.log("Iniciando o deploy do BipTrust na rede Sepolia...");

  // carteira configurada no hardhat.config.js (Locadora/Owner)
  const [deployer] = await hre.ethers.getSigners();
  console.log("Fazendo deploy com a conta:", deployer.address);

  const saldo = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Saldo da conta (Sepolia ETH):", hre.ethers.formatEther(saldo));

  // Puxa o endereço da segunda conta metamask (totem do Oracle IoT) do .env
  const enderecoOracleIoT = process.env.ORACLE_IOT_ADDRESS; 

  // Trava de segurança caso a variável não exista no .env
  if (!enderecoOracleIoT) {
    console.error("❌ ERRO: ORACLE_IOT_ADDRESS não foi configurado no arquivo .env");
    process.exit(1);
  }

  const BipTrust = await hre.ethers.getContractFactory("BipTrust");
  
  // deploy passando o construtor
  const bipTrust = await BipTrust.deploy(enderecoOracleIoT);

  // aguarda o contrato ser minerado no bloco
  await bipTrust.waitForDeployment();

  const contractAddress = await bipTrust.getAddress();
  
  console.log("✅ BipTrust deployado com SUCESSO!");
  console.log("Endereço do Contrato:", contractAddress);
  console.log("Endereço do Oracle IoT:", enderecoOracleIoT);
  
  // imprime instruções para o README
  console.log("\n--- dados abaixo para o frontend ---");
  console.log(`const CONTRACT_ADDRESS = "${contractAddress}";`);
}

// tratar de erros padrão do Hardhat
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});