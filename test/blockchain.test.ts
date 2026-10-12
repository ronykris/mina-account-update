import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PrivateKey } from 'o1js';
import { AUTrace, AUVisualizer } from '../src/index.js';

const MINA_TOKEN_ID = 'wSHV2S4qX9jFsLjQo8r1BsMLH2ZRKsZx6EJd1sbozGPieEC4Jf';
const feePayer = PrivateKey.random().toPublicKey().toBase58();
const zkApp = PrivateKey.random().toPublicKey().toBase58();

// Synthetic transaction with the fields autrace reads from the Blockberry zkApp
// transaction endpoint (no API key is available in tests). Since Mesa, accounts
// carry 32 appState slots instead of 8.
const mesaTx = {
    txHash: '5JsyntheticMesaZkappTransaction',
    blockHeight: 600000,
    timestamp: 1757000000000,
    txStatus: 'applied',
    memo: '',
    fee: 0.1,
    feePayerAddress: feePayer,
    failures: [],
    updatedAccounts: [
        {
            accountAddress: feePayer,
            isZkappAccount: false,
            callDepth: 0,
            tokenId: MINA_TOKEN_ID,
            totalBalanceChange: -0.1,
            callData: '0',
            update: { appState: Array(32).fill(null), verificationKey: null, permissions: null },
        },
        {
            accountAddress: zkApp,
            isZkappAccount: true,
            callDepth: 1,
            tokenId: MINA_TOKEN_ID,
            totalBalanceChange: 0,
            callData: '1234',
            update: {
                appState: Array.from({ length: 32 }, (_, i) => (i === 31 ? '42' : null)),
                verificationKey: null,
                permissions: { editState: 'proof', send: 'proof' },
            },
        },
    ],
};

describe('AUTrace on Mesa-era on-chain transactions', () => {
    it('adapts updated accounts with 32 appState slots', () => {
        const state = new AUTrace().getTransactionState(mesaTx);
        const nodes = [...state.nodes.values()];

        assert.equal(nodes.length, 2);
        assert.equal(state.blockchainData?.txHash, mesaTx.txHash);
        assert.equal(nodes.find(n => n.publicKey === zkApp)?.type, 'contract');
        assert.equal(state.relationships.get(`${mesaTx.txHash}-1`)?.parentId, `${mesaTx.txHash}-0`);
    });

    it('keeps all 32 state values in the flow graph', () => {
        const state = new AUTrace().getBlockchainTxnStateWithFlowAnalysis(mesaTx);
        const zkAppNode = state.blockchainData?.flowGraph?.nodes.find(n => n.address === zkApp);

        assert.equal(zkAppNode?.stateValues.length, 32);
        assert.equal(zkAppNode?.stateValues[31], '42');
    });

    it('renders the flow graph as SVG', async () => {
        const autrace = new AUTrace();
        const state = autrace.getBlockchainTxnStateWithFlowAnalysis(mesaTx);
        const outputPath = fileURLToPath(new URL('./mesa-flow.svg', import.meta.url));

        await new AUVisualizer(autrace.getStateHistory()).generateBlockchainVisualization(state, 'svg', outputPath);

        const svg = await fs.readFile(outputPath, 'utf8');
        assert.match(svg, /^<svg/);
        assert.ok(svg.includes(`${zkApp.substring(0, 6)}....${zkApp.substring(zkApp.length - 6)}`));
    });
});
