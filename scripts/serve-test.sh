#!/usr/bin/env bash
# Build, (re)start the production server on :3100, and record its PID.
set -e
cd "$(dirname "$0")/.."
PIDFILE=.next-test.pid
[ -f $PIDFILE ] && kill "$(cat $PIDFILE)" 2>/dev/null || true
npm run build > .build.log 2>&1 || { tail -30 .build.log; exit 1; }
PORT=3100 nohup node node_modules/next/dist/bin/next start > .server.log 2>&1 &
echo $! > $PIDFILE
for i in $(seq 1 30); do curl -sf localhost:3100 >/dev/null && { echo "server up (pid $(cat $PIDFILE))"; exit 0; }; sleep 1; done
echo "server failed"; tail .server.log; exit 1
