import { visualizeTransaction } from './mermaid_visualizer.js';
import { writeFile } from 'fs/promises';
import { exec } from 'child_process';

async function generatePNG() {
    try {
        // Generate Mermaid code
        const mermaidCode = await visualizeTransaction();
        console.log('Mermaid code generated successfully');
        
        // Write to file
        await writeFile('transaction.mmd', mermaidCode);
        console.log('Mermaid file written successfully');
        
        // Enhanced configuration for high-quality output
        const mermaidConfig = {
            backgroundColor: '#FFFFFF',
            width: 3840,  // 4K width
            height: 2160, // 4K height
            scale: 4,     // Higher scaling factor for better quality
            theme: 'default',
            pdfFit: true, // Ensure diagram fits in the output
            cssFile: null as string | null, // No custom CSS file
            quiet: true,  // Reduce CLI output noise
            pixelRatio: 2 // Higher pixel ratio for sharper text
        };
        
        // Generate PNG with high-resolution configuration
        const mermaidCommand = `npx mmdc -i transaction.mmd -o transaction.png \
            -b ${mermaidConfig.backgroundColor} \
            -w ${mermaidConfig.width} \
            -H ${mermaidConfig.height} \
            -s ${mermaidConfig.scale} \
            --pdfFit ${mermaidConfig.pdfFit} \
            --quiet ${mermaidConfig.quiet} \
            --pixelRatio ${mermaidConfig.pixelRatio} \
            ${mermaidConfig.theme ? `--theme ${mermaidConfig.theme}` : ''} \
            ${mermaidConfig.cssFile ? `--cssFile ${mermaidConfig.cssFile}` : ''}`;
            
        exec(mermaidCommand, (error, stdout, stderr) => {
            if (error) {
                console.error('Error generating PNG:', error);
                return;
            }
            if (stderr) {
                console.error('stderr:', stderr);
                return;
            }
            console.log('High-resolution PNG generated successfully!');
        });
    } catch (error) {
        console.error('Failed to generate visualization:', error);
        process.exit(1);
    }
}

// Execute
generatePNG();