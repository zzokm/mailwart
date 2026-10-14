import "server-only"

export { jmapCall, responseById } from "./client"
export * from "./types"
export { StalwartError, formatSetFailure, mapHttpError } from "./errors"
export { parseActionError, describeJmapDetails } from "./parse-error"
export {
  queryDomains,
  getDomain,
  createDomain,
  updateDomain,
  destroyDomain,
  migrateAllDomainsToManual,
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
  MOCK_AUTORESPONDERS,
  MOCK_FILTER_RULES,
  MOCK_SPAM_SETTINGS,
  mockDomainList,
  mockOverviewStats,
  mockHealth,
  getMockStore,
} from "./mock"
export {
  queryDeliveryTracesLive,
  deliveryUnavailableNote,
  MOCK_DELIVERY_EVENTS,
  type DeliveryFetchResult,
} from "./delivery"
export {
  getStalwartDkimSignaturesForDomain,
  type StalwartDkimInfo,
} from "./dkim"
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
export {
  buildFilterSieve,
  buildVacationSieve,
  summarizeFilter,
  normalizeAddressList,
  parseAddressListText,
  probeSieveJmapSupport,
  loadLiveSpamSettings,
} from "./filters"
export {
  ensureMailboxesOnAllDomains,
  sendSmtpMessage,
  runDeliverabilityTest,
  DEFAULT_TEST_PASSWORD,
  type MailboxConnectionProfile,
} from "./deliverability"
