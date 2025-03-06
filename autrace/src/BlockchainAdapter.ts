import { AccountUpdate } from 'o1js';

export function adaptBlockchainTransaction(blockchainTx: any): any {
  // If the transaction is already in the expected format, return it as is
  if (blockchainTx?.transaction?.accountUpdates) {
    return blockchainTx;
  }

  const accountUpdates: any[] = [];

  if (blockchainTx.updatedAccounts && Array.isArray(blockchainTx.updatedAccounts)) {
    blockchainTx.updatedAccounts.forEach((account: any, index: number) => {
      // Create an account update object similar to what o1js would generate
      const accountUpdate = createAUFromBlockchainData(account, index, blockchainTx);
      accountUpdates.push(accountUpdate);
    });
  }

  return {
    transaction: {
      accountUpdates,
      hash: blockchainTx.txHash,
      blockHeight: blockchainTx.blockHeight,
      memo: blockchainTx.memo || ''
    },
    originalBlockchainData: blockchainTx // Keep the original data for reference
  };
}


const createAUFromBlockchainData = (account: any, index: number, tx: any): any => {
  const isProof = account.update?.permissions?.editState === 'proof' || 
                  account.update?.permissions?.send === 'proof';
  const isSignature = account.update?.permissions?.incrementNonce === 'signature' || 
                     account.update?.permissions?.setDelegate === 'signature';
  
  // Generate unique ID similar to what o1js would use
  const id = `${tx.txHash}-${index}`;
  
  // Determine if this is a contract
  const isContract = account.isZkappAccount || 
                     account.update?.verificationKey !== null || 
                     isProof;
  
  // Create a label for the account update
  const label = isContract ? `Contract-${account.accountAddress.substring(0, 8)}` : 
               `Account-${account.accountAddress.substring(0, 8)}`;
  
  // Create authorization based on permissions
  const authorization: any = {};
  if (isProof) {
    authorization.proof = true;
  } else if (isSignature) {
    authorization.signature = true;
  }

  // Create balance change info
  const balanceChange = account.totalBalanceChange || 0;
  const isNegative = balanceChange < 0;
  
  return {
    id,
    label,
    lazyAuthorization: {
      kind: isProof ? 'lazy-proof' : isSignature ? 'lazy-signature' : 'none',
      methodName: account.callData && account.callData !== '0' ? 'methodCall' : undefined,
      args: account.callData && account.callData !== '0' ? [account.callData] : undefined
    },
    authorization,
    body: {
      publicKey: {
        toBase58: () => account.accountAddress
      },
      balanceChange: {
        magnitude: Math.abs(balanceChange).toString(),
        isNegative: () => isNegative,
        toString: () => (isNegative ? '-' : '') + Math.abs(balanceChange).toString()
      },
      update: {
        appState: account.update?.appState,
        verificationKey: {
          value: {
            hash: account.verificationKeyHash,
            data: account.update?.verificationKey 
          }
        },
        permissions: {
          value: mapPermissions(account.update?.permissions)
        }
      }
    }
  };
}

const mapPermissions = (permissions: any) => {
  if (!permissions) return {};
  
  const createPermission = (type: string) => {
    const isProof = permissions[type] === 'proof';
    const isSignature = permissions[type] === 'signature';
    
    return {
      constant: { toBoolean: () => permissions[type] === 'none' },
      signatureNecessary: { toBoolean: () => isSignature },
      signatureSufficient: { toBoolean: () => isSignature },
      proof: { toBoolean: () => isProof }
    };
  };
  
  return {
    editState: createPermission('editState'),
    send: createPermission('send'),
    receive: createPermission('receive'),
    setDelegate: createPermission('setDelegate'),
    setPermissions: createPermission('setPermissions'),
    setVerificationKey: createPermission('setVerificationKey'),
    setZkappUri: createPermission('setZkappUri'),
    editActionState: createPermission('editActionState'),
    setTokenSymbol: createPermission('setTokenSymbol'),
    incrementNonce: createPermission('incrementNonce'),
    setVotingFor: createPermission('setVotingFor'),
    setTiming: createPermission('setTiming')
  };
}