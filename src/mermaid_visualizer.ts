// Import Node's fs promises API
import { readFile } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { existsSync } from 'fs';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Styling constants for the visualizer
export const STYLE_CONSTANTS = {
    GRAPH_DIRECTION: 'TB',
    NODE_STYLES: {
        ZKAPP: {
            name: 'zkapp',
            fill: '#e6e6fa',
            stroke: '#483D8B',  // Darker border for better contrast
            strokeWidth: '4px', // Increased border thickness
            fontWeight: 'bold',
            fontSize: '16px'
        },
        NORMAL: {
            name: 'normal',
            fill: '#B0E0E6',    // Slightly darker for better visibility
            stroke: '#4682B4',  // Steel blue border
            strokeWidth: '3px',
            fontSize: '14px'
        },
        NEGATIVE: {
            name: 'negative',
            fill: '#FFB6C1',
            stroke: '#CD5C5C',  // Indian red border
            strokeWidth: '3px',
            fontSize: '14px'
        },
        INFO: {
            name: 'info',
            fill: '#F0F8FF',    // Alice blue background
            stroke: '#4682B4',  // Steel blue border
            strokeWidth: '2px',
            fontSize: '14px'
        }
    },
    ADDRESS_TRUNCATE_LENGTH: 6,
    SUBGRAPH_NAME: 'TransactionInfo',
    FONT_SIZES: {              // Enhanced font sizes for better readability
        NODE: 16,
        LABEL: 14,
        INFO: 15,
        TITLE: 18
    },
    SPACING: {                 // Added spacing configurations
        NODE_PADDING: 20,
        EDGE_LENGTH: 50
    }
} as const;

// Helper function to generate style definitions
export function generateStyleDefinitions(): string[] {
    const { NODE_STYLES, GRAPH_DIRECTION } = STYLE_CONSTANTS;
    
    return [
        `graph ${GRAPH_DIRECTION}`,
        `classDef ${NODE_STYLES.ZKAPP.name} fill:${NODE_STYLES.ZKAPP.fill},stroke:${NODE_STYLES.ZKAPP.stroke},stroke-width:${NODE_STYLES.ZKAPP.strokeWidth}`,
        `classDef ${NODE_STYLES.NORMAL.name} fill:${NODE_STYLES.NORMAL.fill},stroke:${NODE_STYLES.NORMAL.stroke},stroke-width:${NODE_STYLES.NORMAL.strokeWidth}`,
        `classDef ${NODE_STYLES.NEGATIVE.name} fill:${NODE_STYLES.NEGATIVE.fill},stroke:${NODE_STYLES.NEGATIVE.stroke},stroke-width:${NODE_STYLES.NEGATIVE.strokeWidth}`
    ];
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
        const { ADDRESS_TRUNCATE_LENGTH } = STYLE_CONSTANTS;
        return `${address.slice(0, ADDRESS_TRUNCATE_LENGTH)}...${address.slice(-ADDRESS_TRUNCATE_LENGTH)}`;
    }

    private getNodeStyle(account: Account): string {
        const { NODE_STYLES } = STYLE_CONSTANTS;
        if (account.isZkappAccount) return NODE_STYLES.ZKAPP.name;
        return account.totalBalanceChange >= 0 ? NODE_STYLES.NORMAL.name : NODE_STYLES.NEGATIVE.name;
    }

    private formatBalance(balance: number, includeUsd: boolean = false): string {
        let formatted = `${balance} MINA`;
        if (includeUsd && this.config.showUsdValues) {
            const usdValue = (balance * this.data.feeUsd / this.data.fee).toFixed(2);
            formatted += ` ($${usdValue})`;
        }
        return formatted;
    }

    public generateMermaidCode(): string {
        try {
            const styles = generateStyleDefinitions();
            const { nodes, nodeMap } = this.generateNodes();
            const edges = this.generateEdges(nodeMap);
            const txInfo = this.generateTransactionInfo();
    
            return [
                ...styles,
                '',  // Empty line after styles
                nodes.join('\n'),
                '',  // Empty line after nodes
                edges.join('\n'),
                '',  // Empty line after edges
                '',  // Extra empty line before subgraph
                txInfo.join('\n')
            ].join('\n');
        } catch (error) {
            throw new Error(`Failed to generate Mermaid code: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    
    private generateNodes(): { nodes: string[], nodeMap: Map<string, string> } {
        const nodes: string[] = [];
        const nodeMap = new Map<string, string>();
    
        this.data.updatedAccounts.forEach((account, index) => {
            const nodeId = this.generateNodeId(index);
            const shortAddr = this.shortenAddress(account.accountAddress);
            const balance = this.formatBalance(account.totalBalanceChange, true);
            const style = this.getNodeStyle(account);
    
            nodes.push(`${nodeId}["${shortAddr} <br/> Balance: ${balance}"]:::${style}`);
            nodeMap.set(account.accountAddress, nodeId);
        });
    
        return { nodes, nodeMap };
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
                    edges.push(`${senderId} --> |"${label}"| ${receiverId}`);
                }
            });
        });
    
        return edges;
    }

    private generateTransactionInfo(): string[] {
        const { SUBGRAPH_NAME, NODE_STYLES } = STYLE_CONSTANTS;
        // Add dummy node to push transaction info to bottom
        const info = [
            `Bottom[ ]:::${NODE_STYLES.INFO.name}`,
            `subgraph ${SUBGRAPH_NAME}`  // Remove style from subgraph declaration
        ];
        
        if (this.config.detailedTransactionInfo) {
            info.push(
                `    TxHash["TX: ${this.shortenAddress(this.data.txHash)}"]:::${NODE_STYLES.INFO.name}`,
                `    Memo["Memo: ${this.data.memo}"]:::${NODE_STYLES.INFO.name}`,
                `    Block["Block: ${this.data.blockHeight}"]:::${NODE_STYLES.INFO.name}`,
                `    TxFee["Fee: ${this.formatBalance(this.data.fee, true)}"]:::${NODE_STYLES.INFO.name}`,
                `    TxStatus["Status: ${this.data.txStatus}"]:::${NODE_STYLES.INFO.name}`,
                `    TxTime["Time: ${new Date(this.data.timestamp).toISOString()}"]:::${NODE_STYLES.INFO.name}`
            );
        } else {
            info.push(
                `    TxHash["TX: ${this.shortenAddress(this.data.txHash)}"]:::${NODE_STYLES.INFO.name}`,
                `    Memo["Memo: ${this.data.memo}"]:::${NODE_STYLES.INFO.name}`,
                `    Block["Block: ${this.data.blockHeight}"]:::${NODE_STYLES.INFO.name}`
            );
        }
        
        info.push('end');
        
        // Style the subgraph after its declaration
        info.push(`style ${SUBGRAPH_NAME} fill:${NODE_STYLES.INFO.fill},stroke:${NODE_STYLES.INFO.stroke},stroke-width:${NODE_STYLES.INFO.strokeWidth}`);
        
        // Add invisible edge to push transaction info to bottom
        info.push(`Bottom --> TxHash[ ]:::${NODE_STYLES.INFO.name}`);
        return info;
    }

    private generateNodeId(index: number): string {
        return `${this.config.nodePrefix}${index}`;
    }
}

// Main visualization function
export async function visualizeTransaction(): Promise<string> {
    try {
        // First try current directory
        let dataPath = 'dummy_data.txt';
        
        // If file doesn't exist in current directory, try src/data
        if (!existsSync(dataPath)) {
            dataPath = join(__dirname, '..', '..', 'src', 'dummy_data.txt');
        }
        
        // Log the path we're trying to read from
        console.log('Attempting to read from:', dataPath);
        
        const response = await readFile(dataPath);
        const content = response.toString('utf-8');
        const txData = JSON.parse(content) as Transaction;

        // Configure the visualizer
        const config: VisualizerConfig = {
            showUsdValues: true,
            detailedTransactionInfo: true
        };

        // Generate the Mermaid diagram code
        const visualizer = new TransactionVisualizer(txData, config);
        return visualizer.generateMermaidCode();
    } catch (error) {
        throw new Error(`Error processing transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Note: Temporarily keeping the Transaction interface until we import from o1js
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

interface Account {
    accountAddress: string;
    isZkappAccount: boolean;
    totalBalanceChange: number;
    totalBalanceChangeUsd: number;
}

interface VisualizerConfig {
    nodePrefix?: string;
    showUsdValues?: boolean;
    detailedTransactionInfo?: boolean;
}