import { AccountUpdate, Mina, PrivateKey } from "o1js";
import { ProofsOnlyZkApp } from './ProofsOnlyZkApps.js';
import { SecondaryZkApp } from './SecondaryZkApp.js';

import { AccountUpdateTrace } from './AccountUpdateTrace.js'
import { ASCIITreeVisualizer } from "./AsciiVisualiser.js";

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

    const tracker = new AccountUpdateTrace();
    const visualizer = new ASCIITreeVisualizer();
    
    const deployTxn = await Mina.transaction(deployerAccount, async () => {
        AccountUpdate.fundNewAccount(deployerAccount, 2);
        await proofsOnlyInstance.deploy();
        await secondaryInstance.deploy();
      }); 
      const deployTxnAU = deployTxn.transaction.accountUpdates
      //console.log(deployTxnData)
      //crawl(deployTxnData, console.log)
      const deployTxnSnap = tracker.takeSnapshot(deployTxnAU, 'deploy')
      console.log(JSON.stringify(deployTxnSnap, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value, 2))
      
      const txnProve = await deployTxn.prove();
      const txnProveAU = txnProve.transaction.accountUpdates
      //console.log(txnProveData)
      //const changeLog = compareAUTrees(deployTxnData, txnProveData)
      //console.log(JSON.stringify(changeLog, (key, value) =>
      //  typeof value === 'bigint' ? value.toString() : value, 2));
      
      const txnProveSnap = tracker.takeSnapshot(txnProveAU, 'prove')
      console.log(JSON.stringify(txnProveSnap, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value, 2))
      
      const txnSign = deployTxn.sign([deployerKey, proofsOnlySk, secondarySk]);
      const txnSignAU = txnSign.transaction.accountUpdates 
      //console.log(txnSign.toJSON())
      const txnSignSnap = tracker.takeSnapshot(txnSignAU, 'sign')
      console.log(JSON.stringify(txnSignSnap, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value, 2))

      const txnRcvd = await deployTxn.send();
      //console.log(txnRcvd.toJSON())
      const txnRcvdAU = txnRcvd.transaction.accountUpdates
      const txnRcvdSnap = tracker.takeSnapshot(txnRcvdAU, 'send')
      console.log(JSON.stringify(txnRcvdSnap, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value, 2))

      console.log(visualizer.visualizeChangeSummary(tracker.getSnapshots()));
      //visualizer.visualizeChangeSummary(tracker.getSnapshots())

    
})()
