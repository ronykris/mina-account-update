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

export { TreeSnapshot, TreeOperation, ChangeLog };