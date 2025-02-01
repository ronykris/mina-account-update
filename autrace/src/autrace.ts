import { AccountUpdate, PublicKey, SmartContract, Transaction } from 'o1js';
import { TreeSnapshot, TreeOperation, ChangeLog, TransactionState, AUMetadata, AccountType, Edge, EnhancedTransactionState, ParsedAccountUpdate, TransactionNode, MethodAnalysis, ContractMetadata, ContractMethod, AccountUpdateRelationship } from './Interface'
import { SmartContractAnalyzer } from './ContractAnalyser';
import { AccountUpdateAnalyzer } from './AccountUpdateAnalyzer';

export class AUTrace {
    private transactionState: TransactionState;
    private currentSequence: number = 0;
    private contractAnalyzer: SmartContractAnalyzer;
    private auAnalyzer: AccountUpdateAnalyzer;


    constructor() {
        this.auAnalyzer = new AccountUpdateAnalyzer();
        this.contractAnalyzer = new SmartContractAnalyzer();
        this.transactionState = {
            nodes: new Map(),
            edges: [],
            balanceStates: new Map(),
            metadata: {
                totalProofs: 0,
                totalSignatures: 0,
                totalFees: '0',
                accountUpdates: 0
            },
            relationships: new Map()
        };
        
    }

    public initializeContracts(contracts: SmartContract[]) {
        contracts.forEach(contract => {
            this.contractAnalyzer.analyzeContractInstance(contract);
        });
    }

    public traverseTransaction = (transaction: any): void => {
        if (!transaction) return;

        const accountUpdates = transaction.transaction.accountUpdates || [];
        this.transactionState.metadata.accountUpdates = accountUpdates.length;

        accountUpdates.forEach((au: AccountUpdate) => {
            this.processAccountUpdate(au);
        });
    }

    private processAccountUpdate = (au: AccountUpdate): void => {
        const auMetadata = this.extractAUMetadata(au);
        
        if (auMetadata.type === 'proof') {
            this.transactionState.metadata.totalProofs++;
        } else if (auMetadata.type === 'signature') {
            this.transactionState.metadata.totalSignatures++;
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

    private determineAuthorizationType(au: any): 'proof' | 'signature' | 'none' {
        if (au.lazyAuthorization?.kind === 'lazy-proof') return 'proof';
        if (au.lazyAuthorization?.kind === 'lazy-signature') return 'signature';
        return 'none';
    }

    private extractContractType(au: AccountUpdate): string | undefined {
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
            console.log('Label: ', labelLower)
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
                        value: Number(relationship.stateChanges[0].value),
                        denomination: 'state'
                    };
                }
    
                edges.push(edge);
            }
        });
    
        return edges;
    }

    public getTransactionState = (): TransactionState => {
        const auRelationships = this.auAnalyzer.getRelationships();
        this.transactionState.relationships = auRelationships;

        return {
            nodes: this.transactionState.nodes,
            edges: this.buildEdgesFromRelationships(auRelationships),
            balanceStates: this.transactionState.balanceStates,
            metadata: this.transactionState.metadata,
            relationships: auRelationships
        };
    }
}