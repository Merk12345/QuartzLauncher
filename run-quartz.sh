#!/usr/bin/env bash
cd "$HOME/Desktop/quartzlauncherstuff/QuartzLauncher"

export PATH="$HOME/.nvm/versions/node/$(ls "$HOME/.nvm/versions/node" | tail -n 1)/bin:$PATH"
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"

npm start > "$HOME/Desktop/quartz-launcher-log.txt" 2>&1
