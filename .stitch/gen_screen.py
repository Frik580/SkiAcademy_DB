import json
import os
import ssl
import time
import urllib.request

api_key = os.environ["STITCH_API_KEY"]
ctx = ssl._create_unverified_context()


def call(arguments, label, timeout=600):
    msg = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {"name": "generate_screen_from_text", "arguments": arguments},
    }
    body = json.dumps(msg).encode("utf-8")
    req = urllib.request.Request(
        "https://stitch.googleapis.com/mcp",
        data=body,
        headers={"Content-Type": "application/json", "X-Goog-Api-Key": api_key},
        method="POST",
    )
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=timeout) as resp:
            data = resp.read().decode("utf-8")
    except Exception as e:
        print(label, "EXC", e)
        return None
    parsed = json.loads(data)
    err = parsed.get("result", {}).get("isError")
    text = parsed.get("result", {}).get("content", [{}])[0].get("text", "")
    print(label, "t", round(time.time() - t0, 1), "err", err, "len", len(data))
    print("preview:", text[:500])
    out = os.path.join(os.path.dirname(__file__), f"generate-resp-{label}.json")
    with open(out, "w", encoding="utf-8") as f:
        f.write(data)
    return parsed


base = {
    "projectId": "12447626312814512672",
    "prompt": "Desktop landing page for Carve ski school with navbar and hero mountain photo.",
}

if __name__ == "__main__":
    import sys

    mode = sys.argv[1] if len(sys.argv) > 1 else "minimal"
    if mode == "minimal":
        call(base, "minimal", timeout=120)
    elif mode == "device":
        call({**base, "deviceType": "DESKTOP"}, "device", timeout=120)
    elif mode == "flash":
        call({**base, "deviceType": "DESKTOP", "modelId": "GEMINI_3_FLASH"}, "flash", timeout=120)
    elif mode == "ds":
        call(
            {
                **base,
                "deviceType": "DESKTOP",
                "designSystem": "assets/11762622741281556178",
            },
            "ds",
            timeout=120,
        )
    elif mode == "full":
        prompt = """Recreate Carve Academy public home page. Desktop web.

1. Sticky frosted navbar: Carve logo left; theme icon, EN, Sign In right.
2. Full-bleed alpine hero with left scrim; eyebrow PRIVATE LESSONS ON THE MOUNTAIN; serif title Find your guide. Carve your line.; CTA Start your journey; link Choose a course; carousel dots.
3. Path to mastery wavy 4-level journey section.
4. Two columns: resort sidebar Sheregesh -8 deg snow wind OPEN; courses card grid (3); Meet the guides instructor rows with Book.
5. Minimal footer.

Editorial alpine, generous whitespace."""
        call(
            {
                "projectId": "12447626312814512672",
                "prompt": prompt,
                "deviceType": "DESKTOP",
                "modelId": "GEMINI_3_FLASH",
                "designSystem": "assets/11762622741281556178",
            },
            "full",
            timeout=600,
        )
    else:
        print("unknown mode", mode)
