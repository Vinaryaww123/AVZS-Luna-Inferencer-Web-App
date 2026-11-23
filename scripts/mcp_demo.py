#!/usr/bin/env python3
"""Example MCP server (stdio, dependency-free): echo, add, now tools. For trying things out and as a template for your own server.
Add it to mcp.json:  "demo": {"command": "python", "args": ["scripts/mcp_demo.py"]}"""
import json, sys, time
TOOLS = [
    {'name': 'echo', 'description': 'Returns the given text.', 'inputSchema': {'type': 'object', 'properties': {'text': {'type': 'string'}}, 'required': ['text']}},
    {'name': 'add', 'description': 'Adds two numbers.', 'inputSchema': {'type': 'object', 'properties': {'a': {'type': 'number'}, 'b': {'type': 'number'}}, 'required': ['a', 'b']}},
    {'name': 'now', 'description': 'Current local computer time (ISO 8601).', 'inputSchema': {'type': 'object', 'properties': {}}},
]
def call(name, a):
    if name == 'echo': return a.get('text', '')
    if name == 'add': return str(a['a'] + a['b'])
    if name == 'now': return time.strftime('%Y-%m-%dT%H:%M:%S%z')
    raise ValueError('unknown tool: ' + name)
for line in sys.stdin:
    try: m = json.loads(line)
    except ValueError: continue
    i, meth = m.get('id'), m.get('method')
    if i is None: continue                      # notifications are not answered
    if meth == 'initialize': r = {'protocolVersion': (m.get('params') or {}).get('protocolVersion', '2025-06-18'), 'capabilities': {'tools': {}}, 'serverInfo': {'name': 'luna-demo', 'version': '1.0'}}
    elif meth == 'tools/list': r = {'tools': TOOLS}
    elif meth == 'ping': r = {}
    elif meth == 'tools/call':
        p = m.get('params') or {}
        try: r = {'content': [{'type': 'text', 'text': call(p.get('name'), p.get('arguments') or {})}]}
        except Exception as e: r = {'content': [{'type': 'text', 'text': str(e)}], 'isError': True}
    else:
        print(json.dumps({'jsonrpc': '2.0', 'id': i, 'error': {'code': -32601, 'message': 'unknown method'}}), flush=True); continue
    print(json.dumps({'jsonrpc': '2.0', 'id': i, 'result': r}), flush=True)
