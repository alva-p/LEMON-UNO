const { ethers } = require('ethers');

// Configuración
const RPC_URL = 'https://eth-sepolia.g.alchemy.com/v2/djCt4b0Teyi7TdtLh4N2s';
const PRIVATE_KEY = '0xbec16796aa4b7f9c8d56c821e22d4d057075835e0f40c477fea269b8972f6cba';

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

// Direcciones mock para testing
const mockAddresses = [
  '0x4cd7c806e1d1dfca2db3725ce57273270771fcf1', // DEV_WALLET
  '0x742d35Cc6634C0532925a3b844Bc454e4438f44e', // Dirección mock 1
  '0xF39Fd6e51aad88F6F4ce6aB8827279cffFb92266', // Dirección mock 2
  '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', // Dirección mock 3
];

async function transferFunds() {
  console.log('🚀 Iniciando transferencias de fondos a direcciones mock...\n');
  
  const amount = ethers.parseEther('0.01'); // 0.01 ETH cada uno
  
  for (const address of mockAddresses) {
    try {
      console.log(`📤 Enviando 0.01 ETH a ${address}...`);
      
      const tx = await wallet.sendTransaction({
        to: address,
        value: amount,
      });
      
      console.log(`✅ Transacción enviada: ${tx.hash}`);
      await tx.wait();
      console.log(`✅ Transacción confirmada\n`);
      
    } catch (error) {
      console.error(`❌ Error enviando a ${address}:`, error.message);
    }
  }
  
  console.log('🎉 Transferencias completadas!');
}

transferFunds().catch(console.error);
