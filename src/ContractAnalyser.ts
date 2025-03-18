import { SmartContract, State, state } from "o1js";
import { ContractAnalysis, MethodAnalysis } from "./Interface.js";

export class SmartContractAnalyzer {
    private contracts: Map<string, ContractAnalysis>;
    
    constructor() {
        this.contracts = new Map();
    }

    public analyzeContractInstance = (instance: SmartContract) => {
        const contractClass = Object.getPrototypeOf(instance).constructor;
        const contractName = contractClass.name;

        // Analyze state fields
        const stateFields = this.extractStateFields(contractClass);
        
        // Analyze methods and their relationships
        const methods = this.extractMethods(contractClass);
        
        // Analyze permissions
        const permissions = this.extractPermissions(contractClass);

        this.contracts.set(contractName, {
            name: contractName,
            stateFields,
            methods,
            permissions
        });
    }

    public getContracts(): Map<string, ContractAnalysis> {
        return this.contracts;
    }

    public getContract(contractName: string): ContractAnalysis | undefined {
        return this.contracts.get(contractName);
    }
    
    private extractStateFields = (contractClass: any): { name: string; index: number; }[] => {
        const stateFields: { name: string; index: number; }[] = [];
        let stateIndex = 0;

        Object.getOwnPropertyNames(contractClass.prototype).forEach(prop => {
            //console.log(prop)
            const descriptor = Object.getOwnPropertyDescriptor(contractClass.prototype, prop);
            //console.log('Descriptor: ', descriptor);
            if (descriptor?.get && prop !== 'address') {
                stateFields.push({
                    name: prop,
                    index: stateIndex++
                });
            }                
        })        
        //console.log('StateFields: ', stateFields)
        return stateFields;
    }

    private extractMethods = (contractClass: any): MethodAnalysis[] => {
        const methods: MethodAnalysis[] = [];

        Object.getOwnPropertyNames(contractClass.prototype).forEach(prop => {
            const descriptor = Object.getOwnPropertyDescriptor(contractClass.prototype, prop);
            if (descriptor?.value instanceof Function) {
                const methodStr = descriptor.value.toString();
                
                methods.push({
                    name: prop,
                    childCalls: this.extractChildCalls(methodStr),
                    stateChanges: this.extractStateChanges(methodStr),
                    authorization: {
                        requiresProof: methodStr.includes('@method'),
                        requiresSignature: methodStr.includes('requireSignature')
                    }
                });
            }
        });

        return methods;
    }

    private extractChildCalls = (methodStr: string): { contractMethod?: string; internalMethod?: string; }[] => {
        const childCalls = [];

        // Detect internal method calls
        const internalCallMatch = methodStr.match(/await this\.(\w+)\(/g);
        if (internalCallMatch) {
            childCalls.push({
                internalMethod: internalCallMatch[0].replace('await this.', '').replace('(', '')
            });
        }

        // Detect contract instantiations and calls
        const contractCallMatch = methodStr.match(/const\s+(\w+)\s*=\s*new\s+(\w+)\([^)]*\).*?await\s+\1\.(\w+)\(/s);
        if (contractCallMatch) {
            childCalls.push({
                contractMethod: `${contractCallMatch[2]}.${contractCallMatch[3]}`
            });
        }

        return childCalls;
    }

    private extractStateChanges = (methodStr: string): { field: string; operation: 'set' | 'get'; }[] => {
        const stateChanges: any = [];
        
        // Match state get operations
        const getMatches = methodStr.match(/this\.(\w+)\.get(?:AndRequireEquals)?\(\)/g);
        if (getMatches) {
            getMatches.forEach(match => {
                const field = match.split('.')[1];
                stateChanges.push({ field, operation: 'get' });
            });
        }

        // Match state set operations
        const setMatches = methodStr.match(/this\.(\w+)\.set\([^)]+\)/g);
        if (setMatches) {
            setMatches.forEach(match => {
                const field = match.split('.')[1];
                stateChanges.push({ field, operation: 'set' });
            });
        }

        return stateChanges;
    }
    
    private extractPermissions = (contractClass: any): string[] => {
        const deployMethod = contractClass.prototype.deploy;
        if (!deployMethod) return [];

        const deployStr = deployMethod.toString();
        const permissions = [];

        // Extract permission settings
        const permissionMatches = deployStr.match(/Permissions\.(\w+)\(\)/g);
        if (permissionMatches) {
            permissions.push(...permissionMatches.map((p: string) => 
                p.replace('Permissions.', '').replace('()', '')
            ));
        }

        return permissions;
    }
    
    public buildRelationshipGraph = (): Map<string, {
        parents: string[];
        children: Array<{
            contract?: string;
            method: string;
        }>;
        stateAccess: Array<{
            field: string;
            operations: ('get' | 'set')[];
        }>;
        state: string;
    }> => {
        const relationships = new Map();

        this.contracts.forEach((contract, contractName) => {
            const contractRelations = {
                parents: [],
                children: [] as Array<{contract?: string; method: string}>,
                stateAccess: [] as Array<{field: string; operations: ('get' | 'set')[]}>,
                onChainStates: contract.stateFields.map(field => field.name).join(', ')
            };

            contract.methods.forEach(method => {
                // Add child relationships
                method.childCalls.forEach(call => {
                    if (call.contractMethod) {
                        const [childContract, childMethod] = call.contractMethod.split('.');
                        contractRelations.children.push({
                            contract: childContract,
                            method: childMethod!
                        });
                    } else if (call.internalMethod) {
                        contractRelations.children.push({
                            method: call.internalMethod
                        });
                    }
                });

                // Track state access
                method.stateChanges.forEach(change => {
                    const existing = contractRelations.stateAccess.find(s => s.field === change.field);
                    if (existing) {
                        if (!existing.operations.includes(change.operation)) {
                            existing.operations.push(change.operation);
                        }
                    } else {
                        contractRelations.stateAccess.push({
                            field: change.field,
                            operations: [change.operation]
                        });
                    }
                });
            });

            relationships.set(contractName, contractRelations);
        });

        // Second pass to fill in parent relationships
        relationships.forEach((relations, contractName) => {
            relations.children.forEach((child: { contract: any; }) => {
                if (child.contract) {
                    const childRelations = relationships.get(child.contract);
                    if (childRelations && !childRelations.parents.includes(contractName)) {
                        childRelations.parents.push(contractName);
                    }
                }
            });
        });
        return relationships;
    }
    

    
}