
export const adaptBlockchainTransaction = (blockchainTx: any): any => {
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
      memo: blockchainTx.memo || '',
      status: blockchainTx.txStatus,
      failures: blockchainTx.failures || []
    },
    originalBlockchainData: blockchainTx // Keep the original data for reference
  };
}


const createAUFromBlockchainData = (account: any, index: number, tx: any): any => {
  // Check if this update failed
  const isFailedUpdate = tx.failures && tx.failures.some((f: any) => f.index === index);
  const failureReason = isFailedUpdate 
    ? tx.failures.find((f: any) => f.index === index)?.failureReason 
    : undefined;
  
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
  let label = isContract ? `Contract-${account.accountAddress.substring(0, 8)}` : 
               `Account-${account.accountAddress.substring(0, 8)}`;
  
  // Add status to label if failed
  if (isFailedUpdate) {
    label = `[FAILED] ${label}`;
  }
  // Create authorization based on permissions
  const authorization: any = {};
  if (isProof) {
    authorization.proof = true;
  } else if (isSignature) {
    authorization.signature = true;
  }

  // Extract and process state updates
  const stateUpdates = extractStateUpdates(account.update);


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
        appState: extractAppState(account.update),
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
    },
    // Additional metadata for blockchain-specific information
    metadata: {
      callDepth: account.callDepth || 0,
      tokenId: account.tokenId,
      isZkappAccount: account.isZkappAccount,
      incrementNonce: account.incrementNonce,
      failed: isFailedUpdate,
      failureReason: failureReason,
      stateUpdates: stateUpdates
    }
  };
}

const extractAppState = (update: any): any[] => {
  if (!update || !update.appState || !Array.isArray(update.appState)) {
    return [];
  }
  
  return update.appState.map((state: any) => state || '0');
}

const extractStateUpdates = (update: any): any[] => {
  if (!update) return [];
  
  const stateUpdates = [];
  
  // Check appState
  if (update.appState && Array.isArray(update.appState)) {
    stateUpdates.push({
      type: 'appState',
      value: update.appState
    });
  }
  
  // Check for delegate changes
  if (update.delegatee) {
    stateUpdates.push({
      type: 'delegate',
      value: update.delegatee
    });
  }
  
  // Check for timing changes
  if (update.timing) {
    stateUpdates.push({
      type: 'timing',
      value: update.timing
    });
  }
  
  // Check for token symbol changes
  if (update.tokenSymbol) {
    stateUpdates.push({
      type: 'tokenSymbol',
      value: update.tokenSymbol
    });
  }
  
  // Check for other updates like votingFor or zkappUri
  if (update.votingFor) {
    stateUpdates.push({
      type: 'votingFor',
      value: update.votingFor
    });
  }
  
  if (update.zkappUri) {
    stateUpdates.push({
      type: 'zkappUri',
      value: update.zkappUri
    });
  }
  
  return stateUpdates;
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

  const permissionTypes = [
    'editState', 'send', 'receive', 'setDelegate', 'setPermissions',
    'setVerificationKey', 'setZkappUri', 'editActionState', 'setTokenSymbol',
    'incrementNonce', 'setVotingFor', 'setTiming'
  ];
  
  const mappedPermissions: any = {};

  permissionTypes.forEach(type => {
    if (permissions[type] !== undefined) {
      mappedPermissions[type] = createPermission(type);
    }
  });
  
  return mappedPermissions;
}