#! /bin/sh

cake build

cleanup() {
  echo "-- Cleanup --"
  killall freeswitch;
  rm -f freeswitch.pid freeswitch.serial freeswitch.xml.fsxml;
}

trap cleanup EXIT
trap cleanup INT

DIR="`pwd`"

echo "------ Testing the client -----"

freeswitch -nc -nosql -nonat -nonatmap -nocal -nort \
  -base "$DIR" -conf "$DIR" -log "$DIR" -run "$DIR" -db "$DIR" -scripts "$DIR" -temp "$DIR"
sleep 1

echo "-- Starting client test --"
coffee client.coffee
echo "-- Client test completed --"

freeswitch -stop -run "$DIR"
cleanup

echo "----- Testing the server ------"

freeswitch -nc -nosql -nonat -nonatmap -nocal -nort \
  -base "$DIR" -conf "$DIR" -log "$DIR" -run "$DIR" -db "$DIR" -scripts "$DIR" -temp "$DIR"
sleep 1

echo "-- Starting server test --"
coffee server.coffee &
SERVER_PID=$!
sleep 1
coffee server-test.coffee
echo "-- Server test completed --"

kill -9 $SERVER_PID

freeswitch -stop -run "$DIR"
cleanup
