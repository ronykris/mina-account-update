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
    contractMetadata?: ContractMetadata;
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

/*interface ContractMetadata {
    methods: {
        name: string;
        authorization: {
            requiresProof: boolean;
            requiresSignature: boolean;
        };
        accountUpdates: {
            creates: boolean;
            requiresSignature: boolean;
            balanceChanges: boolean;
        }[];
    }[];
    state: {
        fields: string[];
        hasOnChainState: boolean;
    };
}*/

interface ContractMetadata {
    methods: MethodAnalysis[];
    state: {
        fields: string[];
        hasOnChainState: boolean;
    };
}

interface EnhancedTransactionState extends TransactionState {
    contractMetadata: Map<string, ContractMetadata>;
}

interface AccountUpdateBody {
    callDepth?: number;
    balanceChange?: any;
    publicKey?: any;
    mayUseToken?: any;
}

interface ParsedAccountUpdate {
    id: string | number;
    label?: string;
    body: AccountUpdateBody;
    lazyAuthorization?: {
        kind?: string;
        methodName?: string;
    };
    caller?: string;
}

interface MethodAnalysis {
    name: string;
    authorization: {
        requiresProof: boolean;
        requiresSignature: boolean;
    };
    accountUpdates: MethodAccountUpdate[];
}

interface MethodAccountUpdate {
    creates: boolean;
    requiresSignature: boolean;
    balanceChanges: boolean;
}

interface ContractMethod {
    name: string;
    authorization: {
        requiresProof: boolean;
        requiresSignature: boolean;
    };
    accountUpdates: MethodAccountUpdate[];
}

export { TreeSnapshot, TreeOperation, ChangeLog, ContractMethod, MethodAccountUpdate, AUMetadata, Edge, TransactionNode, TransactionState, AccountType, ContractMetadata, MethodAnalysis, EnhancedTransactionState, ParsedAccountUpdate };