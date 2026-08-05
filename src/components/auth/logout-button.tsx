"use client"

import { LogOut } from "lucide-react"

import { logoutAction } from "@/lib/actions/auth"
import { SidebarMenuButton } from "@/components/ui/sidebar"

export function LogoutButton() {
  return (
    <form action={logoutAction} className="w-full">
      <SidebarMenuButton type="submit" tooltip="Sign out" className="w-full">
        <LogOut />
        <span>Sign out</span>
      </SidebarMenuButton>
    </form>
  )
}
