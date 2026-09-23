#!/bin/sh

set -eu

headers=''
while [ "$#" -gt 0 ]; do
  if [ "$1" = --dump-header ]; then
    shift
    [ "$#" -gt 0 ] || exit 2
    headers=$1
  fi
  shift
done

[ -n "$headers" ] || exit 2
header=${YOLPOL_TEST_CURL_HEADER:-x-robots-tag: noindex, nofollow, noarchive}
printf 'HTTP/2 200\r\n%s\r\n\r\n' "$header" > "$headers"
