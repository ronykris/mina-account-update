import { promises as fs } from 'fs';
import child_process from 'child_process';
import util from 'util';
import { EntityInfo, FlowOperation, TransactionState } from './Interface.js';
import * as d3 from 'd3';
import { JSDOM } from 'jsdom';
import sharp from 'sharp';

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
            console.log(`Edges already exist (${txState.edges.length}), skipping edge generation`);
            return txState;
        }
        
        const edges: any[] = [];
        const nodeIds = Array.from(txState.nodes.keys());
        console.log(`Found ${nodeIds.length} nodes for edge generation`);
        
        // Fee payer relationship - connect fee payer to other accounts
        const feePayer = this.findFeePayer(txState);
        console.log(`Fee payer detection result: ${feePayer || 'None found'}`);
        if (feePayer) {
            console.log(`Connecting fee payer ${feePayer} to all other nodes`);
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
        console.log(`Creating sequential edges for ${nodeIds.length} nodes`);
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
        console.log(`Found ${tokenGroups.size} token groups`);
        tokenGroups.forEach((nodeIds, tokenId) => {
            if (nodeIds.length > 1 && tokenId !== 'wSHV2S4qX9jFsLjQo8r1BsMLH2ZRKsZx6EJd1sbozGPieEC4Jf') {
                console.log(`Creating edges for token ${tokenId.substring(0, 10)}...`);
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
        console.log(`Generated ${edges.length} edges total`);
        // Return updated state with edges
        return {
            ...txState,
            edges: edges
        };
    }


    private findFeePayer(txState: TransactionState): string | undefined {
        // Try to find fee payer from blockchain data
        if (txState.blockchainData?.feePayerAddress) {
            console.log(`Found feePayerAddress in blockchain data: ${txState.blockchainData.feePayerAddress.substring(0, 10)}...`);
            // Look for node with matching address
            for (const [id, node] of txState.nodes.entries()) {
                if (node.publicKey === txState.blockchainData.feePayerAddress) {
                    console.log(`Found fee payer node by address match: ${id}`);
                    return id;
                }
            }
            console.log("No node with matching feePayerAddress found");
        }
        
        // Alternatively, look for node with negative balance change
        for (const [id, node] of txState.nodes.entries()) {
            console.log(`Node ${id} balance change: ${node.balanceChange || 'undefined'}`);
            if (node.balanceChange && node.balanceChange < 0) {
                console.log(`Found fee payer node by negative balance: ${id}`);
                return id;
            }
        }
        console.log("No fee payer found");
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

    private async generateBlockchainFlowSVG(txState: TransactionState, outputPath: string = 'blockchain_flow.svg'): Promise<string> {
        try {
            // Build edges if missing
            txState = this.buildEdgesIfMissing(txState);
    
            // Create a virtual DOM for server-side rendering
            const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
            const document = dom.window.document;
            global.document = document;
            
            // Define a modern color palette
            const colors = {
                background: '#f8fafc',
                nodeStroke: '#475569',
                account: '#bfdbfe',  // Light blue
                contract: '#ddd6fe',  // Light purple
                token: '#bbf7d0',    // Light green
                failed: '#fecaca',   // Light red
                text: '#1e293b',
                failText: '#dc2626',
                link: '#94a3b8',
                linkFailed: '#ef4444'
            };
            
            // Create SVG container with improved dimensions
            const width = 1200;
            const height = 800;
            const svg = d3.select(document.body)
                .append('svg')
                .attr('xmlns', 'http://www.w3.org/2000/svg')
                .attr('width', width)
                .attr('height', height)
                .attr('viewBox', `0 0 ${width} ${height}`)
                .style('background-color', colors.background);
                
            // Add a subtle grid pattern for visual guidance
            const defs = svg.append('defs');
            defs.append('pattern')
                .attr('id', 'grid')
                .attr('width', 20)
                .attr('height', 20)
                .attr('patternUnits', 'userSpaceOnUse')
                .append('path')
                .attr('d', 'M 20 0 L 0 0 0 20')
                .attr('fill', 'none')
                .attr('stroke', '#e2e8f0')
                .attr('stroke-width', 0.5);
                
            svg.append('rect')
                .attr('width', width)
                .attr('height', height)
                .attr('fill', 'url(#grid)');
            
            // Add title with improved styling
            svg.append('text')
                .attr('x', width / 2)
                .attr('y', 40)
                .attr('text-anchor', 'middle')
                .attr('font-family', 'Arial, sans-serif')
                .attr('font-size', '22px')
                .attr('font-weight', 'bold')
                .attr('fill', colors.text)
                .text(`Transaction Flow: ${txState.blockchainData?.txHash?.substring(0, 16) || 'Unknown'}...`);
            
            // Add transaction status with badge-like styling
            const statusGroup = svg.append('g')
                .attr('transform', `translate(${width / 2}, 70)`);
                
            const status = txState.blockchainData?.status || 'Unknown';
            const statusColor = status === 'Applied' ? '#22c55e' : 
                               status === 'Pending' ? '#f59e0b' : 
                               status === 'Failed' ? '#ef4444' : '#94a3b8';
                               
            statusGroup.append('rect')
                .attr('x', -60)
                .attr('y', -18)
                .attr('width', 120)
                .attr('height', 26)
                .attr('rx', 13)
                .attr('ry', 13)
                .attr('fill', statusColor);
                
            statusGroup.append('text')
                .attr('text-anchor', 'middle')
                .attr('font-family', 'Arial, sans-serif')
                .attr('font-size', '14px')
                .attr('font-weight', 'bold')
                .attr('fill', 'white')
                .attr('dy', 5)
                .text(`Status: ${status.toLowerCase()}`);
            
            // Create arrow markers for different relationship types
            const markers = [
                { id: 'arrow-standard', color: colors.link },
                { id: 'arrow-failed', color: colors.linkFailed }
            ];
            
            markers.forEach(marker => {
                defs.append('marker')
                    .attr('id', marker.id)
                    .attr('viewBox', '0 0 10 10')
                    .attr('refX', 27)
                    .attr('refY', 5)
                    .attr('markerWidth', 8)
                    .attr('markerHeight', 8)
                    .attr('orient', 'auto')
                    .append('path')
                    .attr('d', 'M 0 0 L 10 5 L 0 10 z')
                    .attr('fill', marker.color);
            });
            
            // Extract and convert nodes from txState
            const nodesArray: any[] = [];
            const nodeMap = new Map();
            
            // Process nodes
            txState.nodes.forEach((node, id) => {
                const publicKey = node.publicKey || '';
                // Format address as xxxx....xxxxx (first 4 and last 4 characters)
                const shortAddress = publicKey.length > 8 
                    ? `${publicKey.substring(0, 6)}....${publicKey.substring(publicKey.length - 6)}`
                    : publicKey;
                    
                const nodeData = {
                    id,
                    label: node.label || 'Unknown',
                    publicKey: node.publicKey,
                    shortAddress: shortAddress,
                    type: node.type,
                    failed: !!node.failed,
                    failureReason: node.failureReason,
                    tokenId: node.tokenId,
                    // For hierarchical layout
                    children: [],
                    level: 0,
                    column: 0,
                    parents: []
                };
                
                nodesArray.push(nodeData);
                nodeMap.set(id, nodeData);
            });
            
            // Prepare edges and build parent-child relationships
            const linksArray: any[] = [];
            
            txState.edges.forEach((edge, i) => {
                if (nodeMap.has(edge.fromNode) && nodeMap.has(edge.toNode)) {
                    const source = nodeMap.get(edge.fromNode);
                    const target = nodeMap.get(edge.toNode);
                    
                    // Add child to parent
                    source.children.push(target);
                    
                    // Add parent to child for bidirectional navigation
                    target.parents.push(source);
                    
                    // Create a formatted operation string
                    let formattedOp = '';
                    if (edge.operation) {
                        const opStr = typeof edge.operation === 'string' ? edge.operation : JSON.stringify(edge.operation);
                        
                        // Extract useful information from operation string
                        const matchType = opStr.match(/Type:\s*([\w]+)/);
                        
                        if (matchType) {
                            formattedOp = matchType[1];
                        } else if (opStr.length > 20) {
                            formattedOp = opStr.substring(0, 17) + '...';
                        } else {
                            formattedOp = opStr;
                        }
                    }
                    
                    linksArray.push({
                        id: `edge${i}`,
                        source: source,
                        target: target,
                        operation: edge.operation,
                        formattedOperation: formattedOp,
                        failed: !!edge.failed
                    });
                }
            });
            
            // Find root nodes (nodes with no parents)
            const rootNodes = nodesArray.filter(node => node.parents.length === 0);
            
            // If no root nodes found, use the first node as root
            if (rootNodes.length === 0 && nodesArray.length > 0) {
                rootNodes.push(nodesArray[0]);
            }
            
            // Assign levels to nodes through breadth-first traversal
            const assignLevels = () => {
                const visited = new Set();
                const queue = [...rootNodes];
                
                // Set all root nodes to level 0
                rootNodes.forEach(node => {
                    node.level = 0;
                    visited.add(node.id);
                });
                
                while (queue.length > 0) {
                    const current = queue.shift();
                    
                    // Process all children
                    current.children.forEach((child: { level: number; id: unknown; }) => {
                        // Set child's level to parent's level + 1
                        child.level = Math.max(child.level, current.level + 1);
                        
                        // Add to queue if not visited
                        if (!visited.has(child.id)) {
                            visited.add(child.id);
                            queue.push(child);
                        }
                    });
                }
            };
            
            // Assign columns to nodes to minimize overlaps
            const assignColumns = () => {
                // Group nodes by level
                const nodesByLevel: any = {};
                nodesArray.forEach(node => {
                    if (!nodesByLevel[node.level]) {
                        nodesByLevel[node.level] = [];
                    }
                    nodesByLevel[node.level].push(node);
                });
                
                // Assign columns for each level
                Object.keys(nodesByLevel).forEach(level => {
                    const nodesAtLevel = nodesByLevel[level];
                    nodesAtLevel.forEach((node: any, i: any) => {
                        node.column = i;
                    });
                });
            };
            
            // Apply hierarchical layout algorithm
            assignLevels();
            assignColumns();
            
            // Calculate node positions based on their level and column
            const nodeRadius = 25;
            const horizontalSpacing = 180;  // Space between levels
            const verticalSpacing = 100;    // Space between nodes at the same level
            const topMargin = 150;          // Space from top for title and status
            
            // Group nodes by level
            const levelGroups: {[key: string]: any[]} = {};
            nodesArray.forEach(node => {
                if (!levelGroups[node.level]) {
                    levelGroups[node.level] = [];
                }
                levelGroups[node.level].push(node);
            });

            // Find the maximum level and count of nodes in each level
            const maxLevel = Math.max(...nodesArray.map(node => node.level));
            const maxNodesInLevel = Math.max(...Object.values(levelGroups).map((group: any[]) => group.length));

            // Calculate horizontal start position to center the diagram
            const diagramWidth = maxLevel * horizontalSpacing;
            const horizontalStart = (width - diagramWidth) / 2;
            
            // Calculate vertical center positions for each level
            const levelHeights: any = {};
            Object.keys(levelGroups).forEach(level => {
                const nodesCount = levelGroups[level].length;
                levelHeights[level] = (height - topMargin) / 2 - ((nodesCount - 1) * verticalSpacing) / 2;
            });
            
            // Assign coordinates to nodes
            nodesArray.forEach(node => {
                const levelHeight = levelHeights[node.level];
                const nodesAtLevel = levelGroups[node.level];
                const indexAtLevel = nodesAtLevel.indexOf(node);
                
                // Position with horizontal centering
                node.x = horizontalStart + node.level * horizontalSpacing;
                node.y = levelHeight + indexAtLevel * verticalSpacing;
            });
            
            // Create links (edges) between nodes
            const link = svg.append('g')
                .selectAll('path')
                .data(linksArray)
                .enter().append('path')
                .attr('d', d => {
                    // Use straight lines with slight curve for hierarchy
                    return `M${d.source.x + nodeRadius},${d.source.y}
                            C${d.source.x + horizontalSpacing/2},${d.source.y}
                             ${d.target.x - horizontalSpacing/2},${d.target.y}
                             ${d.target.x - nodeRadius},${d.target.y}`;
                })
                .attr('fill', 'none')
                .attr('stroke', d => d.failed ? colors.linkFailed : colors.link)
                .attr('stroke-width', 2)
                .attr('stroke-dasharray', d => d.failed ? '5,5' : null)
                .attr('marker-end', d => `url(#arrow-${d.failed ? 'failed' : 'standard'})`)
                .attr('opacity', 0.7);
            
            // Add link labels
            const linkText = svg.append('g')
                .selectAll('text')
                .data(linksArray)
                .enter().append('text')
                .attr('text-anchor', 'middle')
                .attr('font-family', 'Arial, sans-serif')
                .attr('font-size', '11px')
                .attr('font-weight', 'normal')
                .attr('fill', d => d.failed ? colors.failText : colors.text)
                .attr('pointer-events', 'none')
                .text(d => d.formattedOperation);
                
            // Position link labels along the path
            linkText.each(function(d) {
                const textElement = d3.select(this);
                
                // Position halfway between nodes, slightly above the path
                const x = (d.source.x + d.target.x) / 2;
                const y = (d.source.y + d.target.y) / 2 - 15;
                
                textElement.attr('x', x);
                textElement.attr('y', y);
                
                // Add background for better readability
                const textNode = textElement.node();
                if (textNode) {
                    const textWidth = d.formattedOperation.length * 6; // Estimate width
                    const textHeight = 15; // Estimate height
                    
                    svg.insert('rect', 'text')
                        .attr('x', x - textWidth / 2 - 4)
                        .attr('y', y - textHeight / 2 - 2)
                        .attr('width', textWidth + 8)
                        .attr('height', textHeight + 4)
                        .attr('rx', 3)
                        .attr('ry', 3)
                        .attr('fill', 'white')
                        .attr('fill-opacity', 0.9);
                }
            });
            
            // Create node group
            const node = svg.append('g')
                .selectAll('g')
                .data(nodesArray)
                .enter().append('g')
                .attr('transform', d => `translate(${d.x},${d.y})`);
            
            // Create node circles
            node.append('circle')
                .attr('r', nodeRadius)
                .attr('fill', d => {
                    if (d.failed) return colors.failed;
                    if (d.type === 'contract') return colors.contract;
                    if (d.tokenId && d.tokenId !== 'wSHV2S4qX9jFsLjQo8r1BsMLH2ZRKsZx6EJd1sbozGPieEC4Jf') return colors.token;
                    return colors.account;
                })
                .attr('stroke', d => d.failed ? colors.failText : colors.nodeStroke)
                .attr('stroke-width', 1.5);
            
            // Add node icons
            node.each(function(d) {
                const nodeGroup = d3.select(this);
                
                // Add icon based on node type
                if (d.type === 'contract') {
                    nodeGroup.append('text')
                        .attr('text-anchor', 'middle')
                        .attr('dominant-baseline', 'central')
                        .attr('font-family', 'Arial, sans-serif')
                        .attr('font-size', '16px')
                        .attr('fill', colors.text)
                        .text('⚙️');
                } else if (d.tokenId && d.tokenId !== 'wSHV2S4qX9jFsLjQo8r1BsMLH2ZRKsZx6EJd1sbozGPieEC4Jf') {
                    nodeGroup.append('text')
                        .attr('text-anchor', 'middle')
                        .attr('dominant-baseline', 'central')
                        .attr('font-family', 'Arial, sans-serif')
                        .attr('font-size', '16px')
                        .attr('fill', colors.text)
                        .text('🪙');
                } else {
                    nodeGroup.append('text')
                        .attr('text-anchor', 'middle')
                        .attr('dominant-baseline', 'central')
                        .attr('font-family', 'Arial, sans-serif')
                        .attr('font-size', '16px')
                        .attr('fill', colors.text)
                        .text('👤');
                }
                
                // Add error icon for failed nodes
                if (d.failed) {
                    nodeGroup.append('text')
                        .attr('x', 15)
                        .attr('y', -15)
                        .attr('text-anchor', 'middle')
                        .attr('font-family', 'Arial, sans-serif')
                        .attr('font-size', '14px')
                        .attr('fill', colors.failText)
                        .text('❌');
                }
            });
            
            // Add address labels
            node.append('text')
                .attr('dy', 40)
                .attr('text-anchor', 'middle')
                .attr('font-family', 'Arial, sans-serif')
                .attr('font-size', '11px')
                .attr('font-weight', 'bold')
                .attr('fill', colors.text)
                .text(d => d.shortAddress);
            
            // Add failure reason if node failed
            node.filter(d => d.failed && d.failureReason)
                .append('text')
                .attr('dy', 55)
                .attr('text-anchor', 'middle')
                .attr('font-family', 'Arial, sans-serif')
                .attr('font-size', '10px')
                .attr('fill', colors.failText)
                .text(d => d.failureReason.length > 20 ? d.failureReason.substring(0, 17) + '...' : d.failureReason);
            
            // Create a legend
            const legendGroup = svg.append('g')
                .attr('transform', `translate(40, 120)`);
                
            legendGroup.append('rect')
                .attr('width', 150)
                .attr('height', 130)
                .attr('fill', 'white')
                .attr('fill-opacity', 0.8)
                .attr('rx', 8)
                .attr('ry', 8)
                .attr('stroke', '#e2e8f0')
                .attr('stroke-width', 1);
                
            legendGroup.append('text')
                .attr('x', 10)
                .attr('y', 20)
                .attr('font-family', 'Arial, sans-serif')
                .attr('font-size', '14px')
                .attr('font-weight', 'bold')
                .attr('fill', colors.text)
                .text('Legend');
                
            const legendItems = [
                { color: colors.account, icon: '👤', label: 'Account' },
                { color: colors.contract, icon: '⚙️', label: 'Contract' },
                { color: colors.token, icon: '🪙', label: 'Token' },
                { color: colors.failed, icon: '❌', label: 'Failed' }
            ];
            
            legendItems.forEach((item, i) => {
                const g = legendGroup.append('g')
                    .attr('transform', `translate(15, ${i * 25 + 35})`);
                
                // Colored circle
                g.append('circle')
                    .attr('r', 8)
                    .attr('fill', item.color)
                    .attr('stroke', colors.nodeStroke)
                    .attr('stroke-width', 1);
                    
                // Icon
                g.append('text')
                    .attr('x', 0)
                    .attr('y', 0)
                    .attr('text-anchor', 'middle')
                    .attr('dominant-baseline', 'central')
                    .attr('font-family', 'Arial, sans-serif')
                    .attr('font-size', '10px')
                    .text(item.icon);
                
                // Label
                g.append('text')
                    .attr('x', 20)
                    .attr('y', 4)
                    .attr('font-family', 'Arial, sans-serif')
                    .attr('font-size', '12px')
                    .attr('fill', colors.text)
                    .text(item.label);
            });
            
            // Add timestamp or metadata
            svg.append('text')
                .attr('x', width - 40)
                .attr('y', height - 20)
                .attr('text-anchor', 'end')
                .attr('font-family', 'Arial, sans-serif')
                .attr('font-size', '11px')
                .attr('fill', '#94a3b8')
                .text(`Generated: ${new Date().toLocaleString()}`);
            
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

    private convertSvgToPngWithSharp = async (svgPath: string, pngPath: string): Promise<string> => {
        try {
            const svgBuffer = await fs.readFile(svgPath);
            
            await sharp(svgBuffer)
                .png()
                .flatten({ background: { r: 255, g: 255, b: 255 } }) // Add white background
                .toFile(pngPath);
            
            console.log(`Successfully converted SVG to PNG at: ${pngPath}`);
            return pngPath;
        } catch (error) {
            console.error('Error converting SVG to PNG:', error);
            throw error;
        }
    }

    public generateBlockchainFlowWithPng = async (txState: TransactionState, svgPath: string = 'blockchain_flow.svg', pngPath: string = 'blockchain_flow.png'): Promise<{svgPath: string, pngPath: string}> => {
        try {
            await this.generateBlockchainFlowSVG(txState, svgPath);
            
            await this.convertSvgToPngWithSharp(svgPath, pngPath);
            
            return {
                svgPath,
                pngPath
            };
        } catch (error) {
            console.error('Error generating blockchain flow PNG:', error);
            throw error;
        }
    }

    public async generateBlockchainVisualization(
        txState: TransactionState,
        outputFormat: 'svg' | 'png' | 'md' = 'png',
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
                    const tempSvgPath = 'temp_blockchain_flow.svg';
                    try {
                        const result = await this.generateBlockchainFlowWithPng(txState, tempSvgPath, finalOutputPath);
                        await fs.unlink(tempSvgPath);                        
                        return finalOutputPath;
                    } catch (error) {
                        console.error('Error generating blockchain flow PNG:', error);
                        throw error;
                    }
            
            case 'md':
                const markdown = this.generateBlockchainMarkdown(txState);
                await fs.writeFile(finalOutputPath, markdown);
                console.log(`Successfully generated blockchain analysis markdown at: ${finalOutputPath}`);
                return finalOutputPath;
        }
    }

    public generateTransactionVisualization = async (
        txState: TransactionState,
        outputFormat: 'svg' | 'png' = 'png',
        outputPath?: string
    ): Promise<void> => {
        const defaultPaths = {
            'svg': 'transaction_visualization.svg',
            'png': 'transaction_visualization.png'
        };
        
        const finalOutputPath = outputPath || defaultPaths[outputFormat];
        
        // Detect if this is a blockchain transaction
        const isBlockchainTx = !!txState.blockchainData;
        
        if (isBlockchainTx) {
            this.generateBlockchainVisualization(txState, outputFormat, finalOutputPath);
            //this.generateBlockchainFlowSVG(txState, outputPath);
        } else {
            // Use standard visualization
            if (outputFormat === 'svg') {
                return this.generateSVG(finalOutputPath);
            } else {     
                const tempSvgPath = 'temp_transaction_visualization.svg';   
                await this.generateSVG(tempSvgPath);
                try {                    
                    await this.convertSvgToPngWithSharp(tempSvgPath, finalOutputPath);
                    await fs.unlink(tempSvgPath);                    
                    console.log(`Successfully generated transaction PNG at: ${finalOutputPath}`);                    
                } catch (error) {
                    console.error('Error converting SVG to PNG:', error);
                    throw error;
                }
            }
        }
    }

}