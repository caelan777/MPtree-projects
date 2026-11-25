@echo off
rem Daily: collect the MPTree numbers and put them where the TV reads them.
rem Started by Windows Task Scheduler, see Dashboard/README.md, "The TV".
cd /d "%~dp0.."
node Dashboard\publish-tv.mjs > Dashboard\publish-tv.log 2>&1
