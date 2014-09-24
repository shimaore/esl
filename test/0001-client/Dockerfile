FROM shimaore/freeswitch
ADD conf/ /usr/local/freeswitch/conf
CMD ["/usr/local/freeswitch/bin/freeswitch","-nf","-nosql","-nonat","-nonatmap","-nocal","-nort","-c"]
EXPOSE 5064/udp 5064/tcp 8024/tcp
