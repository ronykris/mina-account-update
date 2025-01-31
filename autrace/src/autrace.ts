import { AccountUpdate, PublicKey, Transaction } from 'o1js';
import { TreeSnapshot, TreeOperation, ChangeLog, TransactionState, AUMetadata, AccountType, Edge, EnhancedTransactionState, ParsedAccountUpdate, TransactionNode, MethodAnalysis, ContractMetadata, ContractMethod } from './Interface'

export class AUTrace {
    private transactionState: EnhancedTransactionState;
    private currentSequence: number = 0;

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
            },
            relationships: new Map(),
            contractMetadata: new Map()
        };
    }

    private analyzeContractMethod(methodInfo: any): MethodAnalysis {
        const methodAnalysis: MethodAnalysis = {
            name: methodInfo.name,
            authorization: {
                requiresProof: methodInfo.toString().includes('@method'),
                requiresSignature: methodInfo.toString().includes('requireSignature')
            },
            accountUpdates: []
        };
    
        if (methodInfo.toString().includes('AccountUpdate.create')) {
            methodAnalysis.accountUpdates.push({
                creates: true,
                requiresSignature: methodInfo.toString().includes('requireSignature'),
                balanceChanges: methodInfo.toString().includes('.send')
            });
        }
    
        return methodAnalysis;
    }

    private analyzeContractState(state: any): { fields: string[], hasOnChainState: boolean } {
        const fields = Object.keys(state).filter(key => 
            state[key] !== null && state[key] !== undefined
        );
    
        return {
            fields,
            hasOnChainState: fields.length > 0
        };
    }

    private extractContractMetadata(au: AccountUpdate): void {
        if (!this.isContractAccount(au)) return;
    
        const contractId = au.id.toString();
        
        // Extract verification key info
        const verificationKey = au.body?.update?.verificationKey?.value;
        if (verificationKey) {
            // Get methods from verification key
            const methodNames = this.extractMethodsFromVerificationKey(verificationKey);
            const methods: ContractMethod[] = methodNames.map(name => ({
                name,
                authorization: {
                    requiresProof: true,
                    requiresSignature: false
                },
                accountUpdates: []
            }));
    
            // Analyze methods in detail
            methods.forEach(method => {
                const methodInfo = this.analyzeContractMethod(method);
                method.authorization = methodInfo.authorization;
                method.accountUpdates = methodInfo.accountUpdates;
            });
            console.log('AppState: ', au.body?.update?.appState)
            this.transactionState.contractMetadata.set(contractId, {
                methods,
                state: this.analyzeContractState(au.body?.update?.appState || {})
            });
        }
    
        // Extract and update permissions
        if (au.body?.update?.permissions?.value) {
            const permissions = au.body.update.permissions.value;
            const contractMeta = this.transactionState.contractMetadata.get(contractId);
            if (contractMeta) {
                contractMeta.methods = contractMeta.methods.map(method => ({
                    ...method,
                    authorization: {
                        ...method.authorization,
                        requiresSignature: permissions.send?.signatureNecessary?.toBoolean() || false
                    }
                }));
            }
        }
    }
    

    private extractMethodsFromVerificationKey(verificationKey: any): string[] {
        try {
            if (verificationKey.data) {
                const methodNames: string[] = [];
                // Extract method names from verification key data structure
                // You'll need to adjust this based on actual verification key structure
                if (typeof verificationKey.data === 'string') {
                    const methodMatches = verificationKey.data.match(/@method\s+(\w+)/g);
                    if (methodMatches) {
                        methodMatches.forEach((match: string) => {
                            const methodName = match.replace('@method', '').trim();
                            methodNames.push(methodName);
                        });
                    }
                }
                return methodNames;
            }
        } catch (error) {
            console.error('Error extracting methods:', error);
        }
        return [];
    }

    public traverseTransaction = (transaction: any): void => {
        if (!transaction) return;

        const accountUpdates = (transaction.transaction.accountUpdates || []) as Array<ParsedAccountUpdate>;
        //const accountUpdates: []= transaction.transaction.accountUpdates || [];
        //console.log(accountUpdates)
        
        const auCount = accountUpdates.length;
        this.transactionState.metadata.accountUpdates = auCount

        //First pass: Collect all nodes
        accountUpdates.forEach((au: any) => {
            this.processAccountUpdate(au);
        });

        type DepthGroups = {
            [depth: number]: typeof accountUpdates;
        };

        // Second pass: Build edges and track relationships
        const ausByDepth = accountUpdates.reduce<DepthGroups>((groups, au) => {
            const depth = au.body?.callDepth || 0;
            if (!groups[depth]) {
                groups[depth] = [];
            }
            groups[depth].push(au);
            return groups;
        }, {})

        Object.keys(ausByDepth)
        .sort((a, b) => Number(a) - Number(b))
        .forEach(depth => {
            ausByDepth[Number(depth)].forEach(au => {
                if (Number(depth) > 0) {
                    const parentDepth = Number(depth) - 1;
                    const potentialParents = ausByDepth[parentDepth] || [];
                    
                    const parent = this.findParentUpdate(au, potentialParents);
                    if (parent) {
                        const operationType = au.lazyAuthorization?.methodName || 
                                           (au.body?.balanceChange ? 'transfer' : 'method');
                        this.addEdge(parent, au, operationType);
                    }
                }
            });
        });
        // Update metadata with final counts
        this.transactionState.metadata.totalFees = Array.from(this.transactionState.balanceStates.entries())
            .reduce((total, [_, changes]) => {
                const lastChange = changes[changes.length - 1];
                return total + (lastChange < 0 ? BigInt(lastChange) : BigInt(0));
            }, BigInt(0))
            .toString();

        /*console.log('Transaction State:', {
            nodes: Array.from(this.transactionState.nodes.entries()),
            edges: this.transactionState.edges,
            metadata: this.transactionState.metadata,
            contractMetadata: Array.from(this.transactionState.contractMetadata.entries())
        });*/
    }

    private processAccountUpdate = (au: AccountUpdate): void => {
        const auMetadata = this.extractAUMetadata(au);
        
        // Existing tracking logic...
        if (auMetadata.type === 'proof') {
            this.transactionState.metadata.totalProofs++;
        } else if (auMetadata.type === 'signature') {
            this.transactionState.metadata.totalSignatures++;
        }

        // Add node with enhanced contract metadata
        if (!this.transactionState.nodes.has(auMetadata.id)) {
            const nodeType = this.determineNodeType(au);
            const node: TransactionNode = {
                id: auMetadata.id,
                type: nodeType,
                label: auMetadata.label,
                publicKey: auMetadata.publicKey,
                contractType: this.extractContractType(au)
            }

            /*if (nodeType === 'contract') {
                if (au.body?.update?.verificationKey?.value?.data) {
                    const contractMetadata: ContractMetadata = {
                        methods: [this.analyzeContractMethod(au)],
                        state: this.analyzeContractState(au)
                    };
                    this.transactionState.contractMetadata.set(auMetadata.id, contractMetadata);
                    node.contractMetadata = contractMetadata;
                }
            }*/
            if (nodeType === 'contract') {
                this.extractContractMetadata(au);
                node.contractMetadata = this.transactionState.contractMetadata.get(auMetadata.id);
            }
            
            this.transactionState.nodes.set(auMetadata.id, node);
            
        }

        this.updateBalanceState(auMetadata);

        /*// Update edge creation logic to include method context
        if (au.body.callDepth > 0) {
            const parentAU = this.findParentUpdate(au);
            if (parentAU) {
                const methodName = au.lazyAuthorization?.methodName || 'unknown';
                this.addEdge(parentAU, au, methodName);
            }
        }*/
    }

    private findParentUpdate(au: ParsedAccountUpdate, potentialParents: ParsedAccountUpdate[]): ParsedAccountUpdate | undefined {
        // First, try to find parent by method call
        if (au.caller) {
            return potentialParents.find(parent => 
                parent.body.publicKey.toBase58() === au.caller
            );
        }
    
        // Then, try to find by balance transfer
        if (au.body.balanceChange) {
            const balanceChange = BigInt(au.body.balanceChange.toString());
            if (balanceChange > 0) {
                // Look for a corresponding negative balance change
                return potentialParents.find(parent => {
                    const parentChange = BigInt(parent.body.balanceChange.toString());
                    return parentChange < 0 && 
                           (parentChange * BigInt(-1)) >= balanceChange;
                });
            }
        }
    
        return undefined;
    }

    /*private processAccountUpdate = (au: AccountUpdate): void => {
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

        // Create edges based on balance changes
        const balanceChange = BigInt(au.body.balanceChange.toString());
        if (balanceChange < BigInt(0)) {
            this.addEdge(au, { id: au.body.mayUseToken.tokenOwner }, 'transfer');
    }
    }*/

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

    private addEdge = (fromAU: ParsedAccountUpdate, toAU: ParsedAccountUpdate, opType: string): void => {
        this.currentSequence++;

        const edge: Edge = {
            id: `op${this.currentSequence}`,
            fromNode: fromAU.id.toString(),
            toNode: toAU.id.toString(),
            operation: {
                sequence: this.currentSequence,
                type: opType,
                status: 'success',                
            }

        }

        if (fromAU.body?.balanceChange) {
            const fee = BigInt(fromAU.body.balanceChange.toString());
            if (fee < BigInt(0)) {
                edge.operation.fee = fee.toString();
                
                edge.operation.amount = {
                    value: Number(-fee),
                    denomination: 'fee'
                };
            }
        }

        this.transactionState.edges.push(edge);
    } 

    public getTransactionState = (): TransactionState => {

        const formattedNodes = new Map();
    this.transactionState.nodes.forEach((node, key) => {
        formattedNodes.set(key, {
            ...node,
            contractMetadata: node.contractMetadata ? {
                methods: node.contractMetadata.methods.map(method => ({
                    name: method.name,
                    authorization: {
                        requiresProof: method.authorization.requiresProof,
                        requiresSignature: method.authorization.requiresSignature
                    },
                    accountUpdates: method.accountUpdates.map(update => ({
                        creates: update.creates,
                        requiresSignature: update.requiresSignature,
                        balanceChanges: update.balanceChanges
                    }))
                })),
                state: {
                    fields: [...node.contractMetadata.state.fields],
                    hasOnChainState: node.contractMetadata.state.hasOnChainState
                }
            } : undefined
        });
    });

    console.log(formattedNodes)
        
        const state = {
            nodes: formattedNodes,
            edges: this.transactionState.edges,
            balanceStates: this.transactionState.balanceStates,
            metadata: {
                totalProofs: this.transactionState.metadata.totalProofs,
                totalSignatures: this.transactionState.metadata.totalSignatures,
                totalFees: this.transactionState.metadata.totalFees,
                accountUpdates: this.transactionState.metadata.accountUpdates
            },
            relationships: this.transactionState.relationships
        };
    
        return state
    }
}