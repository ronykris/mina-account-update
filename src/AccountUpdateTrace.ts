import { AccountUpdate, PublicKey } from 'o1js';
import { TreeSnapshot, TreeOperation, ChangeLog } from './Interface'

export class AccountUpdateTrace {
    private snapshots: TreeSnapshot[] = [];
    private currentTree: AccountUpdate[] = [];

    private getLeafNodeValue = (tree: any, key: string): any => {
        //console.log(tree)
        if (typeof tree !== 'object' || tree === null) {
          return undefined;
        }
      
        if (tree.hasOwnProperty(key)) {
          return tree[key]
        }
    }

    private traverseNodesRecursively = (tree: any): Set<string> => {
        const keys = new Set<string>();
      
        for (const key in tree) {
          keys.add(key)
      
          if (typeof tree[key] === 'object' && tree[key] !== null && !Array.isArray(tree[key])) {
            const childKeys = this.traverseNodesRecursively(tree[key])
            for (const childKey of childKeys) {
              keys.add(`${key}.${childKey}`); // Use dot notation for nested keys
            }
          }
        }
        return keys;
    }

    private keysUpdated = (a: any, b: any, keyList: Set<string>): any => {
        const keysUpdatedList: {
          field: string,
          oldValue: any,
          newValue: any
        }[] = []
        
        for ( const key of keyList ) {
          let oldValue = this.getLeafNodeValue(a, key)
          //console.log(`OLD VALUE ${key}: `, oldValue)
          let newValue = this.getLeafNodeValue(b, key)
          //console.log(`NEW VALUE ${key}: `, newValue)
          //console.log(`Type of ${key}: `, typeof(newValue))
          if ( oldValue instanceof PublicKey && newValue instanceof PublicKey ) {
            oldValue = oldValue.toBase58()
            newValue = newValue.toBase58()
            //console.log('Public key old value: ', oldValue)
            //console.log('Public key new value: ', newValue)
          }
          if ( newValue !== oldValue ) {
              keysUpdatedList.push({
                field: key,
                oldValue: oldValue,
                newValue: newValue
              })
          }
        }
        return keysUpdatedList
    }

    private deleteFromSet = (set: Set<string>, toDelete: string[]): Set<string> => {
        for (const item of toDelete) {
          set.delete(item);
        }
        return set
    }

    private keysRemoved = (a: Set<string>, b: Set<string>): string[] => {
        let keysRemovedList: string[] = []
        for ( const key of a) {
          if (!b.has(key)) {
            keysRemovedList.push(key)
          }
        }
        return keysRemovedList
    }

    private keysAdded = (a: Set<string>, b: Set<string>): string[] => {
        let keysAddedList: string[] = []
        for ( const key of b) {
          if (!a.has(key)) {
            keysAddedList.push(key)
          }
        }
        return keysAddedList
    }

    private getLeafNodeValueRecursive = (tree: any, key: string): any => {
        const keyParts = key.split('.')
        let value = tree;
      
        for (const part of keyParts) {
          if (value && typeof value === 'object' && part in value) {
            value = value[part];
          } else {
            return undefined; // Key not found
          }
        }
        return value;
    }

    

    private compareAUTrees = (
        oldAUArray: AccountUpdate[], 
        newAUArray: AccountUpdate[],
        path: string = 'accountUpdate'
      ): ChangeLog => {
        const changes: ChangeLog = {
          added: [], removed: [], updated: []
        }
        
        const oldAUMap = new Map(oldAUArray.map((node) => [node.id, node]));
        const newAUMap = new Map(newAUArray.map((node) => [node.id, node]));
        
    
        const compareAUItemsRecursive = (a: AccountUpdate, b: AccountUpdate, path: string) => {
          const keysA = this.traverseNodesRecursively(a)
          const keysB = this.traverseNodesRecursively(b)
          //console.log('Keys A: ',keysA)
          //console.log('Keys B: ',keysB)
          const keysRemovedList = this.keysRemoved(keysA, keysB)
          for ( const key of keysRemovedList ) {
            const value = this.getLeafNodeValueRecursive(a, key)
            changes.removed.push({
              path: `${path}.${key}`,
              node: {key, value}
            })
          }
    
          const keysAddedList = this.keysAdded(keysA, keysB)
          for ( const key of keysAddedList) {
            let value: string;
            if ( key.includes('proof') ) {
              value = this.getLeafNodeValueRecursive(b, key)
              //console.log('Value: ', value)
              if ( value.length > 50 ) {
                value = `${value.slice(0, 50)}...`
              }
            } else {
              value = this.getLeafNodeValueRecursive(b, key)
            }
            changes.added.push({
              path: `${path}.${key}`,
              node: {key, value}
            })
          }
    
          let keysB_modified: Set<string> = keysB
          keysB_modified = this.deleteFromSet(keysB_modified, keysAddedList)
    
          const keysUpdatedList = this.keysUpdated(a, b, keysB_modified)
          for (const { field, oldValue, newValue } of keysUpdatedList) {
            if (typeof oldValue === 'function' || typeof newValue === 'function') {
              continue;
            }
            if (typeof oldValue !== 'object' || typeof newValue !== 'object' ) {
              /*console.log('Field: ', field)*/
              //console.log('Old Value: ', oldValue)
              //console.log('New Value: ', newValue)
              changes.updated.push({
                path: `${path}.${field}`,
                changes: [{ 
                  field, 
                  oldValue,
                  newValue: newValue === undefined ? {} : newValue
                }],
              });
            } else {
              compareAUItemsRecursive(
                oldValue as AccountUpdate,
                newValue as AccountUpdate,
                `${path}.${field}`
              );
            }
          }
        }
        
        // Find removed and updated elements
        for (const oldAUArrayItem of oldAUArray) {
          const currentPath = `${path}[${oldAUArray.indexOf(oldAUArrayItem)}]`;
          if (!newAUMap.has(oldAUArrayItem.id)) {
            changes.removed.push({
              path: currentPath,
              node: oldAUArrayItem
            })
          } else {
            const newAUArrayItem = newAUMap.get(oldAUArrayItem.id)!
            //compareAUItems(oldAUArrayItem, newAUArrayItem, currentPath)
            compareAUItemsRecursive(oldAUArrayItem, newAUArrayItem, currentPath);
          }
        }
    
        for ( const newAUArrayItem of newAUArray) {
          const currentPath = `${path}[${newAUArray.indexOf(newAUArrayItem)}]`
          if (!oldAUMap.has(newAUArrayItem.id)) {
            changes.added.push({
              path: currentPath,
              node: newAUArrayItem
            })
          }
        }
        return changes
    }


    public takeSnapshot(accountUpdates: AccountUpdate[], operation: TreeOperation): TreeSnapshot {
        const snapshot: TreeSnapshot = {
            operation,
            timestamp: Date.now(),
            tree: accountUpdates,
            changes: this.compareAUTrees(this.currentTree, accountUpdates)
        };

        this.snapshots.push(snapshot);
        this.currentTree = accountUpdates;
        return snapshot;
    }

    public getSnapshots(): TreeSnapshot[] {
        return this.snapshots;
    }
}