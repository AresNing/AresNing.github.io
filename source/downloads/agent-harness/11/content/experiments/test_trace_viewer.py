import json
from pathlib import Path
import tempfile
import unittest
from trace_viewer import load_trace, render, summarize_tools

class ViewerTest(unittest.TestCase):
    def read_rows(self, rows):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)/'trace.jsonl'
            path.write_text('\n'.join(json.dumps(x) for x in rows))
            return load_trace(path)

    def test_unknown_payload_is_preserved(self):
        row = dict(scenario='s', seq=1, raw=dict(type='future_event', unknown={'nested': [1, 2]}))
        self.assertEqual(self.read_rows([row]), [row])

    def test_script_payload_cannot_escape_json_element(self):
        document = render([dict(scenario='s', seq=1, raw=dict(type='x', text='</script><script>alert(1)</script>'))])
        self.assertNotIn('</script><script>alert(1)', document)
        self.assertIn('\\u003c/script\\u003e', document)

    def test_duplicate_seq_rejected(self):
        row = dict(scenario='s', seq=1, raw=dict(type='x'))
        with self.assertRaises(ValueError):
            self.read_rows([row, row])

    def test_scenarios_have_independent_sequence(self):
        rows = [dict(scenario=s, seq=1, raw=dict(type='x')) for s in ['a', 'b']]
        self.assertEqual(self.read_rows(rows), rows)

    def test_missing_raw_rejected(self):
        with self.assertRaises(ValueError):
            self.read_rows([dict(scenario='s', seq=1)])

    def test_repeated_call_observations_are_not_overwritten(self):
        rows = [dict(scenario='s', seq=n, raw=dict(type=t, toolCallId='same')) for n,t in [(1,'tool_execution_start'),(2,'tool_execution_end'),(3,'tool_execution_start'),(4,'tool_execution_end')]]
        result = summarize_tools(rows)['s'][0]
        self.assertEqual(result['starts'], [1,3])
        self.assertEqual(result['ends'], [2,4])
        self.assertEqual(result['flags'], ['isError 未记录','isError 未记录'])

    def test_error_flag_is_not_inferred_from_missing_or_truthy_value(self):
        rows = [dict(scenario='s', seq=n+1, raw=dict(type='tool_execution_end',toolCallId='a',isError=flag)) for n,flag in enumerate([True,False,None,'false'])]
        self.assertEqual(summarize_tools(rows)['s'][0]['flags'], ['isError=true','isError=false','isError 未记录','isError 未记录'])

    def test_message_boundary_and_execution_boundary_stay_separate(self):
        rows = [dict(scenario='s',seq=1,raw=dict(type='message_end',message=dict(role='toolResult',toolCallId='a')))]
        result = summarize_tools(rows)['s'][0]
        self.assertEqual(result['messageEnds'],[1])
        self.assertEqual(result['ends'],[])
        self.assertEqual(result['flags'],[])

    def test_identical_call_id_in_other_scenario_is_independent(self):
        rows = [dict(scenario=name,seq=n,raw=dict(type='tool_execution_start',toolCallId='a')) for name,n in [('first',1),('second',7)]]
        result = summarize_tools(rows)
        self.assertEqual(result['first'][0]['starts'],[1])
        self.assertEqual(result['second'][0]['starts'],[7])

if __name__ == '__main__':
    unittest.main()
