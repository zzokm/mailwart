"use client"

import { ExternalLink } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export function RoundcubeButton({
  href,
  email,
  iconOnly = false,
}: {
  href: string
  email?: string
  iconOnly?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        delay={0}
        render={
          <Button
            variant="outline"
            size={iconOnly ? "icon-sm" : "sm"}
            nativeButton={false}
            render={
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open webmail for ${email ?? "mailbox"}`}
              />
            }
          />
        }
      >
        <ExternalLink className="size-3.5" data-icon={iconOnly ? undefined : "inline-start"} />
        {iconOnly ? null : "Open webmail"}
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">
        Opens {email ?? "this mailbox"} in webmail with a short-lived signed
        login.
      </TooltipContent>
    </Tooltip>
  )
}
