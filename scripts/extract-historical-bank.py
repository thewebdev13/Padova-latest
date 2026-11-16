"""Read original bank PDFs; preserve page text and file hashes in a new private artifact."""
import hashlib, json, pathlib, sys
from pypdf import PdfReader
source=pathlib.Path(sys.argv[1]); destination=pathlib.Path(sys.argv[2])
if destination.exists(): raise RuntimeError('Never replace an existing extraction')
result=[]
for file in sorted(source.glob('*.pdf')):
    reader=PdfReader(file)
    result.append({'file':file.name,'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'pages':[{'page':i+1,'text':page.extract_text() or ''} for i,page in enumerate(reader.pages)]})
destination.parent.mkdir(parents=True,exist_ok=True)
destination.write_text(json.dumps(result),encoding='utf-8')
print(json.dumps({'files':len(result),'pages':sum(len(r['pages']) for r in result),'readOnly':True}))
