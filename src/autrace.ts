import { AccountUpdate, SmartContract } from 'o1js';
import { TransactionState, AUMetadata, Edge, TransactionNode, AccountUpdateRelationship, ContractAnalysis } from './Interface.js'
import { SmartContractAnalyzer } from './ContractAnalyser.js';
import { AccountUpdateAnalyzer } from './AccountUpdateAnalyzer.js';
import { adaptBlockchainTransaction } from './BlockchainAdapter.js';
import { BlockchainFlowAnalyzer } from './BlockchainFlowAnalyzer.js';
import { UInt64, Field } from 'o1js';

export class AUTrace {
    private transactionState: TransactionState;
    private contractAnalyzer: SmartContractAnalyzer;
    private contractAnalysis: Map<string, ContractAnalysis>;
    private auAnalyzer: AccountUpdateAnalyzer;
    private transactionSnapshots: any[] = [];


    constructor() {
        this.auAnalyzer = new AccountUpdateAnalyzer();
        this.contractAnalyzer = new SmartContractAnalyzer();
        this.contractAnalysis = new Map();
        this.transactionState = {
            nodes: new Map(),
            edges: [],
            balanceStates: new Map(),
            metadata: {
                totalProofs: 0,
                totalSignatures: 0,
                totalFees: 0,
                accountUpdates: 0
            },
            relationships: new Map(),
            blockchainData: undefined
        };
        
    }

    public initializeContracts(contracts: SmartContract[]) {
        contracts.forEach(contract => {
            this.contractAnalyzer.analyzeContractInstance(contract);
        });
        this.contractAnalysis = this.contractAnalyzer.getContracts();
    }

    public getContractAnalysis(): Map<string, ContractAnalysis> {
        return this.contractAnalysis;
    }

    public getContractAnalysisFor(contractName: string): ContractAnalysis | undefined {
        return this.contractAnalysis.get(contractName);
    }

    private traverseTransaction = (transaction: any): void => {
        if (!transaction) return;

        // Extract blockchain data if available
        if (transaction.originalBlockchainData) {
            const blockchainTx = transaction.originalBlockchainData;
            this.transactionState.blockchainData = {
                blockHeight: blockchainTx.blockHeight,
                txHash: blockchainTx.txHash,
                timestamp: blockchainTx.timestamp,
                memo: blockchainTx.memo || '',
                status: blockchainTx.txStatus || 'unknown',
                failures: blockchainTx.failures || []
            };
        }

        const accountUpdates = transaction.transaction.accountUpdates || [];
        this.transactionState.metadata.accountUpdates = accountUpdates.length;

        accountUpdates.forEach((au: AccountUpdate) => {
            this.processAccountUpdate(au);
        });
    }

    private processAccountUpdate = (au: AccountUpdate): void => {
        const auMetadata = this.extractAUMetadata(au);
        if (au.authorization.proof) {
            this.transactionState.metadata.totalProofs++;
        } else if (au.authorization.signature) {
            this.transactionState.metadata.totalSignatures++;
        }
        /*if (auMetadata.type === 'proof') {
            this.transactionState.metadata.totalProofs++;
        } else if (auMetadata.type === 'signature') {
            this.transactionState.metadata.totalSignatures++;
        }*/
        // Calculate fees
        
        if (au.body.balanceChange) {
            //const magnitude = au.body.balanceChange.magnitude.toString();
            let magnitudeRaw: any = au.body.balanceChange.magnitude;
            let magnitude: bigint;
            if (typeof magnitudeRaw === "bigint") {
                magnitude = magnitudeRaw;
            } else if (typeof magnitudeRaw === "string") {
                if (/^\d+$/.test(magnitudeRaw)) {
                    // String contains an integer (e.g., "1000000000"), convert directly
                    magnitude = BigInt(magnitudeRaw);
                } else if (/^\d+\.\d+$/.test(magnitudeRaw)) {
                    // String contains a decimal (e.g., "0.467684313"), convert safely
                    const magnitudeFloat = parseFloat(magnitudeRaw);
                    magnitude = BigInt(Math.round(magnitudeFloat * 1e9)); // Convert MINA to nanomina
                } else {
                    throw new Error(`Unexpected magnitude string format: ${magnitudeRaw}`);
                }
            } else if (typeof magnitudeRaw === "number") {
                // If it's already a float, multiply and round before converting
                const magnitudeInteger = Math.round(magnitudeRaw * 1e9); // Convert MINA to nanomina
                magnitude = BigInt(magnitudeInteger);
            } else if (typeof magnitudeRaw === "object" && magnitudeRaw !== null && "value" in magnitudeRaw) {                
                // If the object contains a `value` field, extract it
                //console.log("DEBUG: magnitudeRaw keys:", Object.keys(magnitudeRaw));

                // ✅ Handle case where magnitudeRaw is already UInt64
                if (magnitudeRaw instanceof UInt64) {
                    magnitude = magnitudeRaw.toBigInt();
                    //console.log("DEBUG: magnitudeRaw is already UInt64, extracted BigInt:", magnitude);
                } else if (magnitudeRaw.value instanceof Field) {                        
                    magnitude = magnitudeRaw.value.toBigInt();
                    //console.log("DEBUG: Converted Field to BigInt:", magnitude);
                } else {
                    throw new Error(`Unexpected magnitude type inside object: ${typeof magnitudeRaw.value}, value: ${magnitudeRaw.value}`);
                }
            } else {
                throw new Error(`Unexpected magnitude type or structure: ${typeof magnitudeRaw}, value: ${JSON.stringify(magnitudeRaw)}`);
            }        
        


            //console.log("DEBUG: Converted magnitude to BigInt:", magnitude)
            // If balance change is negative, it's a fee
            if (au.body.balanceChange.isNegative()) {
                // Convert to nanomina
                //const feesInNanomina = BigInt(magnitude);
                const feesInNanomina = magnitude;
                
                // Convert current total from MINA to nanomina for calculation
                const currentTotalNanomina = this.transactionState.metadata.totalFees === 0 
                    //? BigInt(0) 
                    ? 0n
                    : BigInt(Math.round(Number(this.transactionState.metadata.totalFees) * 1e9));
                        
                const newTotalNanomina = currentTotalNanomina + feesInNanomina;
                
                // Convert back to MINA and store as number
                this.transactionState.metadata.totalFees = Number(newTotalNanomina) / 1_000_000_000;
            }
        }

        if (!this.transactionState.nodes.has(auMetadata.id)) {
            const nodeType = this.determineNodeType(au);
            
            // Extract additional metadata
            const failed = (au as any).metadata?.failed || false;
            const failureReason = (au as any).metadata?.failureReason;
            const tokenId = (au as any).metadata?.tokenId;
            const callDepth = (au as any).metadata?.callDepth || 0;
            
            const node: TransactionNode = {
                id: auMetadata.id,
                type: nodeType,
                label: auMetadata.label,
                publicKey: auMetadata.publicKey,
                contractType: this.extractContractType(au),
                failed,
                failureReason,
                tokenId,
                callDepth
            };
            this.transactionState.nodes.set(auMetadata.id, node);
        }

        this.auAnalyzer.processAccountUpdate(au);
        this.updateBalanceState(auMetadata);
    }


    private extractAUMetadata = (au: any): AUMetadata => {
        // Extract label, checking if it's a failed operation
        let label = au.label || 'Unnamed Update';
        if ((au as any).metadata?.failed) {
            label = `[FAILED] ${label}`;
        }
        return {
            id: au.id.toString(),
            label: au.label || 'Unnamed Update',
            type: this.determineAuthorizationType(au),
            publicKey: au.body.publicKey.toBase58(),
            balanceChange: au.body.balanceChange.toString(),
            methodName: au.lazyAuthorization?.methodName,
            args: au.lazyAuthorization?.args,
            // Additional metadata
            failed: (au as any).metadata?.failed || false,
            tokenId: (au as any).metadata?.tokenId,
            callDepth: (au as any).metadata?.callDepth || 0
        };
    }

    private getTotalFeesInMina(): number {
        const feesInNanomina = BigInt(this.transactionState.metadata.totalFees);
        const feesInMina = Number(feesInNanomina) / 1e9;
        return Number(feesInMina); 
    }

    private determineAuthorizationType(au: any): 'proof' | 'signature' | 'none' {
        if (au.lazyAuthorization?.kind === 'lazy-proof') return 'proof';
        if (au.lazyAuthorization?.kind === 'lazy-signature') return 'signature';
        return 'none';
    }

    private extractContractType = (au: AccountUpdate): string | undefined => {
        if (au.label) {
            return au.label
        }
            /*// Look for contract type patterns in the label
            if (au.label.includes('FungibleTokenAdmin')) {
                return 'FungibleTokenAdmin';
            }
            if (au.label.includes('FungibleToken')) {
                return 'FungibleToken';
            }
            if (au.label.includes('TokenEscrow')) {
                return 'TokenEscrow';
            }
            if (au.label.includes('ZkApp')) {
                return 'SmartContract';
            }*/
        return undefined
    }

    
    private determineNodeType = (au: AccountUpdate): 'account' | 'contract' => {    
        const isContract = this.isContractAccount(au)
        if (isContract) {
            return 'contract'
        }
        return 'account'
    }

    private isContractAccount(au: AccountUpdate): boolean {
        //console.log(`Verification Key of ${au.body.publicKey.toBase58()} : ${au.body?.update?.verificationKey.value.hash}`)
        //console.log(`Auth kind of ${au.body.publicKey.toBase58()} : ${au.lazyAuthorization?.kind}`)
        // 1. Check the label for contract indicators
        if (au.label) {
            const labelLower = au.label.toLowerCase();
            //console.log('Label: ', labelLower)
            if (labelLower.includes('contract') || 
                labelLower.includes('zkapp') ||
                labelLower.includes('deploy')) {            
                return true;
            }
        }

        //2. Check for verification key updates
        // Contracts typically have verification keys
        if (au.body?.update?.verificationKey.value.data) {
            return true;
        }
        /*
        // 3. Check for proof-based permissions
        // Contracts typically use proofs for authorization
        if (au.body?.update?.permissions.value) {
            const permissions = au.body.update.permissions.value;
            const requiresProof = (
                (   
                    permissions.editState.constant.toBoolean() === false &&
                    permissions.editState?.signatureNecessary?.toBoolean() === false &&
                    permissions.editState?.signatureSufficient?.toBoolean() === false
                ) || (
                    permissions.send?.constant?.toBoolean() === false &&
                    permissions.send?.signatureNecessary?.toBoolean() === false &&
                    permissions.send?.signatureSufficient?.toBoolean() === false
                )
            )                    
            if (requiresProof) {
                return true;
            }
        }*/

        // 4. Check authorization type
        // Contracts often use proof-based authorization
        if (au.lazyAuthorization?.kind === 'lazy-proof') {
            return true;
        }    
            
        // If none of the above, it's probably a regular account
        return false;            
    }

    private updateBalanceState = (auMetadata: AUMetadata): void => {
        const currentBalance = this.transactionState.balanceStates.get(auMetadata.id) || [0];
        // Get the last known balance
        const lastBalance = currentBalance[currentBalance.length - 1] ?? 0;

        //console.log("DEBUG: Converting balanceChange to BigInt:", auMetadata.balanceChange, "Type:", typeof auMetadata.balanceChange);
        const balanceChange = auMetadata.balanceChange
            ? BigInt(Math.round(Number(auMetadata.balanceChange) * 1e9))
            : 0n;
        const newBalance = BigInt(lastBalance?.toString()) + balanceChange;
        currentBalance.push(Number(newBalance));
        this.transactionState.balanceStates.set(auMetadata.id, currentBalance);
    }

    private buildEdgesFromRelationships(relationships: Map<string, AccountUpdateRelationship>): Edge[] {
        const edges: Edge[] = [];
        let sequence = 1;
    
        relationships.forEach(relationship => {
            if (relationship.parentId) {
                const edge: Edge = {
                    id: `op${sequence++}`,
                    fromNode: relationship.parentId,
                    toNode: relationship.id,
                    operation: {
                        sequence,
                        type: relationship.method?.name || 'update',
                        status: 'success'
                    }
                };
    
                if (relationship.stateChanges?.length) {
                    edge.operation.amount = {
                        value: Number(relationship.stateChanges[0]!.value!),
                        denomination: 'USD'
                    };
                }
    
                edges.push(edge);
            }
        });
    
        return edges;
    }

    public clearTransactionState = (): void => {
        this.transactionState = {
            nodes: new Map(),
            edges: [],
            balanceStates: new Map(),
            metadata: {
                totalProofs: 0,
                totalSignatures: 0,
                totalFees: 0,
                accountUpdates: 0
            },
            relationships: new Map(),
            blockchainData: undefined
        };
        // Also reset the account update analyzer
        this.auAnalyzer.reset();
    };

    public getTransactionState = (transaction: any): TransactionState => {
        
        if (!this.transactionState) {
            this.clearTransactionState();
        } else {
            this.transactionState.nodes = new Map();
            this.transactionState.edges = [];
            this.transactionState.relationships = new Map();
            this.transactionState.blockchainData = undefined;
        }

        // Check if this is a blockchain transaction and adapt it if needed
        const isBlockchainTx = !transaction?.transaction?.accountUpdates && 
                               (transaction.updatedAccounts || transaction.txHash);
        
        // Use the adapter if this is a blockchain transaction
        const processableTx = isBlockchainTx ? 
            adaptBlockchainTransaction(transaction) : 
            transaction;

        this.traverseTransaction(processableTx);

        // Reset the account update analyzer before processing
        this.auAnalyzer.reset();

        const accountUpdates = processableTx.transaction.accountUpdates || [];
        accountUpdates.forEach((au: AccountUpdate) => {
            this.auAnalyzer.processAccountUpdate(au);
        });

        const auRelationships = this.auAnalyzer.getRelationships();
        const plainRelationships = new Map<string, AccountUpdateRelationship>();
        auRelationships.forEach((rel, key) => {
            
            const contractName = rel.method?.contract || '';
            const contractAnalysis = this.contractAnalyzer.getContract(contractName);
            const stateNames = contractAnalysis 
                ? contractAnalysis.stateFields.map(f => f.name).join(', ')
                : '';

            const expandedChildren = Array.isArray(rel.children) && rel.children.length > 0
                ? rel.children.join(', ')
                : '';
            
            let expandedMethod = 'N/A';
            if (rel.method) {
                if (typeof rel.method === 'object') {
                    expandedMethod = `Contract: ${rel.method.contract ?? ''}, Method: ${rel.method.name ?? ''}`;
                } else {
                    expandedMethod = String(rel.method);
                }
            }
            
            let expandedStateChanges = 'No State Changes';
            if (Array.isArray(rel.stateChanges) && rel.stateChanges.length > 0) {
                expandedStateChanges = rel.stateChanges
                    .map(change => {
                        if (typeof change === 'object') {
                            return `Field: ${change.field ?? ''}, Value: ${
                                typeof change.value === 'object' 
                                    ? (change.value?.value ?? '0') 
                                    : (change.value ?? '0')
                            }`;
                        } else {
                            return String(change);
                        }
                    })
                    .join(' | ');
            }
    
            plainRelationships.set(key, {
                ...rel,
                children: expandedChildren as any,
                method: expandedMethod as any,
                onChainStates: stateNames,
                stateChanges: expandedStateChanges as any
            });
        });
    
        const expandedEdges = this.buildEdgesFromRelationships(auRelationships)
            .map(edge => {
                const operation = edge.operation;
                const amountValue = (typeof operation.amount?.value === 'number' && !isNaN(operation.amount.value))
                    ? operation.amount.value
                    : 0;

                const denomination = operation.amount?.denomination || 'unknown';

                // Build the amount string if amount exists
                const amount = operation.amount
                    ? `, Amount: ${amountValue} ${denomination}`
                    : '';

                // Validate fee
                const fee = (typeof operation.fee === 'number' || typeof operation.fee === 'string')
                    ? `, Fee: ${operation.fee}`
                    : '';

                const status = edge.failed ? 'failed' : (operation.status ?? 'success');
                const flattenedOperation = `Sequence: ${operation.sequence ?? 'N/A'}, Type: ${operation.type ?? 'N/A'}, Status: ${operation.status ?? 'N/A'}${amount}${fee}`;

                return {
                    id: edge.id,
                    fromNode: edge.fromNode,
                    toNode: edge.toNode,
                    operation: flattenedOperation,
                    failed: edge.failed,
                    failureReason: edge.failureReason
                };
            });     
            
            /*const state = {
                nodes: Object.fromEntries(this.transactionState.nodes),
                edges: expandedEdges,
                balanceStates: Object.fromEntries(this.transactionState.balanceStates),
                metadata: this.transactionState.metadata,
                relationships: Object.fromEntries(plainRelationships)
            };*/

            const finalState = {
                nodes: this.transactionState.nodes,
                edges: expandedEdges as any,
                balanceStates: this.transactionState.balanceStates,
                /*metadata: {
                    ...this.transactionState.metadata,
                    totalFees: this.getTotalFeesInMina()  // Add here to convert to MINA
                },*/
                metadata: this.transactionState.metadata,
                relationships: plainRelationships,
                // Add metadata from blockchain transaction if available
                blockchainData: this.transactionState.blockchainData
            }

        //this.transactionSnapshots = [...this.transactionSnapshots, state];
        this.transactionSnapshots = [...this.transactionSnapshots, finalState];
        
        return finalState;

    }

    public getBlockchainTransactionState = (blockchainTx: any): TransactionState => {
        return this.getTransactionState(blockchainTx);
    }

    public getTransactions = (...transactionStates: any[]) => {                
        for (const txState of transactionStates) {
            if (txState) {
                this.getTransactionState(txState);
            }
        }
    }

    public getStateHistory() {
        return this.transactionSnapshots;
    }

    public getBlockchainTxnStateWithFlowAnalysis = (blockchainTx: any): TransactionState => {
        // First get normal transaction state
        const txState = this.getBlockchainTransactionState(blockchainTx);
        const onchainFlowAnalyzer = new BlockchainFlowAnalyzer()
        // Then enhance it with flow analysis
        return onchainFlowAnalyzer.enhanceTransactionState(txState, blockchainTx);
    }
}