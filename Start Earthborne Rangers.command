#!/bin/zsh
# Double-click to play Earthborne Rangers on this Mac.
# Starts the game and opens it in your browser. Close this window (or press Ctrl+C) to stop it.

cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
	echo "Node.js isn't installed. Get the LTS version from https://nodejs.org, then double-click this file again."
	read -k1 "?Press any key to close…"
	exit 1
fi

if [ ! -d node_modules ]; then
	echo "First run: installing (about a minute)…"
	npm install || { read -k1 "?Install failed. Press any key to close…"; exit 1; }
fi

IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
echo ""
echo "Starting Earthborne Rangers… your browser will open in a moment."
if [ -n "$IP" ]; then
	echo ""
	echo "  ▶ To play on your iPad or iPhone (same Wi-Fi), open Safari and go to:"
	echo "        http://$IP:5175"
	echo "    Then tap Share → Add to Home Screen for a full-screen Earthborne Rangers app."
	echo "    (If the Mac asks whether to allow incoming connections for node, click Allow.)"
fi
echo ""
echo "Leave this window open while you play. Close it to stop the game."
echo ""
npm run dev -- --open --host --port 5175
