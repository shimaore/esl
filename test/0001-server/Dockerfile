FROM shimaore/freeswitch:2.1.0
ADD conf/ /opt/freeswitch/conf
CMD ["/opt/freeswitch/bin/freeswitch","-nf","-nosql","-nonat","-nonatmap","-nocal","-nort","-c"]
EXPOSE 5062/udp 5062/tcp 8022/tcp

# These are the optional arguments you can pass to freeswitch:
# 	-nf                    -- no forking
# 	-reincarnate           -- restart the switch on an uncontrolled exit
# 	-reincarnate-reexec    -- run execv on a restart (helpful for upgrades)
# 	-u [user]              -- specify user to switch to
# 	-g [group]             -- specify group to switch to
# 	-core                  -- dump cores
# 	-help                  -- this message
# 	-version               -- print the version and exit
# 	-rp                    -- enable high(realtime) priority settings
# 	-lp                    -- enable low priority settings
# 	-np                    -- enable normal priority settings
# 	-vg                    -- run under valgrind
# 	-nosql                 -- disable internal sql scoreboard
# 	-heavy-timer           -- Heavy Timer, possibly more accurate but at a cost
# 	-nonat                 -- disable auto nat detection
# 	-nonatmap              -- disable auto nat port mapping
# 	-nocal                 -- disable clock calibration
# 	-nort                  -- disable clock clock_realtime
# 	-stop                  -- stop freeswitch
# 	-nc                    -- do not output to a console and background
# 	-ncwait                -- do not output to a console and background but wait until the system is ready before exiting (implies -nc)
# 	-c                     -- output to a console and stay in the foreground
# 
# 	Options to control locations of files:
# 	-base [basedir]         -- alternate prefix directory
# 	-cfgname [filename]     -- alternate filename for FreeSWITCH main configuration file
# 	-conf [confdir]         -- alternate directory for FreeSWITCH configuration files
# 	-log [logdir]           -- alternate directory for logfiles
# 	-run [rundir]           -- alternate directory for runtime files
# 	-db [dbdir]             -- alternate directory for the internal database
# 	-mod [moddir]           -- alternate directory for modules
# 	-htdocs [htdocsdir]     -- alternate directory for htdocs
# 	-scripts [scriptsdir]   -- alternate directory for scripts
# 	-temp [directory]       -- alternate directory for temporary files
# 	-grammar [directory]    -- alternate directory for grammar files
# 	-certs [directory]      -- alternate directory for certificates
# 	-recordings [directory] -- alternate directory for recordings
# 	-storage [directory]    -- alternate directory for voicemail storage
# 	-cache [directory]      -- alternate directory for cache files
# 	-sounds [directory]     -- alternate directory for sound files
# 
