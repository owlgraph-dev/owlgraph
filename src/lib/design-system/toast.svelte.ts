// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// An action's outcome with nowhere on screen to sit; a field's error is its
// FieldError, a lasting state an Alert. An error stays until dismissed (reading
// must not be timed), the rest leave after 5s; a repeat restarts its toast.
// A no-op outside the browser, where module state would be shared across requests.

export type ToastTone = 'danger' | 'warning' | 'info' | 'success';

export interface ToastAction {
  label: string;
  /** Runs, then the toast closes. */
  onClick: () => void;
}

export interface ToastOptions {
  action?: ToastAction;
  /** Milliseconds before it closes; `null` keeps it until dismissed. */
  duration?: number | null;
}

export interface ToastItem {
  readonly id: number;
  readonly tone: ToastTone;
  readonly message: string;
  readonly action?: ToastAction;
  readonly duration: number | null;
}

const TOAST_MAX_VISIBLE = 3;
const DEFAULT_DURATION = 5000;

class ToastStore {
  items = $state<ToastItem[]>([]);
  /** The Toaster's always-present live regions' text, cleared and re-set so a repeat is read again. */
  polite = $state('');
  assertive = $state('');

  #nextId = 1;
  #paused = false;
  #timers = new Map<number, { handle: ReturnType<typeof setTimeout> | null; remaining: number; startedAt: number }>();

  get visible(): ToastItem[] {
    return this.items.slice(0, TOAST_MAX_VISIBLE);
  }

  show(tone: ToastTone, message: string, options: ToastOptions = {}): number {
    if (typeof window === 'undefined') return 0;
    const duration = options.duration !== undefined ? options.duration : tone === 'danger' ? null : DEFAULT_DURATION;
    const existing = this.items.find((t) => t.tone === tone && t.message === message);
    if (existing) {
      const timer = this.#timers.get(existing.id);
      if (timer && existing.duration != null) {
        if (timer.handle) clearTimeout(timer.handle);
        this.#timers.delete(existing.id);
      }
      this.#announce(tone, message);
      this.#sync();
      return existing.id;
    }
    const id = this.#nextId++;
    this.items = [...this.items, { id, tone, message, action: options.action, duration }];
    this.#announce(tone, message);
    this.#sync();
    return id;
  }

  dismiss(id: number): void {
    const timer = this.#timers.get(id);
    if (timer?.handle) clearTimeout(timer.handle);
    this.#timers.delete(id);
    this.items = this.items.filter((t) => t.id !== id);
    this.#sync();
  }

  /** Stops every running timer, keeping what is left of each. */
  pause(): void {
    if (this.#paused) return;
    this.#paused = true;
    const now = Date.now();
    for (const timer of this.#timers.values()) {
      if (!timer.handle) continue;
      clearTimeout(timer.handle);
      timer.handle = null;
      timer.remaining = Math.max(0, timer.remaining - (now - timer.startedAt));
    }
  }

  resume(): void {
    if (!this.#paused) return;
    this.#paused = false;
    this.#sync();
  }

  // Starts the timer of every visible, timed toast that has none running.
  #sync(): void {
    if (this.#paused) return;
    for (const item of this.visible) {
      if (item.duration == null) continue;
      const timer = this.#timers.get(item.id) ?? { handle: null, remaining: item.duration, startedAt: 0 };
      if (timer.handle) continue;
      timer.startedAt = Date.now();
      timer.handle = setTimeout(() => this.dismiss(item.id), timer.remaining);
      this.#timers.set(item.id, timer);
    }
  }

  #announce(tone: ToastTone, message: string): void {
    const key = tone === 'danger' ? 'assertive' : 'polite';
    this[key] = '';
    setTimeout(() => (this[key] = message), 50);
  }
}

export const toaster = new ToastStore();

export const toast = {
  error: (message: string, options?: ToastOptions) => toaster.show('danger', message, options),
  warning: (message: string, options?: ToastOptions) => toaster.show('warning', message, options),
  info: (message: string, options?: ToastOptions) => toaster.show('info', message, options),
  success: (message: string, options?: ToastOptions) => toaster.show('success', message, options),
  dismiss: (id: number) => toaster.dismiss(id),
};
