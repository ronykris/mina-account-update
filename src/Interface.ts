type TreeOperation = 'deploy' | 'prove' | 'sign' | 'send';

interface FieldChange {
    field: string;
    before: any;
    after: any;
}

interface NodeChange {
    node: string;
    changes: FieldChange[];
}

interface TreeChanges {
    added: string[];
    removed: string[];
    modified: NodeChange[];
}

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

export { FieldChange, NodeChange, TreeChanges, TreeSnapshot, TreeOperation, ChangeLog };