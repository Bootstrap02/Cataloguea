const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createResultId } = require('../result/resultIdentity');

const STORE_VERSION = 1;
const DEFAULT_STORE_PATH = path.join(__dirname, '..', 'runtime', 'run-state.json');
const OPERATION_STATUSES = new Set(['confirmed', 'failed', 'uncertain', 'unknown']);
const SETTLEMENT_QUEUES = new Map();
const MUTATION_QUEUES = new Map();
const MUTATING_METHODS = [
  'recordTransition',
  'recordResultObservation',
  'recordVerifiedResult',
  'recordEvent',
  'startOperation',
  'finishOperation',
  'beginOperation',
  'beginSettlement',
  'finishSettlement',
];

function serializeMutation(filePath, mutation) {
  const key = path.resolve(filePath);
  const previous = MUTATION_QUEUES.get(key) || Promise.resolve();
  const current = previous.then(mutation, mutation);
  const settled = current.then(() => undefined, () => undefined);
  MUTATION_QUEUES.set(key, settled);
  settled.then(() => {
    if (MUTATION_QUEUES.get(key) === settled) MUTATION_QUEUES.delete(key);
  });
  return current;
}

function createEmptyStore() {
  return {
    version: STORE_VERSION,
    updatedAt: null,
    checkpoint: null,
    operations: [],
    results: [],
    settlements: [],
    events: [],
  };
}

function validateStore(store) {
  if (
    !store
    || store.version !== STORE_VERSION
    || !Array.isArray(store.operations)
    || !Array.isArray(store.events)
    || (store.results !== undefined && !Array.isArray(store.results))
    || (store.settlements !== undefined && !Array.isArray(store.settlements))
    || (store.checkpoint !== null && typeof store.checkpoint !== 'object')
  ) {
    throw new Error('Automation run store has an unsupported or invalid format.');
  }
  store.results ||= [];
  store.settlements ||= [];
  return store;
}

function sanitizeSettlementOutcome(outcome) {
  const sanitized = { ...outcome };
  if (outcome.strategyState) {
    sanitized.strategyState = {
      status: typeof outcome.strategyState.status === 'string'
        ? outcome.strategyState.status
        : 'updated',
      resultId: outcome.resultId || null,
    };
  }
  return sanitized;
}

class RunStore {
  constructor({
    filePath = DEFAULT_STORE_PATH,
    clock = () => new Date().toISOString(),
    idFactory = randomUUID,
  } = {}) {
    this.filePath = filePath;
    this.clock = clock;
    this.idFactory = idFactory;
    for (const methodName of MUTATING_METHODS) {
      const implementation = this[methodName].bind(this);
      this[methodName] = (...args) => serializeMutation(
        this.filePath,
        () => implementation(...args),
      );
    }
  }

  async read() {
    let contents;
    try {
      contents = await fs.readFile(this.filePath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') {
        return createEmptyStore();
      }
      throw new Error(`Reading automation run store failed: ${error.message}`, {
        cause: error,
      });
    }

    let store;
    try {
      store = JSON.parse(contents);
    } catch (error) {
      throw new Error(`Parsing automation run store failed: ${error.message}`, {
        cause: error,
      });
    }
    return validateStore(store);
  }

  async snapshot() {
    const store = await this.read();
    return JSON.parse(JSON.stringify(store));
  }

  async recordTransition(runId, { from, to }) {
    const store = await this.read();
    const timestamp = this.clock();
    store.checkpoint = {
      ...(store.checkpoint?.runId === runId ? store.checkpoint : {}),
      runId,
      state: to,
      step: to,
      updatedAt: timestamp,
    };
    store.events.push({
      id: this.idFactory(),
      runId,
      timestamp,
      type: 'state_transition',
      from,
      to,
    });
    await this.write(store);
  }

  async recordResultObservation(runId, {
    operationId,
    fixture,
    status,
    observation = null,
  }) {
    if (!['pending', 'rejected'].includes(status)) {
      throw new Error(`Invalid result observation status: ${status}`);
    }
    const store = await this.read();
    const timestamp = this.clock();
    store.checkpoint = {
      ...(store.checkpoint?.runId === runId ? store.checkpoint : {}),
      runId,
      operationId,
      fixture: { ...fixture },
      resultObservationStatus: status,
      resultObservation: observation,
      updatedAt: timestamp,
    };
    store.events.push({
      id: this.idFactory(),
      runId,
      timestamp,
      type: 'result_observed',
      operationId,
      fixture: { ...fixture },
      status,
      observation,
    });
    await this.write(store);
    return { status, timestamp };
  }

  async recordVerifiedResult(runId, { operationId, normalizedResult }) {
    if (
      normalizedResult?.status !== 'verified'
      || !normalizedResult.fixture?.id
      || !Number.isSafeInteger(normalizedResult.result?.homeScore)
      || normalizedResult.result.homeScore < 0
      || !Number.isSafeInteger(normalizedResult.result?.awayScore)
      || normalizedResult.result.awayScore < 0
    ) {
      throw new Error('Only a complete, verified normalized result can be persisted.');
    }

    const store = await this.read();
    if (typeof operationId !== 'string' || operationId.length === 0) {
      throw new Error('A confirmed action operation ID is required to persist a verified result.');
    }
    const actionOperation = store.operations.find(
      (operation) => operation.id === operationId && operation.runId === runId,
    );
    if (!actionOperation || actionOperation.status !== 'confirmed') {
      throw new Error('A verified result must be linked to a confirmed action operation in this run.');
    }
    const { fixture, result } = normalizedResult;
    const resultId = createResultId(normalizedResult, operationId);
    const resultForOperation = store.results.find(
      (entry) => entry.operationId === operationId && entry.runId === runId,
    );
    if (
      resultForOperation
      && (
        resultForOperation.fixture?.id !== fixture.id
        || resultForOperation.fixture?.home !== fixture.home
        || resultForOperation.fixture?.away !== fixture.away
        || resultForOperation.result?.homeScore !== result.homeScore
        || resultForOperation.result?.awayScore !== result.awayScore
      )
    ) {
      throw new Error('A confirmed action operation cannot be linked to conflicting verified results.');
    }
    const existing = store.results.find(({ id }) => id === resultId) || resultForOperation;
    const timestamp = this.clock();
    const disposition = existing ? 'already_known' : 'recorded';
    if (!existing) {
      store.results.push({
        id: resultId,
        runId,
        operationId,
        fixture: { ...fixture },
        result: { ...result },
        status: 'verified',
        source: normalizedResult.source,
        timestamp: normalizedResult.timestamp,
        recordedAt: timestamp,
      });
    }
    store.checkpoint = {
      ...(store.checkpoint?.runId === runId ? store.checkpoint : {}),
      runId,
      operationId,
      fixture: { ...fixture },
      resultObservationStatus: 'verified',
      normalizedResult: { ...normalizedResult, fixture: { ...fixture }, result: { ...result } },
      resultDisposition: disposition,
      updatedAt: timestamp,
    };
    store.events.push({
      id: this.idFactory(),
      runId,
      timestamp,
      type: existing ? 'duplicate_result_observed' : 'result_verified',
      resultId,
      operationId,
      fixture: { ...fixture },
      disposition,
    });
    await this.write(store);
    return { disposition, resultId, result: existing || store.results.at(-1) };
  }

  async recordEvent(runId, type, details = {}) {
    const store = await this.read();
    store.events.push({
      id: this.idFactory(),
      runId,
      timestamp: this.clock(),
      type,
      ...details,
    });
    await this.write(store);
  }

  async startOperation(runId, name, details = {}) {
    const store = await this.read();
    const timestamp = this.clock();
    const operationId = this.idFactory();
    if (
      typeof operationId !== 'string'
      || operationId.length === 0
      || store.operations.some(({ id }) => id === operationId)
    ) {
      throw new Error('Operation ID factory returned an invalid or duplicate operation ID.');
    }
    const operation = {
      id: operationId,
      runId,
      name,
      status: 'pending',
      startedAt: timestamp,
      updatedAt: timestamp,
      details,
    };
    store.operations.push(operation);
    store.events.push({
      id: this.idFactory(),
      runId,
      timestamp,
      type: 'operation_started',
      operationId: operation.id,
      operation: name,
    });
    await this.write(store);
    return { ...operation, details: { ...details } };
  }

  async finishOperation(runId, operationId, status, details = {}) {
    if (!OPERATION_STATUSES.has(status)) {
      throw new Error(`Invalid operation status: ${status}`);
    }

    const store = await this.read();
    const operation = store.operations.find(
      (candidate) => candidate.id === operationId && candidate.runId === runId,
    );
    if (!operation) {
      throw new Error(`Operation ${operationId} was not found for run ${runId}.`);
    }
    if (!['pending', 'executing'].includes(operation.status)) {
      throw new Error(`Operation ${operationId} is already ${operation.status}.`);
    }

    const timestamp = this.clock();
    operation.status = status;
    operation.updatedAt = timestamp;
    operation.outcome = details;
    store.events.push({
      id: this.idFactory(),
      runId,
      timestamp,
      type: 'operation_finished',
      operationId,
      status,
      ...details,
    });
    await this.write(store);
    return { ...operation, outcome: { ...details } };
  }

  async beginOperation(runId, operationId) {
    const store = await this.read();
    const operation = store.operations.find(
      (candidate) => candidate.id === operationId && candidate.runId === runId,
    );
    if (!operation) {
      throw new Error(`Operation ${operationId} was not found for run ${runId}.`);
    }
    if (operation.status !== 'pending') {
      throw new Error(`Operation ${operationId} cannot execute from ${operation.status}.`);
    }

    const timestamp = this.clock();
    operation.status = 'executing';
    operation.updatedAt = timestamp;
    store.events.push({
      id: this.idFactory(),
      runId,
      timestamp,
      type: 'operation_executing',
      operationId,
    });
    await this.write(store);
    return { ...operation, details: { ...operation.details } };
  }

  async beginSettlement(runId, request) {
      const begin = async () => {
        const store = await this.read();
        const legacyResultId = createResultId(request.normalizedResult);
        const result = store.results.find(({ id, operationId }) => (
          id === request.resultId
          || (id === legacyResultId && operationId === request.actionOperationId)
        ));
        if (
          !result
          || result.status !== 'verified'
          || result.operationId !== request.actionOperationId
          || result.fixture?.id !== request.fixture?.id
          || result.fixture?.home !== request.fixture?.home
          || result.fixture?.away !== request.fixture?.away
          || result.result?.homeScore !== request.result?.homeScore
          || result.result?.awayScore !== request.result?.awayScore
        ) {
          throw new Error('Settlement requires the persisted verified result and its confirmed action.');
        }

        const existing = store.settlements.find((settlement) => (
          settlement.resultId === request.resultId
          || (
            settlement.actionOperationId === request.actionOperationId
            && settlement.resultId === result.id
          )
        ));
        if (existing?.status === 'confirmed') {
          const timestamp = this.clock();
          store.checkpoint = {
            ...(store.checkpoint?.runId === runId ? store.checkpoint : {}),
            runId,
            resultId: request.resultId,
            actionOperationId: existing.actionOperationId,
            settlementOperationId: existing.settlementOperationId,
            settlementStatus: 'confirmed',
            strategyState: existing.outcome?.strategyState || null,
            updatedAt: timestamp,
          };
          store.events.push({
            id: this.idFactory(),
            runId,
            timestamp,
            type: 'settlement_already_confirmed',
            resultId: request.resultId,
            actionOperationId: existing.actionOperationId,
            settlementOperationId: existing.settlementOperationId,
          });
          await this.write(store);
          return { disposition: 'already_settled', settlement: existing };
        }
        if (existing?.status === 'unknown' || existing?.status === 'executing') {
          if (existing.status === 'executing') {
            const timestamp = this.clock();
            existing.status = 'unknown';
            existing.updatedAt = timestamp;
            existing.outcome = {
              reason: 'A prior settlement was executing without a persisted confirmation.',
            };
            const operation = store.operations.find(({ id }) => id === existing.settlementOperationId);
            if (operation?.status === 'executing') {
              operation.status = 'unknown';
              operation.updatedAt = timestamp;
              operation.outcome = existing.outcome;
            }
            store.events.push({
              id: this.idFactory(),
              runId,
              timestamp,
              type: 'settlement_marked_unknown',
              settlementOperationId: existing.settlementOperationId,
              resultId: request.resultId,
            });
            await this.write(store);
          }
          return { disposition: 'unknown', settlement: existing };
        }
        if (existing) {
          throw new Error(`Settlement for ${request.resultId} has invalid status "${existing.status}".`);
        }

        const actionOperation = store.operations.find(
          ({ id, runId: ownerRunId }) => id === request.actionOperationId && ownerRunId === result.runId,
        );
        if (!actionOperation || actionOperation.status !== 'confirmed') {
          throw new Error('Settlement action operation is not confirmed.');
        }
        const timestamp = this.clock();
        const settlementOperationId = this.idFactory();
        if (
          typeof settlementOperationId !== 'string'
          || settlementOperationId.length === 0
          || store.operations.some(({ id }) => id === settlementOperationId)
        ) {
          throw new Error('Operation ID factory returned an invalid or duplicate settlement operation ID.');
        }
        const operation = {
          id: settlementOperationId,
          runId,
          name: 'cataloguea_strategy_settlement',
          status: 'pending',
          startedAt: timestamp,
          updatedAt: timestamp,
          details: {
            resultId: request.resultId,
            actionOperationId: request.actionOperationId,
            fixture: request.fixture,
            result: request.result,
          },
        };
        const settlement = {
          resultId: request.resultId,
          runId,
          actionOperationId: request.actionOperationId,
          settlementOperationId,
          status: 'executing',
          startedAt: timestamp,
          updatedAt: timestamp,
        };
        store.operations.push(operation);
        store.settlements.push(settlement);
        store.events.push(
          {
            id: this.idFactory(),
            runId,
            timestamp,
            type: 'operation_started',
            operationId: settlementOperationId,
            operation: operation.name,
          },
          {
            id: this.idFactory(),
            runId,
            timestamp,
            type: 'operation_executing',
            operationId: settlementOperationId,
          },
          {
            id: this.idFactory(),
            runId,
            timestamp,
            type: 'settlement_started',
            resultId: request.resultId,
            actionOperationId: request.actionOperationId,
            settlementOperationId,
          },
        );
        operation.status = 'executing';
        store.checkpoint = {
          ...(store.checkpoint?.runId === runId ? store.checkpoint : {}),
          runId,
          resultId: request.resultId,
          actionOperationId: request.actionOperationId,
          settlementOperationId,
          settlementStatus: 'executing',
          updatedAt: timestamp,
        };
        await this.write(store);
        return { disposition: 'started', operation, settlement };
      };

      const queueKey = path.resolve(this.filePath);
      const currentQueue = SETTLEMENT_QUEUES.get(queueKey) || Promise.resolve();
      const queued = currentQueue.then(begin, begin);
      SETTLEMENT_QUEUES.set(queueKey, queued.then(() => undefined, () => undefined));
      return queued;
    }

  async finishSettlement(runId, resultId, status, outcome = {}) {
      if (!['confirmed', 'unknown'].includes(status)) {
        throw new Error(`Invalid settlement status: ${status}`);
      }
      if (!outcome || typeof outcome !== 'object' || Array.isArray(outcome)) {
        throw new TypeError('Settlement outcome must be an object.');
      }
      const store = await this.read();
      const settlement = store.settlements.find(
        (entry) => entry.resultId === resultId && entry.runId === runId,
      );
      if (!settlement) {
        throw new Error(`Settlement for ${resultId} was not found for run ${runId}.`);
      }
      if (settlement.status !== 'executing') {
        throw new Error(`Settlement for ${resultId} is already ${settlement.status}.`);
      }

      const timestamp = this.clock();
      settlement.status = status;
      settlement.updatedAt = timestamp;
      const persistedOutcome = sanitizeSettlementOutcome(outcome);
      settlement.outcome = persistedOutcome;
      const operation = store.operations.find(({ id }) => id === settlement.settlementOperationId);
      if (!operation || operation.status !== 'executing') {
        throw new Error(`Settlement operation ${settlement.settlementOperationId} is not executing.`);
      }
      operation.status = status;
      operation.updatedAt = timestamp;
      operation.outcome = persistedOutcome;
      store.checkpoint = {
        ...(store.checkpoint?.runId === runId ? store.checkpoint : {}),
        runId,
        resultId,
        actionOperationId: settlement.actionOperationId,
        settlementOperationId: settlement.settlementOperationId,
        settlementStatus: status,
        strategyState: persistedOutcome.strategyState || null,
        updatedAt: timestamp,
      };
      store.events.push({
        id: this.idFactory(),
        runId,
        timestamp,
        type: status === 'confirmed' ? 'settlement_confirmed' : 'settlement_unknown',
        resultId,
        actionOperationId: settlement.actionOperationId,
        settlementOperationId: settlement.settlementOperationId,
        ...persistedOutcome,
      });
      await this.write(store);
      return { ...settlement, outcome: persistedOutcome };
  }

  async write(store) {
    store.updatedAt = this.clock();
    const directory = path.dirname(this.filePath);
    const temporaryPath = `${this.filePath}.${process.pid}.${this.idFactory()}.tmp`;
    await fs.mkdir(directory, { recursive: true });
    let temporaryFileCreated = false;
    try {
      const file = await fs.open(temporaryPath, 'wx', 0o600);
      temporaryFileCreated = true;
      try {
        await file.writeFile(`${JSON.stringify(store, null, 2)}\n`, 'utf8');
        await file.sync();
      } finally {
        await file.close();
      }
      await fs.rename(temporaryPath, this.filePath);
    } catch (error) {
      if (temporaryFileCreated) {
        try {
          await fs.rm(temporaryPath, { force: true });
        } catch (cleanupError) {
          throw new AggregateError(
            [error, cleanupError],
            `Writing automation run store failed and temporary-file cleanup failed: ${error.message}`,
          );
        }
      }
      throw new Error(`Writing automation run store failed: ${error.message}`, {
        cause: error,
      });
    }
  }
}

module.exports = { DEFAULT_STORE_PATH, RunStore };
