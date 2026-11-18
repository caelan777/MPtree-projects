# Taps through MPTree on a booted simulator with idb and screenshots each step.
#   python3 sim-tour.py <udid> <out dir>
import json, subprocess, sys, time
UDID, OUT = sys.argv[1], sys.argv[2]
n = 0

def idb(*a):
    return subprocess.run(["idb", *a, "--udid", UDID], capture_output=True, text=True).stdout

def shot(name):
    global n; n += 1
    subprocess.run(["xcrun", "simctl", "io", UDID, "screenshot", f"{OUT}/{n:02d}-{name}.png"])
    open(f"{OUT}/{n:02d}-{name}.json", "w").write(idb("ui", "describe-all", "--json"))

def elements():
    raw = idb("ui", "describe-all", "--json").strip()
    try: return json.loads(raw)
    except Exception: return [json.loads(l) for l in raw.splitlines() if l.strip().startswith("{")]

def tap(label, contains=False):
    for e in elements():
        l = (e.get("AXLabel") or "") + " " + (e.get("AXValue") or "")
        if (label in l) if contains else ((e.get("AXLabel") or "").strip() == label):
            f = e["frame"]; x, y = f["x"] + f["width"] / 2, f["y"] + f["height"] / 2
            idb("ui", "tap", str(int(x)), str(int(y)))
            print("tapped", label, x, y); return True
    print("NOT FOUND", label); return False

def step(name, *labels, wait=4, contains=False):
    for l in labels:
        if tap(l, contains): break
    time.sleep(wait); shot(name)

time.sleep(12); shot("welcome")
step("after-next", "Next")
step("songs", "Enter MPTree", "Skip", wait=6)
step("songs-2", "Thanks", "Skip", "Got it", wait=3)
step("playing", "Test Song One", contains=True, wait=5)
step("player", "Expand player", wait=5)
idb("ui", "swipe", "200", "300", "200", "800"); time.sleep(3); shot("player-closed")
