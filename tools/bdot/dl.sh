#!/bin/bash
cd ~/pzw/work
while read teryt url; do
  if [ -s "${teryt}.zip" ]; then echo "skip $teryt"; continue; fi
  curl -s -m 900 --retry 2 -o "${teryt}.zip" "$url" && echo "ok $teryt $(du -h ${teryt}.zip|cut -f1)" || echo "FAIL $teryt"
done < "$1"
