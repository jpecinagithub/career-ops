/**
 * Security Code Relay
 * Lets the applier pause and wait for an email verification code
 * that Claude Code reads from Gmail and injects via POST /api/apply/security-code.
 */

const pendingCodes = new Map(); // requestId → { resolve, reject, timeout }

export function waitForSecurityCode(requestId, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingCodes.delete(requestId);
      reject(new Error(`Timeout esperando código de seguridad (${timeoutMs / 1000}s)`));
    }, timeoutMs);
    pendingCodes.set(requestId, { resolve, reject, timeout });
  });
}

export function injectSecurityCode(requestId, code) {
  const pending = pendingCodes.get(requestId);
  if (!pending) return false;
  clearTimeout(pending.timeout);
  pendingCodes.delete(requestId);
  pending.resolve(code.trim());
  return true;
}
