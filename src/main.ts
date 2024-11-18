import { AccountUpdate, Mina, PrivateKey } from "o1js";
import { ProofsOnlyZkApp } from './ProofsOnlyZkApps';
import { SecondaryZkApp } from './SecondaryZkApp';

import { AccountUpdateTrace } from './AccountUpdateTrace'

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
    
    const deployTxn = await Mina.transaction(deployerAccount, async () => {
        AccountUpdate.fundNewAccount(deployerAccount, 2);
        await proofsOnlyInstance.deploy();
        await secondaryInstance.deploy();
      }); 
      const deployTxnData = deployTxn.transaction.accountUpdates
      //console.log(deployTxnData)
      //crawl(deployTxnData, console.log)
      const deployTxnSnap = tracker.takeSnapshot(deployTxnData, 'deploy')
      console.log(deployTxnSnap)
      
      const txnProve = await deployTxn.prove();
      const txnProveData = txnProve.transaction.accountUpdates
      //console.log(txnProveData)
      //const changeLog = compareAUTrees(deployTxnData, txnProveData)
      //console.log(JSON.stringify(changeLog, (key, value) =>
      //  typeof value === 'bigint' ? value.toString() : value, 2));
      
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
