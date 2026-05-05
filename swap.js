const { ethers } = require('ethers');
const {
  RPC_URL,
  WETH_ADDRESS,
  PRIVATE_KEYS,
  TARGET_TOKENS,
  sleep,
  randomInt,
  executeWallet,
} = require('./lib/swap-core');

async function main() {
  console.log(`[START] Mass Swap Bot - Sepolia Testnet`);
  console.log(`[CONFIG] Router: 0xBc93a9E52c76f38bB4369BBd4d5732f0047D7473`);
  console.log(`[CONFIG] WETH: ${WETH_ADDRESS}`);
  console.log(`[CONFIG] Wallet Count: ${PRIVATE_KEYS.length}`);
  console.log(`[CONFIG] Target Tokens: ${TARGET_TOKENS.length}`);

  if (PRIVATE_KEYS.length === 0) {
    console.error(`[FATAL] PRIVATE_KEYS not found in .env`);
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);

  try {
    const blockNumber = await provider.getBlockNumber();
    console.log(`[NETWORK] Connected. Block: ${blockNumber}\n`);
  } catch (err) {
    console.error(`[FATAL] Failed to connect to RPC: ${err.message}`);
    process.exit(1);
  }

  for (let i = 0; i < PRIVATE_KEYS.length; i++) {
    await executeWallet(PRIVATE_KEYS[i], provider, WETH_ADDRESS, TARGET_TOKENS);

    if (i < PRIVATE_KEYS.length - 1) {
      const delayMs = randomInt(60000, 300000);
      console.log(`\n[DELAY] Waiting ${Math.round(delayMs/1000)} seconds (~${(delayMs/60000).toFixed(1)} minutes) before next wallet...`);
      await sleep(delayMs);
    }
  }

  console.log(`\n[DONE] All wallets have been processed.`);
}

main().catch(err => {
  console.error(`[FATAL] Unhandled error: ${err}`);
  process.exit(1);
});
