const express = require('express');
const fs = require('fs');
const path = require('path');
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

const app = express();
const PORT = process.env.DAEMON_PORT || 3876;

let isRunning = false;

function writeSummary(results, startTime, endTime) {
  const summary = {
    startTime,
    endTime,
    durationSec: Math.round((new Date(endTime) - new Date(startTime)) / 1000),
    totalWallets: PRIVATE_KEYS.length,
    success: results.filter(r => r.status === 'success').length,
    failed: results.filter(r => r.status === 'failed' || r.status === 'error').length,
    skipped: results.filter(r => r.status === 'skipped').length,
    wallets: results.map(r => ({
      address: r.address,
      status: r.status,
      mode: r.mode,
      pair: r.symbol,
      txHash: r.txHash,
      error: r.error,
    })),
  };
  const outPath = path.join(__dirname, 'last-batch.json');
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log(`[DAEMON] Summary written to ${outPath}`);
}

async function runBatch() {
  if (isRunning) {
    console.log(`[DAEMON] Batch already running — skipping trigger`);
    return;
  }
  isRunning = true;

  const startTime = new Date().toISOString();
  const results = [];
  console.log(`\n========================================`);
  console.log(`[DAEMON] Batch started at ${startTime}`);
  console.log(`[DAEMON] Wallets: ${PRIVATE_KEYS.length} | Tokens: ${TARGET_TOKENS.length}`);
  console.log(`========================================`);

  const provider = new ethers.JsonRpcProvider(RPC_URL);

  try {
    const blockNumber = await provider.getBlockNumber();
    console.log(`[NETWORK] Connected. Block: ${blockNumber}\n`);
  } catch (err) {
    console.error(`[FATAL] Failed to connect to RPC: ${err.message}`);
    writeSummary([], startTime, new Date().toISOString());
    isRunning = false;
    return;
  }

  for (let i = 0; i < PRIVATE_KEYS.length; i++) {
    const result = await executeWallet(PRIVATE_KEYS[i], provider, WETH_ADDRESS, TARGET_TOKENS);
    results.push(result);

    if (i < PRIVATE_KEYS.length - 1) {
      const delayMs = randomInt(60000, 300000);
      console.log(`\n[DELAY] Waiting ${Math.round(delayMs/1000)} seconds (~${(delayMs/60000).toFixed(1)} minutes) before next wallet...`);
      await sleep(delayMs);
    }
  }

  const endTime = new Date().toISOString();
  console.log(`\n[DONE] Batch finished at ${endTime}`);
  writeSummary(results, startTime, endTime);
  isRunning = false;
}

app.use(express.json());

app.post('/trigger', (req, res) => {
  if (isRunning) {
    return res.status(409).json({ status: 'busy', message: 'Batch already running' });
  }
  res.status(202).json({ status: 'accepted', message: 'Batch queued' });
  runBatch().catch(err => {
    console.error(`[DAEMON] Batch error: ${err}`);
    isRunning = false;
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', running: isRunning, wallets: PRIVATE_KEYS.length });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[DAEMON] Swap daemon listening on http://127.0.0.1:${PORT}`);
  console.log(`[DAEMON] POST /trigger  → start batch`);
  console.log(`[DAEMON] GET  /health   → check status`);
});
