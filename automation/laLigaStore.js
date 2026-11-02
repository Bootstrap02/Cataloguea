// The La Liga strategy state, kept in its own file (never the Arsenal one).
const fs = require('node:fs');
const path = require('node:path');
const { createState } = require('./strategy/laLigaStrategy');

function createFileStore({ file, baseStake = 10000 }) {
  let state;
  if (fs.existsSync(file)) state = JSON.parse(fs.readFileSync(file, 'utf8'));
  else state = createState({ baseStake });
  const store = {
    file,
    get state() { return state; },
    set state(value) { state = value; },
    save() {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const temporary = `${file}.tmp`;
      fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`);
      fs.renameSync(temporary, file);
    },
    existed: fs.existsSync(file),
  };
  return store;
}

module.exports = { createFileStore };
