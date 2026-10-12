import { Field, Provable, PublicKey, SmartContract, State, method, state } from 'o1js';

// Mesa raised the on-chain state limit from 8 to 32 field elements.
// `last` lands at appState[31], which only exists on o1js >= 3.
const Middle = Provable.Array(Field, 30);

export class BigStateContract extends SmartContract {
    @state(Field) first = State<Field>();
    @state(Middle) middle = State<Field[]>();
    @state(Field) last = State<Field>();

    @method async setLast(value: Field) {
        this.last.set(value);
    }
}

export class CallerContract extends SmartContract {
    @method async callSetLast(target: PublicKey, value: Field) {
        const bigState = new BigStateContract(target);
        await bigState.setLast(value);
    }
}
