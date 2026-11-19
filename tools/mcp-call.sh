#!/usr/bin/env bash
# One command to call a tool on a remote MCP server over Streamable HTTP (JSON-RPC), with curl.
#   mcp-call.sh list                     tool names
#   mcp-call.sh schema TOOL              one tool's input schema
#   mcp-call.sh call TOOL '{"a":1}'       run a tool, print its text result
# env: MCP_URL (default Shifat's upsy-oauth-bridge), MCP_TOKEN (optional bearer; keep it out of git and chat)
set -euo pipefail
URL="${MCP_URL:-https://upsy-oauth-bridge.shifatmasud.workers.dev/mcp}"
AUTH=(); [ -n "${MCP_TOKEN:-}" ] && AUTH=(-H "Authorization: Bearer $MCP_TOKEN")
HDR=$(mktemp); trap 'rm -f "$HDR"' EXIT

post() { # $1 body, $2 session id (optional) -> prints JSON messages (SSE data: lines unwrapped)
  local sid=() ; [ -n "${2:-}" ] && sid=(-H "Mcp-Session-Id: $2")
  curl -sS --max-time 600 -D "$HDR" -X POST "$URL" \
    -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
    "${AUTH[@]}" "${sid[@]}" --data-binary "$1" |
  python3 -c 'import sys
raw=sys.stdin.read()
if "data:" in raw:
  [print(l[5:].strip()) for l in raw.splitlines() if l.startswith("data:") and l[5:].strip()]
elif raw.strip(): print(raw.strip())'
}

INIT='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"mcp-call","version":"1"}}}'
post "$INIT" >/dev/null
SID=$(grep -i '^mcp-session-id:' "$HDR" | awk '{print $2}' | tr -d '\r' || true)
post '{"jsonrpc":"2.0","method":"notifications/initialized"}' "$SID" >/dev/null || true

case "${1:-list}" in
  list)   post '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' "$SID" |
          python3 -c 'import sys,json
for l in sys.stdin:
  m=json.loads(l)
  for t in m.get("result",{}).get("tools",[]): print(t["name"],"-",(t.get("description") or "")[:100])' ;;
  schema) post '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' "$SID" |
          python3 -c 'import sys,json
for l in sys.stdin:
  m=json.loads(l)
  for t in m.get("result",{}).get("tools",[]):
    if t["name"]==sys.argv[1]: print(json.dumps(t,indent=1))' "$2" ;;
  call)   BODY=$(python3 -c 'import sys,json; print(json.dumps({"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":sys.argv[1],"arguments":json.loads(sys.argv[2])}}))' "$2" "${3:-{\}}")
          post "$BODY" "$SID" |
          python3 -c 'import sys,json
for l in sys.stdin:
  m=json.loads(l)
  if m.get("id")!=2: continue
  if "error" in m: print("ERROR",json.dumps(m["error"])); sys.exit(1)
  r=m["result"]
  for c in r.get("content",[]):
    print(c["text"] if c.get("type")=="text" else "[%s content]"%c.get("type"))
  if r.get("isError"): sys.exit(1)' ;;
esac
