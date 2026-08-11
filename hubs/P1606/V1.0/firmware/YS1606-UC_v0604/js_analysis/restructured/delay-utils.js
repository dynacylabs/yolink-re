// Original webpack module: 9144
const delayMs = (ms) => new Promise((resolve) => setTimeout(() => resolve(), ms));

// Retries `fn` up to `attempts` times, waiting `options.interval`ms
// (default 2s) between tries, throwing once attempts are exhausted (with
// the last error attached via Error `cause`).
async function waitForTask(attempts, fn, options) {
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (--attempts <= 0) throw new Error("Retry times exceed", { cause: err });
      await delayMs(options?.interval ?? 2000);
    }
  }
}

module.exports = { delayMs, waitForTask };
