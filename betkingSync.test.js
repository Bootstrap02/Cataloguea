const test = require("node:test");
const assert = require("node:assert/strict");
const { createBetkingController, verifyBetkingKey, validateState } = require("../Controllers/catalogueaBKCtrl");

// an in-memory stand-in for the BetkingBase mongoose model (just the calls the controller makes)
function fakeModel() {
  const docs = [];
  const matches = (doc, filter) => Object.entries(filter).every(([field, want]) => {
    if (want && typeof want === "object" && "$lte" in want) return doc[field] <= want.$lte;
    if (want && typeof want === "object" && "$in" in want) return want.$in.includes(doc[field]);
    if (want && typeof want === "object" && "$exists" in want) return (field in doc) === want.$exists;
    return doc[field] === want;
  });
  const model = {
    docs,
    findOne: (filter) => ({ lean: async () => { const doc = docs.find((item) => matches(item, filter)); return doc ? { ...doc, updatedAt: "t" } : null; } }),
    create: async (doc) => {
      if (docs.some((item) => item.key === doc.key && item.version === doc.version)) throw new Error("duplicate key");
      docs.push({ ...doc, createdAt: "t" });
      return { ...doc };
    },
    findOneAndUpdate: async (filter, update) => {
      const doc = docs.find((item) => matches(item, filter));
      if (!doc) return null;
      Object.assign(doc, update.$set);
      return { ...doc };
    },
    deleteMany: async (filter) => {
      let deleted = 0;
      for (let i = docs.length - 1; i >= 0; i -= 1) if (matches(docs[i], filter)) { docs.splice(i, 1); deleted += 1; }
      return { deletedCount: deleted };
    },
    find: (filter) => ({ sort: () => ({ limit: (n) => ({ lean: async () => docs.filter((item) => matches(item, filter)).sort((a, b) => b.version - a.version).slice(0, n) }) }) }),
  };
  return model;
}

const goodState = (bank = 0) => ({ winners: ["BAR", "RMA"], bases: { BAR: 5000, RMA: 5000 }, smallDeficits: { BAR: 0, RMA: 0 }, privateDef: { ATM: 70 }, bigDef: {}, brokenTarget: {}, bank, settledRounds: ["a"] });

function call(handler, req = {}) {
  return new Promise((resolve) => {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { resolve({ status: this.statusCode, body }); } };
    handler({ query: {}, params: {}, body: {}, ...req }, res);
  });
}

test("GET /betking: nothing saved yet says so; the first PUT creates version 1", async () => {
  const c = createBetkingController({ BetkingBase: fakeModel() });
  assert.deepEqual((await call(c.getBase)).body, { exists: false });
  const put = await call(c.updateBase, { body: { state: goodState(), baseVersion: 0, deviceId: "laptop", reason: "first-sync" } });
  assert.equal(put.status, 200);
  assert.equal(put.body.version, 1);
  const got = (await call(c.getBase)).body;
  assert.equal(got.exists, true);
  assert.equal(got.state.privateDef.ATM, 70);
  assert.equal(got.summary.teamsWithDeficit, 1);
});

test("a PUT builds on the version the device last saw; a stale device gets 409 and nothing changes; force replaces", async () => {
  const model = fakeModel();
  const c = createBetkingController({ BetkingBase: model });
  await call(c.updateBase, { body: { state: goodState(0), baseVersion: 0, deviceId: "laptop" } });
  assert.equal((await call(c.updateBase, { body: { state: goodState(10), baseVersion: 1, deviceId: "laptop", reason: "round" } })).body.version, 2);
  const stale = await call(c.updateBase, { body: { state: goodState(999), baseVersion: 1, deviceId: "phone" } });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.serverVersion, 2);
  assert.equal(model.docs.find((doc) => doc.key === "main").state.bank, 10, "the stale save changed nothing");
  const forced = await call(c.updateBase, { body: { state: goodState(999), baseVersion: 1, deviceId: "phone", force: true } });
  assert.equal(forced.body.version, 3);
});

test("every replaced state is kept as history and can be fetched back", async () => {
  const c = createBetkingController({ BetkingBase: fakeModel() });
  await call(c.updateBase, { body: { state: goodState(1), baseVersion: 0 } });
  await call(c.updateBase, { body: { state: goodState(2), baseVersion: 1 } });
  await call(c.updateBase, { body: { state: goodState(3), baseVersion: 2 } });
  assert.deepEqual((await call(c.getHistory)).body.history.map((row) => row.version), [2, 1]);
  assert.equal((await call(c.getHistoryItem, { params: { version: "1" } })).body.state.bank, 1);
  assert.equal((await call(c.getHistoryItem, { params: { version: "9" } })).status, 404);
  assert.equal((await call(c.getBase)).body.state.bank, 3, "the history never replaces the newest state");
});

test("old-format documents (the Arsenal-era record) are ignored, and can be removed on request", async () => {
  const model = fakeModel();
  model.docs.push({ base: 10000, privateDef: { oneX: 5 } });          // the old record has no key
  const c = createBetkingController({ BetkingBase: model });
  assert.deepEqual((await call(c.getBase)).body, { exists: false });
  await call(c.updateBase, { body: { state: goodState(), baseVersion: 0 } });
  const refused = await call(c.deleteBase);
  assert.equal(refused.status, 400, "deleting needs ?confirm=yes");
  const done = await call(c.deleteBase, { query: { confirm: "yes", legacy: "yes" } });
  assert.equal(done.body.legacyDeleted, 1);
  assert.equal(model.docs.length, 0);
});

test("a body that is not a La Liga strategy state is refused", async () => {
  const c = createBetkingController({ BetkingBase: fakeModel() });
  const bad = await call(c.updateBase, { body: { state: { hello: "world" }, baseVersion: 0 } });
  assert.equal(bad.status, 400);
  assert.ok(bad.body.problems.length >= 3);
  assert.deepEqual(validateState(goodState()), []);
});

test("the sync key is required: server setting missing = 503, wrong key = 401, right key passes", () => {
  const run = (key, header) => {
    const saved = process.env.LALIGA_SYNC_KEY;
    if (key === undefined) delete process.env.LALIGA_SYNC_KEY; else process.env.LALIGA_SYNC_KEY = key;
    let outcome = "passed";
    const res = { status(code) { outcome = code; return this; }, json() {} };
    verifyBetkingKey({ get: () => header }, res, () => {});
    if (saved === undefined) delete process.env.LALIGA_SYNC_KEY; else process.env.LALIGA_SYNC_KEY = saved;
    return outcome;
  };
  assert.equal(run(undefined, "anything"), 503);
  assert.equal(run("secret-key", undefined), 401);
  assert.equal(run("secret-key", "wrong"), 401);
  assert.equal(run("secret-key", "secret-key"), "passed");
});
