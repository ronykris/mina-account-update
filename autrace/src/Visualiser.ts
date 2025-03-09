import { promises as fs } from 'fs';
import child_process from 'child_process';
import util from 'util';
import { EntityInfo, FlowOperation, TransactionState } from './Interface.js';
import * as d3 from 'd3';
import { JSDOM } from 'jsdom';

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
            //await this.openInBrowser(outputPath);
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

    private generateBlockchainSection = (txState: TransactionState): string => {
        if (!txState.blockchainData) {
            return '';
        }

        const data = txState.blockchainData;
        let md = '## Blockchain Transaction Details\n\n';
        
        md += `- **Transaction Hash**: \`${data.txHash || 'Unknown'}\`\n`;
        md += `- **Block Height**: ${data.blockHeight || 'Unknown'}\n`;
        md += `- **Status**: ${data.status || 'Unknown'}\n`;
        
        if (data.timestamp) {
            const date = new Date(data.timestamp);
            md += `- **Timestamp**: ${date.toISOString()}\n`;
        }
        
        if (data.memo) {
            md += `- **Memo**: ${data.memo}\n`;
        }
        
        // Add failure information if applicable
        if (data.status === 'failed' && data.failures && data.failures.length > 0) {
            md += '\n### Failures\n\n';
            data.failures.forEach(failure => {
                md += `- **Account Update ${failure.index}**: ${failure.failureReason}\n`;
            });
        }        
        return md;
    }

    public generateBlockchainMarkdown(txState: TransactionState): string {
        let markdown = '# Blockchain Transaction Analysis\n\n';
        
        // Add blockchain-specific section
        markdown += this.generateBlockchainSection(txState);
        
        // Add standard sections
        markdown += this.generateEntityRegistry();
        markdown += this.generateTransactionFlow();
        markdown += this.generateMetadata();
        
        return markdown;
    }

    
    private buildEdgesIfMissing(txState: TransactionState): TransactionState {
        // If edges already exist, don't do anything
        if (txState.edges && txState.edges.length > 0) {
            return txState;
        }
        
        const edges: any[] = [];
        const nodeIds = Array.from(txState.nodes.keys());
        
        // Fee payer relationship - connect fee payer to other accounts
        const feePayer = this.findFeePayer(txState);
        if (feePayer) {
            // Connect fee payer to all other nodes (except itself)
            nodeIds.forEach(nodeId => {
                if (nodeId !== feePayer) {
                    edges.push({
                        fromNode: feePayer,
                        toNode: nodeId,
                        operation: 'Fee Payment/Initiation',
                        failed: txState.blockchainData?.status === 'failed'
                    });
                }
            });
        }
        
        // Sequential relationships - create a chain of operations in sequence
        for (let i = 0; i < nodeIds.length - 1; i++) {
            // Skip if this would create a duplicate edge
            if (!edges.some(e => e.fromNode === nodeIds[i] && e.toNode === nodeIds[i+1])) {
                edges.push({
                    fromNode: nodeIds[i],
                    toNode: nodeIds[i+1],
                    operation: 'Sequence',
                    failed: txState.blockchainData?.status === 'failed'
                });
            }
        }
        
        // Token relationships - connect operations on the same token
        const tokenGroups = this.groupNodesByToken(txState);
        tokenGroups.forEach((nodeIds, tokenId) => {
            if (nodeIds.length > 1 && tokenId !== 'wSHV2S4qX9jFsLjQo8r1BsMLH2ZRKsZx6EJd1sbozGPieEC4Jf') {
                for (let i = 0; i < nodeIds.length - 1; i++) {
                    edges.push({
                        fromNode: nodeIds[i],
                        toNode: nodeIds[i+1],
                        operation: 'Token Operation',
                        failed: txState.blockchainData?.status === 'failed'
                    });
                }
            }
        });
        
        // Return updated state with edges
        return {
            ...txState,
            edges: edges
        };
    }


    private findFeePayer(txState: TransactionState): string | undefined {
        // Try to find fee payer from blockchain data
        if (txState.blockchainData?.feePayerAddress) {
            // Look for node with matching address
            for (const [id, node] of txState.nodes.entries()) {
                if (node.publicKey === txState.blockchainData.feePayerAddress) {
                    return id;
                }
            }
        }
        
        // Alternatively, look for node with negative balance change
        for (const [id, node] of txState.nodes.entries()) {
            if (node.balanceChange && node.balanceChange < 0) {
                return id;
            }
        }
        
        return undefined;
    }


    private groupNodesByToken(txState: TransactionState): Map<string, string[]> {
        const tokenGroups = new Map<string, string[]>();
        
        txState.nodes.forEach((node, id) => {
            const tokenId = node.tokenId || 'default';
            if (!tokenGroups.has(tokenId)) {
                tokenGroups.set(tokenId, []);
            }
            tokenGroups.get(tokenId)!.push(id);
        });
        
        return tokenGroups;
    }

    public async generateBlockchainFlowSVG(txState: TransactionState, outputPath: string = 'blockchain_flow.svg'): Promise<string> {
        try {

            txState = this.buildEdgesIfMissing(txState);
            
            // Create a virtual DOM for server-side rendering
            const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
            const document = dom.window.document;
            global.document = document;
            
            // Create SVG container
            const width = 1200;
            const height = 800;
            const svg = d3.select(document.body)
                .append('svg')
                .attr('xmlns', 'http://www.w3.org/2000/svg')
                .attr('width', width)
                .attr('height', height)
                .attr('viewBox', `0 0 ${width} ${height}`);
            
            // Add title
            svg.append('text')
                .attr('x', width / 2)
                .attr('y', 30)
                .attr('text-anchor', 'middle')
                .attr('font-family', 'Arial')
                .attr('font-size', '20px')
                .attr('font-weight', 'bold')
                .text(`Transaction Flow: ${txState.blockchainData?.txHash?.substring(0, 16) || 'Unknown'}...`);
            
            // Add status
            svg.append('text')
                .attr('x', width / 2)
                .attr('y', 60)
                .attr('text-anchor', 'middle')
                .attr('font-family', 'Arial')
                .attr('font-size', '16px')
                .text(`Status: ${txState.blockchainData?.status || 'Unknown'}`);
            
            // Create arrow markers for different relationship types
            const defs = svg.append('defs');
            const markers = [
                { id: 'arrow-black', color: 'black' },
                { id: 'arrow-red', color: 'red' },
                { id: 'arrow-green', color: 'green' },
                { id: 'arrow-blue', color: 'blue' },
                { id: 'arrow-purple', color: 'purple' }
            ];
            
            markers.forEach(marker => {
                defs.append('marker')
                    .attr('id', marker.id)
                    .attr('viewBox', '0 0 10 10')
                    .attr('refX', 25)
                    .attr('refY', 5)
                    .attr('markerWidth', 6)
                    .attr('markerHeight', 6)
                    .attr('orient', 'auto')
                    .append('path')
                    .attr('d', 'M 0 0 L 10 5 L 0 10 z')
                    .attr('fill', marker.color);
            });
            
            // Extract and convert nodes from txState
            const nodesArray: any[] = [];
            const nodeMap = new Map();
            
            // Debug information
            console.log(`Processing transaction state with ${txState.nodes.size} nodes and ${txState.edges.length} edges`);
            
            // Process nodes
            txState.nodes.forEach((node, id) => {
                const nodeData = {
                    id,
                    label: node.label || 'Unknown',
                    publicKey: node.publicKey,
                    shortAddress: node.publicKey.substring(0, 10) + '...',
                    type: node.type,
                    failed: !!node.failed,
                    failureReason: node.failureReason,
                    tokenId: node.tokenId,
                    // These will be filled in by the simulation
                    x: undefined,
                    y: undefined
                };
                
                nodesArray.push(nodeData);
                nodeMap.set(id, nodeData);
            });
            
            // Extract edges
            const linksArray: any[] = [];
            
            txState.edges.forEach((edge, i) => {
                // Validate source and target nodes exist
                if (nodeMap.has(edge.fromNode) && nodeMap.has(edge.toNode)) {
                    linksArray.push({
                        id: `edge${i}`,
                        source: nodeMap.get(edge.fromNode),
                        target: nodeMap.get(edge.toNode),
                        operation: edge.operation,
                        failed: !!edge.failed
                    });
                } else {
                    console.warn(`Edge references non-existent node: ${edge.fromNode} -> ${edge.toNode}`);
                }
            });
            
            console.log(`Processed ${nodesArray.length} nodes and ${linksArray.length} links for visualization`);
            
            // Set initial positions manually (in a grid layout) instead of using force simulation
            const gridCols = Math.ceil(Math.sqrt(nodesArray.length));
            const cellWidth = width / (gridCols + 1);
            const cellHeight = height / (Math.ceil(nodesArray.length / gridCols) + 1);
            
            nodesArray.forEach((node, i) => {
                const row = Math.floor(i / gridCols);
                const col = i % gridCols;
                node.x = (col + 1) * cellWidth;
                node.y = (row + 1) * cellHeight;
            });
            
            // Draw links
            const link = svg.append('g')
                .selectAll('line')
                .data(linksArray)
                .enter().append('line')
                .attr('x1', d => d.source.x)
                .attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x)
                .attr('y2', d => d.target.y)
                .attr('stroke', d => d.failed ? 'red' : 'black')
                .attr('stroke-width', 2)
                .attr('stroke-dasharray', d => d.failed ? '5,5' : null)
                .attr('marker-end', d => `url(#arrow-${d.failed ? 'red' : 'black'})`);
            
            // Add link labels
            const linkText = svg.append('g')
                .selectAll('text')
                .data(linksArray)
                .enter().append('text')
                .attr('x', d => (d.source.x + d.target.x) / 2)
                .attr('y', d => (d.source.y + d.target.y) / 2 - 10)
                .attr('text-anchor', 'middle')
                .attr('font-family', 'Arial')
                .attr('font-size', '12px')
                .attr('fill', d => d.failed ? 'red' : 'black')
                .text(d => {
                    if (!d.operation) return '';
                    const opStr = typeof d.operation === 'string' ? d.operation : JSON.stringify(d.operation);
                    return opStr.length > 30 ? opStr.substring(0, 27) + '...' : opStr;
                });
            
            // Draw nodes
            const node = svg.append('g')
                .selectAll('g')
                .data(nodesArray)
                .enter().append('g')
                .attr('transform', d => `translate(${d.x},${d.y})`);
            
            // Add circles for nodes
            node.append('circle')
                .attr('r', 20)
                .attr('fill', d => {
                    if (d.failed) return '#FFCCCC';
                    if (d.type === 'contract') return '#DDA0DD';
                    if (d.tokenId && d.tokenId !== 'wSHV2S4qX9jFsLjQo8r1BsMLH2ZRKsZx6EJd1sbozGPieEC4Jf') return '#CCFFCC';
                    return '#B3E0FF';
                })
                .attr('stroke', d => d.failed ? 'red' : '#333')
                .attr('stroke-width', 2);
            
            // Add labels to nodes
            node.append('text')
                .attr('dy', 5)
                .attr('text-anchor', 'middle')
                .attr('font-family', 'Arial')
                .attr('font-size', '12px')
                .text(d => d.shortAddress);
            
            // Add subtitle text for nodes
            node.append('text')
                .attr('dy', 25)
                .attr('text-anchor', 'middle')
                .attr('font-family', 'Arial')
                .attr('font-size', '10px')
                .attr('fill', d => d.failed ? 'red' : 'black')
                .text(d => {
                    if (d.failed) return d.failureReason ? d.failureReason.substring(0, 15) : 'Failed';
                    if (d.tokenId && d.tokenId !== 'wSHV2S4qX9jFsLjQo8r1BsMLH2ZRKsZx6EJd1sbozGPieEC4Jf') return 'Custom Token';
                    return d.type === 'contract' ? 'Contract' : 'Account';
                });
            
            // Add legend
            const legend = svg.append('g')
                .attr('transform', 'translate(50, 100)');
            
            const legendItems = [
                { color: '#B3E0FF', label: 'Account' },
                { color: '#DDA0DD', label: 'Contract' },
                { color: '#CCFFCC', label: 'Token Operation' },
                { color: '#FFCCCC', label: 'Failed Operation' }
            ];
            
            legendItems.forEach((item, i) => {
                const g = legend.append('g')
                    .attr('transform', `translate(0, ${i * 25})`);
                
                g.append('rect')
                    .attr('width', 20)
                    .attr('height', 20)
                    .attr('fill', item.color)
                    .attr('stroke', '#333')
                    .attr('stroke-width', 1);
                
                g.append('text')
                    .attr('x', 30)
                    .attr('y', 15)
                    .attr('font-family', 'Arial')
                    .attr('font-size', '14px')
                    .text(item.label);
            });
            
            // Save SVG to file
            const svgString = document.body.innerHTML;
            await fs.writeFile(outputPath, svgString);
            
            console.log(`Successfully generated blockchain flow SVG at: ${outputPath}`);
            return outputPath;
        } catch (error) {
            console.error('Error generating blockchain flow SVG:', error);
            throw error;
        }
    }

    public async generateBlockchainVisualization(
        txState: TransactionState,
        outputFormat: 'svg' | 'png' | 'md' = 'svg',
        outputPath?: string
    ): Promise<string> {
        // Default output paths based on format
        const defaultPaths = {
            'svg': 'blockchain_flow.svg',
            'png': 'blockchain_flow.png',
            'md': 'blockchain_analysis.md'
        };
        
        const finalOutputPath = outputPath || defaultPaths[outputFormat];
        
        switch (outputFormat) {
            case 'svg':
                return this.generateBlockchainFlowSVG(txState, finalOutputPath);
            
            case 'png':
                // For PNG, first generate SVG then convert to PNG
                const svgPath = await this.generateBlockchainFlowSVG(txState, 'temp_blockchain_flow.svg');
                try {
                    // Convert SVG to PNG using external tool
                    const command = `convert -density 300 ${svgPath} ${finalOutputPath}`;
                    await exec(command);
                    
                    // Clean up temporary SVG
                    await fs.unlink(svgPath);
                    
                    console.log(`Successfully generated blockchain flow PNG at: ${finalOutputPath}`);
                    return finalOutputPath;
                } catch (error) {
                    console.error('Error converting SVG to PNG:', error);
                    throw error;
                }
            
            case 'md':
                // Generate markdown analysis
                const markdown = this.generateBlockchainMarkdown(txState);
                await fs.writeFile(finalOutputPath, markdown);
                console.log(`Successfully generated blockchain analysis markdown at: ${finalOutputPath}`);
                return finalOutputPath;
        }
    }

    public async generateTransactionVisualization(
        txState: TransactionState,
        outputPath: string = 'transaction_visualization.svg'
    ): Promise<void> {
        // Detect if this is a blockchain transaction
        const isBlockchainTx = !!txState.blockchainData;
        
        if (isBlockchainTx) {
            // Use blockchain-specific visualization
            this.generateBlockchainFlowSVG(txState, outputPath);
        } else {
            // Use standard visualization
            this.generateSVG(outputPath);
        }
    }

}