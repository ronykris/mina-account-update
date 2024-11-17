import {  Mina, PrivateKey, AccountUpdate, Field, PublicKey } from 'o1js';

import { ProofsOnlyZkApp } from './ProofsOnlyZkApps.js';
import { SecondaryZkApp } from './SecondaryZkApp.js';

import crawl from "tree-crawl";

type AccountUpdateBody = {
    publicKey: PublicKey;
    tokenId: string;
    update: object;
    balanceChange: object;
    actions: object;
    callData: Field;
    preconditions: object;
  };
  
  /*type AccountUpdateObj = {
    label: string;
    lazyAuthorization?: object; // Make it optional to handle undefined
    id: number;
    body: AccountUpdateBody;
    authorization: object;
  };*/
  
  type ChangeLog = {
    added: {path: string; node: any}[];
    removed: {path: string; node: any}[];
    updated: {path: string; changes: {
      field: string;
      oldValue: any;
      newValue: any;
    }[]}[]    
  };

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

    /*const traverseTree = (node: any, path: string): void => {
      if (typeof node === 'object' && node !== null) {
        if (Array.isArray(node)) {
          node.forEach((item, index) => {
            //console.log(`${path}[${index}]`, item);
            traverseTree(item, `${path}[${index}]`);
          });
        } else {
          Object.keys(node).forEach((key) => {
            console.log(`${path}/${key}`, node[key]);
            traverseTree(node[key], `${path}/${key}`);
          });
        }
      } else {
        console.log(`${path}`, node);
      }
    };*/

    const keysUpdated = (a: any, b: any, keyList: Set<string>): any => {
      const keysUpdatedList: {
        field: string,
        oldValue: any,
        newValue: any
      }[] = []
      
      for ( const key of keyList ) {
        const oldValue = getLeafNodeValue(a, key)
        //console.log(`OLD VALUE ${key}: `, oldValue)
        const newValue = getLeafNodeValue(b, key)
        //console.log(`NEW VALUE ${key}: `, newValue)
        if ( typeof(newValue) !== 'object') {
          
          if ( newValue !== oldValue ) {
            keysUpdatedList.push({
              field: key,
              oldValue: oldValue,
              newValue: newValue === undefined ? {} : newValue
            })
          }
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

    const compareAUItems = (a: AccountUpdate, b: AccountUpdate, path: string) => {
      const keysA = traverseFirstLevelNodes(a)
      const keysB = traverseFirstLevelNodes(b)
      //console.log(keysA)
      //console.log(keysB)
      const keysRemovedList = keysRemoved(keysA, keysB)
      for ( const key of keysRemovedList) {
        const value = getLeafNodeValue(a, key)
        changes.removed.push({
          path: path,
          node: {key, value}
        })
      }
      const keysAddedList = keysAdded(keysA, keysB)
      for ( const key of keysAddedList) {
        const value = getLeafNodeValue(b, key)
        changes.added.push({
          path: path,
          node: {key, value}
        })
      }

      let keysB_modified: Set<string> = keysB
      keysB_modified = deleteFromSet(keysB_modified, keysAddedList)

      const keysUpdatedList = keysUpdated(a, b, keysB_modified)
      changes.updated.push({
        path: path,
        changes: keysUpdatedList
      })
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
        compareAUItems(oldAUArrayItem, newAUArrayItem, currentPath)
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
      console.log(JSON.stringify(changeLog, null, 2));
      
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

