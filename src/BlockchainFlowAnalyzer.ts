import { TransactionState, TransactionFlowGraph, ProcessedAccount, Relationship } from './Interface.js';

export class BlockchainFlowAnalyzer {
    public analyzeTransactionFlow = (blockchainTx: any): TransactionFlowGraph => {
        const txMeta = {
            txHash: blockchainTx.txHash,
            status: blockchainTx.txStatus,
            blockHeight: blockchainTx.blockHeight,
            timestamp: blockchainTx.timestamp,
            fee: blockchainTx.fee,
            feePayerAddress: blockchainTx.feePayerAddress,
            memo: blockchainTx.memo || ''
        };

        const accountUpdates = this.processAccountUpdates(blockchainTx.updatedAccounts);

        this.mapFailureInfo(accountUpdates, blockchainTx.failures);

        const relationships = [
            // Various relationship types in order of precedence
            this.buildCallDepthRelationships(accountUpdates),
            this.buildStateDepRelationships(accountUpdates),
            this.buildTokenRelationships(accountUpdates),
            this.buildFeepayerRelationships(accountUpdates, txMeta.feePayerAddress),
            this.buildCallDataRelationships(accountUpdates),
            this.buildTemporalRelationships(accountUpdates)
        ];

        const edges = this.mergeRelationships(relationships);
        
        return {
            metadata: txMeta,
            nodes: accountUpdates,
            edges: edges
        };
    }

    private processAccountUpdates = (rawAccounts: any[]): ProcessedAccount[] => {
        return rawAccounts.map((account, index) => ({
          id: `au-${index}`,
          index,
          address: account.accountAddress,
          shortAddress: account.accountAddress.substring(0, 12) + '...',
          isContract: account.isZkappAccount || !!account.update?.verificationKey,
          callDepth: account.callDepth || 0,
          tokenId: account.tokenId,
          tokenSymbol: this.extractTokenSymbol(account),
          balanceChange: account.totalBalanceChange || 0,
          failed: false, // Will be updated in mapFailureInfo
          failureReason: null,
          stateValues: this.extractStateValues(account.update?.appState),
          callData: account.callData !== '0' ? account.callData : null,
          permissions: account.update?.permissions || {}
        }));
    }

    private mapFailureInfo = (accounts: ProcessedAccount[], failures: any[]) => {
        if (!failures || !Array.isArray(failures)) return;
        
        failures.forEach(failure => {
          // Adjust for 0-based vs 1-based indexing if needed
          const accountIndex = failure.index - 1;
          if (accountIndex >= 0 && accountIndex < accounts.length) {
            accounts[accountIndex].failed = true;
            accounts[accountIndex].failureReason = failure.failureReason;
          }
        });
        
        // Find root cause of failure to highlight it
        const rootFailure = accounts.find(a => a.failed);
        if (rootFailure) {
          rootFailure.isRootFailure = true;
        }
    }

    private buildCallDepthRelationships = (accounts: ProcessedAccount[]): Relationship[] => {
        const relationships: Relationship[] = [];
        
        // Group accounts by call depth
        const accountsByDepth = new Map<number, ProcessedAccount[]>();
        accounts.forEach(account => {
          if (!accountsByDepth.has(account.callDepth)) {
            accountsByDepth.set(account.callDepth, []);
          }
          accountsByDepth.get(account.callDepth)!.push(account);
        });
        
        // Process accounts with depth > 0
        for (let depth = 1; depth <= Math.max(...accountsByDepth.keys()); depth++) {
          const highDepthAccounts = accountsByDepth.get(depth) || [];
          const lowerDepthAccounts = accountsByDepth.get(depth - 1) || [];
          
          highDepthAccounts.forEach(highAccount => {
            // Find potential parent account(s) with same address at lower depth
            const potentialParents = lowerDepthAccounts.filter(
              lowAccount => lowAccount.address === highAccount.address
            );
            
            if (potentialParents.length > 0) {
              // Use the closest previous parent in sequence
              const validParents = potentialParents.filter(p => p.index < highAccount.index);
              if (validParents.length > 0) {
                const parent = validParents.reduce((prev, curr) => 
                  (curr.index > prev.index) ? curr : prev
                );
                
                relationships.push({
                  from: parent.id,
                  to: highAccount.id,
                  type: 'call_depth',
                  label: 'calls (depth)',
                  color: 'blue'
                });
              }
            }
          });
        }        
        return relationships;
    }

    private buildStateDepRelationships = (accounts: ProcessedAccount[]): Relationship[] => {
        const relationships: Relationship[] = [];
        const stateValues = new Map<string, { accountId: string, index: number }[]>();
        
        // Track all non-zero state values
        accounts.forEach(account => {
          if (account.stateValues) {
            account.stateValues.forEach((value, index) => {
              if (value && value !== '0') {
                const valueStr = value.toString();
                if (!stateValues.has(valueStr)) {
                  stateValues.set(valueStr, []);
                }
                stateValues.get(valueStr)!.push({ accountId: account.id, index });
              }
            });
          }
        });
        
        // Create relationships for accounts that share state values
        stateValues.forEach((appearances, value) => {
          if (appearances.length > 1) {
            // Sort by account index to get chronological order
            appearances.sort((a, b) => {
              const accountA = accounts.find(acc => acc.id === a.accountId)!;
              const accountB = accounts.find(acc => acc.id === b.accountId)!;
              return accountA.index - accountB.index;
            });
            
            // Create edges between consecutive appearances
            for (let i = 0; i < appearances.length - 1; i++) {
              relationships.push({
                from: appearances[i].accountId,
                to: appearances[i+1].accountId,
                type: 'state_dependency',
                label: 'state dep',
                color: 'black'
              });
            }
          }
        });        
        return relationships;
    }

    private buildTokenRelationships = (accounts: ProcessedAccount[]): Relationship[] => {
        const relationships: Relationship[] = [];
        const defaultTokenId = 'wSHV2S4qX9jFsLjQo8r1BsMLH2ZRKsZx6EJd1sbozGPieEC4Jf'; // Mina default token
        
        // Group accounts by token ID
        const accountsByToken = new Map<string, ProcessedAccount[]>();
        accounts.forEach(account => {
          if (!accountsByToken.has(account.tokenId)) {
            accountsByToken.set(account.tokenId, []);
          }
          accountsByToken.get(account.tokenId)!.push(account);
        });
        
        // Create relationships for non-default tokens
        accountsByToken.forEach((tokenAccounts, tokenId) => {
          if (tokenId !== defaultTokenId && tokenAccounts.length > 1) {
            // Sort by account index
            tokenAccounts.sort((a, b) => a.index - b.index);
            
            // Create a chain of token operations
            for (let i = 0; i < tokenAccounts.length - 1; i++) {
              relationships.push({
                from: tokenAccounts[i].id,
                to: tokenAccounts[i+1].id,
                type: 'token_operation',
                label: 'token op',
                color: 'purple'
              });
            }
          }
        });
        
        return relationships;
    }

    private buildFeepayerRelationships = (accounts: ProcessedAccount[], feePayerAddress: string): Relationship[] => {
        const relationships: Relationship[] = [];
        
        const feePayer = accounts.find(account => account.address === feePayerAddress);
        if (!feePayer) return relationships;
        
        // Connect fee payer to the first non-fee-payer account update
        const firstOp = accounts.find(account => account.address !== feePayerAddress);
        if (firstOp) {
          relationships.push({
            from: feePayer.id,
            to: firstOp.id,
            type: 'fee_payer',
            label: 'initiates',
            color: 'green'
          });
        }
        
        return relationships;
    }

    private buildCallDataRelationships = (accounts: ProcessedAccount[]): Relationship[] => {
        const relationships: Relationship[] = [];
        
        accounts.forEach((account, i) => {
          if (account.callData) {
            // Connect to next account in sequence as a heuristic
            // More sophisticated matching could be done based on actual callData analysis
            if (i < accounts.length - 1) {
              relationships.push({
                from: account.id,
                to: accounts[i+1].id,
                type: 'call_data',
                label: 'calls (data)',
                color: 'orange'
              });
            }
          }
        });
        
        return relationships;
    }

    private buildTemporalRelationships = (accounts: ProcessedAccount[]): Relationship[] => {
        const relationships: Relationship[] = [];
        
        for (let i = 0; i < accounts.length - 1; i++) {
          relationships.push({
            from: accounts[i].id,
            to: accounts[i+1].id,
            type: 'sequence',
            label: 'sequence',
            color: 'gray'
          });
        }
        
        return relationships;
    }

    private mergeRelationships = (relationshipSets: Relationship[][]): Relationship[] => {
        const merged: Relationship[] = [];
        const edgeMap = new Map<string, boolean>();
        
        // Process each set of relationships in priority order
        relationshipSets.forEach(relationships => {
          relationships.forEach(rel => {
            const edgeKey = `${rel.from}-${rel.to}`;
            if (!edgeMap.has(edgeKey)) {
              edgeMap.set(edgeKey, true);
              merged.push(rel);
            }
          });
        });
        
        return merged;
    }

    private applyFailureStatus = (relationships: Relationship[], accounts: ProcessedAccount[]): Relationship[] => {
        return relationships.map(rel => {
          const fromAccount = accounts.find(acc => acc.id === rel.from);
          const toAccount = accounts.find(acc => acc.id === rel.to);
          
          if ((fromAccount && fromAccount.failed) || (toAccount && toAccount.failed)) {
            return {
              ...rel,
              failed: true,
              style: 'dashed'
            };
          }
          
          return rel;
        });
    }

    private extractTokenSymbol = (account: any): string => {
        if (account.update?.tokenSymbol) {
          return account.update.tokenSymbol;
        }
        
        // Default Mina token
        if (account.tokenId === 'wSHV2S4qX9jFsLjQo8r1BsMLH2ZRKsZx6EJd1sbozGPieEC4Jf') {
          return 'MINA';
        }
        
        return 'Custom';
    }

    private extractStateValues = (appState: any): string[] => {
        if (!appState || !Array.isArray(appState)) {
          return [];
        }
        
        return appState.map(state => state ? state.toString() : '0');
      }

    public enhanceTransactionState = (txState: TransactionState, blockchainTx: any): TransactionState => {
        // Only proceed if this is a blockchain transaction
        if (!blockchainTx || !blockchainTx.txHash) {
          return txState; // Return unchanged if not a blockchain transaction
        }
        
        // Generate flow graph
        const flowGraph = this.analyzeTransactionFlow(blockchainTx);
        
        // Create a new transaction state with the original data plus flow graph
        return {
          ...txState,
          blockchainData: {
            ...(txState.blockchainData || {}),
            flowGraph: flowGraph
          }
        };
    }
}