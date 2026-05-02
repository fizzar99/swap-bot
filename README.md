# Mass Swap Bot - Sepolia Testnet

An automated bot for performing mass swaps on a DEX (Uniswap V2 Style) on the Sepolia Testnet using Node.js and Ethers.js v6.

---

## Features

- **Multi-Wallet**: Supports multiple wallets at once
- **Random Delay**: Random delay of **1-3 minutes** between wallets
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

---

## Prerequisites

- Node.js (version 18+)
- Ubuntu CLI (or Linux/Windows with terminal)
- Sepolia ETH in your wallet (from free faucet)

---

## Installation

### 1. Create project folder

```bash
mkdir swap-bot
cd swap-bot
```

### 2. Initialize project & install dependencies

```bash
npm init -y
npm install ethers dotenv
```

### 3. Prepare `.env` configuration file

Create a `.env` file in the project root (`swap-bot/.env`):

```env
SEPOLIA_RPC=https://ethereum-sepolia-rpc.publicnode.com
PRIVATE_KEYS=0xYOUR_PRIVATE_KEY_1,0xYOUR_PRIVATE_KEY_2
TARGET_TOKENS=0xTokenAddressA,0xTokenAddressB
```

**Variable descriptions:**

| Variable | Description |
|----------|-------------|
| `SEPOLIA_RPC` | Sepolia Testnet RPC endpoint URL |
| `PRIVATE_KEYS` | Comma-separated list of wallet private keys (no spaces) |
| `TARGET_TOKENS` | Comma-separated list of target token contract addresses |

> ⚠️ **IMPORTANT**: Never share your `.env` file or commit it to GitHub. A private key is full access to your wallet.

### 4. Get Sepolia ETH (Faucet)

If your wallet doesn't have Sepolia ETH, claim for free at:
- https://sepoliafaucet.com
- https://www.alchemy.com/faucets/ethereum-sepolia

### 5. Copy the bot file

Save `swap.js` into the `swap-bot/` folder.

---

## Running the Bot

```bash
node swap.js
```

Example terminal output:

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
[BALANCE] DAI: 150.0000
[SWAP] DAI -> ETH | Amount: 30.0000 DAI (20%)
[APPROVE] Allowance sufficient
[ESTIMATE] Expected: 0.0123 ETH, Min: 0.0122 ETH (slippage 0.5%)
[TX SENT] 0x00ae81b5...
[TX CONFIRMED] Block: 12345679, GasUsed: 142350

[DELAY] Waiting 127 seconds (~2.1 minutes) before next wallet...
```

---

## Customizable Configuration

Open `swap.js` and edit the following constants as needed:

| Constant | Default | Description |
|----------|---------|-------------|
| `SLIPPAGE_BPS` | `50n` | 0.5% slippage tolerance |
| `DEADLINE_MINUTES` | `10` | Transaction deadline (minutes) |
| `ETH_GAS_BUFFER` | `0.0005` | ETH buffer reserved for gas |

---

## Troubleshooting

### Error: `PRIVATE_KEYS not found in .env`
Make sure the `.env` file exists in the same folder as `swap.js` and the `PRIVATE_KEYS` variable is set.

### Error: `ETH balance too low for gas fees`
Your wallet ran out of Sepolia ETH. Claim more from the faucet links above.

### Error: `Token balance is zero`
Your wallet doesn't have the target token. Do a manual swap first or change the target token.

### Transaction Failed / Reverted
Possible causes:
- Slippage too low → increase `SLIPPAGE_BPS`
- Liquidity pair doesn't exist → make sure the token is available on the DEX
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
- [dotenv](https://www.npmjs.com/package/dotenv)
