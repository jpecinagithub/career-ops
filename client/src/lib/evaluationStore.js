/**
 * evaluationStore — singleton that persists evaluation state across route changes.
 *
 * The Evaluator component mounts/unmounts as the user navigates, but the
 * evaluation stream must keep running regardless. This module holds the live
 * state and lets any component subscribe to updates.
 */

import { BASE, evaluateStream } from './api.js';

const listeners = new Set();

let state = {
  status: 'idle',       // 'idle' | 'streaming' | 'done' | 'error'
  report: '',
  jdText: '',
  url: '',
  error: null,
  abortFn: null,
};

function notify() {
  listeners.forEach(fn => fn({ ...state }));
}

export function getState() {
  return { ...state };
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function startEvaluation(jdText, url = '') {
  // Cancel any running evaluation first
  if (state.abortFn) {
    state.abortFn();
  }

  state = { status: 'streaming', report: '', jdText, url, error: null, abortFn: null };
  notify();

  const abortFn = evaluateStream(
    jdText,
    (chunk) => {
      state = { ...state, report: state.report + chunk };
      notify();
    },
    () => {
      state = { ...state, status: 'done', abortFn: null };
      notify();
    },
    (err) => {
      state = { ...state, status: 'error', error: err.message, abortFn: null };
      notify();
    }
  );

  state = { ...state, abortFn };
  // Don't notify here — component already has 'streaming' state
}

export function stopEvaluation() {
  if (state.abortFn) {
    state.abortFn();
    state = { ...state, status: 'done', abortFn: null };
    notify();
  }
}

export function clearEvaluation() {
  if (state.abortFn) state.abortFn();
  state = { status: 'idle', report: '', jdText: '', url: '', error: null, abortFn: null };
  notify();
}
