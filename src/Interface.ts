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
    failed?: boolean;
    failureReason?: string;
    tokenId?: string;
    callDepth?: number;
    balanceChange?: number;
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
        totalFees: number;
        accountUpdates: number;
    };
    relationships: Map<string, AccountUpdateRelationship>;
    blockchainData?: BlockchainData;
}

interface Edge {
    id: string;
    fromNode: string;
    toNode: string;
    operation: {
        sequence: number;
        type: string;
        status: 'success' | 'rejected';
        amount?: {
            value: number;
            denomination: string;
        };
        fee?: string;
    };
    failed?: boolean;
    failureReason?: string;
}

interface AUMetadata {
    id: string;
    label: string;
    type: 'proof' | 'signature' | 'none';
    publicKey: string;
    balanceChange: string;
    methodName?: string;
    args?: any[];
    failed?: boolean;
    tokenId?: string;
    callDepth?: number;
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
    childCalls: {
        contractMethod?: string;  // for inter-contract calls
        internalMethod?: string;  // for internal method calls
    }[];
    stateChanges: {
        field: string;
        operation: 'set' | 'get';
    }[];
    authorization: {
        requiresProof: boolean;
        requiresSignature: boolean;
    };
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

interface ContractAnalysis {
    name: string;
    stateFields: {
        name: string;
        index: number;  // position in appState array
    }[];
    methods: MethodAnalysis[];
    permissions: string[];
}

interface AccountUpdateRelationship {
    
        id: string;
        label: string;
        parentId?: string;
        children: string[];
        depth: number;
        method?: {
            name: string;
            contract: string;
        };
        onChainStates?: string;
        stateChanges?: {
            field: string;
            value: any;
        }[];
        tokenId?: string;
        failed?: boolean;
        failureReason?: string;    
}

interface PlainRelationshipMap {
    [key: string]: AccountUpdateRelationship;
}

interface EntityInfo {
    id: string;
    type: string;
    name: string;
    operations: Set<string>;
    publicKey: string;
    contractType?: string;
    labels: Set<string>;
}

interface FlowOperation {
    from: string;
    to: string;
    action: string;
    fee?: string;
    status?: string;
    parameters?: Record<string, string>;
}

interface BlockchainData {
    blockHeight?: number;
    txHash?: string;
    timestamp?: number;
    memo?: string;
    status?: string;
    failures?: Array<{index: number, failureReason: string}>;
    flowGraph?: TransactionFlowGraph;
    feePayerAddress?: string;
}

interface ProcessedAccount {
    id: string;
    index: number;
    address: string;
    shortAddress: string;
    isContract: boolean;
    callDepth: number;
    tokenId: string;
    tokenSymbol: string;
    balanceChange: number;
    failed: boolean;
    failureReason: string | null;
    isRootFailure?: boolean;
    stateValues: string[];
    callData: string | null;
    permissions: any;
  }

  interface Relationship {
    from: string;
    to: string;
    type: string;
    label: string;
    color: string;
    failed?: boolean;
    style?: string;
  }
  
  interface TransactionFlowGraph {
    metadata: {
      txHash: string;
      status: string;
      blockHeight: number;
      timestamp: number;
      fee: number;
      feePayerAddress: string;
      memo: string;
    };
    nodes: ProcessedAccount[];
    edges: Relationship[];
  }

export { Relationship, ProcessedAccount, TransactionFlowGraph, TreeSnapshot, BlockchainData, EntityInfo, FlowOperation, PlainRelationshipMap, AccountUpdateRelationship, TreeOperation, ContractAnalysis, ChangeLog, ContractMethod, MethodAccountUpdate, AUMetadata, Edge, TransactionNode, TransactionState, AccountType, ContractMetadata, MethodAnalysis, EnhancedTransactionState, ParsedAccountUpdate };