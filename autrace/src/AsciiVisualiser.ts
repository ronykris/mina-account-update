import { ChangeLog, TreeSnapshot } from "./Interface.js";

export class ASCIITreeVisualizer {
    private readonly INDENT = '  ';
    private readonly TRUNCATE_LENGTH = 50;
    private readonly HASH_PREVIEW_LENGTH = 8;
    
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
    } as const;

    private readonly SYMBOLS = {
        added: '+',
        removed: '-',
        modified: '•',
        arrow: '→',
        bullet: '∙',
        branch: '├',
        leaf: '└',
        vertical: '│',
    } as const;

    private formatValue(value: any): string {
        if (value === null || value === undefined) {
            return 'null';
        }
        
        if (Array.isArray(value)) {
            try {
                return `[${value.map(v => this.formatValue(v)).join(', ')}]`;
            } catch (error) {
                return '[Error: Invalid Array]';
            }
        }

        if (typeof value === 'object') {
            try {
                if (value === null) {
                    return 'null';
                }

                if ('_value' in value) {
                    return String(value._value);
                }

                // Handle special cases
                if (value.hash) {
                    return `{hash: "${value.hash.substring(0, this.HASH_PREVIEW_LENGTH)}..."}`;
                }

                const str = this.stringifyWithBigInt(value);
                return this.truncateString(str);
            } catch (error) {
                return '[Error: Invalid Object]';
            }
        }

        try {
            const str = String(value);
            return this.truncateString(str);
        } catch (error) {
            return '[Error: Invalid Value]';
        }
    }

    private truncateString(str: string): string {
        if (str.length <= this.TRUNCATE_LENGTH) {
            return str;
        }

        if (str.startsWith('B62')) {
            return `${str.substring(0, this.HASH_PREVIEW_LENGTH)}...`;
        }

        return `${str.substring(0, this.TRUNCATE_LENGTH - 3)}...`;
    }

    private stringifyWithBigInt = (obj: any): string => {
        try {
            return JSON.stringify(
                obj,
                (key, value) => {
                    if (typeof value === 'bigint') {
                        return value.toString();
                    }
                    if (value instanceof Error) {
                        return value.message;
                    }
                    return value;
                }
            );
        } catch (error) {
            return '[Error: Unable to stringify]';
        }
    };

    private visualizeChanges(changes: ChangeLog): string {
        let result = '';

        const hasAdded = Array.isArray(changes.added) && changes.added.length > 0;
        const hasUpdated = Array.isArray(changes.updated) && changes.updated.length > 0;
        const hasRemoved = Array.isArray(changes.removed) && changes.removed.length > 0;

        if (hasAdded) {
            result += `${this.COLORS.green}${this.SYMBOLS.branch} Added:${this.COLORS.reset}\n`;

            changes.added.forEach((item, i) => {
                const isLast = i === changes.added.length - 1;
                const prefix = isLast ? this.SYMBOLS.leaf : this.SYMBOLS.branch;
                result += `${this.COLORS.green}${prefix} ${this.SYMBOLS.added} ${item.path}${this.COLORS.reset}\n`;

                if (item.node) {
                    const addPrefix = isLast ? this.SYMBOLS.leaf : this.SYMBOLS.branch;
                    result += `${this.COLORS.green}    ${addPrefix} ${this.stringifyWithBigInt(item.node)} ${this.COLORS.reset}\n`;
                }
            });
        }

        if (hasUpdated) {
            if (hasAdded) result += '\n';
            result += `${this.COLORS.yellow}${this.SYMBOLS.branch} Modified:${this.COLORS.reset}\n`;
            
            changes.updated.forEach((mod, i) => {
                const isLast = i === changes.updated.length - 1;
                const prefix = isLast ? this.SYMBOLS.leaf : this.SYMBOLS.branch;
                result += `${this.COLORS.yellow}${prefix} ${this.SYMBOLS.modified} ${mod.path}${this.COLORS.reset}\n`;
                
                if (Array.isArray(mod.changes)) {
                    mod.changes.forEach((change, j) => {
                        const changePrefix = j === mod.changes.length - 1 ? this.SYMBOLS.leaf : this.SYMBOLS.branch;
                        result += `${this.COLORS.gray}    ${changePrefix} ${change.field}: ${this.COLORS.reset}` +
                                 `${this.formatValue(change.oldValue)} ${this.SYMBOLS.arrow} ${this.formatValue(change.newValue)}\n`;
                    });
                }
            });
        }

        if (hasRemoved) {
            if (hasAdded || hasUpdated) result += '\n';
            result += `${this.COLORS.red}${this.SYMBOLS.branch} Removed:${this.COLORS.reset}\n`;

            changes.removed.forEach((item, i) => {
                const isLast = i === changes.removed.length - 1;
                const prefix = isLast ? this.SYMBOLS.leaf : this.SYMBOLS.branch;
                result += `${this.COLORS.red}${prefix} ${this.SYMBOLS.removed} ${item.path}${this.COLORS.reset}\n`;

                if (item.node) {
                    const removePrefix = isLast ? this.SYMBOLS.leaf : this.SYMBOLS.branch;
                    result += `${this.COLORS.red}    ${removePrefix} ${this.stringifyWithBigInt(item.node)} ${this.COLORS.reset}\n`;
                }
            });
        }

        return result;
    }

    public visualizeChangeSummary(snapshots: TreeSnapshot[]): string {
        if (!Array.isArray(snapshots) || snapshots.length === 0) {
            return this.formatHeader('No changes to visualize');
        }

        let result = this.formatHeader('Transaction Evolution Summary');

        snapshots.forEach((snapshot, index) => {
            if (!snapshot) return;

            const timestamp = snapshot.timestamp || Date.now();
            const operation = snapshot.operation || 'UNKNOWN';
            
            result += this.formatPhase(operation, timestamp);

            if (index === 0) {
                const accountUpdates = Array.isArray(snapshot.tree) ? snapshot.tree.length : 0;
                result += `${this.COLORS.gray}${this.SYMBOLS.bullet} Created transaction with ${accountUpdates} account updates${this.COLORS.reset}\n`;
            } else if (snapshot.changes) {
                const hasChanges = Object.values(snapshot.changes).some(arr => Array.isArray(arr) && arr.length > 0);
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
        try {
            const date = new Date(timestamp).toLocaleTimeString();
            return `${this.COLORS.bold}${this.COLORS.purple}▶ ${phase.toUpperCase()} ${this.COLORS.gray}(${date})${this.COLORS.reset}\n`;
        } catch (error) {
            return `${this.COLORS.bold}${this.COLORS.purple}▶ ${phase.toUpperCase()} ${this.COLORS.gray}(Invalid timestamp)${this.COLORS.reset}\n`;
        }
    }
}