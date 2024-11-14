import { Transaction, AccountUpdate } from "o1js";

type TreeOperation = 'deploy' | 'prove' | 'sign' | 'send';

interface TreeNode {
    type: string;
    id: string;
    path: string;
    children: TreeNode[];
    metadata: {
        [key: string]: any; 
        authorization?: string;
        proofs?: any;
        body?: any;
        state?: any;
    };
}

interface TreeSnapshot {
    operation: TreeOperation;
    timestamp: number;
    tree: TreeNode;
    changes: {
        added: string[];
        removed: string[];
        modified: {
            node: string;
            changes: {
                field: string;
                before: any;
                after: any;
            }[];
        }[];
    };
}

class TransactionTreeTracker {
    private snapshots:  TreeSnapshot[] = [];
    private currentTree: TreeNode | null = null;

    private generateNodeId(node: any, path: string): string {
        return `${path}-${node.type || 'unknown'}-${Math.random().toString(36).substr(2, 9)}`;
    }

    private buildTree(txn: any, path: string = ''): TreeNode {
        const tree: TreeNode = {
            type: 'Transaction',
            id: this.generateNodeId(txn, path),
            path,
            children: [],
            metadata: {}
        };

        if (txn.transaction?.feePayer) {
            const feePayerNode: TreeNode = {
                type: 'FeePayer',
                id: this.generateNodeId(txn.transaction.feePayer, `${path}/feePayer`),
                path: `${path}/feePayer`,
                children: [],
                metadata: {
                    authorization: txn.transaction.feePayer.authorization,
                    body: txn.transaction.feePayer.body
                }
            };
            tree.children.push(feePayerNode);
        }

        if (txn.transaction?.accountUpdates) {
            txn.transaction.accountUpdates.forEach((update: any, index: number) => {
                const updateNode: TreeNode = {
                    type: 'AccountUpdate',
                    id: this.generateNodeId(update, `${path}/accountUpdates[${index}]`),
                    path: `${path}/accountUpdates[${index}]`,
                    children: [],
                    metadata: {
                        authorization: update.authorization,
                        body: update.body,
                        state: update.body?.update?.appState
                    }
                };
                tree.children.push(updateNode);
            });
        }

        if ('proofs' in txn) {
            const proofsNode: TreeNode = {
                type: 'Proofs',
                id: this.generateNodeId({ type: 'Proofs' }, `${path}/proofs`),
                path: `${path}/proofs`,
                children: [],
                metadata: {
                    proofs: txn.proofs
                }
            };
            tree.children.push(proofsNode);
        }

        return tree;
    }

    private diffTrees(oldTree: TreeNode | null, newTree: TreeNode): TreeSnapshot['changes'] {
        const changes: TreeSnapshot['changes'] = {
            added: [],
            removed: [],
            modified: []
        };

        const traverseTree = (
            oldNode: TreeNode | null,
            newNode: TreeNode,
            path: string = ''
        ) => {
            if (!oldNode) {
                changes.added.push(newNode.path);
                return;
            }

            const modifications: { field: string; before: any; after: any }[] = [];

            Object.keys(newNode.metadata).forEach(key => {
                const oldValue = oldNode.metadata[key];
                const newValue = newNode.metadata[key];
                
                if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
                    modifications.push({
                        field: key,
                        before: oldValue,
                        after: newValue
                    });
                }
            });

            if (modifications.length > 0) {
                changes.modified.push({
                    node: newNode.path,
                    changes: modifications
                });
            }

            const oldChildren = new Map(oldNode.children.map(child => [child.path, child]));
            const newChildren = new Map(newNode.children.map(child => [child.path, child]));

            oldNode.children.forEach(child => {
                if (!newChildren.has(child.path)) {
                    changes.removed.push(child.path);
                }
            });

            newNode.children.forEach(child => {
                const oldChild = oldChildren.get(child.path);
                if (!oldChild) {
                    changes.added.push(child.path);
                } else {
                    traverseTree(oldChild, child, child.path);
                }
            });
        };

        traverseTree(oldTree, newTree);
        return changes;
    }

    takeSnapshot(txn: any, operation: TreeOperation) {
        const tree = this.buildTree(txn);
        const snapshot: TreeSnapshot = {
            operation,
            timestamp: Date.now(),
            tree,
            changes: this.diffTrees(this.currentTree, tree)
        };

        this.snapshots.push(snapshot);
        this.currentTree = tree;
        return snapshot;
    }

    getSnapshots(): TreeSnapshot[] {
        return this.snapshots;
    }

    getChangesBetweenOperations(op1: TreeOperation, op2: TreeOperation): TreeSnapshot['changes'] | null {
        const snapshot1 = this.snapshots.find(s => s.operation === op1);
        const snapshot2 = this.snapshots.find(s => s.operation === op2);

        if (!snapshot1 || !snapshot2) return null;

        return this.diffTrees(snapshot1.tree, snapshot2.tree);
    }

    generateChangeSummary(): string {
        let summary = '';
        
        this.snapshots.forEach((snapshot, index) => {
            if (index === 0) {
                summary += `\nInitial State (${snapshot.operation}):\n`;
                summary += `Created transaction tree with ${snapshot.tree.children.length} main branches\n`;
            } else {
                summary += `\nChanges after ${snapshot.operation}:\n`;
                
                if (snapshot.changes.added.length > 0) {
                    summary += '\nAdded:\n';
                    snapshot.changes.added.forEach(path => {
                        summary += `  + ${path}\n`;
                    });
                }

                if (snapshot.changes.removed.length > 0) {
                    summary += '\nRemoved:\n';
                    snapshot.changes.removed.forEach(path => {
                        summary += `  - ${path}\n`;
                    });
                }

                if (snapshot.changes.modified.length > 0) {
                    summary += '\nModified:\n';
                    snapshot.changes.modified.forEach(mod => {
                        summary += `  ~ ${mod.node}:\n`;
                        mod.changes.forEach(change => {
                            summary += `    ${change.field}: ${change.before} => ${change.after}\n`;
                        });
                    });
                }
            }
        });

        return summary;
    }
}

export const createTransactionTracker = () => {
    return new TransactionTreeTracker();
};