#!/bin/sh
# Publishes /media/test.mp4 in an endless loop to rtsp://localhost:8554/$1, scaled to width $2.
set -e
VIDEO=/media/test.mp4
if [ ! -s "$VIDEO" ]; then
  # main and sub start together: each downloads to its own file, the rename is atomic
  wget -q -O "$VIDEO.$1.part" https://github.com/intel-iot-devkit/sample-videos/raw/master/people-detection.mp4
  [ -s "$VIDEO" ] || mv "$VIDEO.$1.part" "$VIDEO"
  rm -f "$VIDEO.$1.part"
fi
exec ffmpeg -nostdin -loglevel error -re -stream_loop -1 -i "$VIDEO" -an \
  -vf "scale=$2:-2" -c:v libx264 -preset veryfast -tune zerolatency -g 24 -pix_fmt yuv420p \
  -f rtsp -rtsp_transport tcp "rtsp://localhost:$RTSP_PORT/$1"
