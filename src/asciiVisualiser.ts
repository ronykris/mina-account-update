type TreeOperation = 'deploy' | 'prove' | 'sign' | 'send';

interface TreeNode {
    type: string;
    id: string;
    path: string;
    children: TreeNode[];
    metadata: {
        [key: string]: any; 
        authorization?: string;
        proofs?: any;
        body?: any;
        state?: any;
    };
}

interface TreeSnapshot {
    operation: TreeOperation;
    timestamp: number;
    tree: TreeNode;
    changes: {
        added: string[];
        removed: string[];
        modified: {
            node: string;
            changes: {
                field: string;
                before: any;
                after: any;
            }[];
        }[];
    };
}

class ASCIITreeVisualizer {
    private readonly INDENT = '  ';
    private readonly COLORS = {
        reset: '\x1b[0m',
        green: '\x1b[32m',
        red: '\x1b[31m',
        blue: '\x1b[34m',
        yellow: '\x1b[33m',
        purple: '\x1b[35m',
        gray: '\x1b[90m',
        white: '\x1b[37m',
        bold: '\x1b[1m'
    };

    private readonly SYMBOLS = {
        added: '+',
        removed: '-',
        modified: '•',
        arrow: '→',
        bullet: '∙',
        branch: '├',
        leaf: '└',
        vertical: '│',
    };

    private formatValue(value: any): string {
        if (value === null || value === undefined) return 'null';
        if (typeof value === 'object') {
            // NEW: Handle Field elements
            if (value._value !== undefined) return value._value.toString();
            return JSON.stringify(value);
        }
        return value.toString();
    }

    private safeStringify(obj: any): string {
        return JSON.stringify(obj, (key, value) => {
            // Handle BigInt
            if (typeof value === 'bigint') {
                return value.toString();
            }
            // Handle Field elements from o1js
            if (value?._value instanceof BigInt) {
                return value._value.toString();
            }
            return value;
        });
    }

    private formatNested(obj: any, prefix: string = '', indent: string = ''): string {
        let result = '';
        if (!obj) return result;

        Object.entries(obj).forEach(([key, value]) => {
            const fullKey = prefix ? `${prefix}.${key}` : key;
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                result += this.formatNested(value, fullKey, indent);
            } else {
                try {
                    const valueStr = typeof value === 'bigint' ? 
                        value.toString() : 
                        this.safeStringify(value);
                    result += `${indent}${this.COLORS.gray}${fullKey}: ${this.COLORS.reset}${valueStr}\n`;
                } catch (error) {
                    console.warn(`Error formatting value for ${fullKey}:`, error);
                    result += `${indent}${this.COLORS.gray}${fullKey}: ${this.COLORS.reset}[Complex Value]\n`;
                }
            }
        });
        return result;
    }

    private formatFieldChange(field: string, before: any, after: any, indent: string): string {
        try {
            const beforeStr = typeof before === 'bigint' ? 
                before.toString() : 
                this.safeStringify(before);
            const afterStr = typeof after === 'bigint' ? 
                after.toString() : 
                this.safeStringify(after);

            if (beforeStr.length > 50 || afterStr.length > 50) {
                return `${indent}${this.COLORS.gray}${field}:${this.COLORS.reset}\n` +
                       `${indent}  ${this.COLORS.red}From: ${beforeStr}${this.COLORS.reset}\n` +
                       `${indent}  ${this.COLORS.green}To:   ${afterStr}${this.COLORS.reset}`;
            }

            return `${indent}${this.COLORS.gray}${field}:${this.COLORS.reset} ` +
                   `${this.COLORS.red}${beforeStr}${this.COLORS.reset} ${this.SYMBOLS.arrow} ` +
                   `${this.COLORS.green}${afterStr}${this.COLORS.reset}`;
        } catch (error) {
            console.warn(`Error formatting change for ${field}:`, error);
            return `${indent}${this.COLORS.gray}${field}: [Complex Value]${this.COLORS.reset}`;
        }
    }

    private formatImportantFields(metadata: any, indent: string): string {
        let result = '';
        if (!metadata?.body) return result;

        const body = metadata.body;

        // Format standard fields
        [
            'tokenId',
            'callData',
            'callDepth',
            'incrementNonce',
            'useFullCommitment',
            'implicitAccountCreationFee'
        ].forEach(field => {
            if (body[field] !== undefined) {
                try {
                    const valueStr = this.safeStringify(body[field]);
                    result += `${indent}${this.COLORS.gray}${field}: ${this.COLORS.reset}${valueStr}\n`;
                } catch (error) {
                    console.warn(`Error formatting ${field}:`, error);
                }
            }
        });

        // Balance
        if (body.balanceChange) {
            result += `${indent}${this.COLORS.gray}balance: ${this.COLORS.reset}` +
                     `${body.balanceChange.sgn === 'Negative' ? '-' : '+'}${body.balanceChange.magnitude}\n`;
        }

        // Update fields
        if (body.update) {
            result += this.formatNested(body.update, 'update', indent);
        }

        // Authorization
        if (body.authorization) {
            result += this.formatNested(body.authorization, 'authorization', indent);
        }

        // Preconditions
        if (body.preconditions) {
            result += this.formatNested(body.preconditions, 'preconditions', indent);
        }

        // Token usage permissions
        if (body.mayUseToken) {
            result += this.formatNested(body.mayUseToken, 'mayUseToken', indent);
        }

        // Events and Actions
        ['events', 'actions'].forEach(field => {
            if (Array.isArray(body[field])) {
                try {
                    const valueStr = this.safeStringify(body[field]);
                    result += `${indent}${this.COLORS.gray}${field}: ${this.COLORS.reset}${valueStr}\n`;
                } catch (error) {
                    console.warn(`Error formatting ${field}:`, error);
                }
            }
        });

        return result;
    }

    private formatHeader(text: string): string {
        const line = '═'.repeat(text.length + 4);
        return `${this.COLORS.blue}╔${line}╗\n║  ${text}  ║\n╚${line}╝${this.COLORS.reset}\n`;
    }

    private formatPhase(phase: string, timestamp: number): string {
        const date = new Date(timestamp).toLocaleTimeString();
        return `${this.COLORS.bold}${this.COLORS.purple}▶ ${phase.toUpperCase()} ${this.COLORS.gray}(${date})${this.COLORS.reset}\n`;
    }

    private formatChanges(changes: TreeSnapshot['changes']): string {
        let result = '';

        // Format additions
        if (changes.added.length > 0) {
            result += `${this.COLORS.green}${this.SYMBOLS.branch} Added:${this.COLORS.reset}\n`;
            changes.added.forEach((path, i, arr) => {
                const prefix = i === arr.length - 1 ? this.SYMBOLS.leaf : this.SYMBOLS.branch;
                result += `${this.COLORS.green}${prefix} ${this.SYMBOLS.added} ${path}${this.COLORS.reset}\n`;
            });
        }

        // Format removals
        if (changes.removed.length > 0) {
            result += `${this.COLORS.red}${this.SYMBOLS.branch} Removed:${this.COLORS.reset}\n`;
            changes.removed.forEach((path, i, arr) => {
                const prefix = i === arr.length - 1 ? this.SYMBOLS.leaf : this.SYMBOLS.branch;
                result += `${this.COLORS.red}${prefix} ${this.SYMBOLS.removed} ${path}${this.COLORS.reset}\n`;
            });
        }

        // Format modifications
        if (changes.modified.length > 0) {
            result += `${this.COLORS.yellow}${this.SYMBOLS.branch} Modified:${this.COLORS.reset}\n`;
            changes.modified.forEach((mod, i, arr) => {
                const isLast = i === arr.length - 1;
                const prefix = isLast ? this.SYMBOLS.leaf : this.SYMBOLS.branch;
                result += `${this.COLORS.yellow}${prefix} ${this.SYMBOLS.modified} ${mod.node}${this.COLORS.reset}\n`;
                
                // Show field changes
                mod.changes.forEach((change, j) => {
                    const fieldPrefix = isLast ? ' ' : this.SYMBOLS.vertical;
                    const beforeValue = this.truncateValue(change.before);
                    const afterValue = this.truncateValue(change.after);
                    //const afterValue = change.after
                    result += `${fieldPrefix}   ${this.COLORS.gray}${change.field}:${this.COLORS.reset} ${beforeValue} ${this.SYMBOLS.arrow} ${afterValue}\n`;
                });
            });
        }

        return result;
    }

    private truncateValue(value: any): string {
        const stringValue = typeof value === 'object' ? 
            JSON.stringify(value) : String(value);
        
        if (stringValue.length > 50) {
            return stringValue.substring(0, 47) + '...';
        }
        return stringValue;
    }

    private visualizeChanges(changes: any): string {
        let result = '';

        if (changes.added.length > 0) {
            result += `${this.COLORS.green}${this.SYMBOLS.branch} Added:${this.COLORS.reset}\n`;
            changes.added.forEach((path: string, i: number, arr: string[]) => {
                const isLast = i === arr.length - 1;
                const prefix = isLast ? this.SYMBOLS.leaf : this.SYMBOLS.branch;
                result += `${this.COLORS.green}${prefix} ${this.SYMBOLS.added} ${path}${this.COLORS.reset}\n`;
            });
        }

        if (changes.removed.length > 0) {
            result += `${this.COLORS.red}${this.SYMBOLS.branch} Removed:${this.COLORS.reset}\n`;
            changes.removed.forEach((path: string, i: number, arr: string[]) => {
                const isLast = i === arr.length - 1;
                const prefix = isLast ? this.SYMBOLS.leaf : this.SYMBOLS.branch;
                result += `${this.COLORS.red}${prefix} ${this.SYMBOLS.removed} ${path}${this.COLORS.reset}\n`;
            });
        }

        if (changes.modified.length > 0) {
            result += `${this.COLORS.yellow}${this.SYMBOLS.branch} Modified:${this.COLORS.reset}\n`;
            changes.modified.forEach((mod: any, i: number, arr: any[]) => {
                const isLast = i === arr.length - 1;
                const prefix = isLast ? this.SYMBOLS.leaf : this.SYMBOLS.branch;
                result += `${this.COLORS.yellow}${prefix} ${this.SYMBOLS.modified} ${mod.node}${this.COLORS.reset}\n`;

                // Show field changes
                mod.changes.forEach((change: any) => {
                    result += this.formatFieldChange(
                        change.field,
                        change.before,
                        change.after,
                        `${isLast ? ' ' : this.SYMBOLS.vertical}   `
                    ) + '\n';
                });

                // Show metadata for this node if available
                if (mod.metadata) {
                    result += this.formatImportantFields(
                        mod.metadata,
                        `${isLast ? ' ' : this.SYMBOLS.vertical}   `
                    );
                }
            });
        }

        return result;
    }

    visualizeChangeSummary(snapshots: TreeSnapshot[]): string {
        let result = this.formatHeader('Transaction Evolution Summary');

        snapshots.forEach((snapshot, index) => {
            result += this.formatPhase(snapshot.operation, snapshot.timestamp);

            if (index === 0) {
                result += `${this.COLORS.gray}${this.SYMBOLS.bullet} Created transaction tree with ${snapshot.tree.children.length} main branches${this.COLORS.reset}\n`;
                snapshot.tree.children.forEach((child: any) => {
                    result += this.formatImportantFields(child.metadata, this.INDENT);
                });
            } 
            if (Object.values(snapshot.changes).some((arr: any) => arr.length > 0)) {
                result += this.visualizeChanges(snapshot.changes);
            } else {
                result += `${this.COLORS.gray}${this.SYMBOLS.bullet} No changes${this.COLORS.reset}\n`;
            }
            
            result += '\n';
        });

        return result;
    }
}

export const asciiVisualiser = () => {
    return new ASCIITreeVisualizer()
}

