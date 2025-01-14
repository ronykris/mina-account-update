import { visualizeTransaction } from './mermaid_visualizer.js';
import { exec } from 'child_process';

async function generatePNG() {
    try {
        const mermaidCode = await visualizeTransaction();
        console.log('Mermaid code generated successfully');
        
        exec('mmdc -i transaction.mmd -o transaction.png', (error, stdout, stderr) => {
            if (error) {
                console.error(`Error: ${error}`);
                return;
            }
            if (stderr) {
                console.error(`Stderr: ${stderr}`);
                return;
            }
            console.log('PNG generated successfully!');
        });
    } catch (error) {
        console.error('Failed to generate visualization:', error);
    }
}

generatePNG();