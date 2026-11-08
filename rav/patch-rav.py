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
    for js_path in sorted(glob.glob(os.path.join(chunks_dir, "*.js"))):
        if re.search(r'_p\d+\.js$', js_path):
            continue
        with open(js_path, "r", encoding="utf-8") as f:
            content = f.read()

        if login_target in content:
            old_chunk_name = os.path.basename(js_path)
            new_chunk_name = old_chunk_name.replace(".js", "_p2.js")
            new_chunk_path = os.path.join(chunks_dir, new_chunk_name)

            print(f"[patch-rav] Patching login wordmark in {old_chunk_name} -> {new_chunk_name}...")
            content = content.replace(login_target, login_rep)

            with open(new_chunk_path, "w", encoding="utf-8") as f:
                f.write(content)

            update_chunk_references(root_static, old_chunk_name, new_chunk_name)
            for prev in ["_p1.js"]:
                update_chunk_references(root_static, old_chunk_name.replace(".js", prev), new_chunk_name)
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

    # --- 3. Patch Settings Chunk (Change Password Tab with High-Security Enforcement) ---
    password_func = '''function oPassword(){let[e,t]=(0,f.useState)(""),[r,n]=(0,f.useState)(""),[s,a]=(0,f.useState)(""),[i,l]=(0,f.useState)(!1),[o,d]=(0,f.useState)(!1),[c,u]=(0,f.useState)(!1),[p,v]=(0,f.useState)(!1),[y,j]=(0,f.useState)(null),[w,N]=(0,f.useState)(!1),k=(e_.useAuthStore.getState().activeAccount()?.email||"").split("%")[0].trim().toLowerCase(),S=(k.split("@")[0]||"").toLowerCase(),C=r.length>=14,M=/[A-Z]/.test(r),E=/[a-z]/.test(r),z=/[0-9]/.test(r),D=/[^a-zA-Z0-9\\s]/.test(r),A=!S||S.length<3||!r.toLowerCase().includes(S),_=(!e||r!==e)&&r.length>0,P=s.length>0&&r===s,F=0;r.length>=8&&F++,C&&F++,M&&E&&F++,z&&F++,D&&F++;let R="Very Weak",$= "text-muted-foreground";1===F?(R="Weak",$="text-red-500"):2===F?(R="Fair",$="text-amber-500"):3===F?(R="Good",$="text-yellow-500"):4===F?(R="Strong",$="text-blue-500"):F>=5&&(R="Very Strong",$="text-emerald-500");let L=C&&M&&E&&z&&D&&A&&_&&P&&e.length>0&&!p;async function O(i){if(i&&i.preventDefault&&i.preventDefault(),!L)return;v(!0),j(null),N(!1);try{let i=await fetch("/api/sso/change-password",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({email:k,currentPassword:e,newPassword:r,confirmPassword:s})}),l=await i.json().catch(()=>({}));if(!i.ok)throw Error(l.error||"Failed to update password. Please check your current password.");N(!0),j("Password changed successfully! Your mailbox password has been updated."),t(""),n(""),a(""),ei.toast.success("Password changed successfully!")}catch(e){let t=e instanceof Error?e.message:"Failed to update password.";N(!1),j(t),ei.toast.error(t)}finally{v(!1)}}function U(e,t){return(0,m.jsxs)("div",{className:(0,I.cn)("flex items-center gap-2 text-xs transition-colors",e?"text-emerald-600 dark:text-emerald-400 font-medium":"text-muted-foreground"),children:[e?(0,m.jsx)("svg",{className:"size-3.5 shrink-0 text-emerald-500",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:2.5,strokeLinecap:"round",strokeLinejoin:"round",children:(0,m.jsx)("polyline",{points:"20 6 9 17 4 12"})}):(0,m.jsx)("svg",{className:"size-3.5 shrink-0 text-muted-foreground/40",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:2,children:(0,m.jsx)("circle",{cx:12,cy:12,r:3,fill:"currentColor"})}),(0,m.jsx)("span",{children:t})]})}function B(e,t){return(0,m.jsx)("button",{type:"button",tabIndex:-1,onClick:t,style:{position:"absolute",right:"0",top:"0",bottom:"0",display:"flex",alignItems:"center",justifyContent:"center",width:"38px",height:"100%",background:"transparent",border:"none",cursor:"pointer",padding:"0",color:"inherit",zIndex:10},className:"text-muted-foreground hover:text-foreground transition-colors",children:e?(0,m.jsxs)("svg",{className:"size-4",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round",children:[(0,m.jsx)("path",{d:"M9.88 9.88a3 3 0 1 0 4.24 4.24"}),(0,m.jsx)("path",{d:"M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"}),(0,m.jsx)("path",{d:"M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"}),(0,m.jsx)("line",{x1:2,x2:22,y1:2,y2:22})]}):(0,m.jsxs)("svg",{className:"size-4",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round",children:[(0,m.jsx)("path",{d:"M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"}),(0,m.jsx)("circle",{cx:12,cy:12,r:3})]})})}return(0,m.jsxs)("div",{className:"flex flex-col gap-6 max-w-2xl",children:[(0,m.jsxs)("div",{children:[(0,m.jsx)("h2",{className:"text-base font-semibold text-foreground",children:"Change Password"}),(0,m.jsx)("p",{className:"mt-1 text-sm text-muted-foreground",children:`Update the password for ${k}. High-security requirements are enforced.`})]}),(0,m.jsxs)("div",{className:"rounded-lg border border-border bg-card p-5 space-y-4 shadow-sm",children:[(0,m.jsxs)("div",{className:"space-y-1.5",children:[(0,m.jsx)("label",{className:"text-sm font-medium text-foreground",children:"Current Password"}),(0,m.jsxs)("div",{className:"relative flex items-center",style:{position:"relative",width:"100%"},children:[(0,m.jsx)("input",{type:i?"text":"password",value:e,onChange:e=>t(e.target.value),placeholder:"Enter current password",className:"w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",style:{width:"100%",paddingRight:"42px",boxSizing:"border-box"}}),B(i,()=>l(!i))]})]}),(0,m.jsxs)("div",{className:"space-y-1.5",children:[(0,m.jsx)("label",{className:"text-sm font-medium text-foreground",children:"New Password"}),(0,m.jsxs)("div",{className:"relative flex items-center",style:{position:"relative",width:"100%"},children:[(0,m.jsx)("input",{type:o?"text":"password",value:r,onChange:e=>n(e.target.value),placeholder:"Enter new strong password",className:"w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",style:{width:"100%",paddingRight:"42px",boxSizing:"border-box"}}),B(o,()=>d(!o))]})]}),r.length>0&&(0,m.jsxs)("div",{className:"space-y-1.5 pt-1",children:[(0,m.jsxs)("div",{className:"flex items-center justify-between text-xs",children:[(0,m.jsx)("span",{className:"text-muted-foreground",children:"Password Strength"}),(0,m.jsx)("span",{className:(0,I.cn)("font-semibold",$),children:R})]}),(0,m.jsxs)("div",{className:"grid grid-cols-4 gap-1.5 h-1.5 w-full",children:[(0,m.jsx)("div",{className:(0,I.cn)("rounded-full h-full transition-colors",F>=1?"bg-red-500":"bg-muted")}),(0,m.jsx)("div",{className:(0,I.cn)("rounded-full h-full transition-colors",F>=2?"bg-amber-500":"bg-muted")}),(0,m.jsx)("div",{className:(0,I.cn)("rounded-full h-full transition-colors",F>=4?"bg-blue-500":"bg-muted")}),(0,m.jsx)("div",{className:(0,I.cn)("rounded-full h-full transition-colors",F>=5?"bg-emerald-500":"bg-muted")})]})]}),(0,m.jsxs)("div",{className:"space-y-1.5",children:[(0,m.jsx)("label",{className:"text-sm font-medium text-foreground",children:"Confirm New Password"}),(0,m.jsxs)("div",{className:"relative flex items-center",style:{position:"relative",width:"100%"},children:[(0,m.jsx)("input",{type:c?"text":"password",value:s,onChange:e=>a(e.target.value),placeholder:"Re-enter new password to confirm",className:"w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",style:{width:"100%",paddingRight:"42px",boxSizing:"border-box"}}),B(c,()=>u(!c))]})]}),(0,m.jsxs)("div",{className:"rounded-md border border-border/80 bg-muted/40 p-3.5 space-y-2.5",children:[(0,m.jsx)("div",{className:"text-xs font-semibold uppercase tracking-wider text-muted-foreground",children:"Security Requirements"}),(0,m.jsxs)("div",{grid:"grid-cols-1 sm:grid-cols-2 gap-2",className:"grid grid-cols-1 sm:grid-cols-2 gap-2",children:[U(C,"At least 14 characters"),U(M,"Uppercase letter (A-Z)"),U(E,"Lowercase letter (a-z)"),U(z,"Number (0-9)"),U(D,"Special symbol (!@#$%^&*)"),U(A,"No email username"),U(_,"Different from current"),U(P,"Passwords match")]})]}),y&&(0,m.jsxs)("div",{className:(0,I.cn)("rounded-md p-3 text-xs flex items-start gap-2",w?"bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400":"bg-destructive/10 border border-destructive/30 text-destructive"),children:[(0,m.jsx)("span",{className:"font-medium",children:w?"Success:":"Error:"}),(0,m.jsx)("span",{children:y})]}),(0,m.jsx)("div",{className:"pt-2 flex justify-end",children:(0,m.jsxs)("button",{type:"button",onClick:O,disabled:!L,className:"inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 transition-colors",children:[p&&(0,m.jsx)(T.Loader2,{className:"size-4 animate-spin"}),p?"Updating Password...":"Update Password"]})})]})]})}'''

    target_tabs = 'let oo=[{id:"display",label:"Display"},{id:"notifications",label:"Notifications"},{id:"identities",label:"Identities"},{id:"vacation",label:"Vacation"},{id:"filters",label:"Filters"},{id:"security",label:"Security"}];'
    rep_tabs = f'{password_func}let oo=[{{id:"display",label:"Display"}},{{id:"notifications",label:"Notifications"}},{{id:"identities",label:"Identities"}},{{id:"password",label:"Password"}},{{id:"vacation",label:"Vacation"}},{{id:"filters",label:"Filters"}},{{id:"security",label:"Security"}}];'

    target_body = '"security"===r&&(0,m.jsx)(oa,{})'
    rep_body = '"security"===r&&(0,m.jsx)(oa,{}),"password"===r&&(0,m.jsx)(oPassword,{})'

    main_patched = False
    for js_path in sorted(glob.glob(os.path.join(chunks_dir, "*.js"))):
        if re.search(r'_p\d+\.js$', js_path):
            continue
        with open(js_path, "r", encoding="utf-8") as f:
            content = f.read()

        if target2 in content or target_tabs in content:
            old_chunk_name = os.path.basename(js_path)
            new_chunk_name = old_chunk_name.replace(".js", "_p5.js")
            new_chunk_path = os.path.join(chunks_dir, new_chunk_name)

            print(f"[patch-rav] Patching mail client & settings chunk in {old_chunk_name} -> {new_chunk_name}...")
            if target2 in content:
                content = content.replace(target1, rep1).replace(target2, rep2).replace(target3, rep3).replace(target4, rep4)
                content = content.replace(rail_target, rail_rep)
                content = content.replace(watermark_target, watermark_rep)
                content = re.sub(r'document\.title\s*=\s*r\s*>\s*0\s*\?\s*`\(\${r}\)[^`]+`\s*:\s*["\'][^"\']+["\']', 'document.title=r>0?`(${r}) Webmail Inbox`:"Webmail Inbox"', content)
                content = re.sub(r'document\.title\s*=\s*r\s*>\s*0\s*\?\s*`\(\${r}\)\s*Webmail(?: Inbox)?`\s*:\s*["\']Webmail(?: Inbox)?["\']', 'document.title=r>0?`(${r}) Webmail Inbox`:"Webmail Inbox"', content)

            if target_tabs in content:
                content = content.replace(target_tabs, rep_tabs)
                content = content.replace(target_body, rep_body)

            with open(new_chunk_path, "w", encoding="utf-8") as f:
                f.write(content)

            update_chunk_references(root_static, old_chunk_name, new_chunk_name)
            for prev in ["_p1.js", "_p2.js", "_p3.js", "_p4.js"]:
                update_chunk_references(root_static, old_chunk_name.replace(".js", prev), new_chunk_name)
            main_patched = True

    if not main_patched:
        print("[patch-rav] Notice: Mail client target already patched or chunk not found.")

    # --- 3. Patch All HTML and TXT files for Title, Metadata and Font Preconnect ---
    font_links = (
        '<link rel="preconnect" href="https://fonts.googleapis.com">'
        '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
        '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,200..800&family=Plus+Jakarta+Sans:ital,wght@0,300..800;1,300..800&display=swap">'
        '<script>'
        'try{'
        'var _isLog=window.location.pathname.indexOf("/login")!==-1;'
        'document.title=_isLog?"Webmail Login":"Webmail Inbox";'
        'if(document.cookie.indexOf("rav-theme=light")===-1){document.documentElement.classList.add("dark");}'
        '}catch(e){}'
        'try{'
        'new MutationObserver(function(){'
        'var _isL=window.location.pathname.indexOf("/login")!==-1;'
        'if(_isL){'
        'if(document.title!=="Webmail Login")document.title="Webmail Login";'
        '}else{'
        'var t=document.title;'
        'if(!t||!t.includes("Webmail")){document.title="Webmail Inbox";}'
        '}'
        '}).observe(document.head,{subtree:true,characterData:true,childList:true});'
        '}catch(e){}'
        '</script>'
    )

    meta_count = 0
    for root, dirs, files in os.walk(root_static):
        for fname in files:
            if fname.endswith((".html", ".txt")):
                fpath = os.path.join(root, fname)
                try:
                    with open(fpath, "r", encoding="utf-8") as f:
                        content = f.read()
                    orig = content

                    is_login_page = "login" in fname.lower() or "login" in fpath.lower()
                    page_title = "Webmail Login" if is_login_page else "Webmail Inbox"

                    content = re.sub(r'<title>.*?</title>', f'<title>{page_title}</title>', content)
                    content = re.sub(r'(\\+["\'])children\1:\1(?:Rav|mailwart webmail|Webmail)\1', rf'\1children\1:\1{page_title}\1', content)
                    content = content.replace('children:"Rav"', f'children:"{page_title}"')
                    content = content.replace('"children":"Rav"', f'"children":"{page_title}"')
                    content = content.replace('children:"mailwart webmail"', f'children:"{page_title}"')
                    content = content.replace('"children":"mailwart webmail"', f'"children":"{page_title}"')
                    content = content.replace('content="Rav"', f'content="{page_title}"')
                    content = content.replace('content="mailwart webmail"', f'content="{page_title}"')
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
