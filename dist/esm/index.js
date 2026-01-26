// ============================================================
// @ramestta/bridge-sdk - Bridge SDK for Ramestta Network
// Cross-chain deposits and withdrawals between Polygon (L2) and Ramestta (L3)
// ============================================================
import { ethers, Contract, BigNumber } from 'ethers';
import { POLYGON_CONTRACTS, RAMESTTA_CONTRACTS, NETWORKS, ROOT_CHAIN_ABI, DEPOSIT_MANAGER_ABI, WITHDRAW_MANAGER_ABI, CHILD_CHAIN_ABI, CHILD_ERC20_ABI, ERC20_ABI, ERC20_PREDICATE_ABI, ERC721_PREDICATE_ABI, STATE_SENDER_ABI, MRC20_ABI, } from '@ramestta/contracts';
export var TransactionStatus;
(function (TransactionStatus) {
    TransactionStatus["Pending"] = "Pending";
    TransactionStatus["Confirmed"] = "Confirmed";
    TransactionStatus["Checkpointed"] = "Checkpointed";
    TransactionStatus["Exited"] = "Exited";
    TransactionStatus["Failed"] = "Failed";
})(TransactionStatus || (TransactionStatus = {}));
// ============================================================
// BridgeClient Class
// ============================================================
export class BridgeClient {
    constructor(config) {
        this.polygonProvider = config.polygonProvider;
        this.ramesttaProvider = config.ramesttaProvider;
        this.polygonSigner = config.polygonSigner;
        this.ramesttaSigner = config.ramesttaSigner;
        const polygonSignerOrProvider = this.polygonSigner || this.polygonProvider;
        const ramesttaSignerOrProvider = this.ramesttaSigner || this.ramesttaProvider;
        // Initialize Polygon contracts
        this.rootChain = new Contract(POLYGON_CONTRACTS.RootChain, ROOT_CHAIN_ABI, polygonSignerOrProvider);
        this.depositManager = new Contract(POLYGON_CONTRACTS.DepositManager, DEPOSIT_MANAGER_ABI, polygonSignerOrProvider);
        this.withdrawManager = new Contract(POLYGON_CONTRACTS.WithdrawManager, WITHDRAW_MANAGER_ABI, polygonSignerOrProvider);
        this.stateSender = new Contract(POLYGON_CONTRACTS.StateSender, STATE_SENDER_ABI, polygonSignerOrProvider);
        this.erc20Predicate = new Contract(POLYGON_CONTRACTS.ERC20Predicate, ERC20_PREDICATE_ABI, polygonSignerOrProvider);
        this.erc721Predicate = new Contract(POLYGON_CONTRACTS.ERC721Predicate, ERC721_PREDICATE_ABI, polygonSignerOrProvider);
        // Initialize Ramestta contracts
        this.childChain = new Contract(RAMESTTA_CONTRACTS.ChildChain, CHILD_CHAIN_ABI, ramesttaSignerOrProvider);
        this.mrc20 = new Contract(RAMESTTA_CONTRACTS.MRC20, MRC20_ABI, ramesttaSignerOrProvider);
    }
    // ============================================================
    // Read Methods - Polygon (L2)
    // ============================================================
    /**
     * Get the latest checkpoint on the root chain
     */
    async getLastCheckpoint() {
        try {
            const headerNumber = await this.rootChain.currentHeaderBlock();
            const header = await this.rootChain.headerBlocks(headerNumber);
            return {
                headerNumber,
                start: header.start || header[0],
                end: header.end || header[1],
                root: header.root || header[2],
                proposer: header.proposer || header[3],
                createdAt: (header.createdAt || header[4] || 0).toString(),
            };
        }
        catch {
            return null;
        }
    }
    /**
     * Check if a block has been checkpointed
     */
    async isCheckpointed(blockNumber) {
        try {
            const checkpoint = await this.getLastCheckpoint();
            if (!checkpoint)
                return false;
            return BigNumber.from(blockNumber).lte(checkpoint.end);
        }
        catch {
            return false;
        }
    }
    /**
     * Get child token address for a root token
     * For RAMA token: returns MRC20 (0x1010) which has the mapping in its token() function
     */
    async getChildToken(rootToken) {
        // Check if it's the RAMA token - use MRC20 mapping
        const ramaToken = POLYGON_CONTRACTS.RamaToken.toLowerCase();
        if (rootToken.toLowerCase() === ramaToken) {
            // RAMA on Polygon maps to MRC20 on Ramestta
            const mrc20RootToken = await this.mrc20.token();
            if (mrc20RootToken.toLowerCase() === ramaToken) {
                return RAMESTTA_CONTRACTS.MRC20;
            }
        }
        // For other tokens, try the childChain contract
        try {
            return await this.childChain.tokens(rootToken);
        }
        catch {
            return ethers.constants.AddressZero;
        }
    }
    /**
     * Check if token is ERC721
     */
    async isERC721(rootToken) {
        // RAMA is not ERC721
        if (rootToken.toLowerCase() === POLYGON_CONTRACTS.RamaToken.toLowerCase()) {
            return false;
        }
        try {
            return await this.childChain.isERC721(rootToken);
        }
        catch {
            return false;
        }
    }
    /**
     * Get token balance on Polygon (L2)
     */
    async getPolygonBalance(tokenAddress, userAddress) {
        const token = new Contract(tokenAddress, ERC20_ABI, this.polygonProvider);
        return token.balanceOf(userAddress);
    }
    /**
     * Get native RAMA balance on Ramestta (L3)
     */
    async getRamesttaBalance(userAddress) {
        return this.ramesttaProvider.getBalance(userAddress);
    }
    /**
     * Get token balance on Ramestta (L3)
     */
    async getChildTokenBalance(childToken, userAddress) {
        const token = new Contract(childToken, CHILD_ERC20_ABI, this.ramesttaProvider);
        return token.balanceOf(userAddress);
    }
    /**
     * Get exit info for a specific exit ID
     */
    async getExitInfo(exitId) {
        return this.withdrawManager.exits(exitId);
    }
    /**
     * Get token info
     */
    async getTokenInfo(tokenAddress, isRoot = true) {
        const provider = isRoot ? this.polygonProvider : this.ramesttaProvider;
        const token = new Contract(tokenAddress, ERC20_ABI, provider);
        const [name, symbol, decimals] = await Promise.all([
            token.name().catch(() => 'Unknown'),
            token.symbol().catch(() => 'UNK'),
            token.decimals().catch(() => 18),
        ]);
        let childToken;
        let rootToken;
        if (isRoot) {
            childToken = await this.getChildToken(tokenAddress).catch(() => undefined);
        }
        return {
            address: tokenAddress,
            name,
            symbol,
            decimals,
            isERC721: false,
            rootToken: isRoot ? tokenAddress : rootToken,
            childToken: isRoot ? childToken : tokenAddress,
        };
    }
    // ============================================================
    // Write Methods - Deposit (L2 → L3)
    // ============================================================
    /**
     * Approve tokens for deposit
     */
    async approveDeposit(tokenAddress, amount) {
        this.requirePolygonSigner();
        const token = new Contract(tokenAddress, ERC20_ABI, this.polygonSigner);
        return token.approve(POLYGON_CONTRACTS.DepositManager, amount);
    }
    /**
     * Approve max tokens for deposit
     */
    async approveMaxDeposit(tokenAddress) {
        return this.approveDeposit(tokenAddress, ethers.constants.MaxUint256);
    }
    /**
     * Deposit ERC20 tokens from Polygon to Ramestta
     * @param tokenAddress - Root token address on Polygon
     * @param amount - Amount to deposit
     * @param userAddress - Recipient address on Ramestta (optional, defaults to sender)
     */
    async depositERC20(tokenAddress, amount, userAddress) {
        this.requirePolygonSigner();
        const user = userAddress || await this.polygonSigner.getAddress();
        // Check allowance
        const token = new Contract(tokenAddress, ERC20_ABI, this.polygonProvider);
        const allowance = await token.allowance(user, POLYGON_CONTRACTS.DepositManager);
        if (allowance.lt(amount)) {
            throw new Error(`Insufficient allowance. Please approve at least ${ethers.utils.formatEther(amount)} tokens first.`);
        }
        return this.depositManager.depositERC20ForUser(tokenAddress, user, amount);
    }
    /**
     * Deposit ERC721 NFT from Polygon to Ramestta
     * @param tokenAddress - Root token address on Polygon
     * @param tokenId - NFT token ID
     */
    async depositERC721(tokenAddress, tokenId) {
        this.requirePolygonSigner();
        return this.depositManager.depositERC721ForUser(tokenAddress, tokenId);
    }
    /**
     * Deposit native RAMA using predicate
     */
    async depositRAMA(amount) {
        this.requirePolygonSigner();
        const user = await this.polygonSigner.getAddress();
        const ramaToken = POLYGON_CONTRACTS.RamaToken;
        // Check allowance
        const token = new Contract(ramaToken, ERC20_ABI, this.polygonProvider);
        const allowance = await token.allowance(user, POLYGON_CONTRACTS.ERC20Predicate);
        if (allowance.lt(amount)) {
            throw new Error(`Insufficient allowance. Please approve RAMA tokens first.`);
        }
        const depositData = ethers.utils.defaultAbiCoder.encode(['uint256'], [amount]);
        return this.erc20Predicate.lockTokens(user, user, ramaToken, depositData);
    }
    // ============================================================
    // Write Methods - Withdraw (L3 → L2)
    // ============================================================
    /**
     * Start withdrawal by burning tokens on Ramestta
     * @param childToken - Child token address on Ramestta
     * @param amount - Amount to withdraw
     */
    async startWithdraw(childToken, amount) {
        this.requireRamesttaSigner();
        const token = new Contract(childToken, CHILD_ERC20_ABI, this.ramesttaSigner);
        return token.withdraw(amount);
    }
    /**
     * Start native RAMA withdrawal
     */
    async startRAMAWithdraw(amount) {
        this.requireRamesttaSigner();
        return this.mrc20.withdraw(amount, { value: amount });
    }
    /**
     * Process exits for a token
     * @param tokenAddress - Root token address
     * @param maxExits - Maximum number of exits to process
     */
    async processExits(tokenAddress, maxExits = 20) {
        this.requirePolygonSigner();
        return this.withdrawManager.processExits(tokenAddress, maxExits);
    }
    // ============================================================
    // Utility Methods
    // ============================================================
    requirePolygonSigner() {
        if (!this.polygonSigner) {
            throw new Error('Polygon signer required. Initialize BridgeClient with polygonSigner.');
        }
    }
    requireRamesttaSigner() {
        if (!this.ramesttaSigner) {
            throw new Error('Ramestta signer required. Initialize BridgeClient with ramesttaSigner.');
        }
    }
    /**
     * Wait for transaction confirmation
     */
    async waitForTransaction(txHash, provider, confirmations = 1) {
        return provider.waitForTransaction(txHash, confirmations);
    }
    /**
     * Wait for checkpoint inclusion
     */
    async waitForCheckpoint(blockNumber, maxWaitMs = 30 * 60 * 1000 // 30 minutes default
    ) {
        const startTime = Date.now();
        while (Date.now() - startTime < maxWaitMs) {
            const isCheckpointed = await this.isCheckpointed(blockNumber);
            if (isCheckpointed)
                return true;
            // Wait 30 seconds before checking again
            await new Promise(resolve => setTimeout(resolve, 30000));
        }
        return false;
    }
    /**
     * Get contract addresses
     */
    getContractAddresses() {
        return {
            polygon: {
                rootChain: POLYGON_CONTRACTS.RootChain,
                depositManager: POLYGON_CONTRACTS.DepositManager,
                withdrawManager: POLYGON_CONTRACTS.WithdrawManager,
                stateSender: POLYGON_CONTRACTS.StateSender,
                erc20Predicate: POLYGON_CONTRACTS.ERC20Predicate,
                erc721Predicate: POLYGON_CONTRACTS.ERC721Predicate,
                ramaToken: POLYGON_CONTRACTS.RamaToken,
            },
            ramestta: {
                childChain: RAMESTTA_CONTRACTS.ChildChain,
                mrc20: RAMESTTA_CONTRACTS.MRC20,
            },
        };
    }
    /**
     * Get network info
     */
    getNetworkInfo() {
        return {
            polygon: NETWORKS.POLYGON_MAINNET,
            ramestta: NETWORKS.RAMESTTA_MAINNET,
        };
    }
}
// ============================================================
// Factory Functions
// ============================================================
/**
 * Create a read-only bridge client
 */
export function createBridgeClient(polygonProviderOrUrl = NETWORKS.POLYGON_MAINNET.rpcUrl, ramesttaProviderOrUrl = NETWORKS.RAMESTTA_MAINNET.rpcUrl) {
    const polygonProvider = typeof polygonProviderOrUrl === 'string'
        ? new ethers.providers.JsonRpcProvider(polygonProviderOrUrl)
        : polygonProviderOrUrl;
    const ramesttaProvider = typeof ramesttaProviderOrUrl === 'string'
        ? new ethers.providers.JsonRpcProvider(ramesttaProviderOrUrl)
        : ramesttaProviderOrUrl;
    return new BridgeClient({ polygonProvider, ramesttaProvider });
}
/**
 * Create bridge client with signers
 */
export function createBridgeClientWithSigners(polygonSigner, ramesttaSigner) {
    return new BridgeClient({
        polygonProvider: polygonSigner.provider,
        ramesttaProvider: ramesttaSigner.provider,
        polygonSigner,
        ramesttaSigner,
    });
}
/**
 * Create bridge client from private key
 */
export function createBridgeClientFromPrivateKey(privateKey, polygonProviderOrUrl = NETWORKS.POLYGON_MAINNET.rpcUrl, ramesttaProviderOrUrl = NETWORKS.RAMESTTA_MAINNET.rpcUrl) {
    const polygonProvider = typeof polygonProviderOrUrl === 'string'
        ? new ethers.providers.JsonRpcProvider(polygonProviderOrUrl)
        : polygonProviderOrUrl;
    const ramesttaProvider = typeof ramesttaProviderOrUrl === 'string'
        ? new ethers.providers.JsonRpcProvider(ramesttaProviderOrUrl)
        : ramesttaProviderOrUrl;
    const polygonSigner = new ethers.Wallet(privateKey, polygonProvider);
    const ramesttaSigner = new ethers.Wallet(privateKey, ramesttaProvider);
    return new BridgeClient({
        polygonProvider,
        ramesttaProvider,
        polygonSigner,
        ramesttaSigner,
    });
}
// ============================================================
// Utility Functions
// ============================================================
/**
 * Format token amount
 */
export function formatAmount(amount, decimals = 18) {
    return ethers.utils.formatUnits(amount, decimals);
}
/**
 * Parse token amount
 */
export function parseAmount(amount, decimals = 18) {
    return ethers.utils.parseUnits(amount, decimals);
}
/**
 * Format RAMA amount (18 decimals)
 */
export function formatRama(amount) {
    return ethers.utils.formatEther(amount);
}
/**
 * Parse RAMA amount
 */
export function parseRama(amount) {
    return ethers.utils.parseEther(amount);
}
/**
 * Calculate estimated bridge time
 */
export function estimateBridgeTime(direction) {
    if (direction === 'deposit') {
        return '5-10 minutes (after state sync)';
    }
    else {
        return '30-45 minutes (after checkpoint + challenge period)';
    }
}
/**
 * Check if address is valid
 */
export function isValidAddress(address) {
    return ethers.utils.isAddress(address);
}
// ============================================================
// Exports
// ============================================================
export { POLYGON_CONTRACTS, RAMESTTA_CONTRACTS, NETWORKS, ROOT_CHAIN_ABI, DEPOSIT_MANAGER_ABI, WITHDRAW_MANAGER_ABI, CHILD_CHAIN_ABI, CHILD_ERC20_ABI, ERC20_ABI, MRC20_ABI, } from '@ramestta/contracts';
export default BridgeClient;
//# sourceMappingURL=index.js.map