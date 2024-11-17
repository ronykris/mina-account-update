type TreeOperation = 'deploy' | 'prove' | 'sign' | 'send';

// Structure for tracking changes
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
    changes: TreeChanges;
}

export class TransactionTreeTracker {
    private snapshots: TreeSnapshot[] = [];
    private currentTree: any = null;

    private shouldCompareValue(value: any): boolean {
        return typeof value !== 'function' && 
               value !== undefined &&
               !(value instanceof Promise);
    }

    private compareValues(oldVal: any, newVal: any): boolean {
        if (!this.shouldCompareValue(oldVal) || !this.shouldCompareValue(newVal)) {
            return true;
        }

        if (oldVal === newVal) return true;
        if (!oldVal || !newVal) return false;
        
        if (typeof oldVal === 'object' && typeof newVal === 'object') {
            // Handle o1js Field elements
            if (oldVal._value !== undefined && newVal._value !== undefined) {
                return oldVal._value === newVal._value;
            }

            try {
                return JSON.stringify(oldVal) === JSON.stringify(newVal);
            } catch {
                return false;
            }
        }
        
        return String(oldVal) === String(newVal);
    }

    private diffTrees(oldTree: any, newTree: any): TreeChanges {
        const changes: TreeChanges = {
            added: [],
            removed: [],
            modified: []
        };

        const traverseObject = (oldObj: any, newObj: any, path: string = '') => {
            // Skip if both objects are null/undefined
            if (!oldObj && !newObj) return;

            // Handle case where old key doesn't exist (addition)
            if (!oldObj) {
                changes.added.push(path);
                return;
            }

            // Handle case where new key doesn't exist (removal)
            if (!newObj) {
                changes.removed.push(path);
                return;
            }

            // Get all keys from both objects
            const allKeys = new Set([
                ...Object.keys(oldObj),
                ...Object.keys(newObj)
            ]);

            allKeys.forEach(key => {
                const oldVal = oldObj[key];
                const newVal = newObj[key];
                const newPath = path ? `${path}/${key}` : key;

                // Skip functions and certain keys
                if (typeof oldVal === 'function' || typeof newVal === 'function' ||
                    key === 'requireBetween' || key === 'toJSON' || key === 'toPretty') {
                    return;
                }

                // Special handling for important objects
                if (key === 'lazyAuthorization' && !newVal && oldVal) {
                    changes.removed.push(newPath);
                    return;
                }

                // Handle nested objects
                if (oldVal && newVal && typeof oldVal === 'object' && typeof newVal === 'object') {
                    if (Array.isArray(oldVal) && Array.isArray(newVal)) {
                        // Handle AccountUpdate arrays
                        oldVal.forEach((item, index) => {
                            if (item && typeof item === 'object') {
                                traverseObject(item, newVal[index], `${newPath}[${index}]`);
                            }
                        });
                    } else {
                        traverseObject(oldVal, newVal, newPath);
                    }
                }
                // Compare values
                else if (!this.compareValues(oldVal, newVal)) {
                    changes.modified.push({
                        node: path || 'root',
                        changes: [{
                            field: key,
                            before: oldVal,
                            after: newVal
                        }]
                    });
                }
            });
        };

        traverseObject(oldTree, newTree);

        // Group modifications by node path
        const groupedModifications = changes.modified.reduce((acc: { [key: string]: NodeChange }, curr) => {
            if (!acc[curr.node]) {
                acc[curr.node] = {
                    node: curr.node,
                    changes: []
                };
            }
            acc[curr.node].changes.push(...curr.changes);
            return acc;
        }, {});

        changes.modified = Object.values(groupedModifications);

        return changes;
    }

    public takeSnapshot(transaction: any, operation: TreeOperation): TreeSnapshot {
        const snapshot: TreeSnapshot = {
            operation,
            timestamp: Date.now(),
            tree: transaction,
            changes: this.diffTrees(this.currentTree, transaction)
        };

        this.snapshots.push(snapshot);
        this.currentTree = transaction;
        return snapshot;
    }

    public getSnapshots(): TreeSnapshot[] {
        return this.snapshots;
    }

    public getChangesBetweenOperations(op1: TreeOperation, op2: TreeOperation): TreeChanges | null {
        const snapshot1 = this.snapshots.find(s => s.operation === op1);
        const snapshot2 = this.snapshots.find(s => s.operation === op2);

        if (!snapshot1 || !snapshot2) return null;

        return this.diffTrees(snapshot1.tree, snapshot2.tree);
    }
}