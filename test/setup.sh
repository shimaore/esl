#!/bin/bash
# set -e
IMG=esl-test-0001
for t in client server; do
  # Kill any leftover processes.
  docker kill $IMG-$t;
  docker rm $IMG-$t;

  echo "****** Building $t *******"
  docker build -t $IMG-$t 0001-$t/

done

echo "****** Starting server *******"
docker run \
  --net=host \
  -d --name $IMG-server $IMG-server
echo "****** Starting client *******"
docker run \
  --net=host \
  -d --name $IMG-client $IMG-client

echo "****** Ready *******"

# Give FreeSwitch some time to settle
sleep 20
