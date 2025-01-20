import { AccountUpdate, PublicKey, Transaction} from 'o1js';
import { TreeSnapshot, TreeOperation, ChangeLog, TransactionState, AUMetadata, AccountType } from './Interface'

export class AUTrace {
    private transactionState: TransactionState;

    constructor() {
        this.transactionState = {
            nodes: new Map(),
            edges: [],
            balanceStates: new Map(),
            metadata: {
                totalProofs: 0,
                totalSignatures: 0,
                totalFees: '0',
                accountUpdates: 0
            }
        };
    }

    public traverseTransaction = (transaction: any): void => {
        if (!transaction) return;

        const accountUpdates: []= transaction.transaction.accountUpdates || [];
        //console.log(accountUpdates)
        
        const auCount = accountUpdates.length;
        this.transactionState.metadata.accountUpdates = auCount

        //First pass: Collect all nodes
        accountUpdates.forEach(au => {
            this.processAccountUpdate(au);
        });

        /*// Second pass: Build edges and track relationships
        accountUpdates.forEach((au, index) => {
            this.processAccountUpdateRelationships(au, index);
        });*/
        console.log(this.transactionState)
    }

    private processAccountUpdate = (au: any): void => {
        const auMetadata = this.extractAUMetadata(au);
        
        // Track signature/proof counts
        if (auMetadata.type === 'proof') {
            this.transactionState.metadata.totalProofs++;
        } else if (auMetadata.type === 'signature') {
            this.transactionState.metadata.totalSignatures++;
        }

        // Add node if it does not exist
        if (!this.transactionState.nodes.has(auMetadata.id)) {
            this.transactionState.nodes.set(auMetadata.id, {
                id: auMetadata.id,
                type: this.determineNodeType(au),
                label: auMetadata.label,
                publicKey: auMetadata.publicKey,
                contractType: this.extractContractType(au)
            });
        }

        // Track balance changes
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
        // 1. Check the label for contract indicators
        if (au.label) {
            const labelLower = au.label.toLowerCase();
            if (labelLower.includes('contract') || 
                labelLower.includes('zkapp') ||
                labelLower.includes('deploy')) {            
                return true;
            }
        }

        //2. Check for verification key updates
        // Contracts typically have verification keys
        if (au.body?.update?.verificationKey) {
            return true;
        }

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
        }

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
}