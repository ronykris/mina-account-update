# AUTrace

A utility package for tracing and visualizing Mina Protocol account updates and transactions. This tool helps developers understand and visualize the flow of transactions and account updates in their zkApps.

## Installation

```bash
npm install autrace
```

## Features

- `AUTrace`: Track and analyze transaction states and account updates in Mina Protocol
- `AUVisualizer`: Generate visual representations of transaction flows in various formats (Markdown, PNG, SVG)
-- Transaction state history tracking
-- Contract analysis capabilities

## Usage

### Basic Usage

```typescript
import * as trace from 'autrace';

// Initialize AUTrace
const autrace = new trace.AUTrace();
```

### Initialize Contracts

```typescript
// Initialize contracts for tracking
autrace.initializeContracts([zkAppContractInstance1, zkAppContractInstance2]);

// Optional: Get contract analysis
const contractAnalysis = autrace.getContractAnalysis();
```

### Transaction Tracking

```typescript
// Clear previous transaction state before new transaction
autrace.clearTransactionState();

// Create and track a transaction
const txn = await Mina.transaction(deployerAccount, async () => {
  // Your transaction logic here
});

// Track different transaction states like so:
const sendState = autrace.getTransactionState(await txn.send());

```

### Visualization

```typescript
// Get the complete state history
const history = autrace.getStateHistory();

// Initialize visualizer with history
const visualizer = new trace.AUVisualizer(history);

// Generate different visualization formats
await visualizer.generateMarkdownFile('output.md');
await visualizer.generatePNG('output.png');
await visualizer.generateSVG('output.svg');
```

### Important Notes

- This package uses ES modules. Ensure your project's package.json has `"type": "module"`.
- TypeScript projects should have appropriate module settings in tsconfig.json.

