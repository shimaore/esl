#!/bin/bash
# set -e
IMG=esl-test-0001

# Postmortem
for t in client server; do
  docker logs $IMG-$t > $IMG-$t.log;
done
for t in client server; do
  docker kill $IMG-$t;
  docker rm $IMG-$t;
  docker rmi $IMG-$t;
done
