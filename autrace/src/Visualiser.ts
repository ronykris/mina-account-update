import { promises as fs } from 'fs';
import child_process from 'child_process';
import util from 'util';
const exec = util.promisify(child_process.exec);

export class AUVisualizer {
    private stateHistory: any[];
        
    constructor(stateHistory: any[]) {
        this.stateHistory = stateHistory;
    }

    private getUniqueNodeId = (id: string, stateIndex: number): string => {
        return `N${id.replace(/[^0-9]/g, '')}${stateIndex}`;
    }

    private formatLabel = (relationship: any): string => {
        return relationship?.label?.replace(/[()]/g, '') || 'Unknown';
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
                subgraph += `        style ${nodeId} fill:${color}\n`;
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

    public generateMermaidCode = (): string => {
        let mermaidCode = 'flowchart TB\n';
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

    public async generatePNG(outputPath: string = 'transaction_flow.png'): Promise<void> {

        try {
            const mermaidCode = this.generateMermaidCode();

            const tempFile = 'temp_diagram.mmd';
            await fs.writeFile(tempFile, mermaidCode);

            const config = {
                width: 1200,      // Width of the output PNG
                height: 800,      // Height of the output PNG
                backgroundColor: '#ffffff'  // White background
            };

            const command = `mmdc -i ${tempFile} -o ${outputPath} -w ${config.width} -H ${config.height} -b ${config.backgroundColor}`;
            
            await exec(command);

            await fs.unlink(tempFile);

            console.log(`Successfully generated PNG at: ${outputPath}`);
        } catch (error) {
            console.error('Error generating PNG:', error);
            throw error;
        }
    }
}