declare global {
    interface Window {
        fs: {
            readFile(path: string, options?: { encoding?: string }): Promise<string | Uint8Array>;
        }
    }
}


interface AccountPermissions {
    access: string | null;
    editActionState: string | null;
    editState: string | null;
    incrementNonce: string | null;
    receive: string | null;
    send: string | null;
    setDelegate: string | null;
    setPermissions: string | null;
    setTiming: string | null;
    setTokenSymbol: string | null;
    setVerificationKey: string | null;
    setVotingFor: string | null;
    setZkappUri: string | null;
}

interface AccountTiming {
    initialMinimumBalance: number | null;
    cliffTime: number | null;
    cliffAmount: number | null;
    vestingPeriod: number | null;
    vestingIncrement: number | null;
}

interface AccountScam {
    scamId: string | null;
    objectType: string | null;
    onchainId: string | null;
    defaultSecurityMessage: string | null;
    securityMessage: string | null;
    scamType: string | null;
}

interface AccountUpdate {
    appState: string[];
    delegateeAddress: string | null;
    delegateeName: string | null;
    delegateeImg: string | null;
    permissions: AccountPermissions;
    timing: AccountTiming;
    tokenSymbol: string | null;
    verificationKey: string | null;
    votingFor: string | null;
    zkappUri: string | null;
}

interface Account {
    accountAddress: string;
    accountName: string | null;
    accountImg: string | null;
    isZkappAccount: boolean;
    verificationKey: string | null;
    verificationKeyHash: string | null;
    accountScam: AccountScam;
    incrementNonce: boolean;
    totalBalanceChange: number;
    totalBalanceChangeUsd: number;
    callDepth: number;
    useFullCommitment: boolean;
    callData: string;
    tokenId: string;
    update: AccountUpdate;
}

interface Transaction {
    blockHeight: number;
    stateHash: string;
    blockStatus: string;
    timestamp: number;
    txHash: string;
    txStatus: string;
    failures: string[];
    memo: string;
    feePayerAddress: string;
    fee: number;
    feeUsd: number;
    totalBalanceChange: number;
    totalBalanceChangeUsd: number;
    updatedAccountsCount: number;
    updatedAccounts: Account[];
    blockConfirmationsCount: number;
    isZkappAccount: boolean;
    nonce: number;
}

interface VisualizerConfig {
    nodePrefix?: string;
    showUsdValues?: boolean;
    detailedTransactionInfo?: boolean;
}

// Helper function
async function readFileAsString(path: string): Promise<string> {
    const response = await window.fs.readFile(path, { encoding: 'utf8' });
    if (response instanceof Uint8Array) {
        return new TextDecoder().decode(response);
    }
    return response;
}

export class TransactionVisualizer {
    private data: Transaction;
    private config: Required<VisualizerConfig>;
    
    constructor(data: Transaction, config: VisualizerConfig = {}) {
        this.data = data;
        this.config = {
            nodePrefix: config.nodePrefix ?? 'A',
            showUsdValues: config.showUsdValues ?? false,
            detailedTransactionInfo: config.detailedTransactionInfo ?? true
        };
    }

    private shortenAddress(address: string): string {
        if (!address) throw new Error('Invalid address provided');
        return `${address.slice(0, 6)}...${address.slice(-6)}`;
    }

    private getNodeStyle(account: Account): string {
        if (account.isZkappAccount) return 'zkapp';
        return account.totalBalanceChange >= 0 ? 'normal' : 'negative';
    }

    private formatBalance(balance: number, includeUsd: boolean = false): string {
        let formatted = `${balance} MINA`;
        if (includeUsd && this.config.showUsdValues) {
            const usdValue = (balance * this.data.feeUsd / this.data.fee).toFixed(2);
            formatted += ` ($${usdValue})`;
        }
        return formatted;
    }

    private addStyleDefinitions(): string[] {
        return [
            'graph TB',
            'classDef zkapp fill:#e6e6fa,stroke:#333,stroke-width:2px',
            'classDef normal fill:#add8e6,stroke:#333,stroke-width:2px',
            'classDef negative fill:#ffb6c1,stroke:#333,stroke-width:2px'
        ];
    }

    private generateNodes(): { nodes: string[], nodeMap: Map<string, string> } {
        const nodes: string[] = [];
        const nodeMap = new Map<string, string>();

        this.data.updatedAccounts.forEach((account, index) => {
            const nodeId = this.generateNodeId(index);
            const shortAddr = this.shortenAddress(account.accountAddress);
            const balance = this.formatBalance(account.totalBalanceChange, true);
            const style = this.getNodeStyle(account);

            nodes.push(`${nodeId}[${shortAddr}<br/>Balance: ${balance}]:::${style}`);
            nodeMap.set(account.accountAddress, nodeId);
        });

        return { nodes, nodeMap };
    }

    private generateNodeId(index: number): string {
        return `${this.config.nodePrefix}${index}`;
    }

    private generateEdges(nodeMap: Map<string, string>): string[] {
        const edges: string[] = [];
        
        const senders = this.data.updatedAccounts.filter(acc => acc.totalBalanceChange < 0);
        const receivers = this.data.updatedAccounts.filter(acc => acc.totalBalanceChange > 0);

        senders.forEach(sender => {
            receivers.forEach(receiver => {
                const senderId = nodeMap.get(sender.accountAddress);
                const receiverId = nodeMap.get(receiver.accountAddress);
                
                if (senderId && receiverId) {
                    const amount = Math.abs(sender.totalBalanceChange);
                    const label = this.formatBalance(amount, true);
                    edges.push(`${senderId} -->|"${label}"| ${receiverId}`);
                }
            });
        });

        return edges;
    }

    private generateTransactionInfo(): string[] {
        const info = ['subgraph Transaction Info'];
        
        if (this.config.detailedTransactionInfo) {
            info.push(
                `TxHash[TX: ${this.shortenAddress(this.data.txHash)}]`,
                `Memo[Memo: ${this.data.memo}]`,
                `Block[Block: ${this.data.blockHeight}]`,
                `Fee[Fee: ${this.formatBalance(this.data.fee, true)}]`,
                `Status[Status: ${this.data.txStatus}]`,
                `Time[Time: ${new Date(this.data.timestamp).toISOString()}]`
            );
        } else {
            info.push(
                `TxHash[TX: ${this.shortenAddress(this.data.txHash)}]`,
                `Memo[Memo: ${this.data.memo}]`,
                `Block[Block: ${this.data.blockHeight}]`
            );
        }
        
        info.push('end');
        return info;
    }

    public generateMermaidCode(): string {
        try {
            const styles = this.addStyleDefinitions();
            const { nodes, nodeMap } = this.generateNodes();
            const edges = this.generateEdges(nodeMap);
            const txInfo = this.generateTransactionInfo();

            return [
                ...styles,
                '',
                ...nodes,
                '',
                ...edges,
                '',
                ...txInfo
            ].join('\n');
        } catch (error) {
            throw new Error(`Failed to generate Mermaid code: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}

// Main visualization function
export async function visualizeTransaction(): Promise<string> {
    try {
        const fileContent = await readFileAsString('dummy_data.txt');
        const txData = JSON.parse(fileContent) as Transaction;

        const config: VisualizerConfig = {
            showUsdValues: true,
            detailedTransactionInfo: true
        };

        const visualizer = new TransactionVisualizer(txData, config);
        return visualizer.generateMermaidCode();
    } catch (error) {
        throw new Error(`Error processing transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Execute
visualizeTransaction().then(console.log).catch(console.error);