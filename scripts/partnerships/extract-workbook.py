"""Read-only lossless cell extraction for preserved source exports. Never saves a workbook."""
import sys, json, hashlib, datetime
from pathlib import Path
import openpyxl

source, destination = map(Path, sys.argv[1:3])
workbook = openpyxl.load_workbook(source, data_only=False, read_only=False)
cached = openpyxl.load_workbook(source, data_only=True, read_only=False)
def serial(value):
    return value.isoformat() if isinstance(value, (datetime.datetime, datetime.date, datetime.time)) else value
result = {'filename': source.name, 'sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'sheets': []}
for sheet in workbook:
    rows = []
    for row in sheet:
        cells = []
        for cell in row:
            if cell.value is None and cell.comment is None and cell.hyperlink is None:
                continue
            cells.append({'cell': cell.coordinate, 'column': cell.column, 'value': serial(cell.value),
                          'cached': serial(cached[sheet.title][cell.coordinate].value), 'type': cell.data_type,
                          'format': cell.number_format, 'note': cell.comment.text if cell.comment else None,
                          'hyperlink': cell.hyperlink.target if cell.hyperlink else None})
        if cells: rows.append({'row': row[0].row, 'cells': cells})
    result['sheets'].append({'name': sheet.title, 'state': sheet.sheet_state, 'max_row': sheet.max_row,
                             'max_column': sheet.max_column, 'rows': rows})
with destination.open('x', encoding='utf-8') as output:
    json.dump(result, output, ensure_ascii=False, separators=(',', ':'))
print(json.dumps({'sha256':result['sha256'], 'sheets':[{'name':s['name'],'rows':len(s['rows']),'state':s['state']} for s in result['sheets']]}))
