import "server-only"

export { jmapCall, responseById } from "./client"
export * from "./types"
export { StalwartError } from "./errors"
export {
  queryDomains,
  getDomain,
  createDomain,
  updateDomain,
  destroyDomain,
} from "./domains"
export {
  queryAccounts,
  getAccount,
  createAccount,
  updateAccount,
  updateAccountPassword,
  destroyAccount,
  bulkCreateAccounts,
} from "./accounts"
export { hydrateAccounts, parseEmailAddress, resolveAccountEmail } from "./email"
export { buildDnsChecklist, getDomainDnsHealth } from "./dns"
export {
  queryAppPasswordsLive,
  createAppPasswordLive,
  destroyAppPasswordLive,
} from "./app-passwords"
export { probeAccountCredentials } from "./credentials"
export {
  MOCK_DOMAINS,
  MOCK_ACCOUNTS,
  MOCK_FORWARDING_RULES,
  mockDomainList,
  mockOverviewStats,
  mockHealth,
  getMockStore,
} from "./mock"
export {
  parseEmailAliases,
  serializeEmailAliases,
  deriveCatchAllMode,
  catchAllLabel,
  deriveMailExchanger,
  mailExchangerToAllowRelaying,
  isExternalEmail,
  validateForwardTargets,
  updateDomainRouting,
  updateAccountAliases,
} from "./routing"
