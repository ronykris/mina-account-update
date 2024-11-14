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
    
        const compareImportantFields = (oldBody: any, newBody: any): { field: string; before: any; after: any }[] => {
            const modifications: { field: string; before: any; after: any }[] = [];
            
            // Debug logging
            console.log('Comparing bodies:', JSON.stringify({
                oldBody: oldBody || {},
                newBody: newBody || {}
            }, null, 2));
    
            // Compare update fields first
            if (oldBody?.update || newBody?.update) {
                const oldUpdate = oldBody?.update || {};
                const newUpdate = newBody?.update || {};
                
                // Debug log update fields
                console.log('Update fields:', JSON.stringify({
                    oldUpdate,
                    newUpdate
                }, null, 2));
    
                // App State comparison with detailed logging
                if (JSON.stringify(oldUpdate.appState) !== JSON.stringify(newUpdate.appState)) {
                    console.log('App state change detected:', {
                        old: oldUpdate.appState,
                        new: newUpdate.appState
                    });
                    modifications.push({
                        field: 'appState',
                        before: oldUpdate.appState,
                        after: newUpdate.appState
                    });
                }
    
                // Verification Key comparison
                if (JSON.stringify(oldUpdate.verificationKey) !== JSON.stringify(newUpdate.verificationKey)) {
                    modifications.push({
                        field: 'verificationKey',
                        before: oldUpdate.verificationKey,
                        after: newUpdate.verificationKey
                    });
                }
    
                // Permissions comparison
                if (JSON.stringify(oldUpdate.permissions) !== JSON.stringify(newUpdate.permissions)) {
                    modifications.push({
                        field: 'permissions',
                        before: oldUpdate.permissions,
                        after: newUpdate.permissions
                    });
                }
            }
    
            // Other basic field comparisons
            const basicFields = [
                'tokenId',
                'callData',
                'callDepth',
                'implicitAccountCreationFee',
                'incrementNonce',
                'useFullCommitment',
                'mayUseToken'
            ];
    
            basicFields.forEach(field => {
                if (JSON.stringify(oldBody?.[field]) !== JSON.stringify(newBody?.[field])) {
                    modifications.push({
                        field,
                        before: oldBody?.[field],
                        after: newBody?.[field]
                    });
                }
            });
    
            // Balance changes
            if (oldBody?.balanceChange || newBody?.balanceChange) {
                const oldBalance = oldBody?.balanceChange ? 
                    `${oldBody.balanceChange.sgn === 'Negative' ? '-' : '+'}${oldBody.balanceChange.magnitude}` : null;
                const newBalance = newBody?.balanceChange ? 
                    `${newBody.balanceChange.sgn === 'Negative' ? '-' : '+'}${newBody.balanceChange.magnitude}` : null;
                
                if (oldBalance !== newBalance) {
                    modifications.push({
                        field: 'balance',
                        before: oldBalance,
                        after: newBalance
                    });
                }
            }
    
            // Authorization changes
            if (JSON.stringify(oldBody?.authorization) !== JSON.stringify(newBody?.authorization)) {
                modifications.push({
                    field: 'authorization',
                    before: oldBody?.authorization,
                    after: newBody?.authorization
                });
            }
    
            // Events and Actions
            ['events', 'actions'].forEach(field => {
                if (JSON.stringify(oldBody?.[field]) !== JSON.stringify(newBody?.[field])) {
                    modifications.push({
                        field,
                        before: oldBody?.[field] || [],
                        after: newBody?.[field] || []
                    });
                }
            });
    
            // Debug log all modifications
            console.log('Found modifications:', JSON.stringify(modifications, null, 2));
    
            return modifications;
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
    
            // Check for modifications
            const modifications: { field: string; before: any; after: any }[] = [];
    
            // Check metadata changes
            if (oldNode.metadata && newNode.metadata) {
                // Check standard metadata changes
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
    
                // NEW: Check important field changes
                const fieldChanges = compareImportantFields(
                    oldNode.metadata.body,
                    newNode.metadata.body
                );
                modifications.push(...fieldChanges);
            }
    
            if (modifications.length > 0) {
                changes.modified.push({
                    node: newNode.path,
                    changes: modifications
                });
            }
    
            // Recursively check children
            const oldChildren = new Map(oldNode.children?.map(child => [child.path, child]) ?? []);
            const newChildren = new Map(newNode.children?.map(child => [child.path, child]) ?? []);
    
            // Check for removed children
            oldNode.children?.forEach(child => {
                if (!newChildren.has(child.path)) {
                    changes.removed.push(child.path);
                }
            });
    
            // Check for added children and modifications
            newNode.children?.forEach(child => {
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

    private extractImportantFields(metadata: any): Record<string, any> {
        const fields: Record<string, any> = {};
        
        try {
            // Safely access body from metadata
            const body = metadata?.body;
            if (!body) return fields;

            // Extract balance changes
            if (body.balanceChange) {
                fields.balance = `${body.balanceChange.sgn === 'Negative' ? '-' : '+'}${body.balanceChange.magnitude}`;
            }

            // Extract nonce changes
            if ('incrementNonce' in body) {
                fields.nonce = body.incrementNonce;
            }

            // Extract app state - with null checks
            const appState = body.update?.appState;
            if (appState) {
                fields.appState = appState;
            }

            // Extract verification key - with null checks
            const vkHash = body.update?.verificationKey?.hash;
            if (vkHash) {
                fields.verificationKey = vkHash;
            }

            // Extract permissions - with null checks
            const permissions = body.update?.permissions;
            if (permissions) {
                fields.permissions = permissions;
            }

            // Extract events and actions - with length checks
            if (Array.isArray(body.events) && body.events.length > 0) {
                fields.events = body.events;
            }
            if (Array.isArray(body.actions) && body.actions.length > 0) {
                fields.actions = body.actions;
            }

            // Extract token information if present
            if (body.tokenId) {
                fields.tokenId = body.tokenId;
            }

            // Extract call data if present
            if (body.callData) {
                fields.callData = body.callData;
            }

            // Extract preconditions if present
            if (body.preconditions) {
                fields.preconditions = body.preconditions;
            }
        } catch (error) {
            console.warn('Error extracting fields:', error);
        }

        return fields;
    }

}

export const createTransactionTracker = () => {
    return new TransactionTreeTracker();
};