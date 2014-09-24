#!/bin/bash
# set -e
IMG=esl-test-0001
for t in client server; do
  docker build -t $IMG-$t 0001-$t/
done

docker run -p 127.0.0.1:8022:8022 \
  --dns=172.17.42.1 --dns-search=docker.local \
  -d --name $IMG-server $IMG-server
docker run -p 127.0.0.1:8024:8024 \
  --dns=172.17.42.1 --dns-search=docker.local \
  --link esl-test-0001-server:server.local \
  -d --name $IMG-client $IMG-client

# Give FreeSwitch some time to settle
# Give docker-dns some time to figure out there are new hosts (pollinterval = 17).
sleep 20
../node_modules/.bin/mocha --compilers coffee.md:coffee-script .
for t in client server; do
  docker logs $IMG-$t;
  docker kill $IMG-$t;
  docker rm $IMG-$t;
  docker rmi $IMG-$t;
done
