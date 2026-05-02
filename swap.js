require('dotenv').config();
const { ethers } = require('ethers');

// ==========================================
// CONFIGURATION
// ==========================================
const RPC_URL = process.env.SEPOLIA_RPC || 'https://ethereum-sepolia-rpc.publicnode.com';
const ROUTER_ADDRESS = '0xBc93a9E52c76f38bB4369BBd4d5732f0047D7473';
const WETH_ADDRESS = '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9';
const SLIPPAGE_BPS = 50n; // 0.5%
const DEADLINE_MINUTES = 10;
const ETH_GAS_BUFFER = ethers.parseEther('0.0005');

const PRIVATE_KEYS = (process.env.PRIVATE_KEYS || '')
  .split(',')
  .map(k => k.trim())
  .filter(k => k.length > 0);

const TARGET_TOKENS = (process.env.TARGET_TOKENS || '')
  .split(',')
  .map(a => a.trim())
  .filter(a => ethers.isAddress(a));

// ==========================================
// ABI
// ==========================================
const ROUTER_ABI = [
  "function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)",
  "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
  "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
  "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
];

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

// ==========================================
// HELPERS
// ==========================================
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomEther() {
  const min = ethers.parseEther("0.0001");
  const max = ethers.parseEther("0.001");
  const range = max - min;
  const rand = BigInt(Math.floor(Math.random() * Number(range)));
  return min + rand;
}

function getDeadline() {
  return Math.floor(Date.now() / 1000) + 60 * DEADLINE_MINUTES;
}

function calculateMinAmount(amountOut) {
  let min = (amountOut * (10000n - SLIPPAGE_BPS)) / 10000n;
  if (min === 0n) min = 1n;
  return min;
}

async function checkAndApprove(tokenContract, spender, amount, signer) {
  const owner = await signer.getAddress();
  const allowance = await tokenContract.allowance(owner, spender);

  if (allowance < amount) {
    console.log(`  [APPROVE] Insufficient allowance. Approving max...`);
    const tx = await tokenContract.approve(spender, ethers.MaxUint256);
    console.log(`  [APPROVE] Tx sent: ${tx.hash}`);
    await tx.wait();
    console.log(`  [APPROVE] Confirmation received`);
  } else {
    console.log(`  [APPROVE] Allowance sufficient`);
  }
}

// ==========================================
// EXECUTION PER WALLET
// ==========================================
async function executeWallet(privateKey, provider, wethAddress, targetTokens) {
  const wallet = new ethers.Wallet(privateKey, provider);
  const address = await wallet.getAddress();
  const router = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, wallet);

  console.log(`\n========================================`);
  console.log(`[WALLET] ${address}`);
  console.log(`========================================`);

  try {
    const ethBalance = await provider.getBalance(address);
    console.log(`[BALANCE] ETH: ${ethers.formatEther(ethBalance)}`);

    if (ethBalance < ETH_GAS_BUFFER) {
      console.log(`[SKIP] ETH balance too low for gas fees`);
      return;
    }

    const mode = randomInt(1, 3);
    console.log(`[MODE] Mode ${mode} selected`);

    const deadline = getDeadline();

    // ========== MODE 1: ETH -> TOKEN ==========
    if (mode === 1) {
      if (targetTokens.length === 0) {
        console.log(`[SKIP] TARGET_TOKENS is empty`);
        return;
      }

      const tokenOut = targetTokens[randomInt(0, targetTokens.length - 1)];
      const tokenContract = new ethers.Contract(tokenOut, ERC20_ABI, wallet);
      const symbol = await tokenContract.symbol().catch(() => 'UNKNOWN');
      const decimals = await tokenContract.decimals().catch(() => 18);

      const amountIn = randomEther();
      console.log(`[SWAP] ETH -> ${symbol} | Amount: ${ethers.formatEther(amountIn)} ETH`);

      if (ethBalance < amountIn + ETH_GAS_BUFFER) {
        console.log(`[SKIP] Insufficient ETH (need ~${ethers.formatEther(amountIn + ETH_GAS_BUFFER)}, have ${ethers.formatEther(ethBalance)})`);
        return;
      }

      const path = [wethAddress, tokenOut];
      const amounts = await router.getAmountsOut(amountIn, path);
      const amountOutMin = calculateMinAmount(amounts[1]);

      console.log(`[ESTIMATE] Expected: ${ethers.formatUnits(amounts[1], decimals)} ${symbol}, Min: ${ethers.formatUnits(amountOutMin, decimals)} ${symbol} (slippage 0.5%)`);

      const tx = await router.swapExactETHForTokens(
        amountOutMin,
        path,
        address,
        deadline,
        { value: amountIn }
      );
      console.log(`[TX SENT] ${tx.hash}`);
      const receipt = await tx.wait();
      if (receipt.status === 1) {
        console.log(`[TX CONFIRMED] Block: ${receipt.blockNumber}, GasUsed: ${receipt.gasUsed.toString()}`);
      } else {
        console.log(`[TX FAILED] Block: ${receipt.blockNumber}, Status: ${receipt.status}`);
      }

    // ========== MODE 2: TOKEN -> ETH ==========
    } else if (mode === 2) {
      if (targetTokens.length === 0) {
        console.log(`[SKIP] TARGET_TOKENS is empty`);
        return;
      }

      const tokenIn = targetTokens[randomInt(0, targetTokens.length - 1)];
      const tokenContract = new ethers.Contract(tokenIn, ERC20_ABI, wallet);
      const symbol = await tokenContract.symbol().catch(() => 'UNKNOWN');
      const decimals = await tokenContract.decimals().catch(() => 18);

      const tokenBalance = await tokenContract.balanceOf(address);
      console.log(`[BALANCE] ${symbol}: ${ethers.formatUnits(tokenBalance, decimals)}`);

      if (tokenBalance === 0n) {
        console.log(`[SKIP] ${symbol} balance is zero`);
        return;
      }

      const sellPercentage = BigInt(randomInt(1, 100));
      const amountIn = (tokenBalance * sellPercentage) / 100n;
      console.log(`[SWAP] ${symbol} -> ETH | Amount: ${ethers.formatUnits(amountIn, decimals)} ${symbol} (${sellPercentage}%)`);

      const path = [tokenIn, wethAddress];
      const amounts = await router.getAmountsOut(amountIn, path);
      const amountOutMin = calculateMinAmount(amounts[1]);

      console.log(`[ESTIMATE] Expected: ${ethers.formatEther(amounts[1])} ETH, Min: ${ethers.formatEther(amountOutMin)} ETH (slippage 0.5%)`);

      await checkAndApprove(tokenContract, ROUTER_ADDRESS, amountIn, wallet);

      const tx = await router.swapExactTokensForETH(
        amountIn,
        amountOutMin,
        path,
        address,
        deadline
      );
      console.log(`[TX SENT] ${tx.hash}`);
      const receipt = await tx.wait();
      if (receipt.status === 1) {
        console.log(`[TX CONFIRMED] Block: ${receipt.blockNumber}, GasUsed: ${receipt.gasUsed.toString()}`);
      } else {
        console.log(`[TX FAILED] Block: ${receipt.blockNumber}, Status: ${receipt.status}`);
      }

    // ========== MODE 3: TOKEN -> TOKEN (via WETH) ==========
    } else if (mode === 3) {
      if (targetTokens.length < 2) {
        console.log(`[SKIP] Need at least 2 tokens for this mode`);
        return;
      }

      let idxIn = randomInt(0, targetTokens.length - 1);
      let idxOut = randomInt(0, targetTokens.length - 1);
      while (idxOut === idxIn) {
        idxOut = randomInt(0, targetTokens.length - 1);
      }

      const tokenIn = targetTokens[idxIn];
      const tokenOut = targetTokens[idxOut];

      const tokenInContract = new ethers.Contract(tokenIn, ERC20_ABI, wallet);
      const tokenOutContract = new ethers.Contract(tokenOut, ERC20_ABI, wallet);

      const symbolIn = await tokenInContract.symbol().catch(() => 'UNKNOWN');
      const symbolOut = await tokenOutContract.symbol().catch(() => 'UNKNOWN');
      const decimalsIn = await tokenInContract.decimals().catch(() => 18);
      const decimalsOut = await tokenOutContract.decimals().catch(() => 18);

      const tokenBalance = await tokenInContract.balanceOf(address);
      console.log(`[BALANCE] ${symbolIn}: ${ethers.formatUnits(tokenBalance, decimalsIn)}`);

      if (tokenBalance === 0n) {
        console.log(`[SKIP] ${symbolIn} balance is zero`);
        return;
      }

      const sellPercentage = BigInt(randomInt(1, 100));
      const amountIn = (tokenBalance * sellPercentage) / 100n;
      console.log(`[SWAP] ${symbolIn} -> ${symbolOut} | Amount: ${ethers.formatUnits(amountIn, decimalsIn)} ${symbolIn} (${sellPercentage}%)`);

      const path = [tokenIn, wethAddress, tokenOut];
      const amounts = await router.getAmountsOut(amountIn, path);
      const amountOutMin = calculateMinAmount(amounts[amounts.length - 1]);

      console.log(`[ESTIMATE] Expected: ${ethers.formatUnits(amounts[amounts.length - 1], decimalsOut)} ${symbolOut}, Min: ${ethers.formatUnits(amountOutMin, decimalsOut)} ${symbolOut} (slippage 0.5%)`);

      await checkAndApprove(tokenInContract, ROUTER_ADDRESS, amountIn, wallet);

      const tx = await router.swapExactTokensForTokens(
        amountIn,
        amountOutMin,
        path,
        address,
        deadline
      );
      console.log(`[TX SENT] ${tx.hash}`);
      const receipt = await tx.wait();
      if (receipt.status === 1) {
        console.log(`[TX CONFIRMED] Block: ${receipt.blockNumber}, GasUsed: ${receipt.gasUsed.toString()}`);
      } else {
        console.log(`[TX FAILED] Block: ${receipt.blockNumber}, Status: ${receipt.status}`);
      }
    }

  } catch (err) {
    console.error(`[ERROR] ${address}: ${err.reason || err.message || err}`);
    // Loop continues
  }
}

// ==========================================
// MAIN
// ==========================================
async function main() {
  console.log(`[START] Mass Swap Bot - Sepolia Testnet`);
  console.log(`[CONFIG] Router: ${ROUTER_ADDRESS}`);
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
      const delayMs = randomInt(60000, 180000);
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
