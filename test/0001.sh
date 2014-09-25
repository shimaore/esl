#!/bin/bash
# set -e
IMG=esl-test-0001
for t in client server; do
  echo "****** Building $t *******"
  docker build -t $IMG-$t 0001-$t/
done

DNS=$(dig +short docker-dns.local.localhost.docker-local @172.17.42.1 | egrep '^[0-9.]+$')
echo
echo "****** docker-dns is at $DNS *******"
echo

echo "****** Starting server *******"
docker run -p 127.0.0.1:8022:8022 \
  --dns=$DNS \
  -d --name $IMG-server $IMG-server
echo "****** Starting client *******"
docker run -p 127.0.0.1:8024:8024 \
  --dns=$DNS \
  -d --name $IMG-client $IMG-client

echo "****** Ready *******"

# Give FreeSwitch some time to settle
# Give docker-dns some time to figure out there are new hosts (pollinterval = 17).
sleep 20
../node_modules/.bin/mocha -t 10000 --compilers coffee.md:coffee-script/register -R spec .

echo "---------------------------------------------------------------------------"
dig esl-test-0001-server.local.localhost.docker-local @172.17.42.1

# Postmortem
for t in client server; do
  echo "---------------------------------------------------------------------------"
  echo "---------------------------------------------------------------------------"
  echo "---------------------------------------------------------------------------"
  echo "----------------- $t --------------------------------------------------"
  echo "---------------------------------------------------------------------------"
  echo "---------------------------------------------------------------------------"
  echo "---------------------------------------------------------------------------"
  docker logs $IMG-$t;
  docker kill $IMG-$t;
  docker rm $IMG-$t;
  docker rmi $IMG-$t;
done
