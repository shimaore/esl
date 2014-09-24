#!/bin/sh
docker stop docker-dns
docker rm   docker-dns
sleep 3
docker run -d -t -h docker-dns --name docker-dns \
  -p 172.17.42.1:53:53/udp \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v ${PWD}/log:/var/log/supervisor \
  shimaore/docker-dns
