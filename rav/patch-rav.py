#!/usr/bin/env python3
"""
patch-rav.py — Hardens Rav Webmail binary and static frontend:
1. Fixes IMAP UTF-8 envelope parsing error (imap-proto TakeWhile1 bug)
   by patching the signed byte check 0x7e (jle) to 0x74 (jz) in take_while1.
2. Fixes user account switcher and profile dropdown in static Next.js export:
   - Strips '%admin' or impersonator suffix from account emails.
   - Dynamically formats server hostname as 'mail.<domain>' for every email.
"""

import os
import glob
import sys

def patch_binary(binary_path: str):
    print(f"[patch-rav] Inspecting binary: {binary_path}")
    if not os.path.exists(binary_path):
        raise FileNotFoundError(f"Binary not found: {binary_path}")

    with open(binary_path, "rb") as f:
        data = bytearray(f.read())

    # Pattern: 4084f67e -> 'test sil, sil; jle <exit_loop>'
    pattern = bytes.fromhex("4084f67e")
    pos = data.find(pattern)
    if pos == -1:
        # Check if already patched
        if bytes.fromhex("4084f674") in data:
            print("[patch-rav] Binary already patched with 0x74 (jz)!")
            return
        raise RuntimeError("IMAP take_while1 pattern 4084f67e not found in binary!")

    print(f"[patch-rav] Found take_while1 pattern at offset {hex(pos)}. Patching 0x7e -> 0x74...")
    data[pos + 3] = 0x74

    with open(binary_path, "wb") as f:
        f.write(data)
    print(f"[patch-rav] Binary {binary_path} successfully patched!")

def patch_frontend(chunks_dir: str):
    print(f"[patch-rav] Inspecting frontend chunks in: {chunks_dir}")
    patched_count = 0

    target1 = 'children:z?.email[0]?.toUpperCase()??"?"'
    rep1 = 'children:(z?.email?.split("%")[0]||"")[0]?.toUpperCase()??"?"'

    target2 = 'children:[(0,m.jsx)("div",{className:"truncate",children:z?.email}),(0,m.jsx)("div",{className:"text-xs text-muted-foreground truncate",children:z?.imapHost})]'
    rep2 = 'children:[(0,m.jsx)("div",{className:"truncate",children:z?.email?.split("%")[0]}),(0,m.jsx)("div",{className:"text-xs text-muted-foreground truncate",children:"mail."+(z?.email?.split("@")[1]||"").split("%")[0]})]'

    target3 = 'children:e.email[0]?.toUpperCase()??"?"'
    rep3 = 'children:(e?.email?.split("%")[0]||"")[0]?.toUpperCase()??"?"'

    target4 = 'children:[(0,m.jsx)("div",{className:(0,I.cn)("truncate text-sm font-medium",r?"text-foreground":"text-foreground/80"),children:e.email}),(0,m.jsx)("div",{className:"text-xs text-muted-foreground truncate",children:e.imapHost})]'
    rep4 = 'children:[(0,m.jsx)("div",{className:(0,I.cn)("truncate text-sm font-medium",r?"text-foreground":"text-foreground/80"),children:e?.email?.split("%")[0]}),(0,m.jsx)("div",{className:"text-xs text-muted-foreground truncate",children:"mail."+(e?.email?.split("@")[1]||"").split("%")[0]})]'

    for js_path in glob.glob(os.path.join(chunks_dir, "*.js")):
        with open(js_path, "r", encoding="utf-8") as f:
            content = f.read()

        if target2 in content:
            print(f"[patch-rav] Patching account switcher and server label in {os.path.basename(js_path)}...")
            content = content.replace(target1, rep1)
            content = content.replace(target2, rep2)
            content = content.replace(target3, rep3)
            content = content.replace(target4, rep4)

            with open(js_path, "w", encoding="utf-8") as f:
                f.write(content)
            patched_count += 1

    if patched_count == 0:
        print("[patch-rav] Note: Account switcher target not found or already patched.")
    else:
        print(f"[patch-rav] Successfully patched {patched_count} frontend chunk(s).")

def main():
    binary_path = sys.argv[1] if len(sys.argv) > 1 else "/app/rav-email-server"
    chunks_dir = sys.argv[2] if len(sys.argv) > 2 else "/app/static/_next/static/chunks"

    patch_binary(binary_path)
    patch_frontend(chunks_dir)
    print("[patch-rav] All hardening patches completed successfully!")

if __name__ == "__main__":
    main()
