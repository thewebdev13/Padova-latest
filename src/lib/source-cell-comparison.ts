// Compare the facts shared by old and new read-only captures. Rich formatting,
// validation and full raw payloads remain preserved separately, never discarded.
import { populated } from './source-field-coverage';
export function comparableSourceCells(cells: Record<string, any>[]) {
  const result = cells.map((cell) => {
    const value: Record<string, unknown> = {};
    for (const key of ['userEnteredValue', 'effectiveValue', 'note', 'hyperlink'])
      if (populated(cell?.[key])) value[key] = cell[key];
    if (
      !populated(cell?.userEnteredValue) &&
      !populated(cell?.effectiveValue) &&
      populated(cell?.formattedValue)
    )
      value.displayOnly = cell.formattedValue;
    return value;
  });
  while (result.length && !Object.keys(result.at(-1)!).length) result.pop();
  return result;
}
