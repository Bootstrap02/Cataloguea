function createFaultInjector(failures = {}) {
  const plans = new Map();
  const calls = new Map();

  for (const [phase, plan] of Object.entries(failures)) {
    plans.set(phase, {
      remaining: plan.times ?? 1,
      error: plan.error || new Error(`Injected ${phase} failure.`),
    });
  }

  return {
    hit(phase) {
      calls.set(phase, (calls.get(phase) || 0) + 1);
      const plan = plans.get(phase);
      if (plan && plan.remaining > 0) {
        plan.remaining -= 1;
        throw plan.error;
      }
    },
    calls(phase) {
      return calls.get(phase) || 0;
    },
  };
}

module.exports = { createFaultInjector };
