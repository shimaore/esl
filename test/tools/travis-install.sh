#!/bin/sh

## Add a repository with a recent FreeSwitch version.
echo "deb http://ftp.debian.org/debian testing main" | tee -a /etc/apt/sources.list
echo "deb http://debian.sotelips.net/shimaore shimaore main" | tee -a /etc/apt/sources.list


gpg --recv-keys "8B48AD6246925553" && true
gpg --recv-keys "8B48AD6246925553"
gpg --armor --export "=Debian Archive Automatic Signing Key (7.0/wheezy) <ftpmaster@debian.org>" | apt-key add -
gpg --recv-keys "F24B9200" && true
gpg --recv-keys "F24B9200"
gpg --armor --export "=Stephane Alnet (Packaging) <stephane@shimaore.net>" | apt-key add -
apt-get update -qq

## Install FreeSwitch
apt-get install --no-install-recommends -o 'Dpkg::Options::="--force-overwrite"' \
  freeswitch freeswitch-mod-commands freeswitch-mod-event-socket freeswitch-mod-dptools freeswitch-mod-loopback freeswitch-mod-dialplan-xml freeswitch-mod-sofia
