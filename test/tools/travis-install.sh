#!/bin/sh

## Add a repository with a recent FreeSwitch version.
apt-get install -qq python-software-properties
apt-add-repository "deb http://ftp.debian.org/debian testing main"
apt-add-repository "deb http://debian.sotelips.net/shimaore shimaore main"
# echo "deb http://debian.sotelips.net/shimaore shimaore main" | tee -a /etc/apt/sources.list

gpg --recv-keys "F24B9200" && true
gpg --recv-keys "F24B9200"
gpg --armor --export "=Stephane Alnet (Packaging) <stephane@shimaore.net>" | apt-key add -
apt-get update -qq

## Install FreeSwitch
apt-get install \
  freeswitch freeswitch-mod-commands freeswitch-mod-event-socket freeswitch-mod-dptools freeswitch-mod-loopback freeswitch-mod-dialplan-xml freeswitch-mod-sofia
