// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SolveClock } from './SolveClock';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function mountClock(props: React.ComponentProps<typeof SolveClock>) {
  const rootElement = document.createElement('div');
  document.body.append(rootElement);
  const root = createRoot(rootElement);
  const render = (current: React.ComponentProps<typeof SolveClock>) => {
    act(() => {
      root.render(<SolveClock {...current} />);
    });
  };
  render(props);
  const text = () => rootElement.querySelector('.solve-clock')?.textContent ?? '';
  const unmount = () => {
    act(() => root.unmount());
    rootElement.remove();
  };
  return { text, unmount };
}

describe('SolveClock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ticks on its own state without waiting for parent renders', () => {
    const start = Date.now();
    const clock = mountClock({ activeMs: 61_000, lastClockAtMs: start, lastInteractionAtMs: start, paused: false });
    expect(clock.text()).toBe('01:01');

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(clock.text()).toBe('01:03');
    clock.unmount();
  });

  it('freezes while paused', () => {
    const start = Date.now();
    const clock = mountClock({ activeMs: 30_000, lastClockAtMs: start, lastInteractionAtMs: start, paused: true });
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(clock.text()).toBe('00:30');
    clock.unmount();
  });

  it('freezes after the inactivity limit like the domain active-time rule', () => {
    const start = Date.now();
    const clock = mountClock({
      activeMs: 45_000,
      lastClockAtMs: start - 50_000,
      lastInteractionAtMs: start - 40_000,
      paused: false
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(clock.text()).toBe('00:45');
    clock.unmount();
  });

  it('renders hours once a solve runs long enough', () => {
    const start = Date.now();
    const clock = mountClock({ activeMs: 3_723_000, lastClockAtMs: start, lastInteractionAtMs: start, paused: false });
    expect(clock.text()).toBe('1:02:03');
    clock.unmount();
  });
});
