# @ramestta/bridge-sdk

Official Ramestta Bridge SDK for cross-chain deposits and withdrawals between Polygon (L2) and Ramestta (L3).

## Installation

```bash
npm install @ramestta/bridge-sdk
# or
yarn add @ramestta/bridge-sdk
```

## Quick Start

### Read-Only Client

```typescript
import { createBridgeClient, formatRama } from '@ramestta/bridge-sdk';

// Create client (uses default RPC endpoints)
const bridge = createBridgeClient();

// Check balances
const polygonBalance = await bridge.getPolygonBalance(
  '0x55a5CC06801bBa4C030568f1A7ee1c753FDcbe36', // RAMA token
  '0xYourAddress'
);
console.log('Polygon RAMA Balance:', formatRama(polygonBalance));

const ramesttaBalance = await bridge.getRamesttaBalance('0xYourAddress');
console.log('Ramestta Native Balance:', formatRama(ramesttaBalance));

// Check checkpoint status
const checkpoint = await bridge.getLastCheckpoint();
console.log('Latest Checkpoint:', checkpoint);
```

### With Signer (For Transactions)

```typescript
import { createBridgeClientFromPrivateKey, parseRama } from '@ramestta/bridge-sdk';

// Create client with private key
const bridge = createBridgeClientFromPrivateKey(
  'your-private-key',
  'https://polygon-rpc.com',
  'https://blockchain.ramestta.com'
);

// ========================================
// Deposit: Polygon (L2) → Ramestta (L3)
// ========================================

// 1. Approve tokens
const approveTx = await bridge.approveMaxDeposit('0xRootTokenAddress');
await approveTx.wait();

// 2. Deposit ERC20 tokens
const depositTx = await bridge.depositERC20(
  '0xRootTokenAddress',
  parseRama('100')
);
await depositTx.wait();
console.log('Deposit initiated:', depositTx.hash);

// ========================================
// Withdraw: Ramestta (L3) → Polygon (L2)
// ========================================

// 1. Start withdrawal (burn tokens on Ramestta)
const burnTx = await bridge.startWithdraw(
  '0xChildTokenAddress',
  parseRama('50')
);
await burnTx.wait();
console.log('Burn initiated:', burnTx.hash);

// 2. Wait for checkpoint (~10 min)
const isCheckpointed = await bridge.waitForCheckpoint(burnTx.blockNumber);

// 3. Process exit on Polygon (after checkpoint)
// Note: Exit proof generation requires additional SDK like matic.js
```

## API Reference

### BridgeClient

#### Constructor

```typescript
const bridge = new BridgeClient({
  polygonProvider: ethersProvider,
  ramesttaProvider: ethersProvider,
  polygonSigner?: ethersSigner,  // Required for deposits
  ramesttaSigner?: ethersSigner, // Required for withdrawals
});
```

#### Read Methods

| Method | Description |
|--------|-------------|
| `getLastCheckpoint()` | Get latest checkpoint on RootChain |
| `isCheckpointed(blockNumber)` | Check if block has been checkpointed |
| `getChildToken(rootToken)` | Get child token address for a root token |
| `isERC721(rootToken)` | Check if token is ERC721 |
| `getPolygonBalance(token, user)` | Get token balance on Polygon |
| `getRamesttaBalance(user)` | Get native RAMA balance on Ramestta |
| `getChildTokenBalance(childToken, user)` | Get child token balance |
| `getExitInfo(exitId)` | Get exit info by ID |
| `getTokenInfo(token, isRoot?)` | Get token metadata |

#### Deposit Methods (L2 → L3)

| Method | Description |
|--------|-------------|
| `approveDeposit(token, amount)` | Approve tokens for deposit |
| `approveMaxDeposit(token)` | Approve unlimited tokens |
| `depositERC20(token, amount, user?)` | Deposit ERC20 tokens |
| `depositERC721(token, tokenId)` | Deposit ERC721 NFT |
| `depositRAMA(amount)` | Deposit native RAMA |

#### Withdraw Methods (L3 → L2)

| Method | Description |
|--------|-------------|
| `startWithdraw(childToken, amount)` | Burn tokens to start withdrawal |
| `startRAMAWithdraw(amount)` | Start native RAMA withdrawal |
| `processExits(token, maxExits?)` | Process pending exits |

#### Utility Methods

| Method | Description |
|--------|-------------|
| `waitForTransaction(hash, provider, confirmations?)` | Wait for tx confirmation |
| `waitForCheckpoint(blockNumber, maxWaitMs?)` | Wait for checkpoint inclusion |
| `getContractAddresses()` | Get all contract addresses |
| `getNetworkInfo()` | Get network configuration |

### Factory Functions

```typescript
// Read-only client
createBridgeClient(polygonProviderOrUrl?, ramesttaProviderOrUrl?)

// Client with signers
createBridgeClientWithSigners(polygonSigner, ramesttaSigner)

// Client from private key
createBridgeClientFromPrivateKey(privateKey, polygonProviderOrUrl?, ramesttaProviderOrUrl?)
```

### Utility Functions

```typescript
// Format/parse with custom decimals
formatAmount(amount: BigNumber, decimals?: number): string
parseAmount(amount: string, decimals?: number): BigNumber

// Format/parse RAMA (18 decimals)
formatRama(amount: BigNumber): string
parseRama(amount: string): BigNumber

// Estimate bridge time
estimateBridgeTime(direction: 'deposit' | 'withdraw'): string

// Validate address
isValidAddress(address: string): boolean
```

## Bridge Flow

### Deposit Flow (L2 → L3)

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Polygon   │────▶│   Deposit    │────▶│  Ramestta   │
│    (L2)     │     │   Manager    │     │    (L3)     │
└─────────────┘     └──────────────┘     └─────────────┘
     │                     │                    │
     │  1. Approve         │  2. Deposit        │  3. Receive
     │     Tokens          │     (Lock)         │     Tokens
     ▼                     ▼                    ▼
   User                StateSender          ChildChain
  Wallet              (State Sync)         (Token Mint)
```

**Time:** ~5-10 minutes

### Withdraw Flow (L3 → L2)

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Ramestta   │────▶│  Checkpoint  │────▶│   Polygon   │
│    (L3)     │     │  (~10 min)   │     │    (L2)     │
└─────────────┘     └──────────────┘     └─────────────┘
     │                     │                    │
     │  1. Burn            │  2. Wait for       │  3. Exit
     │     Tokens          │     Checkpoint     │     (Unlock)
     ▼                     ▼                    ▼
  ChildChain           RootChain           Withdraw
  (Token Burn)        (Verify Proof)       Manager
```

**Time:** ~1.5 hours after checkpoint plus the 4800 second exit window

## Example: Full Bridge Flow

```typescript
import { 
  createBridgeClientFromPrivateKey, 
  parseRama, 
  formatRama,
  estimateBridgeTime 
} from '@ramestta/bridge-sdk';

async function bridgeExample() {
  const bridge = createBridgeClientFromPrivateKey(
    process.env.PRIVATE_KEY!,
    'https://polygon-rpc.com',
    'https://blockchain.ramestta.com'
  );

  const RAMA_TOKEN = '0x55a5CC06801bBa4C030568f1A7ee1c753FDcbe36';
  const myAddress = '0x...';

  // Check balance on Polygon
  const polygonBalance = await bridge.getPolygonBalance(RAMA_TOKEN, myAddress);
  console.log('Polygon Balance:', formatRama(polygonBalance));

  // Deposit to Ramestta
  console.log('Estimated time:', estimateBridgeTime('deposit'));

  // 1. Approve
  const approveTx = await bridge.approveMaxDeposit(RAMA_TOKEN);
  await approveTx.wait();
  console.log('Approved!');

  // 2. Deposit
  const depositTx = await bridge.depositERC20(RAMA_TOKEN, parseRama('10'));
  const receipt = await depositTx.wait();
  console.log('Deposited! Block:', receipt.blockNumber);

  // Check balance on Ramestta (after state sync)
  setTimeout(async () => {
    const ramesttaBalance = await bridge.getRamesttaBalance(myAddress);
    console.log('Ramestta Balance:', formatRama(ramesttaBalance));
  }, 5 * 60 * 1000); // Wait 5 minutes
}
```

## Contract Addresses

### Polygon (L2)

| Contract | Address |
|----------|---------|
| RootChain | `0x32BC23e5FFf7D567313dB4F41A5125Ad9D9Bca63` |
| DepositManager | `0x81ebFB0c73d3165c4719E9604cDa55eF91226dAf` |
| WithdrawManager | `0x6e07F852bAC263492e8C710dB7c0d59275268db8` |
| StateSender | `0xE0C9051E655380D1d880b9B0f4b500cEbD09278f` |
| ERC20Predicate | `0xEc65755B726405e30a869ABd7EE5E66350dE682c` |
| RamaToken | `0x55a5CC06801bBa4C030568f1A7ee1c753FDcbe36` |

### Ramestta (L3)

| Contract | Address |
|----------|---------|
| ChildChain | `0xfE9abcBF139636208efbaf9214E79c4932491303` |
| MRC20 | `0x0000000000000000000000000000000000001010` |

## Networks

| Network | Chain ID | RPC |
|---------|----------|-----|
| Polygon Mainnet | 137 | https://polygon-rpc.com |
| Ramestta Mainnet | 1370 | https://blockchain.ramestta.com |
| Ramestta Testnet | 1371 | https://testnet.ramestta.com |

## License

MIT © Ramestta Team
