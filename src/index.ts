export {}
import { visualizeTransaction } from './mermaid_visualizer.js';

visualizeTransaction().then(console.log).catch(console.error);