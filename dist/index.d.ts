import { ethers, BigNumber, Signer, providers } from 'ethers';
export interface BridgeConfig {
    polygonProvider: providers.Provider;
    ramesttaProvider: providers.Provider;
    polygonSigner?: Signer;
    ramesttaSigner?: Signer;
}
export interface TokenInfo {
    address: string;
    name: string;
    symbol: string;
    decimals: number;
    isERC721: boolean;
    rootToken?: string;
    childToken?: string;
}
export interface DepositResult {
    txHash: string;
    depositId: BigNumber;
    token: string;
    amount: BigNumber;
    user: string;
}
export interface WithdrawResult {
    txHash: string;
    burnTxHash: string;
    token: string;
    amount: BigNumber;
    user: string;
    exitId?: BigNumber;
}
export interface BridgeTransaction {
    hash: string;
    type: 'deposit' | 'withdraw' | 'exit';
    token: string;
    amount: BigNumber;
    from: string;
    to: string;
    status: TransactionStatus;
    timestamp: number;
    blockNumber: number;
}
export declare enum TransactionStatus {
    Pending = "Pending",
    Confirmed = "Confirmed",
    Checkpointed = "Checkpointed",
    Exited = "Exited",
    Failed = "Failed"
}
export interface CheckpointInfo {
    headerNumber: BigNumber;
    start: BigNumber;
    end: BigNumber;
    root: string;
    proposer: string;
    createdAt: BigNumber;
}
export declare class BridgeClient {
    private polygonProvider;
    private ramesttaProvider;
    private polygonSigner?;
    private ramesttaSigner?;
    private rootChain;
    private depositManager;
    private withdrawManager;
    private stateSender;
    private erc20Predicate;
    private erc721Predicate;
    private childChain;
    private mrc20;
    constructor(config: BridgeConfig);
    /**
     * Get the latest checkpoint on the root chain
     */
    getLastCheckpoint(): Promise<CheckpointInfo | null>;
    /**
     * Check if a block has been checkpointed
     */
    isCheckpointed(blockNumber: number): Promise<boolean>;
    /**
     * Get child token address for a root token
     * For RAMA token: returns MRC20 (0x1010) which has the mapping in its token() function
     */
    getChildToken(rootToken: string): Promise<string>;
    /**
     * Check if token is ERC721
     */
    isERC721(rootToken: string): Promise<boolean>;
    /**
     * Get token balance on Polygon (L2)
     */
    getPolygonBalance(tokenAddress: string, userAddress: string): Promise<BigNumber>;
    /**
     * Get native RAMA balance on Ramestta (L3)
     */
    getRamesttaBalance(userAddress: string): Promise<BigNumber>;
    /**
     * Get token balance on Ramestta (L3)
     */
    getChildTokenBalance(childToken: string, userAddress: string): Promise<BigNumber>;
    /**
     * Get exit info for a specific exit ID
     */
    getExitInfo(exitId: BigNumber): Promise<any>;
    /**
     * Get token info
     */
    getTokenInfo(tokenAddress: string, isRoot?: boolean): Promise<TokenInfo>;
    /**
     * Approve tokens for deposit
     */
    approveDeposit(tokenAddress: string, amount: BigNumber): Promise<ethers.ContractTransaction>;
    /**
     * Approve max tokens for deposit
     */
    approveMaxDeposit(tokenAddress: string): Promise<ethers.ContractTransaction>;
    /**
     * Deposit ERC20 tokens from Polygon to Ramestta
     * @param tokenAddress - Root token address on Polygon
     * @param amount - Amount to deposit
     * @param userAddress - Recipient address on Ramestta (optional, defaults to sender)
     */
    depositERC20(tokenAddress: string, amount: BigNumber, userAddress?: string): Promise<ethers.ContractTransaction>;
    /**
     * Deposit ERC721 NFT from Polygon to Ramestta
     * @param tokenAddress - Root token address on Polygon
     * @param tokenId - NFT token ID
     */
    depositERC721(tokenAddress: string, tokenId: BigNumber): Promise<ethers.ContractTransaction>;
    /**
     * Deposit native RAMA using predicate
     */
    depositRAMA(amount: BigNumber): Promise<ethers.ContractTransaction>;
    /**
     * Start withdrawal by burning tokens on Ramestta
     * @param childToken - Child token address on Ramestta
     * @param amount - Amount to withdraw
     */
    startWithdraw(childToken: string, amount: BigNumber): Promise<ethers.ContractTransaction>;
    /**
     * Start native RAMA withdrawal
     */
    startRAMAWithdraw(amount: BigNumber): Promise<ethers.ContractTransaction>;
    /**
     * Process exits for a token
     * @param tokenAddress - Root token address
     * @param maxExits - Maximum number of exits to process
     */
    processExits(tokenAddress: string, maxExits?: number): Promise<ethers.ContractTransaction>;
    private requirePolygonSigner;
    private requireRamesttaSigner;
    /**
     * Wait for transaction confirmation
     */
    waitForTransaction(txHash: string, provider: providers.Provider, confirmations?: number): Promise<providers.TransactionReceipt>;
    /**
     * Wait for checkpoint inclusion
     */
    waitForCheckpoint(blockNumber: number, maxWaitMs?: number): Promise<boolean>;
    /**
     * Get contract addresses
     */
    getContractAddresses(): {
        polygon: {
            rootChain: "0x32BC23e5FFf7D567313dB4F41A5125Ad9D9Bca63";
            depositManager: "0x81ebFB0c73d3165c4719E9604cDa55eF91226dAf";
            withdrawManager: "0x6e07F852bAC263492e8C710dB7c0d59275268db8";
            stateSender: "0xE0C9051E655380D1d880b9B0f4b500cEbD09278f";
            erc20Predicate: "0xEc65755B726405e30a869ABd7EE5E66350dE682c";
            erc721Predicate: "0x02F08C48DaB9739C49A1F6C681B32fEFeCa9F1A9";
            ramaToken: "0x55a5CC06801bBa4C030568f1A7ee1c753FDcbe36";
        };
        ramestta: {
            childChain: "0xfE9abcBF139636208efbaf9214E79c4932491303";
            mrc20: "0x0000000000000000000000000000000000001010";
        };
    };
    /**
     * Get network info
     */
    getNetworkInfo(): {
        polygon: {
            readonly chainId: 137;
            readonly name: "Polygon Mainnet";
            readonly rpcUrl: "https://polygon-rpc.com";
            readonly explorer: "https://polygonscan.com";
            readonly nativeCurrency: {
                readonly name: "POL";
                readonly symbol: "POL";
                readonly decimals: 18;
            };
        };
        ramestta: {
            readonly chainId: 1370;
            readonly name: "Ramestta Mainnet";
            readonly rpcUrl: "https://blockchain.ramestta.com";
            readonly wsUrl: "wss://blockchain.ramestta.com/ws";
            readonly explorer: "https://ramascan.com";
            readonly nativeCurrency: {
                readonly name: "Ramestta";
                readonly symbol: "RAMA";
                readonly decimals: 18;
            };
        };
    };
}
/**
 * Create a read-only bridge client
 */
export declare function createBridgeClient(polygonProviderOrUrl?: providers.Provider | string, ramesttaProviderOrUrl?: providers.Provider | string): BridgeClient;
/**
 * Create bridge client with signers
 */
export declare function createBridgeClientWithSigners(polygonSigner: Signer, ramesttaSigner: Signer): BridgeClient;
/**
 * Create bridge client from private key
 */
export declare function createBridgeClientFromPrivateKey(privateKey: string, polygonProviderOrUrl?: providers.Provider | string, ramesttaProviderOrUrl?: providers.Provider | string): BridgeClient;
/**
 * Format token amount
 */
export declare function formatAmount(amount: BigNumber, decimals?: number): string;
/**
 * Parse token amount
 */
export declare function parseAmount(amount: string, decimals?: number): BigNumber;
/**
 * Format RAMA amount (18 decimals)
 */
export declare function formatRama(amount: BigNumber): string;
/**
 * Parse RAMA amount
 */
export declare function parseRama(amount: string): BigNumber;
/**
 * Calculate estimated bridge time
 */
export declare function estimateBridgeTime(direction: 'deposit' | 'withdraw'): string;
/**
 * Check if address is valid
 */
export declare function isValidAddress(address: string): boolean;
export { POLYGON_CONTRACTS, RAMESTTA_CONTRACTS, NETWORKS, ROOT_CHAIN_ABI, DEPOSIT_MANAGER_ABI, WITHDRAW_MANAGER_ABI, CHILD_CHAIN_ABI, CHILD_ERC20_ABI, ERC20_ABI, MRC20_ABI, } from '@ramestta/contracts';
export default BridgeClient;
//# sourceMappingURL=index.d.ts.map