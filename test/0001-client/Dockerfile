FROM shimaore/freeswitch
ADD conf/ /opt/freeswitch/conf
USER root
CMD ["/opt/freeswitch/bin/freeswitch","-nf","-nosql","-nonat","-nonatmap","-nocal","-nort","-c"]
EXPOSE 5064/udp 5064/tcp 8024/tcp
