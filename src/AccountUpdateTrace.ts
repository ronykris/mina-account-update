import { AccountUpdate, PublicKey, Transaction} from 'o1js';
import { TreeSnapshot, TreeOperation, ChangeLog } from './Interface.js';

export class AccountUpdateTrace {
    private snapshots: TreeSnapshot[] = [];
    private currentTree: AccountUpdate[] | null = null;

    private getLeafNodeValue = (tree: any, key: string): any => {
        if (typeof tree !== 'object' || tree === null) {
            return undefined;
        }

        const keyParts = key.split('.');
        let current = tree;

        for (const part of keyParts) {
            if (current && typeof current === 'object' && part in current) {
                current = current[part];
            } else {
                return undefined;
            }
        }
        return current;
    }

    private isLeafNode = (value: any): boolean => {
        return value === null || 
               value === undefined || 
               typeof value !== 'object' || 
               value instanceof PublicKey ||
               Object.keys(value).length === 0;
    }

    private traverseNodesRecursively = (tree: any, parentPath: string = ''): Set<string> => {
        const keys = new Set<string>();
        
        if (typeof tree !== 'object' || tree === null) {
            return keys;
        }
        
        for (const key in tree) {
            if (Object.prototype.hasOwnProperty.call(tree, key)) {
                const currentPath = parentPath ? `${parentPath}.${key}` : key;
                const value = tree[key];

                if (this.isLeafNode(value)) {
                    keys.add(currentPath);
                } else if (typeof value === 'object' && !Array.isArray(value)) {
                    const childKeys = this.traverseNodesRecursively(value, currentPath);
                    for (const childKey of childKeys) {
                        keys.add(childKey);
                    }
                }
            }
        }
        return keys;
    }

    private areValuesEqual = (a: any, b: any): boolean => {
        // Handle PublicKey comparison
        if (a instanceof PublicKey && b instanceof PublicKey) {
            return a.toBase58() === b.toBase58();
        }

        // Handle primitive types
        if (a === b) return true;
        
        // Handle null/undefined
        if (a == null && b == null) return true;
        if (a == null || b == null) return false;

        // Handle BigInt
        if (typeof a === 'bigint' || typeof b === 'bigint') {
            return BigInt(a) === BigInt(b);
        }

        // Handle Date objects
        if (a instanceof Date && b instanceof Date) {
            return a.getTime() === b.getTime();
        }

        // Handle Arrays
        if (Array.isArray(a) && Array.isArray(b)) {
            return a.length === b.length && 
                   a.every((val, idx) => this.areValuesEqual(val, b[idx]));
        }

        // Handle Objects
        if (typeof a === 'object' && typeof b === 'object') {
            const keysA = Object.keys(a);
            const keysB = Object.keys(b);
            
            if (keysA.length !== keysB.length) return false;
            
            return keysA.every(key => 
                Object.prototype.hasOwnProperty.call(b, key) &&
                this.areValuesEqual(a[key], b[key])
            );
        }

        return false;
    }

    private keysUpdated = (a: any, b: any, keyList: Set<string>): Array<{
        field: string;
        oldValue: any;
        newValue: any;
    }> => {
        const keysUpdatedList: Array<{
            field: string;
            oldValue: any;
            newValue: any;
        }> = [];
        
        for (const key of keyList) {
            const oldValue = this.getLeafNodeValue(a, key);
            const newValue = this.getLeafNodeValue(b, key);
            
            // Skip if both values are functions or if the values are equal
            if (typeof oldValue === 'function' || typeof newValue === 'function') {
                continue;
            }

            if (!this.areValuesEqual(oldValue, newValue)) {
                keysUpdatedList.push({
                    field: key,
                    oldValue,
                    newValue: newValue === undefined ? null : newValue
                });
            }
        }
        return keysUpdatedList;
    }

    private deleteFromSet = (set: Set<string>, toDelete: string[]): Set<string> => {
        const newSet = new Set(set);
        for (const item of toDelete) {
            newSet.delete(item);
        }
        return newSet;
    }

    private keysRemoved = (a: Set<string>, b: Set<string>): string[] => {
        return Array.from(a).filter(key => !b.has(key));
    }

    private keysAdded = (a: Set<string>, b: Set<string>): string[] => {
        return Array.from(b).filter(key => !a.has(key));
    }

    private compareAUTrees = (
        oldAUArray: AccountUpdate[] | null,
        newAUArray: AccountUpdate[] | null,
        path: string = 'accountUpdate'
    ): ChangeLog => {
        const changes: ChangeLog = {
            added: [],
            removed: [],
            updated: []
        };

        // Handle null cases
        if (!oldAUArray && !newAUArray) return changes;
        if (!oldAUArray) {
            if (newAUArray) {
                changes.added.push({
                    path,
                    node: newAUArray
                });
            }
            return changes;
        }
        if (!newAUArray) {
            changes.removed.push({
                path,
                node: oldAUArray
            });
            return changes;
        }

        const oldAUMap = new Map(oldAUArray.map(node => [node.id, node]));
        const newAUMap = new Map(newAUArray.map(node => [node.id, node]));

        const compareAUItemsRecursive = (a: AccountUpdate, b: AccountUpdate, currentPath: string) => {
            const keysA = this.traverseNodesRecursively(a);
            const keysB = this.traverseNodesRecursively(b);

            // Handle removed keys
            for (const key of this.keysRemoved(keysA, keysB)) {
                const value = this.getLeafNodeValue(a, key);
                changes.removed.push({
                    path: `${currentPath}.${key}`,
                    node: { key, value }
                });
            }

            // Handle added keys
            for (const key of this.keysAdded(keysA, keysB)) {
                let value = this.getLeafNodeValue(b, key);
                
                // Truncate long proof values
                if (key.includes('proof') && typeof value === 'string' && value.length > 50) {
                    value = `${value.slice(0, 50)}...`;
                }
                
                changes.added.push({
                    path: `${currentPath}.${key}`,
                    node: { key, value }
                });
            }

            // Handle updated keys
            const commonKeys = new Set([...keysA].filter(x => keysB.has(x)));
            const updatedKeys = this.keysUpdated(a, b, commonKeys);

            for (const { field, oldValue, newValue } of updatedKeys) {
                changes.updated.push({
                    path: `${currentPath}.${field}`,
                    changes: [{
                        field,
                        oldValue,
                        newValue
                    }]
                });
            }
        };

        // Compare existing nodes
        for (const oldAU of oldAUArray) {
            const currentPath = `${path}[${oldAUArray.indexOf(oldAU)}]`;
            
            if (!newAUMap.has(oldAU.id)) {
                changes.removed.push({
                    path: currentPath,
                    node: oldAU
                });
            } else {
                const newAU = newAUMap.get(oldAU.id)!;
                compareAUItemsRecursive(oldAU, newAU, currentPath);
            }
        }

        // Handle new nodes
        for (const newAU of newAUArray) {
            if (!oldAUMap.has(newAU.id)) {
                const currentPath = `${path}[${newAUArray.indexOf(newAU)}]`;
                changes.added.push({
                    path: currentPath,
                    node: newAU
                });
            }
        }

        return changes;
    }

    public takeSnapshot(transaction: AccountUpdate[], operation: TreeOperation): TreeSnapshot {
        const snapshot: TreeSnapshot = {
            operation,
            timestamp: Date.now(),
            tree: transaction,
            changes: this.compareAUTrees(this.currentTree, transaction)
        };

        this.snapshots.push(snapshot);
        this.currentTree = transaction;
        return snapshot;
    }

    public getSnapshots(): TreeSnapshot[] {
        return this.snapshots;
    }
}