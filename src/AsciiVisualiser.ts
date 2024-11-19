import { ChangeLog, TreeSnapshot } from "./Interface";


export class ASCIITreeVisualizer {
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
        
        if (Array.isArray(value)) {
            return `[${value.map(v => this.formatValue(v)).join(', ')}]`;
        }

        if (typeof value === 'object') {
            if (value._value !== undefined) {
                return value._value.toString();
            }

            // Handle special cases
            if (value.hash) {
                return `{hash: "${value.hash.substring(0, 8)}..."}`;
            }

            const str = JSON.stringify(value);
            if (str.length > 50) {
                return `${str.substring(0, 47)}...`;
            }
            return str;
        }

        const str = value.toString();
        if (str.length > 50) {
            if (str.startsWith('B62')) {
                return `${str.substring(0, 8)}...`;
            }
            return `${str.substring(0, 47)}...`;
        }
        return str;
    }

    private stringifyWithBigInt = (obj: any): string => {
        return JSON.stringify(
          obj,
          (key, value) => (typeof value === 'bigint' ? value.toString() : value),
        )
    };

    private visualizeChanges(changes: ChangeLog): string {
        let result = '';

        if (changes.added.length > 0) {
            result += `${this.COLORS.green}${this.SYMBOLS.branch} Added:${this.COLORS.reset}\n`;

            changes.added.forEach((item, i) => {
                const isLast = i === changes.added.length - 1;
                const prefix = isLast ? this.SYMBOLS.leaf : this.SYMBOLS.branch;
                result += `${this.COLORS.green}${prefix} ${this.SYMBOLS.added} ${item.path}${this.COLORS.reset}\n`;

                const addPrefix = isLast ? this.SYMBOLS.leaf : this.SYMBOLS.branch;
                result += `${this.COLORS.green}    ${addPrefix} ${this.stringifyWithBigInt(item.node)} ${this.COLORS.reset}\n` 
            });
        }

        if (changes.updated.length > 0) {
            if (changes.added.length > 0) result += '\n';
            result += `${this.COLORS.yellow}${this.SYMBOLS.branch} Modified:${this.COLORS.reset}\n`;
            
            changes.updated.forEach((mod, i) => {
                const isLast = i === changes.updated.length - 1;
                const prefix = isLast ? this.SYMBOLS.leaf : this.SYMBOLS.branch;
                result += `${this.COLORS.yellow}${prefix} ${this.SYMBOLS.modified} ${mod.path}${this.COLORS.reset}\n`;
                
                mod.changes.forEach((change, j) => {
                    const changePrefix = j === mod.changes.length - 1 ? this.SYMBOLS.leaf : this.SYMBOLS.branch;
                    result += `${this.COLORS.gray}    ${changePrefix} ${change.field}: ${this.COLORS.reset}` +
                             `${this.formatValue(change.oldValue)} ${this.SYMBOLS.arrow} ${this.formatValue(change.newValue)}\n`;
                });
            });
        }

        if (changes.removed.length > 0) {
            if (changes.added.length > 0 || changes.updated.length > 0) result += '\n';
            result += `${this.COLORS.red}${this.SYMBOLS.branch} Removed:${this.COLORS.reset}\n`;

            changes.removed.forEach((item, i) => {
                const isLast = i === changes.removed.length - 1;
                const prefix = isLast ? this.SYMBOLS.leaf : this.SYMBOLS.branch;
                result += `${this.COLORS.red}${prefix} ${this.SYMBOLS.removed} ${item.path}${this.COLORS.reset}\n`;

                const removePrefix = i === changes.removed.length - 1 ? this.SYMBOLS.leaf : this.SYMBOLS.branch;
                result += `${this.COLORS.red}    ${removePrefix} ${this.stringifyWithBigInt(item.node)} ${this.COLORS.reset}\n` 
                //result += `${this.COLORS.red}${prefix} ${this.SYMBOLS.removed} ${item}${this.COLORS.reset}\n`;
            });
        }

        return result;
    }

    public visualizeChangeSummary(snapshots: TreeSnapshot[]): string {
        let result = this.formatHeader('Transaction Evolution Summary');

        snapshots.forEach((snapshot, index) => {
            result += this.formatPhase(snapshot.operation, snapshot.timestamp);

            if (index === 0) {
                const accountUpdates = Array.isArray(snapshot.tree) ? snapshot.tree.length : 0;
                result += `${this.COLORS.gray}${this.SYMBOLS.bullet} Created transaction with ${accountUpdates} account updates${this.COLORS.reset}\n`;
            } else {
                const hasChanges = Object.values(snapshot.changes).some(arr => arr.length > 0);
                if (hasChanges) {
                    result += this.visualizeChanges(snapshot.changes);
                } else {
                    result += `${this.COLORS.gray}${this.SYMBOLS.bullet} No changes${this.COLORS.reset}\n`;
                }
            }
            
            result += '\n';
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
}