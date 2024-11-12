import { showTxn, saveTxn, printTxn } from 'mina-transaction-visualizer';
import { AccountUpdate, Mina, PrivateKey } from 'o1js';

import { ProofsOnlyZkApp } from './ProofsOnlyZkApps.js';
import { SecondaryZkApp } from './SecondaryZkApp.js';

import { txnToDynamicJSON } from './lib.js';

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

    const deployTxn = await Mina.transaction(deployerAccount, async () => {
        AccountUpdate.fundNewAccount(deployerAccount, 2);
        await proofsOnlyInstance.deploy();
        await secondaryInstance.deploy();
      }); 
      console.log(deployTxn.toPretty())
      //console.log('Deploy txn: ',deployTxn.toPretty())
      console.log('Deploy Txn: ', txnToDynamicJSON(deployTxn))
      const txnProve = await deployTxn.prove();
      //console.log('Txn Prove: ', txnProve.toPretty())
      const txnSign = deployTxn.sign([deployerKey, proofsOnlySk, secondarySk]);
      //console.log('Txn Signed: ',txnSign.toPretty())
    
      const txnRcvd = await deployTxn.send();
      //console.log(txnRcvd.toPretty())
      //console.log(await txnRcvd.wait)
    
})()

