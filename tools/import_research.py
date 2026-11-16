"""One-time importer: splits the research atlases into one JSON file per capability.
Usage: python3 tools/import_research.py <research_dir> <repo_root>"""
import json, glob, os, re, sys
SRC, ROOT = sys.argv[1], sys.argv[2]
mob = json.load(open(f'{SRC}/mobile-capability-atlas-v2.merged.json'))
web = json.load(open(f'{SRC}/web-capability-atlas-v2.merged.json'))
DASH = re.compile('[–—]')
def clean(v):
    if isinstance(v, str): return DASH.sub(', ', v).replace(' ,', ',')
    if isinstance(v, list): return [clean(x) for x in v]
    if isinstance(v, dict): return {k: clean(x) for k, x in v.items() if not k.startswith('_')}
    return v
def load(pat, skip_parts=False):
    out = {}
    for f in sorted(glob.glob(pat)):
        if skip_parts and re.search(r'\.p\d+\.json$', f): continue
        for x in json.load(open(f)):
            if isinstance(x, dict) and x.get('id'): out[x['id']] = x
    return out
stories, limits = load(f'{SRC}/stories/out/*.json'), load(f'{SRC}/stories/bounds/*.json', True)
def story(i):
    s = stories.get(i)
    if not s: return None
    s = {k: v for k, v in s.items() if k != 'id'}
    s['marketing'] = [m for m in s.get('marketing') or [] if str(m.get('url','')).startswith('https://')]
    return s
def lim(i):
    b = limits.get(i)
    return {k: v for k, v in b.items() if k != 'id'} if b else None
SHARED = ['id','name','kind','group','subgroup','tags','plain','meaning','lifecycle']
def base(e):
    d = {k: e.get(k) for k in SHARED}
    return d
def tail(d, e):
    d.update({'data': e.get('data'), 'limits': lim(e['id']), 'story': story(e['id']), 'technical_bounds': e.get('bounds') or [],
              'scores': e.get('scores'), 'value': e.get('value'), 'case_study': {'linkedin': e.get('linkedin')} if e.get('linkedin') else None,
              'history': e.get('history') or [], 'related': e.get('related') or [], 'refs': e.get('refs') or [], 'confidence': e.get('confidence')})
    return {k: v for k, v in d.items() if v not in (None, [], {})}
n = 0
for e in mob['entries']:
    d = base(e); d['space'] = 'mobile'
    d['platforms'] = {'android': e.get('android'), 'ios': e.get('ios')}
    if e.get('web_equiv'): d['web_equivalents'] = e['web_equiv']
    d = clean(tail(d, e))
    p = f"{ROOT}/data/mobile/{e['group']}/{e['id'].removeprefix('mob.')}.json"
    os.makedirs(os.path.dirname(p), exist_ok=True); json.dump(d, open(p, 'w'), indent=2, ensure_ascii=False); open(p,'a').write('\n'); n += 1
for e in web['entries']:
    d = base(e); d['space'] = 'web'
    d['platforms'] = {'web': {k: e.get(k) for k in ['api','permission_name','permissions_policy','bcd','access','support'] if e.get(k) not in (None, '', [])}}
    d = clean(tail(d, e))
    p = f"{ROOT}/data/web/{e['group']}/{e['id'].removeprefix('web.')}.json"
    os.makedirs(os.path.dirname(p), exist_ok=True); json.dump(d, open(p, 'w'), indent=2, ensure_ascii=False); open(p,'a').write('\n'); n += 1
plat = {'built': '2026-11-15', 'mobile_os_share_pct': mob['os_share'], 'mobile_versions_share_pct': mob['versions'],
        'share_source': 'StatCounter Global Stats, October 2026', 'browser_data_source': f"@mdn/browser-compat-data {web.get('bcd_version','')}".strip()}
json.dump(plat, open(f'{ROOT}/data/platforms-share.json','w'), indent=2); print('wrote', n)
