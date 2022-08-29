import { Party } from './party.js';
import { Circuit, Field, isReady, Ledger, shutdown } from '../snarky.js';
import { PrivateKey } from './signature.js';
import { Int64 } from './int.js';
import { Encoding, Experimental, Mina } from '../index.js';
import { describe, it } from 'node:test';
import { expect } from 'expect';

await isReady;
let address = PrivateKey.random().toPublicKey();
let party = Party.defaultParty(address);
party.body.balanceChange = Int64.from(1e9).neg();

describe('party', () => {
  it('can convert party to fields consistently', () => {
    // convert party to fields in OCaml, going via Party.of_json
    let json = JSON.stringify(party.toJSON().body);
    let fields1 = Ledger.fieldsOfJson(json);
    // convert party to fields in pure JS, leveraging generated code
    let fields2 = party.toFields();

    // this is useful console output in the case the test should fail
    if (fields1.length !== fields2.length) {
      console.log(
        `unequal length. expected ${fields1.length}, actual: ${fields2.length}`
      );
    }
    for (let i = 0; i < fields1.length; i++) {
      if (fields1[i].toString() !== fields2[i].toString()) {
        console.log('unequal at', i);
        console.log(`expected: ${fields1[i]} actual: ${fields2[i]}`);
      }
    }

    expect(fields1.length).toEqual(fields2.length);
    expect(fields1.map(String)).toEqual(fields2.map(String));
    expect(fields1).toEqual(fields2);
  });

  it('can hash a party', () => {
    // TODO remove restriction "This function can't be run outside of a checked computation."
    Circuit.runAndCheck(() => {
      let hash = party.hash();
      expect(isField(hash)).toBeTruthy();

      // if we clone the party, hash should be the same
      let party2 = Party.clone(party);
      expect(party2.hash()).toEqual(hash);

      // if we change something on the cloned party, the hash should become different
      Party.setValue(party2.update.appState[0], Field.one);
      expect(party2.hash()).not.toEqual(hash);
    });
  });

  it("converts party to a public input that's consistent with the ocaml implementation", async () => {
    let otherAddress = PrivateKey.random().toPublicKey();

    let party = Party.createUnsigned(address);
    Experimental.createChildParty(party, otherAddress);
    let publicInput = party.toPublicInput();

    // create transaction JSON with the same party structure, for ocaml version
    let tx = await Mina.transaction(() => {
      let party = Party.createUnsigned(address);
      Experimental.createChildParty(party, otherAddress);
    });
    let publicInputOcaml = Ledger.zkappPublicInput(tx.toJSON(), 0);

    expect(publicInputOcaml).toEqual(publicInput);
  });

  it('creates the right empty sequence state', () => {
    expect(
      party.body.preconditions.account.sequenceState.value.toString()
    ).toEqual(
      '12935064460869035604753254773225484359407575580289870070671311469994328713165'
    );
  });

  it('encodes token ids correctly', () => {
    let x = Field.random();
    let defaultTokenId = 'wSHV2S4qX9jFsLjQo8r1BsMLH2ZRKsZx6EJd1sbozGPieEC4Jf';
    expect(Encoding.TokenId.toBase58(x)).toEqual(Ledger.fieldToBase58(x));
    expect(Encoding.TokenId.fromBase58(defaultTokenId).toString()).toEqual('1');
  });
});

setImmediate(shutdown);

// to check that we got something that looks like a Field
// note: `instanceof Field` doesn't work
function isField(x: any): x is Field {
  return x?.constructor === Field.one.constructor;
}
