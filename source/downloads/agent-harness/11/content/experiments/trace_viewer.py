"""Offline, read-only Pi event viewer. Original event payloads are preserved."""
import argparse
import html
import json
from pathlib import Path

def load_trace(path):
    rows = []
    last = {}
    for line_number, line in enumerate(Path(path).read_text().splitlines(), 1):
        if not line.strip():
            continue
        row = json.loads(line)
        if not isinstance(row, dict) or not isinstance(row.get('raw'), dict):
            raise ValueError(f'line {line_number}: expected an envelope with raw object')
        scenario = row.get('scenario')
        seq = row.get('seq')
        if not isinstance(scenario, str) or type(seq) is not int or seq <= last.get(scenario, 0):
            raise ValueError(f'line {line_number}: invalid scenario or non-increasing seq')
        if not isinstance(row['raw'].get('type'), str):
            raise ValueError(f'line {line_number}: missing event type')
        last[scenario] = seq
        rows.append(row)
    if not rows:
        raise ValueError('trace is empty')
    return rows

def summarize_tools(rows):
    by_scenario = {}
    for row in rows:
        raw = row['raw']
        message = raw.get('message') if isinstance(raw.get('message'), dict) else {}
        call_id = raw.get('toolCallId') or message.get('toolCallId')
        if not isinstance(call_id, str) or not call_id:
            continue
        tools = by_scenario.setdefault(row['scenario'], {})
        tool = tools.setdefault(call_id, dict(id=call_id, starts=[], ends=[], messageEnds=[], flags=[]))
        if raw['type'] == 'tool_execution_start':
            tool['starts'].append(row['seq'])
        elif raw['type'] == 'tool_execution_end':
            tool['ends'].append(row['seq'])
            flag = raw.get('isError')
            tool['flags'].append('isError=true' if flag is True else 'isError=false' if flag is False else 'isError 未记录')
        elif raw['type'] == 'message_end' and message.get('role') == 'toolResult':
            tool['messageEnds'].append(row['seq'])
    return {scenario: list(tools.values()) for scenario, tools in by_scenario.items()}

def render(rows):
    payload = json.dumps(dict(rows=rows, toolsByScenario=summarize_tools(rows)), ensure_ascii=False).replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026')
    return TEMPLATE.replace('__PAYLOAD__', payload)

TEMPLATE = '''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Harness 执行轨迹 · Pi 源码实验</title>
<style>
:root{color-scheme:light;--ink:#162d36;--muted:#557079;--line:#cfdddf;--accent:#006b61}*{box-sizing:border-box}body{margin:0;background:#f5f7f4;color:var(--ink);font:16px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}header,main{max-width:1280px;margin:auto;padding:26px 32px}header{border-bottom:1px solid var(--line)}h1{font-size:32px;margin:5px 0}p{margin:8px 0;color:var(--muted)}.tag{font-size:12px;letter-spacing:2px;color:var(--accent)}.controls{display:flex;gap:20px;flex-wrap:wrap;margin:20px 0}label{font-size:13px;color:var(--muted)}select,input{display:block;padding:10px;border:1px solid var(--line);border-radius:7px;background:white;color:var(--ink);font:inherit}select{min-width:300px}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:20px 0}.stat{padding:16px;border:1px solid var(--line);background:white;border-radius:10px}.stat b{display:block;font-size:28px}.layout{display:grid;grid-template-columns:minmax(300px,1fr) minmax(320px,1fr);gap:20px}.panel{border:1px solid var(--line);border-radius:10px;background:white;padding:20px;min-width:0}h2{font-size:18px;margin:0 0 12px}.events{max-height:520px;overflow:auto}.event{display:block;text-align:left;width:100%;padding:10px 12px;margin:4px 0;background:#f4f7f7;border:1px solid transparent;border-radius:6px;color:var(--ink);cursor:pointer;font:14px/1.5 ui-monospace,monospace}.event:focus,.event:hover,.event.active{border-color:var(--accent);background:#e5f3ee}.event.error{border-left:4px solid #a43b32}.event small{display:block;color:var(--muted)}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.55 ui-monospace,monospace;max-height:520px;overflow:auto}table{width:100%;border-collapse:collapse;font-size:14px}th,td{padding:9px;border-bottom:1px solid var(--line);text-align:left}footer{margin-top:25px;color:var(--muted);font-size:13px}@media(max-width:780px){header,main{padding:20px}.layout{grid-template-columns:1fr}.stats{grid-template-columns:repeat(2,1fr)}select{min-width:220px}}
</style>
<header><div class="tag">AGENT HARNESS · SOURCE LAB</div><h1>从事件，看清一次执行</h1><p>Pi core 固定版本实验 · 只读、离线 · 保留原生事件和未知字段</p></header>
<main><div class="controls"><label>实验场景<select id="scenario"></select></label><label>筛选事件或工具 ID<input id="filter" placeholder="tool_execution / call ID"></label></div>
<div class="stats"><div class="stat">原始事件<b id="eventsCount"></b></div><div class="stat">内部 turn 结束<b id="turnCount"></b></div><div class="stat">工具结束<b id="toolCount"></b></div><div class="stat">Agent 结束事件<b id="endCount"></b></div></div>
<div class="layout"><section class="panel"><h2>事件顺序</h2><div class="events" id="events"></div></section><section class="panel"><h2>原始事件</h2><pre id="raw"></pre></section></div>
<section class="panel" style="margin-top:20px"><h2>工具关联</h2><table><thead><tr><th>call ID</th><th>开始序号</th><th>结束序号</th><th>toolResult 消息结束序号</th><th>原始错误标志</th></tr></thead><tbody id="tools"></tbody></table></section>
<footer>横轴是观察到的事件序号，不是耗时。缺失结束事件只表示这份记录未观察到，不推断实际工具仍在运行。同 ID 的多次观察全部保留，不推断 attempt 对应关系。消息结束不代表落盘或模型已读取；isError=false 不代表用户目标完成。合成模型用量为 0，不作成本或性能比较。</footer></main>
<script type="application/json" id="payload">__PAYLOAD__</script>
<script>
const {rows,toolsByScenario}=JSON.parse(document.getElementById('payload').textContent), select=document.getElementById('scenario'), filter=document.getElementById('filter');
for(const name of new Set(rows.map(x=>x.scenario))){const option=document.createElement('option');option.value=name;option.textContent=name;select.append(option)}
const byId=id=>document.getElementById(id);
function show(row,button){byId('raw').textContent=JSON.stringify(row,null,2);document.querySelectorAll('.event.active').forEach(x=>x.classList.remove('active'));button?.classList.add('active')}
function render(){const items=rows.filter(x=>x.scenario===select.value);byId('eventsCount').textContent=items.length;byId('turnCount').textContent=items.filter(x=>x.raw.type==='turn_end').length;byId('toolCount').textContent=items.filter(x=>x.raw.type==='tool_execution_end').length;byId('endCount').textContent=items.filter(x=>x.raw.type==='agent_end').length;byId('events').replaceChildren();byId('raw').textContent='选择事件查看原始字段';let first;
for(const row of items){if(!JSON.stringify(row.raw).toLowerCase().includes(filter.value.toLowerCase()))continue;const button=document.createElement('button');button.className='event'+(row.raw.isError?' error':'');button.textContent=String(row.seq).padStart(3,'0')+'  '+row.raw.type;const id=row.raw.toolCallId??row.raw.message?.toolCallId;if(id){const small=document.createElement('small');small.textContent='call '+id;button.append(small)}button.onclick=()=>show(row,button);byId('events').append(button);if(!first)first={row,button}}
if(first)show(first.row,first.button);
byId('tools').replaceChildren();for(const t of (Object.hasOwn(toolsByScenario,select.value)?toolsByScenario[select.value]:[])){const tr=document.createElement('tr');for(const field of ['id','starts','ends','messageEnds','flags']){const td=document.createElement('td');const value=t[field];td.textContent=Array.isArray(value)?(value.length?value.join(', '):'未观察'):value;tr.append(td)}byId('tools').append(tr)}}
select.onchange=render;filter.oninput=render;render();
</script></html>'''

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('input', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    rows = load_trace(args.input)
    args.output.write_text(render(rows))
    print(f'Rendered {len(rows)} original events to {args.output}')
