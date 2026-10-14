import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { AccountUpdate, Field, Mina, PrivateKey, PublicKey, UInt64 } from 'o1js';
import { ASCIITreeVisualizer, AUTrace, AUVisualizer, AccountUpdateTrace } from '../src/index.js';
import { TransactionState } from '../src/Interface.js';
import { BigStateContract, CallerContract } from './contracts.js';

const idOf = (state: TransactionState, address: PublicKey): string => {
    const node = [...state.nodes.values()].find(n => n.publicKey === address.toBase58());
    assert.ok(node, `no node for ${address.toBase58()}`);
    return node.id;
};

const stateChangesOf = (state: TransactionState, address: PublicKey): string =>
    state.relationships.get(idOf(state, address))!.stateChanges as unknown as string;

describe('AUTrace on o1js 3 (Mesa) transactions', () => {
    let sender: Mina.TestPublicKey;
    let receiver: Mina.TestPublicKey;
    let big: BigStateContract;
    let caller: CallerContract;
    let deployTx: Mina.Transaction<false, false>;
    let callTx: Mina.Transaction<false, false>;

    before(async () => {
        const local = await Mina.LocalBlockchain({ proofsEnabled: false });
        Mina.setActiveInstance(local);
        [sender, receiver] = local.testAccounts;

        const bigKey = PrivateKey.random();
        const callerKey = PrivateKey.random();
        big = new BigStateContract(bigKey.toPublicKey());
        caller = new CallerContract(callerKey.toPublicKey());

        deployTx = await Mina.transaction(sender, async () => {
            AccountUpdate.fundNewAccount(sender, 2);
            await big.deploy();
            await caller.deploy();
        });
        await deployTx.prove();
        await deployTx.sign([sender.key, bigKey, callerKey]).send();

        callTx = await Mina.transaction(sender, async () => {
            await caller.callSetLast(big.address, Field(42));
            const payment = AccountUpdate.createSigned(sender);
            payment.send({ to: receiver, amount: UInt64.from(5_000_000_000) });
        });
    });

    it('reports all 32 appState slots zeroed by deploy', () => {
        const state = new AUTrace().getTransactionState(deployTx);

        // The default init() zeroes every slot, whether or not the contract declares state.
        for (const address of [big.address, caller.address]) {
            const changes = stateChangesOf(state, address);
            assert.equal(changes.match(/appState\[\d+\]/g)?.length, 32);
            assert.match(changes, /Field: appState\[31\], Value: 0/);
        }
        assert.equal(stateChangesOf(state, sender), 'No State Changes');
    });

    it('reports only the appState slots a method call sets', () => {
        const state = new AUTrace().getTransactionState(callTx);

        assert.equal(stateChangesOf(state, big.address), 'Field: appState[31], Value: 42');
        assert.equal(stateChangesOf(state, caller.address), 'No State Changes');
        assert.equal(stateChangesOf(state, sender), 'No State Changes');
        assert.equal(stateChangesOf(state, receiver), 'No State Changes');
    });

    it('nests child account updates under their caller', () => {
        const state = new AUTrace().getTransactionState(callTx);
        const callerId = idOf(state, caller.address);
        const bigId = idOf(state, big.address);
        const senderId = idOf(state, sender);
        const receiverId = idOf(state, receiver);

        assert.equal(state.metadata.accountUpdates, 4);
        assert.equal(state.relationships.get(bigId)!.parentId, callerId);
        assert.equal(state.relationships.get(callerId)!.parentId, undefined);
        assert.equal(state.relationships.get(receiverId)!.parentId, senderId);
        assert.equal(state.nodes.get(callerId)!.type, 'contract');
        assert.equal(state.nodes.get(bigId)!.type, 'contract');
        assert.equal(state.nodes.get(senderId)!.type, 'account');
        assert.ok(state.edges.some(e => e.fromNode === callerId && e.toNode === bigId));
    });

    it('tracks tree changes across prove and sign', async () => {
        const trace = new AccountUpdateTrace();
        trace.takeSnapshot(callTx.transaction.accountUpdates, 'deploy');
        await callTx.prove();
        trace.takeSnapshot(callTx.transaction.accountUpdates, 'prove');
        callTx.sign([sender.key]);
        trace.takeSnapshot(callTx.transaction.accountUpdates, 'sign');

        const [, proved, signed] = trace.getSnapshots();
        assert.ok(proved!.changes.added.some(c => c.path === 'accountUpdate[0].authorization.proof'));
        assert.ok(signed!.changes.added.some(c => c.path === 'accountUpdate[2].authorization.signature'));

        const summary = new ASCIITreeVisualizer().visualizeChangeSummary(trace.getSnapshots());
        assert.match(summary, /Created transaction with 4 account updates/);
        assert.match(summary, /PROVE/);
        assert.match(summary, /SIGN/);
    });

    it('counts proofs and signatures once the transaction is proved and signed', () => {
        const state = new AUTrace().getTransactionState(callTx);

        assert.equal(state.metadata.totalProofs, 2);
        assert.equal(state.metadata.totalSignatures, 1);
    });

    it('renders the call tree as Mermaid', () => {
        const autrace = new AUTrace();
        autrace.getTransactionState(callTx);
        const mermaid = new AUVisualizer(autrace.getStateHistory()).generateMermaidCode();

        assert.match(mermaid, /\["CallerContract\.callSetLast"\]/);
        assert.match(mermaid, /\["BigStateContract\.setLast"\]/);
        assert.match(mermaid, /-->\|"\d+\] setLast"\|/);
    });
});
