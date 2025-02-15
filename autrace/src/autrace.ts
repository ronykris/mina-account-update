import { AccountUpdate, SmartContract } from 'o1js';
import { TreeSnapshot, TreeOperation, ChangeLog, TransactionState, AUMetadata, AccountType, Edge, EnhancedTransactionState, ParsedAccountUpdate, TransactionNode, MethodAnalysis, ContractMetadata, ContractMethod, AccountUpdateRelationship, ContractAnalysis } from './Interface.js'
import { SmartContractAnalyzer } from './ContractAnalyser.js';
import { AccountUpdateAnalyzer } from './AccountUpdateAnalyzer.js';

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
            relationships: new Map()
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
            const magnitude = au.body.balanceChange.magnitude.toString();
            // If balance change is negative, it's a fee
            if (au.body.balanceChange.isNegative()) {
                // Convert to nanomina
                const feesInNanomina = BigInt(magnitude);
                
                // Convert current total from MINA to nanomina for calculation
                const currentTotalNanomina = this.transactionState.metadata.totalFees === 0 
                    ? BigInt(0) 
                    : BigInt(this.transactionState.metadata.totalFees * 1e9);
                        
                const newTotalNanomina = currentTotalNanomina + feesInNanomina;
                
                // Convert back to MINA and store as number
                this.transactionState.metadata.totalFees = Number(newTotalNanomina) / 1e9;
            }
        }

        if (!this.transactionState.nodes.has(auMetadata.id)) {
            const nodeType = this.determineNodeType(au);
            const node: TransactionNode = {
                id: auMetadata.id,
                type: nodeType,
                label: auMetadata.label,
                publicKey: auMetadata.publicKey,
                contractType: this.extractContractType(au)
            };
            this.transactionState.nodes.set(auMetadata.id, node);
        }

        this.auAnalyzer.processAccountUpdate(au);
        this.updateBalanceState(auMetadata);
    }


    private extractAUMetadata = (au: any): AUMetadata => {
        return {
            id: au.id.toString(),
            label: au.label || 'Unnamed Update',
            type: this.determineAuthorizationType(au),
            publicKey: au.body.publicKey.toBase58(),
            balanceChange: au.body.balanceChange.toString(),
            methodName: au.lazyAuthorization?.methodName,
            args: au.lazyAuthorization?.args
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
        const balanceChange = auMetadata.balanceChange ? 
            BigInt(auMetadata.balanceChange) : 
            BigInt(0);
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
            relationships: new Map()
        };
    };

    public getTransactionState = (transaction: any): TransactionState => {
        
        if (!this.transactionState) {
            this.clearTransactionState();
        } else {
            this.transactionState.nodes = new Map();
            this.transactionState.edges = [];
            this.transactionState.relationships = new Map();
        }

        this.traverseTransaction(transaction);

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
            
            const expandedMethod = rel.method
                ? `Contract: ${rel.method.contract ?? ''}, Method: ${rel.method.name ?? ''}`
                : 'N/A';
    
            const expandedStateChanges = Array.isArray(rel.stateChanges)
                ? rel.stateChanges
                      .map(change =>
                          `Field: ${change.field ?? ''}, IsSome: ${change.value?.isSome ?? false}, Value: ${change.value?.value ?? '0'}`
                      )
                      .join(' | ')
                : 'No State Changes';
    
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

                const flattenedOperation = `Sequence: ${operation.sequence ?? 'N/A'}, Type: ${operation.type ?? 'N/A'}, Status: ${operation.status ?? 'N/A'}${amount}${fee}`;

                return {
                    id: edge.id,
                    fromNode: edge.fromNode,
                    toNode: edge.toNode,
                    operation: flattenedOperation
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
                relationships: plainRelationships
            }

        //this.transactionSnapshots = [...this.transactionSnapshots, state];
        this.transactionSnapshots = [...this.transactionSnapshots, finalState];
        
        return {
            nodes: this.transactionState.nodes,
            edges: expandedEdges as any,
            balanceStates: this.transactionState.balanceStates,
            /*metadata: {
                ...this.transactionState.metadata,
                totalFees: this.getTotalFeesInMina()  // Add here to convert to MINA
            },*/
            metadata: this.transactionState.metadata,
            relationships: plainRelationships
        };

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
}