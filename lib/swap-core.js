require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { ethers } = require('ethers');
const path = require('path');

// ==========================================
// CONFIGURATION
// ==========================================
const RPC_URL = process.env.SEPOLIA_RPC || 'https://ethereum-sepolia-rpc.publicnode.com';
const ROUTER_ADDRESS = '0xBc93a9E52c76f38bB4369BBd4d5732f0047D7473';
const WETH_ADDRESS = '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9';
const SLIPPAGE_BPS = 50n;
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

  const result = { address, mode: null, status: 'skipped', txHash: null, error: null, symbol: null };

  try {
    const ethBalance = await provider.getBalance(address);
    console.log(`[BALANCE] ETH: ${ethers.formatEther(ethBalance)}`);

    if (ethBalance < ETH_GAS_BUFFER) {
      console.log(`[SKIP] ETH balance too low for gas fees`);
      result.error = 'Low ETH for gas';
      return result;
    }

    const mode = randomInt(1, 3);
    result.mode = mode;
    console.log(`[MODE] Mode ${mode} selected`);

    const deadline = getDeadline();

    if (mode === 1) {
      if (targetTokens.length === 0) {
        console.log(`[SKIP] TARGET_TOKENS is empty`);
        result.error = 'No target tokens';
        return result;
      }
      const tokenOut = targetTokens[randomInt(0, targetTokens.length - 1)];
      const tokenContract = new ethers.Contract(tokenOut, ERC20_ABI, wallet);
      const symbol = await tokenContract.symbol().catch(() => 'UNKNOWN');
      const decimals = await tokenContract.decimals().catch(() => 18);
      result.symbol = symbol;
      const amountIn = randomEther();
      console.log(`[SWAP] ETH -> ${symbol} | Amount: ${ethers.formatEther(amountIn)} ETH`);
      if (ethBalance < amountIn + ETH_GAS_BUFFER) {
        console.log(`[SKIP] Insufficient ETH (need ~${ethers.formatEther(amountIn + ETH_GAS_BUFFER)}, have ${ethers.formatEther(ethBalance)})`);
        result.error = 'Insufficient ETH';
        return result;
      }
      const path = [wethAddress, tokenOut];
      const amounts = await router.getAmountsOut(amountIn, path);
      const amountOutMin = calculateMinAmount(amounts[1]);
      console.log(`[ESTIMATE] Expected: ${ethers.formatUnits(amounts[1], decimals)} ${symbol}, Min: ${ethers.formatUnits(amountOutMin, decimals)} ${symbol} (slippage 0.5%)`);
      const tx = await router.swapExactETHForTokens(amountOutMin, path, address, deadline, { value: amountIn });
      console.log(`[TX SENT] ${tx.hash}`);
      result.txHash = tx.hash;
      const receipt = await tx.wait();
      if (receipt.status === 1) {
        console.log(`[TX CONFIRMED] Block: ${receipt.blockNumber}, GasUsed: ${receipt.gasUsed.toString()}`);
        result.status = 'success';
      } else {
        console.log(`[TX FAILED] Block: ${receipt.blockNumber}, Status: ${receipt.status}`);
        result.status = 'failed';
      }
    } else if (mode === 2) {
      if (targetTokens.length === 0) {
        console.log(`[SKIP] TARGET_TOKENS is empty`);
        result.error = 'No target tokens';
        return result;
      }
      let tokenIn = null, tokenContract = null, symbol = 'UNKNOWN', decimals = 18, tokenBalance = 0n;
      let triedIndices = new Set();
      while (triedIndices.size < targetTokens.length) {
        let idx = randomInt(0, targetTokens.length - 1);
        while (triedIndices.has(idx)) idx = randomInt(0, targetTokens.length - 1);
        triedIndices.add(idx);
        const candidate = targetTokens[idx];
        const candidateContract = new ethers.Contract(candidate, ERC20_ABI, wallet);
        const candidateSymbol = await candidateContract.symbol().catch(() => 'UNKNOWN');
        const candidateDecimals = await candidateContract.decimals().catch(() => 18);
        const candidateBalance = await candidateContract.balanceOf(address);
        console.log(`[BALANCE CHECK] ${candidateSymbol}: ${ethers.formatUnits(candidateBalance, candidateDecimals)}`);
        if (candidateBalance > 0n) {
          tokenIn = candidate; tokenContract = candidateContract; symbol = candidateSymbol;
          decimals = candidateDecimals; tokenBalance = candidateBalance; break;
        }
      }
      if (!tokenIn || tokenBalance === 0n) {
        console.log(`[SKIP] All target tokens have zero balance`); result.error = 'Zero token balance'; return result;
      }
      const sellPercentage = BigInt(randomInt(1, 100));
      const amountIn = (tokenBalance * sellPercentage) / 100n;
      console.log(`[SWAP] ${symbol} -> ETH | Amount: ${ethers.formatUnits(amountIn, decimals)} ${symbol} (${sellPercentage}%)`);
      result.symbol = symbol;
      const path = [tokenIn, wethAddress];
      const amounts = await router.getAmountsOut(amountIn, path);
      const amountOutMin = calculateMinAmount(amounts[1]);
      console.log(`[ESTIMATE] Expected: ${ethers.formatEther(amounts[1])} ETH, Min: ${ethers.formatEther(amountOutMin)} ETH (slippage 0.5%)`);
      await checkAndApprove(tokenContract, ROUTER_ADDRESS, amountIn, wallet);
      const tx = await router.swapExactTokensForETH(amountIn, amountOutMin, path, address, deadline);
      console.log(`[TX SENT] ${tx.hash}`);
      result.txHash = tx.hash;
      const receipt = await tx.wait();
      if (receipt.status === 1) {
        console.log(`[TX CONFIRMED] Block: ${receipt.blockNumber}, GasUsed: ${receipt.gasUsed.toString()}`);
        result.status = 'success';
      } else {
        console.log(`[TX FAILED] Block: ${receipt.blockNumber}, Status: ${receipt.status}`);
        result.status = 'failed';
      }
    } else if (mode === 3) {
      if (targetTokens.length < 2) {
        console.log(`[SKIP] Need at least 2 tokens for this mode`); result.error = 'Need 2+ tokens'; return result;
      }
      let tokenIn = null, tokenInContract = null, symbolIn = 'UNKNOWN', decimalsIn = 18, tokenBalance = 0n;
      let triedIndices = new Set();
      while (triedIndices.size < targetTokens.length) {
        let idx = randomInt(0, targetTokens.length - 1);
        while (triedIndices.has(idx)) idx = randomInt(0, targetTokens.length - 1);
        triedIndices.add(idx);
        const candidate = targetTokens[idx];
        const candidateContract = new ethers.Contract(candidate, ERC20_ABI, wallet);
        const candidateSymbol = await candidateContract.symbol().catch(() => 'UNKNOWN');
        const candidateDecimals = await candidateContract.decimals().catch(() => 18);
        const candidateBalance = await candidateContract.balanceOf(address);
        console.log(`[BALANCE CHECK] ${candidateSymbol}: ${ethers.formatUnits(candidateBalance, candidateDecimals)}`);
        if (candidateBalance > 0n) {
          tokenIn = candidate; tokenInContract = candidateContract; symbolIn = candidateSymbol;
          decimalsIn = candidateDecimals; tokenBalance = candidateBalance; break;
        }
      }
      if (!tokenIn || tokenBalance === 0n) {
        console.log(`[SKIP] All target tokens have zero balance`); result.error = 'Zero token balance'; return result;
      }
      let tokenOut = null;
      while (!tokenOut || tokenOut === tokenIn) {
        const idxOut = randomInt(0, targetTokens.length - 1);
        tokenOut = targetTokens[idxOut];
      }
      const tokenOutContract = new ethers.Contract(tokenOut, ERC20_ABI, wallet);
      const symbolOut = await tokenOutContract.symbol().catch(() => 'UNKNOWN');
      const decimalsOut = await tokenOutContract.decimals().catch(() => 18);
      const sellPercentage = BigInt(randomInt(1, 100));
      const amountIn = (tokenBalance * sellPercentage) / 100n;
      console.log(`[SWAP] ${symbolIn} -> ${symbolOut} | Amount: ${ethers.formatUnits(amountIn, decimalsIn)} ${symbolIn} (${sellPercentage}%)`);
      result.symbol = `${symbolIn}->${symbolOut}`;
      const path = [tokenIn, wethAddress, tokenOut];
      const amounts = await router.getAmountsOut(amountIn, path);
      const amountOutMin = calculateMinAmount(amounts[amounts.length - 1]);
      console.log(`[ESTIMATE] Expected: ${ethers.formatUnits(amounts[amounts.length - 1], decimalsOut)} ${symbolOut}, Min: ${ethers.formatUnits(amountOutMin, decimalsOut)} ${symbolOut} (slippage 0.5%)`);
      await checkAndApprove(tokenInContract, ROUTER_ADDRESS, amountIn, wallet);
      const tx = await router.swapExactTokensForTokens(amountIn, amountOutMin, path, address, deadline);
      console.log(`[TX SENT] ${tx.hash}`);
      result.txHash = tx.hash;
      const receipt = await tx.wait();
      if (receipt.status === 1) {
        console.log(`[TX CONFIRMED] Block: ${receipt.blockNumber}, GasUsed: ${receipt.gasUsed.toString()}`);
        result.status = 'success';
      } else {
        console.log(`[TX FAILED] Block: ${receipt.blockNumber}, Status: ${receipt.status}`);
        result.status = 'failed';
      }
    }
  } catch (err) {
    console.error(`[ERROR] ${address}: ${err.reason || err.message || err}`);
    result.status = 'error';
    result.error = err.reason || err.message || String(err);
  }
  return result;
}

module.exports = {
  RPC_URL,
  ROUTER_ADDRESS,
  WETH_ADDRESS,
  PRIVATE_KEYS,
  TARGET_TOKENS,
  sleep,
  randomInt,
  executeWallet,
};
