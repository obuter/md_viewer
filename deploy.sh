#!/bin/sh
# deploy.sh — sync this repo to debian13 and rebuild the container
set -e
rsync -av --delete \
  --exclude '.git' --exclude '.claude' --exclude '.env' --exclude '.DS_Store' \
  ./ can@10.0.1.11:/home/can/md_viewer/
ssh can@10.0.1.11 'cd /home/can/md_viewer && docker compose up -d --build'
