# Mass Swap Bot - Sepolia Testnet

Automated DEX swap bot for Sepolia Testnet. Supports **one-shot CLI execution** or **daemon mode** with HTTP API trigger. Built with Node.js, Ethers.js v6, and Express.

---

## Features

- **Multi-Wallet**: Supports multiple wallets simultaneously
- **Random Delay**: Random delay of **1-5 minutes** between wallets (anti-sybil)
- **3 Random Swap Modes**:
  1. **ETH → Token**: Buy a random token with ETH (0.0001 - 0.001 ETH)
  2. **Token → ETH**: Sell a random percentage (1% - 100%) of token balance back to ETH
  3. **Token → Token**: Swap between two different tokens with a random percentage (1% - 100%) of balance via WETH
- **Auto Approve**: Checks allowance & automatically approves if needed
- **Slippage Protection**: Uses `getAmountsOut` with 0.5% tolerance
- **Balance Check**: Checks ETH & token balances before execution
- **Gas Buffer**: Reserves a buffer of ETH for gas fees
- **Error Handling**: An error in one wallet does not stop the bot
- **Clean Logging**: Displays wallet address, mode, amount, tx hash in the terminal
- **Daemon Mode**: Run as a background HTTP server and trigger batches via API
- **Batch Summary**: Results automatically written to `last-batch.json`

---

## Project Structure

```
swap-bot/
├── daemon.js           # Express daemon (HTTP API)
├── swap.js             # One-shot CLI script
├── lib/
│   └── swap-core.js    # Core swap logic & helpers
├── last-batch.json     # Last batch summary (auto-generated)
├── .env                # Private keys & config (DO NOT COMMIT)
├── .env.example        # Example environment file
└── package.json
```

---

## Prerequisites

- Node.js (version 18+)
- Ubuntu CLI (or Linux/macOS/Windows with terminal)
- Sepolia ETH in your wallet (from free faucet)

---

## Installation

### 1. Clone repo

```bash
git clone https://github.com/fizzar99/swap-bot.git
cd swap-bot
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure `.env`

Copy the example file and edit:

```bash
cp .env.example .env
```

Edit `.env`:

```env
SEPOLIA_RPC=https://ethereum-sepolia-rpc.publicnode.com
PRIVATE_KEYS=0xYOUR_PRIVATE_KEY_1,0xYOUR_PRIVATE_KEY_2
TARGET_TOKENS=0xTokenAddressA,0xTokenAddressB
```

| Variable | Description |
|----------|-------------|
| `SEPOLIA_RPC` | Sepolia Testnet RPC endpoint URL |
| `PRIVATE_KEYS` | Comma-separated list of wallet private keys (no spaces) |
| `TARGET_TOKENS` | Comma-separated list of target token contract addresses |

> ⚠️ **IMPORTANT**: Never share your `.env` file or commit it to GitHub. A private key is full access to your wallet.

### 4. Get Sepolia ETH (Faucet)

- https://sepoliafaucet.com
- https://www.alchemy.com/faucets/ethereum-sepolia

---

## Usage

### One-Shot Mode (CLI)

Run swaps once directly in terminal:

```bash
node swap.js
```

### Daemon Mode (HTTP API)

Run as a background server:

```bash
node daemon.js
```

Or use PM2 for production:

```bash
pm2 start daemon.js --name swap-daemon
pm2 save
pm2 startup
```

#### Daemon Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/trigger` | Start a new batch swap (returns 409 if already running) |
| `GET`  | `/health`  | Check daemon status & wallet count |

Example trigger:

```bash
curl -X POST http://127.0.0.1:3876/trigger
```

Example health check:

```bash
curl http://127.0.0.1:3876/health
```

You can change the port via `DAEMON_PORT` environment variable (default: `3876`).

---

## Example Output

```
[START] Mass Swap Bot - Sepolia Testnet
[CONFIG] Router: 0xBc93a9E52c76f38bB4369BBd4d5732f0047D7473
[CONFIG] WETH: 0x7b79995e5f793a07bc00c21412e50ecae098e7f9
[CONFIG] Wallet Count: 2
[CONFIG] Target Tokens: 2
[NETWORK] Connected. Block: 12345678

========================================
[WALLET] 0xAbC123...
========================================
[BALANCE] ETH: 0.5234
[MODE] Mode 2 selected
[BALANCE CHECK] DAI: 150.0000
[SWAP] DAI -> ETH | Amount: 30.0000 DAI (20%)
[APPROVE] Allowance sufficient
[ESTIMATE] Expected: 0.0123 ETH, Min: 0.0122 ETH (slippage 0.5%)
[TX SENT] 0x00ae81b5...
[TX CONFIRMED] Block: 12345679, GasUsed: 142350

[DELAY] Waiting 187 seconds (~3.1 minutes) before next wallet...
```

---

## Batch Summary

After each run (CLI or daemon), a summary is written to `last-batch.json`:

```json
{
  "startTime": "2026-05-05T06:00:00.000Z",
  "endTime": "2026-05-05T06:15:30.000Z",
  "durationSec": 930,
  "totalWallets": 3,
  "success": 2,
  "failed": 0,
  "skipped": 1,
  "wallets": [...]
}
```

---

## Customizable Configuration

Open `lib/swap-core.js` and edit these constants as needed:

| Constant | Default | Description |
|----------|---------|-------------|
| `SLIPPAGE_BPS` | `50n` | 0.5% slippage tolerance |
| `DEADLINE_MINUTES` | `10` | Transaction deadline (minutes) |
| `ETH_GAS_BUFFER` | `0.0005` | ETH buffer reserved for gas |

---

## Troubleshooting

### `PRIVATE_KEYS not found in .env`
Make sure `.env` exists and `PRIVATE_KEYS` is set.

### `ETH balance too low for gas fees`
Claim more Sepolia ETH from faucet.

### `Token balance is zero`
Wallet doesn't have the target token. Do a manual swap first or change target token.

### Transaction Failed / Reverted
- Slippage too low → increase `SLIPPAGE_BPS`
- Liquidity pair doesn't exist → verify token is on the DEX
- Deadline expired → increase `DEADLINE_MINUTES`

---

## Disclaimer

- This project is for **educational & testing purposes** on Sepolia Testnet only.
- Private keys are your responsibility. Keep them safe.
- Do not use mainnet wallet private keys that hold valuable assets.

---

## Tech Stack

- [Node.js](https://nodejs.org/)
- [Ethers.js v6](https://docs.ethers.org/v6/)
- [Express](https://expressjs.com/)
- [dotenv](https://www.npmjs.com/package/dotenv)
