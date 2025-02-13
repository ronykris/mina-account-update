import { promises as fs } from 'fs';
import child_process from 'child_process';
import util from 'util';
import { EntityInfo, FlowOperation } from './Interface.js';
const exec = util.promisify(child_process.exec);

export class AUVisualizer {
    private stateHistory: any[];
    private entities: Map<string, EntityInfo>;
    
    constructor(stateHistory: any[]) {
        this.stateHistory = stateHistory;
        this.entities = new Map();
        this.processEntities();
    }

    private getUniqueNodeId = (id: string, stateIndex: number): string => {
        return `N${id.replace(/[^0-9]/g, '')}${stateIndex}`;
    }
    /*private getUniqueNodeId(id: string): string {
        return `N${id.replace(/[^0-9]/g, '')}`;
    }*/
    private formatLabel = (relationship: any): string => {
        return relationship?.label?.replace(/[()]/g, '') || 'Unknown';
    }

    private getNodeStyle(node: any): string {
        switch (node.type) {
            case 'account':
                return 'fill:#B3E0FF,stroke:#333,stroke-width:2px';
            case 'contract':
                return 'fill:#DDA0DD,stroke:#333,stroke-width:2px';
            default:
                return 'fill:#90EE90,stroke:#333,stroke-width:2px';
        }
    }

    private formatEdgeLabel(operation: string): string {
        try {
            const parts = operation.split(',').map(p => p.trim());
            let sequence = '', type = '', amount = '', fee = '';
            
            parts.forEach(part => {
                if (part.toLowerCase().includes('sequence')) {
                    sequence = part.split(':')[1]?.trim() || '';
                }
                if (part.toLowerCase().includes('type')) {
                    type = part.split(':')[1]?.trim() || '';
                }
                if (part.toLowerCase().includes('amount')) {
                    amount = part.split(':')[1]?.trim() || '';
                }
                if (part.toLowerCase().includes('fee')) {
                    fee = part.split(':')[1]?.trim() || '';
                }
            });

            let label = `${sequence})${type}`;
            if (amount) label += ` ${amount}`;
            if (fee) label += ` fee: ${fee}`;
            return label;
        } catch (error) {
            return operation;
        }
    }

    private extractOperationDetails = (operation: string): { sequence: string, type: string } => {
        try {
            const parts = operation.split(',').map(p => p.trim());
            let sequence = '', type = '';
            parts.forEach(part => {
                if (part.toLowerCase().includes('sequence')) {
                    sequence = part.split(':')[1]?.trim() || '';
                }
                if (part.toLowerCase().includes('type')) {
                    type = part.split(':')[1]?.trim() || '';
                }
            });
            return { sequence, type };
        } catch (error) {
            return { sequence: '', type: operation };
        }
    }

    private hasConnections = (nodeId: string, state: any): boolean => {
        // Check if node is source or target of any edge
        return state.edges?.some((edge: any) => 
            edge.fromNode === nodeId || edge.toNode === nodeId
        ) || false;
    }

    private generateStateSubgraph = (state: any, stateIndex: number, isFirstState: boolean): string => {
        let subgraph = `    subgraph State${stateIndex}\n`;
        const nodeIds = new Map();
        
        // Add nodes that have connections or are in first state
        state.nodes.forEach((node: any, id: string) => {
            if (isFirstState || this.hasConnections(id, state)) {
                const nodeId = this.getUniqueNodeId(id, stateIndex);
                nodeIds.set(id, nodeId);
                const relationship = state.relationships.get(id);
                const label = this.formatLabel(relationship);
                const color = (node.type === 'account') ? '#lightblue' : '#purple';
                
                subgraph += `        ${nodeId}["${label}"]\n`;
                subgraph += `        style ${nodeId} fill:${color},width:300px,height:50px\n`;
            }
        });

        // Add edges
        if (Array.isArray(state.edges)) {
            state.edges.forEach((edge: any) => {
                if (edge.fromNode && edge.toNode) {
                    const fromId = nodeIds.get(edge.fromNode);
                    const toId = nodeIds.get(edge.toNode);
                    if (fromId && toId) {
                        const { sequence, type } = this.extractOperationDetails(edge.operation);
                        const label = sequence && type ? `${sequence}] ${type}` : '';
                        subgraph += `        ${fromId} -->|"${label}"| ${toId}\n`;
                    }
                }
            });
        }

        subgraph += '    end\n\n';
        return subgraph;
    }

    private processEntities(): void {
        this.stateHistory.forEach(state => {
            if (state.nodes) {
                state.nodes.forEach((node: any) => {
                    if (!this.entities.has(node.publicKey)) {
                        this.entities.set(node.publicKey, {
                            id: node.id,
                            type: node.type,
                            name: this.extractEntityName(node.label),
                            operations: new Set(),
                            publicKey: node.publicKey,
                            contractType: node.contractType,
                            labels: new Set([node.label])
                        });
                    }
                    const entity = this.entities.get(node.publicKey)!;
                    entity.operations.add(this.extractOperation(node.label));
                    entity.labels.add(node.label);
                });
            }
        });
    }

    private extractEntityName(label: string): string {
        return label.split('.')[0]!;
    }

    private extractOperation(label: string): string {
        return label.split('.')[1]?.replace(/[()]/g, '') || 'unknown';
    }

    private generateEntityRegistry(): string {
        let md = '## Entity Registry\n\n';
        
        const groupedEntities = new Map<string, EntityInfo[]>();
        this.entities.forEach(entity => {
            if (!groupedEntities.has(entity.type)) {
                groupedEntities.set(entity.type, []);
            }
            groupedEntities.get(entity.type)!.push(entity);
        });

        groupedEntities.forEach((entities, type) => {
            md += `### ${type.charAt(0).toUpperCase() + type.slice(1)}s\n`;
            entities.forEach(entity => {
                md += `- **${entity.name}**\n`;
                md += `  - Public Key: \`${entity.publicKey}\`\n`;
                if (entity.contractType) {
                    md += `  - Contract Type: ${entity.contractType}\n`;
                }
                if (entity.operations.size > 0) {
                    md += `  - Operations: ${Array.from(entity.operations).join(', ')}\n`;
                }
                md += '\n';
            });
        });

        return md;
    }

    private processStateOperations(state: any): FlowOperation[] {
        const operations: FlowOperation[] = [];
        
        if (state.edges) {
            state.edges.forEach((edge: any) => {
                const fromNode = state.nodes.get(edge.fromNode);
                const toNode = state.nodes.get(edge.toNode);
                
                if (fromNode && toNode) {
                    const operation = this.extractOperationDetails(edge.operation);
                    operations.push({
                        from: this.extractEntityName(fromNode.label),
                        to: this.extractEntityName(toNode.label),
                        action: operation.type,
                        fee: state.metadata?.totalFees,
                        status: edge.operation.includes('REJECTED') ? 'REJECTED' : 'success'
                    });
                }
            });
        }

        return operations;
    }

    private generateASCIIFlow(operations: FlowOperation[]): string {
        let flow = '';
        
        operations.forEach((op, index) => {
            // Determine the arrow type based on status
            const arrow = op.status === 'REJECTED' ? '╳' : '→';
            
            flow += `${op.from} ${arrow} ${op.to}\n`;
            
            if (op.action) {
                flow += `│  └─ Action: ${op.action}\n`;
            }
            
            if (op.fee && op.fee !== '0') {
                flow += `│  └─ Fee: ${op.fee}\n`;
            }
            
            if (op.status === 'REJECTED') {
                flow += `│  └─ Status: ${op.status}\n`;
            }
            
            if (op.parameters) {
                flow += `│  └─ Parameters:\n`;
                Object.entries(op.parameters).forEach(([key, value]) => {
                    flow += `│     - ${key}: ${value}\n`;
                });
            }
            
            // Add separator between operations
            if (index < operations.length - 1) {
                flow += '│\n';
            }
        });
        
        return flow;
    }

    private generateTransactionFlow(): string {
        let md = '## Transaction Flow\n\n';
        
        this.stateHistory.forEach((state, index) => {
            const operations = this.processStateOperations(state);
            if (operations.length > 0) {
                md += `### State ${index}\n`;
                md += this.generateASCIIFlow(operations);
                md += '\n\n';
            }
        });

        return md;
    }

    

    private generateMetadata(): string {
        let md = '## Transaction Metadata\n\n';

        this.stateHistory.forEach((state, index) => {
            md += `### State ${index}\n`;
            if (state.metadata) {
                Object.entries(state.metadata).forEach(([key, value]) => {
                    md += `- ${key}: ${value}\n`;
                });
            }
            md += '\n';
        });

        return md;
    }

    public generateMermaidCode = (): string => {
        let mermaidCode = `%%{init: {
            'theme': 'base',
            'themeVariables': {
                'fontSize': '15px',
                'fontFamily': '"Helvetica Neue", Arial, sans-serif',
                'nodeSpacing': 200,
                'rankSpacing': 150,
                'labelBackground': '#ffffff',
                'fontWeight': 600,
                'wrap': true,
                'useMaxWidth': false
            },
            'securityLevel': 'loose',
            'flowchart': {
                'htmlLabels': true,
                'curve': 'basis',
                'padding': 30,
                'useMaxWidth': false,
                'diagramPadding': 50
            }
        }}%%\n`;
        mermaidCode += 'flowchart TB\n';
        mermaidCode += '    %% Global styles\n';
        mermaidCode += '    classDef accountNode fill:#lightblue,stroke:#333,stroke-width:2px\n';
        mermaidCode += '    classDef contractNode fill:#purple,stroke:#333,stroke-width:2px\n\n';

        // Generate state subgraphs
        this.stateHistory.forEach((state, index) => {
            if (state.nodes && state.nodes.size > 0) {
                mermaidCode += this.generateStateSubgraph(state, index, index === 0);
            }
        });
    
        return mermaidCode;
    }

    /*public generateMermaidCode(): string {
        let mermaidCode = `%%{init: {
            'theme': 'base',
            'themeVariables': {
                'fontSize': '14px',
                'fontFamily': 'arial',
                'nodeSpacing': 150,
                'rankSpacing': 100
            }
        }}%%\n`;
        mermaidCode += 'flowchart LR\n';

        const processedNodes = new Set();
        const edges: string[] = [];

        // Process all states
        this.stateHistory.forEach(state => {
            // Add nodes
            state.nodes.forEach((node: any, id: string) => {
                if (!processedNodes.has(id)) {
                    const nodeId = this.getUniqueNodeId(id);
                    const relationship = state.relationships.get(id);
                    const label = this.formatLabel(relationship);
                    const style = this.getNodeStyle(node);
                    
                    mermaidCode += `    ${nodeId}["${label}\\n${node.publicKey?.substring(0, 10)}..."]\n`;
                    mermaidCode += `    style ${nodeId} ${style}\n`;
                    processedNodes.add(id);
                }
            });

            // Collect edges
            if (Array.isArray(state.edges)) {
                state.edges.forEach((edge: any) => {
                    const fromId = this.getUniqueNodeId(edge.fromNode);
                    const toId = this.getUniqueNodeId(edge.toNode);
                    const label = this.formatEdgeLabel(edge.operation);
                    edges.push(`    ${fromId} -->|"${label}"| ${toId}\n`);
                });
            }
        });

        // Add all edges after nodes
        edges.forEach(edge => {
            mermaidCode += edge;
        });

        return mermaidCode;
    }*/


    public generateMarkdown(): string {
        let markdown = '# Account Update State History\n\n';
        markdown += this.generateEntityRegistry();
        markdown += this.generateTransactionFlow();
        markdown += this.generateMetadata();
        return markdown;
    }

    public async openInBrowser(filePath: string): Promise<void> {
        // Convert to absolute path for browser
        const absolutePath = require('path').resolve(filePath);
        const fileUrl = `file://${absolutePath}`;

        try {
            // Different commands for different operating systems
            let command: string;
            switch (process.platform) {
                case 'darwin':  // macOS
                    command = `open -a "Google Chrome" "${fileUrl}"`;
                    break;
                case 'win32':   // Windows
                    command = `start chrome "${fileUrl}"`;
                    break;
                default:        // Linux and others
                    command = `google-chrome "${fileUrl}"`;
                    break;
            }
            
            await exec(command);
        } catch (firstError) {
            try {
                // Fallback to default browser if Chrome isn't available
                let fallbackCommand: string;
                switch (process.platform) {
                    case 'darwin':  // macOS
                        fallbackCommand = `open "${fileUrl}"`;
                        break;
                    case 'win32':   // Windows
                        fallbackCommand = `start "" "${fileUrl}"`;
                        break;
                    default:        // Linux and others
                        fallbackCommand = `xdg-open "${fileUrl}"`;
                        break;
                }
                await exec(fallbackCommand);
            } catch (error) {
                console.error('Error opening SVG in browser:', error);
                throw error;
            }
        }
    }

    public async generateSVG(outputPath: string = 'transaction_flow.svg'): Promise<void> {
        try {
            const mermaidCode = this.generateMermaidCode();
    
            const tempFile = 'temp_diagram.mmd';
            await fs.writeFile(tempFile, mermaidCode);
    
            const config = {
                width: 3840,
                height: 2160,
                backgroundColor: '#ffffff',
                scale: 1.0,  // Scale can be 1.0 for SVG since it's vector-based
                puppeteerConfig: {
                    deviceScaleFactor: 1.0
                }
            };
    
            // Generate SVG
            const command = `mmdc -i ${tempFile} -o ${outputPath} ` +
                `-w ${config.width} ` +
                `-H ${config.height} ` +
                `-b ${config.backgroundColor}`;
            
            await exec(command);
    
            // Clean up temporary file
            await fs.unlink(tempFile);
    
            console.log(`Successfully generated SVG at: ${outputPath}`);
            await this.openInBrowser(outputPath);
        } catch (error) {
            console.error('Error generating SVG:', error);
            throw error;
        }
    }

    public async generatePNG(outputPath: string = 'transaction_flow.png'): Promise<void> {

        try {
            const mermaidCode = this.generateMermaidCode();

            const tempFile = 'temp_diagram.mmd';
            await fs.writeFile(tempFile, mermaidCode);

            const config = {
                width: 3840,          // 4K width
                height: 2160,         // 4K height
                backgroundColor: '#ffffff',
                scale: 8.0,           // Increased scale for better text quality
                puppeteerConfig: {
                    deviceScaleFactor: 4.0,
                    defaultViewport: {
                        width: 3840,
                        height: 2160,
                        deviceScaleFactor: 4.0
                    }
                }
            };

            const command = `mmdc -i ${tempFile} -o ${outputPath} ` +
            `-w ${config.width} ` +
            `-H ${config.height} ` +
            `-b ${config.backgroundColor} ` +
            `-s ${config.scale} ` +
            `--puppeteerConfig '{"deviceScaleFactor": ${config.puppeteerConfig.deviceScaleFactor}, ` +
            `"defaultViewport": {"width": ${config.width}, "height": ${config.height}, ` +
            `"deviceScaleFactor": ${config.puppeteerConfig.deviceScaleFactor}}}'`;

            await exec(command);

            await fs.unlink(tempFile);

            console.log(`Successfully generated PNG at: ${outputPath}`);
        } catch (error) {
            console.error('Error generating PNG:', error);
            throw error;
        }
    }

    public async generateMarkdownFile(outputPath: string = 'state_history.md'): Promise<void> {
        try {
            const markdown = this.generateMarkdown();
            await fs.writeFile(outputPath, markdown);
            console.log(`Successfully generated Markdown at: ${outputPath}`);
        } catch (error) {
            console.error('Error generating Markdown:', error);
            throw error;
        }
    }
}