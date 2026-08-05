export type CopilotToolUiMetadata = {
  label: string
  preparing: string
  running: string
  completed: string
}

const ACRONYMS: Record<string, string> = {
  dkim: "DKIM",
  dmarc: "DMARC",
  dns: "DNS",
  spf: "SPF",
  mx: "MX",
  csv: "CSV",
  id: "ID",
}

function words(name: string): string {
  return name
    .split("_")
    .map((word) => ACRONYMS[word] ?? word)
    .join(" ")
}

function sentence(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export function getCopilotToolUiMetadata(
  name: string
): CopilotToolUiMetadata {
  const phrase = words(name)
  const label = sentence(phrase)
  const verb = name.split("_")[0]
  const object = words(name.split("_").slice(1).join("_")) || "request"
  const present: Record<string, string> = {
    get: `Loading ${object}`,
    list: `Listing ${object}`,
    create: `Creating ${object}`,
    update: `Updating ${object}`,
    upsert: `Updating ${object}`,
    refresh: `Checking ${object}`,
    generate: `Generating ${object}`,
    set: `Setting ${object}`,
    reset: `Resetting ${object}`,
    revoke: `Revoking ${object}`,
    destroy: `Deleting ${object}`,
    suspend: `Updating ${object}`,
    prepare: `Preparing ${object}`,
    commit: `Committing ${object}`,
    abort: `Stopping ${object}`,
    pause: `Pausing ${object}`,
    resume: `Resuming ${object}`,
    bulk: `Processing ${object}`,
    navigate: `Preparing destination`,
    ask: `Preparing question`,
  }
  const completed: Record<string, string> = {
    get: `${sentence(object)} loaded`,
    list: `${sentence(object)} loaded`,
    create: `${sentence(object)} created`,
    update: `${sentence(object)} updated`,
    upsert: `${sentence(object)} updated`,
    refresh: `${sentence(object)} checked`,
    generate: `${sentence(object)} generated`,
    set: `${sentence(object)} set`,
    reset: `${sentence(object)} reset`,
    revoke: `${sentence(object)} revoked`,
    destroy: `${sentence(object)} deleted`,
    suspend: `${sentence(object)} updated`,
    prepare: `${sentence(object)} prepared`,
    commit: `${sentence(object)} committed`,
    abort: `${sentence(object)} stopped`,
    pause: `${sentence(object)} paused`,
    resume: `${sentence(object)} resumed`,
    bulk: `${sentence(object)} processed`,
    navigate: "Destination ready",
    ask: "Question ready",
  }
  return {
    label,
    preparing: `Preparing ${object}…`,
    running: `${present[verb] ?? `Processing ${object}`}…`,
    completed: `${completed[verb] ?? `${label} completed`}.`,
  }
}
