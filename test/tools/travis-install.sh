#!/bin/sh

## Upgrade Ubuntu to a version that would have our dependencies.
apt-get install update-manager-core
do-release-upgrade -d -m server -f DistUpgradeViewNonInteractive
apt-get update

## Add a repository with a recent FreeSwitch version.
# apt-get install -qq python-software-properties
# apt-add-repository "deb http://debian.sotelips.net/shimaore shimaore main"
echo "deb http://debian.sotelips.net/shimaore shimaore main" | tee -a /etc/apt/sources.list

gpg --recv-keys "F24B9200" && true
gpg --recv-keys "F24B9200"
gpg --armor --export "=Stephane Alnet (Packaging) <stephane@shimaore.net>" | apt-key add -
apt-get update -qq

## Install FreeSwitch
apt-get install \
  freeswitch freeswitch-mod-commands freeswitch-mod-event-socket freeswitch-mod-dptools freeswitch-mod-loopback freeswitch-mod-dialplan-xml freeswitch-mod-sofia
