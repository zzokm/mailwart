#!/usr/bin/env python3
"""
patch-rav.py — Hardens and whitelabels Rav Webmail binary and static frontend:
1. Fixes IMAP UTF-8 envelope parsing error (imap-proto TakeWhile1 bug)
   by patching the signed byte check 0x7e (jle) to 0x74 (jz) in take_while1.
2. Full Mailwart Whitelabeling:
   - Sets tab title to 'Webmail' across all static HTML, TXT, and dynamic metadata.
   - Defaults to Dark Mode for unregistered/new visitors.
   - Injects Bricolage Grotesque and Plus Jakarta Sans Google Fonts in <head> and CSS.
   - Replaces the word 'Rav' above Sign In with linked brand wordmark 'mailwart'
     (styled in Bricolage Grotesque ExtraLight 200, redirecting to https://email.yehia.dev).
   - Replaces the top rail 'r.' glyph with Mailwart's 'm' squircle brand mark
     (redirecting to https://email.yehia.dev).
   - Replaces the empty message viewer pane watermark 'Rav' with 'mailwart'.
   - Fixes user account switcher and profile dropdown:
     * Strips '%admin' or impersonator suffix from account emails.
     * Dynamically formats server hostname as 'mail.<domain>' for every email.
   - Cache-busts modified chunks to ensure instant deployment past Cloudflare and browser caches.
"""

import os
import glob
import sys
import re

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
        if bytes.fromhex("4084f674") in data:
            print("[patch-rav] Binary already patched with 0x74 (jz)!")
            return
        raise RuntimeError("IMAP take_while1 pattern 4084f67e not found in binary!")

    print(f"[patch-rav] Found take_while1 pattern at offset {hex(pos)}. Patching 0x7e -> 0x74...")
    data[pos + 3] = 0x74

    with open(binary_path, "wb") as f:
        f.write(data)
    print(f"[patch-rav] Binary {binary_path} successfully patched!")

def update_chunk_references(root_static: str, old_name: str, new_name: str):
    if old_name == new_name:
        return
    print(f"[patch-rav] Updating cache-busted reference {old_name} -> {new_name}...")
    for root, dirs, files in os.walk(root_static):
        for f_name in files:
            ref_path = os.path.join(root, f_name)
            try:
                with open(ref_path, "r", encoding="utf-8", errors="ignore") as rf:
                    ref_content = rf.read()
                if old_name in ref_content:
                    ref_content = ref_content.replace(old_name, new_name)
                    with open(ref_path, "w", encoding="utf-8") as wf:
                        wf.write(ref_content)
            except Exception as e:
                print(f"[patch-rav] Warning updating {f_name}: {e}")

def patch_frontend(static_dir: str):
    chunks_dir = os.path.join(static_dir, "_next", "static", "chunks") if not static_dir.endswith("chunks") else static_dir
    root_static = static_dir if not static_dir.endswith("chunks") else os.path.dirname(os.path.dirname(os.path.dirname(static_dir)))

    print(f"[patch-rav] Inspecting frontend in: {root_static}")

    # --- Prepend Google Fonts @import to every CSS chunk ---
    font_import = "@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,200..800&family=Plus+Jakarta+Sans:ital,wght@0,300..800;1,300..800&display=swap');\n"
    for css_file in glob.glob(os.path.join(chunks_dir, "*.css")):
        try:
            with open(css_file, "r", encoding="utf-8") as f:
                c = f.read()
            if font_import not in c:
                with open(css_file, "w", encoding="utf-8") as f:
                    f.write(font_import + c)
                print(f"[patch-rav] Prepended Google Fonts @import to {os.path.basename(css_file)}")
        except Exception as e:
            print(f"[patch-rav] Warning prepending font import to {css_file}: {e}")

    # --- 1. Patch Login Page Chunk ---
    login_target = '(0,t.jsx)("h1",{className:"text-3xl font-bold tracking-tight text-foreground",children:"Rav"})'
    login_rep = '(0,t.jsx)("a",{href:"https://email.yehia.dev",className:"inline-block font-brand text-3xl font-[200] lowercase leading-none tracking-[-0.015em] text-foreground hover:opacity-80 transition-opacity",style:{fontFamily:\'"Bricolage Grotesque", sans-serif\',fontWeight:200},children:"mailwart"})'

    login_patched = False
    for js_path in glob.glob(os.path.join(chunks_dir, "*.js")):
        with open(js_path, "r", encoding="utf-8") as f:
            content = f.read()

        if login_target in content:
            old_chunk_name = os.path.basename(js_path)
            new_chunk_name = old_chunk_name.replace(".js", "_p2.js") if "_p2.js" not in old_chunk_name else old_chunk_name
            new_chunk_path = os.path.join(chunks_dir, new_chunk_name)

            print(f"[patch-rav] Patching login wordmark in {old_chunk_name} -> {new_chunk_name}...")
            content = content.replace(login_target, login_rep)

            with open(new_chunk_path, "w", encoding="utf-8") as f:
                f.write(content)

            update_chunk_references(root_static, old_chunk_name, new_chunk_name)
            if "_p1.js" in old_chunk_name:
                base_orig = old_chunk_name.replace("_p1.js", ".js")
                update_chunk_references(root_static, base_orig, new_chunk_name)
            login_patched = True

    if not login_patched:
        print("[patch-rav] Notice: Login target already patched or chunk not found.")

    # --- 2. Patch Mail Client Chunk (Account Switcher, Server Label, Rail Glyph, Watermark, Document Title) ---
    target1 = 'children:z?.email[0]?.toUpperCase()??"?"'
    rep1 = 'children:(z?.email?.split("%")[0]||"")[0]?.toUpperCase()??"?"'

    target2 = 'children:[(0,m.jsx)("div",{className:"truncate",children:z?.email}),(0,m.jsx)("div",{className:"text-xs text-muted-foreground truncate",children:z?.imapHost})]'
    rep2 = 'children:[(0,m.jsx)("div",{className:"truncate",children:z?.email?.split("%")[0]}),(0,m.jsx)("div",{className:"text-xs text-muted-foreground truncate",children:"mail."+(z?.email?.split("@")[1]||"").split("%")[0]})]'

    target3 = 'children:e.email[0]?.toUpperCase()??"?"'
    rep3 = 'children:(e?.email?.split("%")[0]||"")[0]?.toUpperCase()??"?"'

    target4 = 'children:[(0,m.jsx)("div",{className:(0,I.cn)("truncate text-sm font-medium",r?"text-foreground":"text-foreground/80"),children:e.email}),(0,m.jsx)("div",{className:"text-xs text-muted-foreground truncate",children:e.imapHost})]'
    rep4 = 'children:[(0,m.jsx)("div",{className:(0,I.cn)("truncate text-sm font-medium",r?"text-foreground":"text-foreground/80"),children:e?.email?.split("%")[0]}),(0,m.jsx)("div",{className:"text-xs text-muted-foreground truncate",children:"mail."+(e?.email?.split("@")[1]||"").split("%")[0]})]'

    rail_target = 'className:"mb-4 flex size-10 items-center justify-center",children:(0,m.jsx)("span",{className:"text-lg font-bold text-primary",children:"r."})'
    rail_rep = 'className:"mb-4 flex size-10 items-center justify-center",children:(0,m.jsx)("a",{href:"https://email.yehia.dev",title:"mailwart",className:"flex size-8 items-center justify-center rounded-md border border-border bg-card font-brand text-[17px] font-[200] leading-none text-foreground select-none hover:opacity-80 transition-opacity",style:{fontFamily:\'"Bricolage Grotesque", sans-serif\',fontWeight:200},children:"m"})'

    watermark_target = 'className:"text-2xl font-bold tracking-tight text-muted-foreground/40 select-none",children:"Rav"'
    watermark_rep = 'className:"text-3xl font-brand font-[200] lowercase tracking-tight text-muted-foreground/40 select-none",style:{fontFamily:\'"Bricolage Grotesque", sans-serif\',fontWeight:200},children:"mailwart"'

    main_patched = False
    for js_path in glob.glob(os.path.join(chunks_dir, "*.js")):
        with open(js_path, "r", encoding="utf-8") as f:
            content = f.read()

        if target2 in content:
            old_chunk_name = os.path.basename(js_path)
            new_chunk_name = old_chunk_name.replace(".js", "_p3.js") if "_p3.js" not in old_chunk_name else old_chunk_name
            new_chunk_path = os.path.join(chunks_dir, new_chunk_name)

            print(f"[patch-rav] Patching mail client chunk in {old_chunk_name} -> {new_chunk_name}...")
            content = content.replace(target1, rep1).replace(target2, rep2).replace(target3, rep3).replace(target4, rep4)
            content = content.replace(rail_target, rail_rep)
            content = content.replace(watermark_target, watermark_rep)
            content = re.sub(r'document\.title\s*=\s*r\s*>\s*0\s*\?\s*`\(\${r}\)[^`]+`\s*:\s*["\'][^"\']+["\']', 'document.title=r>0?`(${r}) Webmail`:"Webmail"', content)

            with open(new_chunk_path, "w", encoding="utf-8") as f:
                f.write(content)

            update_chunk_references(root_static, old_chunk_name, new_chunk_name)
            if "_p1.js" in old_chunk_name:
                base_orig = old_chunk_name.replace("_p1.js", ".js")
                update_chunk_references(root_static, base_orig, new_chunk_name)
            if "_p2.js" in old_chunk_name:
                base_orig = old_chunk_name.replace("_p2.js", ".js")
                update_chunk_references(root_static, base_orig, new_chunk_name)
            main_patched = True

    if not main_patched:
        print("[patch-rav] Notice: Mail client target already patched or chunk not found.")

    # --- 3. Patch All HTML and TXT files for Title, Metadata and Font Preconnect ---
    font_links = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,200..800&family=Plus+Jakarta+Sans:ital,wght@0,300..800;1,300..800&display=swap"><script>document.title="Webmail";try{if(document.cookie.indexOf("rav-theme=light")===-1){document.documentElement.classList.add("dark");}}catch(e){}</script>'

    meta_count = 0
    for root, dirs, files in os.walk(root_static):
        for fname in files:
            if fname.endswith((".html", ".txt")):
                fpath = os.path.join(root, fname)
                try:
                    with open(fpath, "r", encoding="utf-8") as f:
                        content = f.read()
                    orig = content

                    content = re.sub(r'<title>.*?</title>', '<title>Webmail</title>', content)
                    content = re.sub(r'(\\+["\'])children\1:\1(?:Rav|mailwart webmail)\1', r'\1children\1:\1Webmail\1', content)
                    content = content.replace('children:"Rav"', 'children:"Webmail"')
                    content = content.replace('"children":"Rav"', '"children":"Webmail"')
                    content = content.replace('children:"mailwart webmail"', 'children:"Webmail"')
                    content = content.replace('"children":"mailwart webmail"', '"children":"Webmail"')
                    content = content.replace('content="Rav"', 'content="Webmail"')
                    content = content.replace('content="mailwart webmail"', 'content="Webmail"')
                    content = content.replace("?favicon.2vob68tjqpejf.ico", "?v=mailwart")

                    if fname.endswith(".html") and "<head>" in content and font_links not in content:
                        content = content.replace('<html lang="en">', '<html lang="en" class="dark">')
                        content = content.replace("<head>", "<head>" + font_links)

                    if content != orig:
                        meta_count += 1
                        with open(fpath, "w", encoding="utf-8") as f:
                            f.write(content)
                except Exception as e:
                    print(f"[patch-rav] Warning updating meta in {fname}: {e}")

    print(f"[patch-rav] Successfully patched {meta_count} HTML/TXT file(s) with 'Webmail' title and fonts.")

def main():
    binary_path = sys.argv[1] if len(sys.argv) > 1 else "/app/rav-email-server"
    static_dir = sys.argv[2] if len(sys.argv) > 2 else "/app/static"

    patch_binary(binary_path)
    patch_frontend(static_dir)
    print("[patch-rav] All hardening and whitelabeling patches completed successfully!")

if __name__ == "__main__":
    main()
