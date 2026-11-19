import test from 'node:test';
import assert from 'node:assert/strict';
import { fixedMenuStyleFromRect } from '../src/lib/fixed-menu-style';

function withViewport(innerWidth: number, innerHeight: number, run: () => void) {
  const previous = (globalThis as { window?: Window }).window;
  (globalThis as { window: Partial<Window> }).window = { innerWidth, innerHeight } as Window;
  try {
    run();
  } finally {
    if (previous) (globalThis as { window: Window }).window = previous;
    else delete (globalThis as { window?: Window }).window;
  }
}

test('fixed menu opens below when there is room', () => {
  withViewport(1200, 900, () => {
    const style = fixedMenuStyleFromRect({
      top: 100,
      bottom: 140,
      left: 40,
      width: 300,
      height: 40,
      right: 340,
      x: 40,
      y: 100,
      toJSON() {
        return {};
      },
    } as DOMRect);
    assert.equal(style.position, 'fixed');
    assert.equal(style.top, 144);
    assert.ok(Number(style.maxHeight) >= 120);
  });
});

test('fixed menu opens upward near the bottom of the viewport', () => {
  withViewport(1000, 700, () => {
    const style = fixedMenuStyleFromRect({
      top: 620,
      bottom: 660,
      left: 20,
      width: 280,
      height: 40,
      right: 300,
      x: 20,
      y: 620,
      toJSON() {
        return {};
      },
    } as DOMRect);
    assert.equal(style.position, 'fixed');
    assert.ok(Number(style.top) < 620);
  });
});
