#!/bin/bash
# set -e
IMG=esl-test-0001
for t in client server; do
  echo "****** Starting $t *******"
  # Kill any leftover processes.
  docker kill $IMG-$t;
  docker rm $IMG-$t;

  docker run \
    --net=host \
    -v "${PWD}/0001-$t/conf:/opt/freeswitch/etc/freeswitch" \
    -d --name $IMG-$t shimaore/freeswitch:4.0.2 \
    /opt/freeswitch/bin/freeswitch -nf -nosql -nonat -nonatmap -nocal -nort -c
done

echo "****** Ready *******"

# Give FreeSwitch some time to settle
sleep 10
