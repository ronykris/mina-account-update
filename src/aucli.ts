#!/usr/bin/env node

import { AUTrace, AUVisualizer } from './index.js';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
//import { createServer } from 'http';
//import { createReadStream } from 'fs';
//import open from 'open';
import { fetchZkAppTransactionByHash } from './helper.js';


yargs(hideBin(process.argv))
  .usage('Usage: $0 [options]')
  .option('tx', {
    alias: 't',
    describe: 'Transaction hash to analyze',
    type: 'string',
  })
  /*.option('file', {
    alias: 'f',
    describe: 'JSON file containing transaction data',
    type: 'string',
  })*/
  .example('$0 --tx 5JuCdmp1PeRnnXhJJ5pHCDC7N3wpBG49DxBG82N8o49f8K7YcDpZ', 'Analyze transaction from the blockchain')
  //.example('$0 --file ./transaction.json', 'Analyze transaction from a local file')  
  .check((argv) => {
    if (argv.tx && argv.file) {
      throw new Error('Please provide either --tx or --file, not both');
    }
    if (!argv.tx && !argv.file) {
      throw new Error('Please provide either --tx or --file');
    }
    return true;
  })
  .help()
  .alias('help', 'h')
  .epilog('For more information visit https://github.com/ronykris/autrace')
  .parseAsync()
  .then(async (argv) => {
    await main(argv)
  })
  .catch(error => {
    console.error(chalk.red('Argument error:'), error.message);
    process.exit(1);
  })


const main = async (argv: any) => {
  try {
    console.log(chalk.blue('AUTrace - Blockchain Transaction Analyzer'));
    console.log(chalk.blue('========================================='));

    let transactionData;

    if (argv.tx) {
      console.log(chalk.yellow(`Fetching transaction ${argv.tx} from API...`));
      transactionData = await fetchZkAppTransactionByHash(argv.tx as string);
      //console.log(transactionData)
    } else if (argv.file) {
      console.log(chalk.yellow(`Loading transaction from file ${argv.file}...`));
      transactionData = loadTransactionFromFile(argv.file as string);
    }

    if (!transactionData) {
      console.error(chalk.red('Failed to load transaction data'));
      process.exit(1);
    }

    const autrace = new AUTrace();
    autrace.clearTransactionState();

    console.log(chalk.yellow('Analyzing transaction...'));
    autrace.getTransactions(transactionData);    
    //console.log(chalk.yellow('Fetching history...'));
    const history = autrace.getStateHistory();
    history.forEach((state, index) => {
      console.log(`State ${index}:`, state);
    });
    
    const visualizer = new AUVisualizer(history);    
    await visualizer.generateTransactionVisualization(history[0]);
    
  } catch (error) {
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}


/**
 * Load transaction data from a local file
 */
function loadTransactionFromFile(filePath: string): any {
  try {
    const resolvedPath = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`File not found: ${resolvedPath}`);
    }
    
    const fileContent = fs.readFileSync(resolvedPath, 'utf8');
    return JSON.parse(fileContent);
  } catch (error) {
    console.error(chalk.red('Error loading transaction file:'), 
                  error instanceof Error ? error.message : String(error));
    throw error;
  }
}

