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

    visualizeChangeSummary(snapshots: TreeSnapshot[]): string {
        let result = this.formatHeader('Transaction Evolution Summary');

        snapshots.forEach((snapshot, index) => {
            // Add phase header
            result += this.formatPhase(snapshot.operation, snapshot.timestamp);

            if (index === 0) {
                // For initial state, show branch count
                result += `${this.COLORS.gray}${this.SYMBOLS.bullet} Created transaction tree with ${snapshot.tree.children.length} main branches${this.COLORS.reset}\n`;
            } else {
                // For subsequent states, show changes
                const changes = snapshot.changes;
                if (Object.values(changes).some(arr => arr.length > 0)) {
                    result += this.formatChanges(changes);
                } else {
                    result += `${this.COLORS.gray}${this.SYMBOLS.bullet} No changes${this.COLORS.reset}\n`;
                }
            }
            result += '\n';
        });

        return result;
    }
}

export const asciiVisualiser = () => {
    return new ASCIITreeVisualizer()
}

