#!/bin/bash
PORT=4000
PID=$(lsof -ti tcp:$PORT)
if [ -n "$PID" ]; then
  echo "Killing existing process on port $PORT (PID $PID)"
  kill -9 $PID
fi
npm run dev
