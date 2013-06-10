#! /bin/sh
DIR="`pwd`"
freeswitch -nc -nosql -nonat -nonatmap -nocal -nort \
  -base "$DIR" -conf "$DIR" -log "$DIR" -run "$DIR" -db "$DIR" -scripts "$DIR" -temp "$DIR"

coffee client.coffee

freeswitch -stop -run "$DIR"
killall freeswitch

rm -f freeswitch.pid freeswitch.serial freeswitch.xml.fsxml
