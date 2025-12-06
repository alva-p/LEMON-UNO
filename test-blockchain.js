console.log('Testing callSmartContract mock...');
import { callSmartContract, ChainId } from './frontend/src/lemon-mini-app-sdk.ts';

async function test() {
  const result = await callSmartContract({
    contracts: [{
      contractAddress: '0xf59d364968e71B45cc00191602fb1E26aA17b49e',
      functionName: 'createLobby',
      functionParams: ['0x0000000000000000000000000000000000000000', '1000000000000000000', '2'],
      value: '0',
      chainId: ChainId.BASE_SEPOLIA
    }]
  });
  console.log('Result:', result);
}

test();
