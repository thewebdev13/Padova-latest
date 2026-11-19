import type { CSSProperties } from 'react';

/** Position a dropdown as `position:fixed` under (or above) an input — avoids modal clip. */
export function fixedMenuStyleFromRect(
  rect: DOMRect,
  opts?: { minWidth?: number; maxMenuHeight?: number; zIndex?: number; gap?: number },
): CSSProperties {
  const gap = opts?.gap ?? 4;
  const zIndex = opts?.zIndex ?? 1200;
  const preferredMax = opts?.maxMenuHeight ?? 280;
  const width = Math.max(rect.width, opts?.minWidth ?? 220);
  let left = rect.left;
  if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);

  const spaceBelow = window.innerHeight - rect.bottom - 12;
  const spaceAbove = rect.top - 12;
  const openUp = spaceBelow < 140 && spaceAbove > spaceBelow;
  const available = Math.max(120, openUp ? spaceAbove : spaceBelow);
  const maxHeight = Math.min(preferredMax, available);

  if (openUp) {
    return {
      position: 'fixed',
      top: Math.max(8, rect.top - gap - maxHeight),
      left,
      width,
      maxHeight,
      zIndex,
      overflow: 'auto',
    };
  }
  return {
    position: 'fixed',
    top: rect.bottom + gap,
    left,
    width,
    maxHeight,
    zIndex,
    overflow: 'auto',
  };
}
