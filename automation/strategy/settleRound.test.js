const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { settleRound } = require('./settleRound');

test('a missed round can be settled by hand and the strategy state carries on from it', async () => {
  const stateFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'settle-')), 'state.json');
  const outcome = await settleRound({ stateFile, home: 'ars', away: 'bre', score: '3-3', winners: ['oneX'] });
  assert.equal(outcome.result.status, 'settled');
  const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.equal(saved.privateDef.oneX, 0, 'the winning option is cleared');
  assert.ok(saved.privateDef.ft40 > 0, 'a losing option carries its stake forward');
  assert.equal(saved.automationSettlements.length, 1);
  await assert.rejects(() => settleRound({ stateFile, home: 'ars', away: 'bre', score: 'three' }), /score must look like/);
  await assert.rejects(() => settleRound({ stateFile, home: 'ars', away: 'zzz', score: '1-0' }), /would not take/);
});
