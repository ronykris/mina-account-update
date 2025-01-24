import { visualizeTransaction } from './mermaid_visualizer.js';

// Main execution
async function main() {
    try {
        const mermaidCode = await visualizeTransaction();
        console.log(mermaidCode);
    } catch (error) {
        console.error('Error generating visualization:', error);
    }
}

main();