import { AccountUpdate } from "o1js";
import { AccountUpdateRelationship } from "./Interface.js";

export class AccountUpdateAnalyzer {
    private auRelationships: Map<string, AccountUpdateRelationship>;
    private currentDepth: number = 0;
    private parentStack: string[] = [];  // Stack to track parent AUs
    private tokenMap: Map<string, string[]> = new Map();

    constructor() {
        this.auRelationships = new Map();
        this.tokenMap = new Map();
    }

    public reset(): void {
        this.auRelationships = new Map();
        this.currentDepth = 0;
        this.parentStack = [];
        this.tokenMap = new Map();
    }

    public processAccountUpdate(au: AccountUpdate): void {
        const auId = au.id.toString();
        //const callDepth = au.body.callDepth || 0;
        let callDepth = 0;
        if ((au as any).metadata?.callDepth !== undefined) {
            callDepth = (au as any).metadata.callDepth;
        } else if (au.body.callDepth !== undefined) {
            callDepth = au.body.callDepth;
        }

        // Extract failure information if present
        const failed = (au as any).metadata?.failed || false;
        const failureReason = (au as any).metadata?.failureReason;

        const tokenId = (au as any).metadata?.tokenId || au.body.tokenId || 'default';
        
        if (!this.tokenMap.has(tokenId)) {
            this.tokenMap.set(tokenId, []);
        }
        this.tokenMap.get(tokenId)!.push(auId);

        // Manage parent stack based on call depth
        while (this.currentDepth >= callDepth && this.parentStack.length > 0) {
            this.parentStack.pop();
            this.currentDepth--;
        }

        const parentId = this.parentStack.length > 0 ? this.parentStack[this.parentStack.length - 1] : undefined;
        const methodInfo = this.extractMethodInfo(au)
        
        // Get label, handle failure info
        let label = au.label || 'Unnamed Update';
        if (failed) {
            label = `[FAILED] ${label}`;
        }

        // Create relationship entry
        const relationship: AccountUpdateRelationship = {
            id: auId,
            label: label,
            parentId,
            children: [],
            depth: callDepth,
            method: this.extractMethodInfo(au),
            stateChanges: this.extractStateChanges(au),
            tokenId: tokenId,
            failed: failed,
            failureReason: failureReason
        };

        // Update parent's children array
        if (parentId) {
            const parentRelationship = this.auRelationships.get(parentId);
            if (parentRelationship) {
                parentRelationship.children.push(auId);
            }
        }

        this.auRelationships.set(auId, relationship);

        // Update stack for next iterations
        if (!failed) {  // Only use non-failed operations as potential parents
            this.parentStack.push(auId);
            this.currentDepth = callDepth;
        }
    }

    private extractMethodInfo(au: AccountUpdate): { name: string; contract: string; } | undefined {
        // First check blockchain format
        if ((au as any).lazyAuthorization?.methodName) {
            return {
                contract: au.label || 'Unknown',
                name: (au as any).lazyAuthorization.methodName
            };
        }
        
        if (!au.label) return undefined;

        const parts = au.label.split('.');
        if (parts.length >= 2) {
            return {
                contract: parts[0]!,
                name: parts[1]!.replace('()', '')
            };
        }
        return undefined;
    }

    private extractStateChanges(au: AccountUpdate): { field: string; value: any; }[] | undefined {
        // Check blockchain format first
        if ((au as any).metadata?.stateUpdates) {
            return (au as any).metadata.stateUpdates.map((update: any) => ({
                field: update.type || 'unknown',
                value: update.value
            }));
        }

        const changes: any = [];
        
        if (au.body?.update?.appState) {
            au.body.update.appState.forEach((state, index) => {
                if (state) {
                    changes.push({
                        field: `appState[${index}]`,
                        value: state
                    });
                }
            });
        }

        return changes.length > 0 ? changes : undefined;
    }

    private processTokenRelationships(): void {
        // For each token, identify operations that should be related
        for (const [tokenId, operations] of this.tokenMap.entries()) {
            if (operations.length <= 1) continue;
            
            // Find operations without parents that can be related
            const orphans = operations.filter(id => {
                const rel = this.auRelationships.get(id);
                return rel && !rel.parentId && !rel.failed;
            });
            
            if (orphans.length <= 1) continue;
            
            // Use first operation as a root for others
            const rootId = orphans[0];
            if (!rootId) continue;
            
            const rootRel = this.auRelationships.get(rootId);
            if (!rootRel) continue;
            
            // Connect other orphans to the root
            for (let i = 1; i < orphans.length; i++) {
                const orphanId = orphans[i];
                const orphanRel = this.auRelationships.get(orphanId);
                
                if (orphanRel && !orphanRel.parentId) {
                    orphanRel.parentId = rootId;
                    rootRel.children.push(orphanId);
                }
            }
        }
    }

    public getRelationships(): Map<string, AccountUpdateRelationship> {
        this.processTokenRelationships();
        return this.auRelationships;
    }

    public getHierarchicalView(): {
        id: string;
        label: string;
        children: any[];  // Recursive structure
        tokenId?: string;
        failed?: boolean;
    }[] {
        this.processTokenRelationships();

        // Get root level AUs (those without parents)
        const roots = Array.from(this.auRelationships.values())
            .filter(r => !r.parentId);

        // Recursively build tree
        const buildTree: any = (auRelationship: AccountUpdateRelationship) => {
            return {
                id: auRelationship.id,
                label: auRelationship.label,
                method: auRelationship.method,
                stateChanges: auRelationship.stateChanges,
                tokenId: auRelationship.tokenId,
                failed: auRelationship.failed,
                failureReason: auRelationship.failureReason,
                children: auRelationship.children.map(childId => {
                    const child = this.auRelationships.get(childId);
                    return child ? buildTree(child) : null;
                }).filter(x => x)
            };
        };

        return roots.map(root => buildTree(root));
    }

}