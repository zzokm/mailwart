import "server-only"

export {
  buildCopilotAiTools,
  buildDestructiveToolApproval,
  executeApprovedCopilotTool,
} from "./ai-tools"
export {
  COPILOT_TOOL_BY_NAME,
  COPILOT_TOOL_DEFS,
  countToolsByCategory,
  getCopilotToolDef,
  listCopilotToolNames,
  listCopilotTools,
  type CopilotToolName,
} from "./registry"
export {
  isAllowedDashboardHref,
  navigateToSchema,
  resolveNavigateTo,
  type NavigateToInput,
} from "./navigate"
export { sanitizeToolPayload, sanitizeToolResult } from "./sanitize"
export type {
  AwaitingApprovalResult,
  BuildAiToolsOptions,
  CopilotToolCategory,
  CopilotToolDef,
  CopilotToolRisk,
} from "./types"

/** @deprecated Prefer buildCopilotAiTools */
export { buildCopilotAiTools as buildAiTools } from "./ai-tools"
