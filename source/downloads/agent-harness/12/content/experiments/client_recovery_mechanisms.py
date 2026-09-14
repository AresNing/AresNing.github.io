"""Controlled counterexamples, plus exact Rust function extraction. No model or product launch."""
from pathlib import Path
import hashlib, json, subprocess, tempfile
ROOT = Path(__file__).resolve().parents[1]
results=[]
def check(name, run):
    try: results.append(dict(name=name,passed=True,observation=run()))
    except Exception as e: results.append(dict(name=name,passed=False,error=str(e)))

def snapshot_race():
    snapshot={'version':1,'text':'A','done':False}
    # Snapshot response is delayed while later complete state reaches the client.
    latest={'version':2,'text':'AB','done':True}
    naive=dict(latest);naive.update(snapshot)
    safe=dict(latest)
    if snapshot['version']>safe['version']: safe.update(snapshot)
    assert naive['text']=='A' and not naive['done'] and safe['done']
    return {'naive':naive,'versionGuard':safe,'scope':'author-designed full-state version contract'}
check('12-design-delayed-snapshot-must-not-regress-completion',snapshot_race)

def delta_race():
    # Source buffers before taking cut=2. Snapshot already includes both deltas.
    events=[(1,'A'),(2,'B'),(3,'C'),(3,'C')]
    text='AB';last=2
    for seq,delta in events:
        if seq<=last: continue
        assert seq==last+1
        text+=delta;last=seq
    assert text=='ABC'
    naive='AB'+''.join(d for _,d in events)
    assert naive=='ABABCC'
    return {'cut':2,'naiveText':naive,'cutAndDenseCursorText':text}
check('12-design-buffer-cut-and-duplicate-delta',delta_race)

def paging():
    descending=[5,4,3,2,1,0];page1=descending[:3]
    now=[6]+descending
    offset_page2=now[3:6]
    bounded=[x for x in now if x<=5 and x<min(page1)][:3]
    assert set(page1)&set(offset_page2)=={3}
    assert page1+bounded==descending
    return {'offsetPages':[page1,offset_page2],'stablePrefixPages':[page1,bounded],'assumption':'append-only numbered log; not mutable item versions'}
check('12-design-pagination-append-between-pages',paging)

def completion():
    server={'operationId':'op-1','state':'completed','result':'AB','version':7}
    submissions=1;view={'state':'running'}
    # done notification lost; reconnect asks about the same operation.
    view.update(server)
    assert submissions==1 and view['state']=='completed'
    retained_from=5;client_cursor=2
    fallback=server if client_cursor<retained_from else None
    assert fallback['result']=='AB'
    return {'submissions':submissions,'confirmation':'read same operation','historyExpired':True,'resultRecovered':True,'intermediateTimelineRecovered':False,'scope':'author-designed retained result independent from short event log'}
check('12-design-lost-completion-and-expired-history',completion)

def costs():
    # Exact payload accounting for synthetic ASCII JSON, not latency or product benchmark.
    events=[{'seq':i,'text':'x'*80} for i in range(10000)]
    size=lambda x:len(json.dumps(x,separators=(',',':')).encode())
    full=size(events);tail=size(events[-100:]);snapshot=size({'cursor':9999,'text':'x'*800000})
    assert full>tail*90
    return {'events':10000,'tailEvents':100,'fullJsonBytes':full,'tailJsonBytes':tail,'fullTextSnapshotBytes':snapshot,'meaning':'fewer records does not guarantee small full-text snapshot; no transport/compression timing'}
check('12-design-payload-accounting',costs)

def extract(path, signature):
    s=(ROOT/path).read_text();start=s.index(signature);op=s.index('{',start);depth=1;i=op+1
    while depth:
        if s[i]=='{':depth+=1
        elif s[i]=='}':depth-=1
        i+=1
    return s[start:i], {'path':path,'start':s[:start].count('\n')+1,'end':s[:i].count('\n')+1,'file_sha256':hashlib.sha256(s.encode()).hexdigest()}

def rust_functions():
    cursor,c=extract('research/repos/codex/codex-rs/tui/src/app_server_session/history.rs','fn advancing_cursor(')
    water,g=extract('research/repos/grok/crates/codegen/xai-grok-pager/src/app/agent_view/session.rs','pub(crate) fn advance_last_seen_event_id(')
    counter,h=extract('research/repos/grok/crates/codegen/xai-grok-pager/src/acp/meta.rs','pub fn event_id_counter(')
    harness='use std::collections::HashSet;\n'+cursor+'\nmod acp { pub mod meta { '+counter+' }}\n#[derive(Default)] struct View {last_seen_event_id:Option<String>,last_seen_event_seq:Option<u64>}\nimpl View{'+water+'}\n'
    harness+='''fn main(){
      let mut seen=HashSet::new();
      assert_eq!(advancing_cursor(Some("a"),Some("b".into()),&mut seen),Some("b".into()));
      assert_eq!(advancing_cursor(Some("b"),Some("a".into()),&mut seen),None);
      let mut v=View::default();v.advance_last_seen_event_id("s-2".into(),Some(2));
      v.advance_last_seen_event_id("s-5".into(),Some(5));
      assert_eq!(v.last_seen_event_seq,Some(5)); // Missing 3/4 is not tracked by this function.
      v.advance_last_seen_event_id("s-3".into(),Some(3));assert_eq!(v.last_seen_event_seq,Some(5));
      v.advance_last_seen_event_id("s-opaque".into(),None);assert_eq!(v.last_seen_event_seq,Some(5));
      println!("exact functions: cursor cycle stops; max watermark is not contiguous ACK");
    }'''
    with tempfile.TemporaryDirectory(prefix='recovery-functions-') as d:
        p=Path(d);(p/'main.rs').write_text(harness)
        subprocess.run(['rustc','--edition=2021',str(p/'main.rs'),'-o',str(p/'check')],check=True,capture_output=True,timeout=30)
        out=subprocess.check_output([str(p/'check')],text=True,timeout=5).strip()
    return {'sources':[c,g,h],'output':out,'scope':'unmodified extracted functions, synthetic container; not Rust workspace build, real pager or server'}
check('12-extracted-codex-cursor-and-grok-watermark',rust_functions)
(ROOT/'evidence/client-recovery-mechanism-results.json').write_text(json.dumps({'date':'2026-09-14','scope':'Five author-designed scenarios and one exact-function Rust harness with two original mechanisms. No full product or network/disk test.', 'outcomes':results},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'passed':sum(x['passed'] for x in results),'total':len(results),'failures':[x for x in results if not x['passed']]},ensure_ascii=False))
raise SystemExit(0 if all(x['passed'] for x in results) else 1)
