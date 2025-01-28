type TreeOperation = 'deploy' | 'prove' | 'sign' | 'send';



interface TreeSnapshot {
    operation: TreeOperation;
    timestamp: number;
    tree: any;  // The actual transaction data
    changes: ChangeLog;
}

type ChangeLog = {
    added: {path: string; node: any}[];
    removed: {path: string; node: any}[];
    updated: {path: string; changes: {
        field: string;
        oldValue: any;
        newValue: any;
    }[]}[]    
};

interface TransactionNode {
    id: string;
    type: AccountType;
    label: string;
    publicKey: string;
    role?: string;
    contractType?: string;
    features?: Record<string, any>;
}

interface TransactionEdge {
    fromId: string;
    toId: string;
    operation: string;
    amount?: string;
    fee?: string;
    status?: 'success' | 'rejected';
    sequence: number;
}

interface TransactionState {
    nodes: Map<string, TransactionNode>;
    edges: Edge[];
    balanceStates: Map<string, number[]>;
    metadata: {
        totalProofs: number;
        totalSignatures: number;
        totalFees: string;
        accountUpdates: number;
    };
    relationships: Map<string, string[]>;
}

interface Edge {
    id: string;
    fromNode: string;
    toNode: string;
    operation: {
        sequence: number;
        type: string;
        amount?: {
            value: number;
            denomination: string;
        };
        status: 'success' | 'rejected';
        fee?: string;
    };
}

interface AUMetadata {
    id: string;
    label: string;
    type: 'proof' | 'signature' | 'none';
    publicKey: string;
    balanceChange: string;
    methodName?: string;
    args?: any[];
}

type AccountType = 'account' | 'contract';

interface NodeType {
    type: AccountType;
}


export { TreeSnapshot, TreeOperation, ChangeLog, AUMetadata, Edge, TransactionNode, TransactionState, AccountType };