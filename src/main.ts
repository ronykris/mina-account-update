import { showTxn, saveTxn, printTxn } from 'mina-transaction-visualizer';
import { AccountUpdate, Mina, PrivateKey } from 'o1js';

import { ProofsOnlyZkApp } from './ProofsOnlyZkApps.js';
import { SecondaryZkApp } from './SecondaryZkApp.js';

import { txnToDynamicJSON } from './lib.js';
import { createTransactionTracker } from './txnTracker.js';
import { asciiVisualiser } from './asciiVisualiser.js';

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
  
    const legend = {
      [proofsOnlyAddr.toBase58()]: 'proofsOnlyZkApp',
      [secondaryAddr.toBase58()]: 'secondaryZkApp',
      [deployerAccount.toBase58()]: 'deployer',
    };

    const proofsOnlyInstance = new ProofsOnlyZkApp(proofsOnlyAddr);
    const secondaryInstance = new SecondaryZkApp(secondaryAddr);
    const tracker = createTransactionTracker();
    const visualizer = asciiVisualiser();

    const deployTxn = await Mina.transaction(deployerAccount, async () => {
        AccountUpdate.fundNewAccount(deployerAccount, 2);
        await proofsOnlyInstance.deploy();
        await secondaryInstance.deploy();
      }); 
      const deployTxnSnap = tracker.takeSnapshot(deployTxn, 'deploy')
      console.log(deployTxnSnap)
      
      //console.log('Deploy Txn: ', deployTxn)
      //console.log('Deploy Txn Flattened: ', deployTxn.toJSON())
      //console.log('Deploy txn: ',deployTxn.toPretty())
      //const serialized = await txnToDynamicJSON(deployTxn)
      //console.log('Deploy Txn: ', serialized)
      const txnProve = await deployTxn.prove();
      const txnProveSnap = tracker.takeSnapshot(txnProve, 'prove')
      console.log(txnProveSnap)
      //console.log('Txn Prove: ', txnProve)
      //console.log('Txn Prove Flattened: ', txnProve.toJSON())
      const txnSign = deployTxn.sign([deployerKey, proofsOnlySk, secondarySk]);
      const txnSignSnap = tracker.takeSnapshot(txnSign, 'sign')
      console.log(txnSignSnap)
      //console.log('Txn Signed: ',txnSign)
      //console.log('Txn Signed Flattened: ',txnSign.toJSON())
    
      const txnRcvd = await deployTxn.send();
      const txnRcvdSnap = tracker.takeSnapshot(txnRcvd, 'send')
      console.log(txnRcvdSnap)
      //console.log('Txn Rcvd: ', txnRcvd)
      //console.log('Txn Rcvd Flattened: ', txnRcvd.toJSON())
      //console.log(await txnRcvd.wait)
      console.log(tracker.generateChangeSummary());
      //console.log(visualizer.visualizeAllSnapshots(tracker.getSnapshots()));
      console.log(visualizer.visualizeChangeSummary(tracker.getSnapshots()));


    
})()

