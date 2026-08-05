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
}: {
  href: string
  email?: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        delay={0}
        render={
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<a href={href} target="_blank" rel="noreferrer" />}
          />
        }
      >
        <ExternalLink data-icon="inline-start" />
        Open webmail
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">
        Opens Roundcube
        {email ? ` with ${email} prefilled` : ""}. Enter the mailbox password —
        no SSO.
      </TooltipContent>
    </Tooltip>
  )
}
