export type WebmailClientType = "rav" | "roundcube"

export interface RavFeatures {
  /** Local Rust-native Tantivy full-text search indexing across bodies and headers */
  tantivySearch: boolean
  /** Real-time push mailbox updates via WebSocket & IMAP IDLE */
  websocketLive: boolean
  /** Client-side OpenPGP key management, digital signing, and message encryption */
  pgpSuite: boolean
  /** HMAC-signed privacy link proxy preventing IP address leaks to tracking pixels */
  linkProxy: boolean
  /** Mood reaction stickers in composer and email threads */
  stickers: boolean
  /** Modern Tiptap rich-text & Markdown composer instead of plain text */
  richTextEditor: boolean
}

export interface RoundcubeFeatures {
  /** Native ManageSieve sieve filter synchronization via port 4190 */
  manageSieveSync: boolean
  /** Out-of-office vacation autoresponder synchronization */
  vacationResponder: boolean
  /** Zipdownload & bulk archive export plugins */
  zipDownload: boolean
  /** Elastic adaptive skin layout optimization for desktop, tablet, and mobile */
  elasticSkin: boolean
  /** 3-pane split preview mode */
  previewPane: boolean
}

export interface WebmailSettings {
  client: WebmailClientType
  openInNewTab: boolean
  ravFeatures: RavFeatures
  roundcubeFeatures: RoundcubeFeatures
  updatedAt?: string
}

export const DEFAULT_RAV_FEATURES: RavFeatures = {
  tantivySearch: true,
  websocketLive: true,
  pgpSuite: true,
  linkProxy: true,
  stickers: false,
  richTextEditor: true,
}

export const DEFAULT_ROUNDCUBE_FEATURES: RoundcubeFeatures = {
  manageSieveSync: true,
  vacationResponder: true,
  zipDownload: true,
  elasticSkin: true,
  previewPane: true,
}

export const DEFAULT_WEBMAIL_SETTINGS: WebmailSettings = {
  client: "rav",
  openInNewTab: true,
  ravFeatures: DEFAULT_RAV_FEATURES,
  roundcubeFeatures: DEFAULT_ROUNDCUBE_FEATURES,
}
