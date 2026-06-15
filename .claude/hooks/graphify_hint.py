#!/usr/bin/env python3
import json, sys, os

# Read stdin so the pipe closes cleanly; the contents are not needed.
try:
    json.load(sys.stdin)
except (json.JSONDecodeError, ValueError):
    pass

root = os.environ.get("CLAUDE_PROJECT_DIR", ".")
graph = os.path.join(root, "graphify-out", "graph.json")

# Only add context when a graph exists.
if os.path.exists(graph):
    hint = ("graphify-out/ is available — for questions about architecture, "
            "file relationships, or call graphs, use "
            "`graphify query \"...\"` before broad grep/read searches.")
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": hint
        }
    }))
sys.exit(0)
