import { AccountUpdate } from "o1js";
import { AccountUpdateRelationship } from "./Interface.js";

export class AccountUpdateAnalyzer {
    private auRelationships: Map<string, AccountUpdateRelationship>;
    private currentDepth: number = 0;
    private parentStack: string[] = [];  // Stack to track parent AUs

    constructor() {
        this.auRelationships = new Map();
    }

    public processAccountUpdate(au: AccountUpdate): void {
        const auId = au.id.toString();
        const callDepth = au.body.callDepth || 0;

        // Manage parent stack based on call depth
        while (this.currentDepth >= callDepth && this.parentStack.length > 0) {
            this.parentStack.pop();
            this.currentDepth--;
        }

        const parentId = this.parentStack.length > 0 ? this.parentStack[this.parentStack.length - 1] : undefined;

        // Create relationship entry
        const relationship: AccountUpdateRelationship = {
            id: auId,
            label: au.label || 'Unnamed Update',
            parentId,
            children: [],
            depth: callDepth,
            method: this.extractMethodInfo(au),
            stateChanges: this.extractStateChanges(au)
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
        this.parentStack.push(auId);
        this.currentDepth = callDepth;
    }

    private extractMethodInfo(au: AccountUpdate): { name: string; contract: string; } | undefined {
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

    public getRelationships(): Map<string, AccountUpdateRelationship> {
        return this.auRelationships;
    }

    public getHierarchicalView(): {
        id: string;
        label: string;
        children: any[];  // Recursive structure
    }[] {
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
                children: auRelationship.children.map(childId => {
                    const child = this.auRelationships.get(childId);
                    return child ? buildTree(child) : null;
                }).filter(x => x)
            };
        };

        return roots.map(root => buildTree(root));
    }

}