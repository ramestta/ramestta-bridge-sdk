"use strict";
// ============================================================
// @ramestta/bridge-sdk - Bridge SDK for Ramestta Network
// Cross-chain deposits and withdrawals between Polygon (L2) and Ramestta (L3)
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.MRC20_ABI = exports.ERC20_ABI = exports.CHILD_ERC20_ABI = exports.CHILD_CHAIN_ABI = exports.WITHDRAW_MANAGER_ABI = exports.DEPOSIT_MANAGER_ABI = exports.ROOT_CHAIN_ABI = exports.NETWORKS = exports.RAMESTTA_CONTRACTS = exports.POLYGON_CONTRACTS = exports.BridgeClient = exports.TransactionStatus = void 0;
exports.createBridgeClient = createBridgeClient;
exports.createBridgeClientWithSigners = createBridgeClientWithSigners;
exports.createBridgeClientFromPrivateKey = createBridgeClientFromPrivateKey;
exports.formatAmount = formatAmount;
exports.parseAmount = parseAmount;
exports.formatRama = formatRama;
exports.parseRama = parseRama;
exports.estimateBridgeTime = estimateBridgeTime;
exports.isValidAddress = isValidAddress;
const ethers_1 = require("ethers");
const contracts_1 = require("@ramestta/contracts");
var TransactionStatus;
(function (TransactionStatus) {
    TransactionStatus["Pending"] = "Pending";
    TransactionStatus["Confirmed"] = "Confirmed";
    TransactionStatus["Checkpointed"] = "Checkpointed";
    TransactionStatus["Exited"] = "Exited";
    TransactionStatus["Failed"] = "Failed";
})(TransactionStatus || (exports.TransactionStatus = TransactionStatus = {}));
// ============================================================
// BridgeClient Class
// ============================================================
class BridgeClient {
    constructor(config) {
        this.polygonProvider = config.polygonProvider;
        this.ramesttaProvider = config.ramesttaProvider;
        this.polygonSigner = config.polygonSigner;
        this.ramesttaSigner = config.ramesttaSigner;
        const polygonSignerOrProvider = this.polygonSigner || this.polygonProvider;
        const ramesttaSignerOrProvider = this.ramesttaSigner || this.ramesttaProvider;
        // Initialize Polygon contracts
        this.rootChain = new ethers_1.Contract(contracts_1.POLYGON_CONTRACTS.RootChain, contracts_1.ROOT_CHAIN_ABI, polygonSignerOrProvider);
        this.depositManager = new ethers_1.Contract(contracts_1.POLYGON_CONTRACTS.DepositManager, contracts_1.DEPOSIT_MANAGER_ABI, polygonSignerOrProvider);
        this.withdrawManager = new ethers_1.Contract(contracts_1.POLYGON_CONTRACTS.WithdrawManager, contracts_1.WITHDRAW_MANAGER_ABI, polygonSignerOrProvider);
        this.stateSender = new ethers_1.Contract(contracts_1.POLYGON_CONTRACTS.StateSender, contracts_1.STATE_SENDER_ABI, polygonSignerOrProvider);
        this.erc20Predicate = new ethers_1.Contract(contracts_1.POLYGON_CONTRACTS.ERC20Predicate, contracts_1.ERC20_PREDICATE_ABI, polygonSignerOrProvider);
        this.erc721Predicate = new ethers_1.Contract(contracts_1.POLYGON_CONTRACTS.ERC721Predicate, contracts_1.ERC721_PREDICATE_ABI, polygonSignerOrProvider);
        // Initialize Ramestta contracts
        this.childChain = new ethers_1.Contract(contracts_1.RAMESTTA_CONTRACTS.ChildChain, contracts_1.CHILD_CHAIN_ABI, ramesttaSignerOrProvider);
        this.mrc20 = new ethers_1.Contract(contracts_1.RAMESTTA_CONTRACTS.MRC20, contracts_1.MRC20_ABI, ramesttaSignerOrProvider);
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
            return ethers_1.BigNumber.from(blockNumber).lte(checkpoint.end);
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
        const ramaToken = contracts_1.POLYGON_CONTRACTS.RamaToken.toLowerCase();
        if (rootToken.toLowerCase() === ramaToken) {
            // RAMA on Polygon maps to MRC20 on Ramestta
            const mrc20RootToken = await this.mrc20.token();
            if (mrc20RootToken.toLowerCase() === ramaToken) {
                return contracts_1.RAMESTTA_CONTRACTS.MRC20;
            }
        }
        // For other tokens, try the childChain contract
        try {
            return await this.childChain.tokens(rootToken);
        }
        catch {
            return ethers_1.ethers.constants.AddressZero;
        }
    }
    /**
     * Check if token is ERC721
     */
    async isERC721(rootToken) {
        // RAMA is not ERC721
        if (rootToken.toLowerCase() === contracts_1.POLYGON_CONTRACTS.RamaToken.toLowerCase()) {
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
        const token = new ethers_1.Contract(tokenAddress, contracts_1.ERC20_ABI, this.polygonProvider);
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
        const token = new ethers_1.Contract(childToken, contracts_1.CHILD_ERC20_ABI, this.ramesttaProvider);
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
        const token = new ethers_1.Contract(tokenAddress, contracts_1.ERC20_ABI, provider);
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
        const token = new ethers_1.Contract(tokenAddress, contracts_1.ERC20_ABI, this.polygonSigner);
        return token.approve(contracts_1.POLYGON_CONTRACTS.DepositManager, amount);
    }
    /**
     * Approve max tokens for deposit
     */
    async approveMaxDeposit(tokenAddress) {
        return this.approveDeposit(tokenAddress, ethers_1.ethers.constants.MaxUint256);
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
        const token = new ethers_1.Contract(tokenAddress, contracts_1.ERC20_ABI, this.polygonProvider);
        const allowance = await token.allowance(user, contracts_1.POLYGON_CONTRACTS.DepositManager);
        if (allowance.lt(amount)) {
            throw new Error(`Insufficient allowance. Please approve at least ${ethers_1.ethers.utils.formatEther(amount)} tokens first.`);
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
        const ramaToken = contracts_1.POLYGON_CONTRACTS.RamaToken;
        // Check allowance
        const token = new ethers_1.Contract(ramaToken, contracts_1.ERC20_ABI, this.polygonProvider);
        const allowance = await token.allowance(user, contracts_1.POLYGON_CONTRACTS.ERC20Predicate);
        if (allowance.lt(amount)) {
            throw new Error(`Insufficient allowance. Please approve RAMA tokens first.`);
        }
        const depositData = ethers_1.ethers.utils.defaultAbiCoder.encode(['uint256'], [amount]);
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
        const token = new ethers_1.Contract(childToken, contracts_1.CHILD_ERC20_ABI, this.ramesttaSigner);
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
                rootChain: contracts_1.POLYGON_CONTRACTS.RootChain,
                depositManager: contracts_1.POLYGON_CONTRACTS.DepositManager,
                withdrawManager: contracts_1.POLYGON_CONTRACTS.WithdrawManager,
                stateSender: contracts_1.POLYGON_CONTRACTS.StateSender,
                erc20Predicate: contracts_1.POLYGON_CONTRACTS.ERC20Predicate,
                erc721Predicate: contracts_1.POLYGON_CONTRACTS.ERC721Predicate,
                ramaToken: contracts_1.POLYGON_CONTRACTS.RamaToken,
            },
            ramestta: {
                childChain: contracts_1.RAMESTTA_CONTRACTS.ChildChain,
                mrc20: contracts_1.RAMESTTA_CONTRACTS.MRC20,
            },
        };
    }
    /**
     * Get network info
     */
    getNetworkInfo() {
        return {
            polygon: contracts_1.NETWORKS.POLYGON_MAINNET,
            ramestta: contracts_1.NETWORKS.RAMESTTA_MAINNET,
        };
    }
}
exports.BridgeClient = BridgeClient;
// ============================================================
// Factory Functions
// ============================================================
/**
 * Create a read-only bridge client
 */
function createBridgeClient(polygonProviderOrUrl = contracts_1.NETWORKS.POLYGON_MAINNET.rpcUrl, ramesttaProviderOrUrl = contracts_1.NETWORKS.RAMESTTA_MAINNET.rpcUrl) {
    const polygonProvider = typeof polygonProviderOrUrl === 'string'
        ? new ethers_1.ethers.providers.JsonRpcProvider(polygonProviderOrUrl)
        : polygonProviderOrUrl;
    const ramesttaProvider = typeof ramesttaProviderOrUrl === 'string'
        ? new ethers_1.ethers.providers.JsonRpcProvider(ramesttaProviderOrUrl)
        : ramesttaProviderOrUrl;
    return new BridgeClient({ polygonProvider, ramesttaProvider });
}
/**
 * Create bridge client with signers
 */
function createBridgeClientWithSigners(polygonSigner, ramesttaSigner) {
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
function createBridgeClientFromPrivateKey(privateKey, polygonProviderOrUrl = contracts_1.NETWORKS.POLYGON_MAINNET.rpcUrl, ramesttaProviderOrUrl = contracts_1.NETWORKS.RAMESTTA_MAINNET.rpcUrl) {
    const polygonProvider = typeof polygonProviderOrUrl === 'string'
        ? new ethers_1.ethers.providers.JsonRpcProvider(polygonProviderOrUrl)
        : polygonProviderOrUrl;
    const ramesttaProvider = typeof ramesttaProviderOrUrl === 'string'
        ? new ethers_1.ethers.providers.JsonRpcProvider(ramesttaProviderOrUrl)
        : ramesttaProviderOrUrl;
    const polygonSigner = new ethers_1.ethers.Wallet(privateKey, polygonProvider);
    const ramesttaSigner = new ethers_1.ethers.Wallet(privateKey, ramesttaProvider);
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
function formatAmount(amount, decimals = 18) {
    return ethers_1.ethers.utils.formatUnits(amount, decimals);
}
/**
 * Parse token amount
 */
function parseAmount(amount, decimals = 18) {
    return ethers_1.ethers.utils.parseUnits(amount, decimals);
}
/**
 * Format RAMA amount (18 decimals)
 */
function formatRama(amount) {
    return ethers_1.ethers.utils.formatEther(amount);
}
/**
 * Parse RAMA amount
 */
function parseRama(amount) {
    return ethers_1.ethers.utils.parseEther(amount);
}
/**
 * Calculate estimated bridge time
 */
function estimateBridgeTime(direction) {
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
function isValidAddress(address) {
    return ethers_1.ethers.utils.isAddress(address);
}
// ============================================================
// Exports
// ============================================================
var contracts_2 = require("@ramestta/contracts");
Object.defineProperty(exports, "POLYGON_CONTRACTS", { enumerable: true, get: function () { return contracts_2.POLYGON_CONTRACTS; } });
Object.defineProperty(exports, "RAMESTTA_CONTRACTS", { enumerable: true, get: function () { return contracts_2.RAMESTTA_CONTRACTS; } });
Object.defineProperty(exports, "NETWORKS", { enumerable: true, get: function () { return contracts_2.NETWORKS; } });
Object.defineProperty(exports, "ROOT_CHAIN_ABI", { enumerable: true, get: function () { return contracts_2.ROOT_CHAIN_ABI; } });
Object.defineProperty(exports, "DEPOSIT_MANAGER_ABI", { enumerable: true, get: function () { return contracts_2.DEPOSIT_MANAGER_ABI; } });
Object.defineProperty(exports, "WITHDRAW_MANAGER_ABI", { enumerable: true, get: function () { return contracts_2.WITHDRAW_MANAGER_ABI; } });
Object.defineProperty(exports, "CHILD_CHAIN_ABI", { enumerable: true, get: function () { return contracts_2.CHILD_CHAIN_ABI; } });
Object.defineProperty(exports, "CHILD_ERC20_ABI", { enumerable: true, get: function () { return contracts_2.CHILD_ERC20_ABI; } });
Object.defineProperty(exports, "ERC20_ABI", { enumerable: true, get: function () { return contracts_2.ERC20_ABI; } });
Object.defineProperty(exports, "MRC20_ABI", { enumerable: true, get: function () { return contracts_2.MRC20_ABI; } });
exports.default = BridgeClient;
//# sourceMappingURL=index.js.map