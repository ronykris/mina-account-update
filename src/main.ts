import {  Mina, PrivateKey, AccountUpdate, Field, PublicKey } from 'o1js';

import { ProofsOnlyZkApp } from './ProofsOnlyZkApps.js';
import { SecondaryZkApp } from './SecondaryZkApp.js';

type AccountUpdateBody = {
    publicKey: PublicKey;
    tokenId: string;
    update: object;
    balanceChange: object;
    actions: object;
    callData: Field;
    preconditions: object;
  };
  
  type ChangeLog = {
    added: {path: string; node: any}[];
    removed: {path: string; node: any}[];
    updated: {path: string; changes: {
      field: string;
      oldValue: any;
      newValue: any;
    }[]}[]    
  };

  const traverseNodesRecursively = (tree: any): Set<string> => {
    const keys = new Set<string>();
  
    for (const key in tree) {
      keys.add(key)
  
      if (typeof tree[key] === 'object' && tree[key] !== null && !Array.isArray(tree[key])) {
        const childKeys = traverseNodesRecursively(tree[key])
        for (const childKey of childKeys) {
          keys.add(`${key}.${childKey}`); // Use dot notation for nested keys
        }
      }
    }
    return keys;
  }

  const traverseFirstLevelNodes = (tree: AccountUpdate): Set<string> => {
    const firstLevelKeys = new Set<string>(Object.keys(tree))
    return firstLevelKeys;
  };

  const keysRemoved = (a: Set<string>, b: Set<string>): string[] => {
    let keysRemovedList: string[] = []
    for ( const key of a) {
      if (!b.has(key)) {
        keysRemovedList.push(key)
      }
    }
    return keysRemovedList
  }

  const keysAdded = (a: Set<string>, b: Set<string>): string[] => {
    let keysAddedList: string[] = []
    for ( const key of b) {
      if (!a.has(key)) {
        keysAddedList.push(key)
      }
    }
    return keysAddedList
  }

  const getLeafNodeValue = (tree: any, key: string): any => {
    //console.log(tree)
    if (typeof tree !== 'object' || tree === null) {
      return undefined;
    }
  
    if (tree.hasOwnProperty(key)) {
      return tree[key]
    }
  }

  const getLeafNodeValueRecursive = (tree: any, key: string): any => {
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

  const compareAUTrees = (
    oldAUArray: AccountUpdate[], 
    newAUArray: AccountUpdate[],
    path: string = 'accountUpdate'
  ): ChangeLog => {
    const changes: ChangeLog = {
      added: [], removed: [], updated: []
    }
    
    const oldAUMap = new Map(oldAUArray.map((node) => [node.id, node]));
    const newAUMap = new Map(newAUArray.map((node) => [node.id, node]));

    const keysUpdated = (a: any, b: any, keyList: Set<string>): any => {
      const keysUpdatedList: {
        field: string,
        oldValue: any,
        newValue: any
      }[] = []
      
      for ( const key of keyList ) {
        let oldValue = getLeafNodeValue(a, key)
        //console.log(`OLD VALUE ${key}: `, oldValue)
        let newValue = getLeafNodeValue(b, key)
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
    
    const deleteFromSet = (set: Set<string>, toDelete: string[]): Set<string> => {
      for (const item of toDelete) {
        set.delete(item);
      }
      return set
    }

    const stringifyWithBigInt = (obj: any): string => {
      return JSON.stringify(
        obj,
        (key, value) => (typeof value === 'bigint' ? value.toString() : value),
      ).toString()
    };
    

    const compareAUItemsRecursive = (a: AccountUpdate, b: AccountUpdate, path: string) => {
      const keysA = traverseNodesRecursively(a)
      const keysB = traverseNodesRecursively(b)
      //console.log('Keys A: ',keysA)
      //console.log('Keys B: ',keysB)
      const keysRemovedList = keysRemoved(keysA, keysB)
      for ( const key of keysRemovedList ) {
        const value = getLeafNodeValueRecursive(a, key)
        changes.removed.push({
          path: `${path}.${key}`,
          node: {key, value}
        })
      }

      const keysAddedList = keysAdded(keysA, keysB)
      for ( const key of keysAddedList) {
        let value: string;
        if ( key.includes('proof') ) {
          value = getLeafNodeValueRecursive(b, key)
          //console.log('Value: ', value)
          if ( value.length > 50 ) {
            value = `${value.slice(0, 50)}...`
          }
        } else {
          value = getLeafNodeValueRecursive(b, key)
        }
        changes.added.push({
          path: `${path}.${key}`,
          node: {key, value}
        })
      }

      let keysB_modified: Set<string> = keysB
      keysB_modified = deleteFromSet(keysB_modified, keysAddedList)

      const keysUpdatedList = keysUpdated(a, b, keysB_modified)
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

      
  
(async function main() {
    const proofsEnabled = false;
    const Local = await Mina.LocalBlockchain({ proofsEnabled });
    Mina.setActiveInstance(Local);
    const deployerAccount = Local.testAccounts[0];
    const deployerKey = deployerAccount.key;
  
    if (proofsEnabled) {
      await ProofsOnlyZkApp.compile();
      await SecondaryZkApp.compile();
    }
    
    const proofsOnlySk = PrivateKey.random();
    const proofsOnlyAddr = proofsOnlySk.toPublicKey();
  
    const secondarySk = PrivateKey.random();
    const secondaryAddr = secondarySk.toPublicKey();

    const proofsOnlyInstance = new ProofsOnlyZkApp(proofsOnlyAddr);
    const secondaryInstance = new SecondaryZkApp(secondaryAddr);
    
    const deployTxn = await Mina.transaction(deployerAccount, async () => {
        AccountUpdate.fundNewAccount(deployerAccount, 2);
        await proofsOnlyInstance.deploy();
        await secondaryInstance.deploy();
      }); 
      const deployTxnData = deployTxn.transaction.accountUpdates
      //console.log(deployTxnData)
      //crawl(deployTxnData, console.log)
      //const deployTxnSnap = tracker.takeSnapshot(deployTxn, 'deploy')
      //console.log(JSON.stringify(deployTxnSnap))
      
      const txnProve = await deployTxn.prove();
      const txnProveData = txnProve.transaction.accountUpdates
      //console.log(txnProveData)
      const changeLog = compareAUTrees(deployTxnData, txnProveData)
      console.log(JSON.stringify(changeLog, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value, 2));
      
      //const txnProveSnap = tracker.takeSnapshot(txnProve, 'prove')
      
      const txnSign = deployTxn.sign([deployerKey, proofsOnlySk, secondarySk]);
      //console.log(txnSign.toJSON())
      //const txnSignSnap = tracker.takeSnapshot(txnSign, 'sign')
      
      const txnRcvd = await deployTxn.send();
      //console.log(txnRcvd.toJSON())
      //const txnRcvdSnap = tracker.takeSnapshot(txnRcvd, 'send')
      
      //console.log(visualizer.visualizeChangeSummary(tracker.getSnapshots()));
      //visualizer.visualizeChangeSummary(tracker.getSnapshots())

    
})()
