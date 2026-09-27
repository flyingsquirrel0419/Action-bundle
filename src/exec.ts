/** Shared shell-command execution with streaming stdio and manual timeout. */

import { spawn } from "node:child_process";

export interface RunShellOptions {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  /** Max milliseconds the command may run before SIGTERM. */
  timeoutMs?: number;
  /** Grace period between SIGTERM and SIGKILL when terminating a group. Default 5s. */
  killGraceMs?: number;
}

/** Default grace period between SIGTERM and SIGKILL when terminating a group. */
const DEFAULT_KILL_GRACE_MS = 5000;

/**
 * Run a shell command via `sh -c` with stdio inherited (logs stream live,
 * no output buffering). Resolves on exit code 0; rejects with an Error
 * describing a non-zero exit, a signal kill, a timeout, or a spawn failure.
 *
 * The child runs in its own process group (detached) so termination reaches
 * the whole group — signalling only `sh` would orphan its children, which
 * can hold the parent's stdout pipe open and stall the surrounding process.
 */
export function runShell(command: string, opts: RunShellOptions = {}): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn("sh", ["-c", command], {
      env: opts.env ?? process.env,
      cwd: opts.cwd ?? process.cwd(),
      stdio: "inherit",
      detached: true,
    });
    let timedOut = false;
    let terminationRequested = false;
    let terminateAt = 0;
    let timeoutTimer: NodeJS.Timeout | undefined;
    let killTimer: NodeJS.Timeout | undefined;

    const groupSignal = (signal: NodeJS.Signals): void => {
      if (child.pid === undefined) {
        try {
          child.kill(signal);
        } catch {
          // already gone
        }
        return;
      }
      try {
        // Negative pid targets the child's whole process group.
        process.kill(-child.pid, signal);
      } catch {
        // ESRCH: the group is already gone — nothing to do.
      }
    };

    const groupAlive = (): boolean => {
      if (child.pid === undefined) return false;
      try {
        process.kill(-child.pid, 0);
        return true;
      } catch {
        return false;
      }
    };

    const armKillTimer = (ref: boolean): void => {
      if (killTimer !== undefined) return;
      const grace = opts.killGraceMs ?? DEFAULT_KILL_GRACE_MS;
      killTimer = setTimeout(function check() {
        if (!groupAlive()) {
          killTimer = undefined;
          return;
        }
        if (Date.now() - terminateAt >= grace) {
          groupSignal("SIGKILL");
          killTimer = undefined;
          return;
        }
        // Group still alive but grace not yet spent (e.g. sh exited on
        // SIGTERM while its children are mid-shutdown): re-probe shortly
        // instead of pinning the loop for the whole grace period.
        killTimer = setTimeout(check, 50);
        if (!ref) killTimer.unref();
      }, ref ? Math.min(50, grace) : grace);
      // Unref'd while the child handle already keeps the loop alive; a ref'd
      // timer after close must outlive this promise to reach stubborn groups.
      if (!ref) killTimer.unref();
    };

    /** Signal the whole group and arm SIGKILL escalation exactly once. */
    const terminate = (signal: NodeJS.Signals): void => {
      terminationRequested = true;
      terminateAt = Date.now();
      groupSignal(signal);
      armKillTimer(false);
    };

    if (opts.timeoutMs !== undefined) {
      timeoutTimer = setTimeout(() => {
        timedOut = true;
        terminate("SIGTERM");
      }, opts.timeoutMs);
    }

    // A detached group no longer receives terminal Ctrl-C or runner SIGTERM,
    // so forward them while the child runs. The parent's own termination is
    // not swallowed: the child's close path then rejects as usual.
    const forwardSigint = (): void => terminate("SIGINT");
    const forwardSigterm = (): void => terminate("SIGTERM");
    process.on("SIGINT", forwardSigint);
    process.on("SIGTERM", forwardSigterm);

    const detachListeners = (): void => {
      process.removeListener("SIGINT", forwardSigint);
      process.removeListener("SIGTERM", forwardSigterm);
    };

    const finish = (err?: Error): void => {
      if (err) rejectPromise(err);
      else resolvePromise();
    };
    child.on("error", (e) => {
      detachListeners();
      if (timeoutTimer !== undefined) clearTimeout(timeoutTimer);
      if (killTimer !== undefined) clearTimeout(killTimer);
      finish(new Error("failed to spawn command: " + e.message));
    });
    child.on("close", (code, signal) => {
      detachListeners();
      if (timeoutTimer !== undefined) clearTimeout(timeoutTimer);
      if (terminationRequested) {
        // sh exiting on SIGTERM says nothing about group members that ignore
        // it. Probe the group: gone -> cancel escalation; alive -> keep a
        // ref'd SIGKILL timer so survivors cannot outlive this process.
        if (groupAlive()) {
          if (killTimer !== undefined) {
            clearTimeout(killTimer);
            killTimer = undefined;
          }
          armKillTimer(true);
        } else if (killTimer !== undefined) {
          clearTimeout(killTimer);
          killTimer = undefined;
        }
      } else if (killTimer !== undefined) {
        clearTimeout(killTimer);
        killTimer = undefined;
      }
      if (timedOut) {
        finish(new Error("command timed out after " + opts.timeoutMs + "ms"));
      } else if (signal) {
        finish(new Error("command killed by signal " + signal));
      } else if (code !== 0) {
        finish(new Error("command exited with code " + code));
      } else {
        finish();
      }
    });
  });
}
