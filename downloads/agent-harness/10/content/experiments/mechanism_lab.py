"""Independent failure demonstrations. These are NOT implementations of the four products."""
import json
import os
from pathlib import Path
import signal
import socket
import sqlite3
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]

def worker(directory, idempotent, crash):
    directory = Path(directory)
    db = sqlite3.connect(directory/'effects.sqlite')
    db.execute('create table if not exists effects (id integer primary key, operation text)')
    if idempotent:
        db.execute('create unique index if not exists once_only on effects(operation)')
        db.execute('insert or ignore into effects(operation) values (?)', ('op-1',))
    else:
        db.execute('insert into effects(operation) values (?)', ('op-1',))
    db.commit()
    if crash:
        os._exit(73)  # external effect is durable, harness result is not recorded
    (directory/'result.json').write_text('{"operation":"op-1","status":"done"}')

if len(sys.argv) > 1 and sys.argv[1] == 'worker':
    worker(sys.argv[2], sys.argv[3] == 'yes', sys.argv[4] == 'crash')
    sys.exit()

results = []
def check(name, fn):
    try:
        results.append(dict(name=name, passed=True, observation=fn()))
    except Exception as error:
        results.append(dict(name=name, passed=False, error=repr(error)))

def crash_window():
    observations = {}
    for idem in (False, True):
        with tempfile.TemporaryDirectory(prefix='harness-crash-') as folder:
            args = [sys.executable, __file__, 'worker', folder, 'yes' if idem else 'no']
            first = subprocess.run(args+['crash'])
            assert first.returncode == 73
            assert not (Path(folder)/'result.json').exists()
            subprocess.run(args+['finish'], check=True)
            db = sqlite3.connect(Path(folder)/'effects.sqlite')
            count = db.execute('select count(*) from effects').fetchone()[0]
            db.close()
            assert count == (1 if idem else 2)
            observations['idempotent' if idem else 'naive'] = count
    return observations

def cancel_children():
    # Two synthetic subprocesses contend for the same workspace marker. No model is launched.
    with tempfile.TemporaryDirectory(prefix='harness-child-') as folder:
        code = 'import sys,time; print("ready",flush=True); time.sleep(30); open(sys.argv[1],"a").write("late\\n")'
        children = [subprocess.Popen([sys.executable, '-c', code, str(Path(folder)/'shared.txt')], stdout=subprocess.PIPE, text=True, start_new_session=True) for _ in range(2)]
        try:
            for child in children:
                assert child.stdout.readline().strip() == 'ready'
            for child in children:
                os.killpg(child.pid, signal.SIGTERM)
            exits = [child.wait(timeout=5) for child in children]
            assert all(x != 0 for x in exits)
            assert not (Path(folder)/'shared.txt').exists()
            return dict(reapedChildren=2, lateWrites=0, exitCodes=exits)
        finally:
            for child in children:
                if child.poll() is None:
                    os.killpg(child.pid, signal.SIGKILL)
                    child.wait()
                child.stdout.close()

def reconnect():
    # Socket reconnect plus durable snapshot/cursor illustration, not an ACP/RPC conformance test.
    facts = [dict(seq=1, type='turn_started'), dict(seq=2, type='approval_pending', approvalId='a')]
    left, right = socket.socketpair()
    left.sendall(json.dumps(facts[0]).encode())
    observed = [json.loads(right.recv(4096))]
    left.close(); right.close()
    facts += [dict(seq=3, type='approval_denied', approvalId='a'), dict(seq=4, type='turn_completed', status='blocked')]
    left, right = socket.socketpair()
    left.sendall(json.dumps([x for x in facts if x['seq'] > observed[-1]['seq']]).encode())
    observed += json.loads(right.recv(4096))
    left.close(); right.close()
    # Replayed cursor overlaps must be deduplicated; terminal status must preserve blocked.
    dedup = {x['seq']: x for x in observed+facts[-2:]}
    assert len(dedup) == 4
    assert dedup[4]['status'] == 'blocked'
    return dict(eventsRecovered=4, duplicateEventsDropped=2, finalStatus='blocked', pendingApproval=False)

def permission_mutation():
    def execute(allowed, defective=False):
        effects = []
        if allowed or defective:
            effects.append('write')
        return effects
    assert execute(False) == []
    mutant_detected = execute(False, defective=True) != []
    assert mutant_detected
    return dict(denyBlocksEffect=True, intentionalPermissionBugDetected=True)

check('06-effect-before-result-crash', crash_window)
check('08-cancel-and-reap-two-processes', cancel_children)
check('09-disconnect-snapshot-cursor', reconnect)
check('10-semantic-mutation-check', permission_mutation)
(ROOT/'evidence/mechanism-results.json').write_text(json.dumps(dict(scope='independent teaching prototypes; not product acceptance', runtime=sys.version.split()[0], outcomes=results), indent=2)+'\n')
print(json.dumps(dict(passed=sum(x['passed'] for x in results), total=len(results), failures=[x for x in results if not x['passed']]), indent=2))
if not all(x['passed'] for x in results):
    sys.exit(1)
