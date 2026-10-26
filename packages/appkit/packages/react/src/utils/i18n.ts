/**
 * i18n — ponytail approach: static key-value map, no framework dependency.
 *
 * All UI strings go through here. No hardcoded text in components.
 * To add a language: copy this file and translate the values.
 */

export type Locale = "en" | "zh";

const en = {
  // Storage security
  "storage.critical.title": "Insecure Storage Detected",
  "storage.critical.body": "Your browser does not support IndexedDB. Wallet data is stored in plaintext in localStorage and could be exposed to XSS attacks. We strongly recommend switching to a modern browser.",
  "storage.warning.title": "Storage Security Warning",
  "storage.warning.body": "Your browser does not support IndexedDB, but your wallet data is encrypted with AES-256-GCM. Consider switching browsers for better origin isolation.",

  // Address validation
  "address.empty": "Address is empty",
  "address.invalid_format": "Invalid address format (expected 0x + 40 hex chars)",
  "address.zero_address": "Address is the zero address — funds would be permanently lost",
  "address.burn_address": "Address appears to be a burn address — funds would be permanently lost",

  // General wallet
  "wallet.connect": "Connect Wallet",
  "wallet.disconnect": "Disconnect",
  "wallet.connecting": "Connecting...",
  "wallet.copy_address": "Copy address",
  "wallet.copied": "Copied!",
  "wallet.view_on_explorer": "View on Explorer",
  "wallet.retry": "Retry",
  "wallet.connection_failed": "Connection failed",
  "wallet.scan_qr": "Scan with your wallet app",

  // Embedded wallet
  "embedded.generate": "Create Wallet",
  "embedded.import": "Import Wallet",
  "embedded.backup_seed": "Back up your seed phrase",
  "embedded.backup_warning": "Anyone with your seed phrase can access your funds. Store it securely.",
  "embedded.backup_done": "I've saved my seed phrase",
  "embedded.wipe": "Remove Wallet",
  "embedded.wipe_confirm": "Are you sure? This cannot be undone.",
} as const;

const zh: Record<keyof typeof en, string> = {
  "storage.critical.title": "偵測到不安全儲存",
  "storage.critical.body": "您的瀏覽器不支援 IndexedDB。錢包資料以明文儲存在 localStorage 中，可能暴露於 XSS 攻擊。強烈建議更換至現代瀏覽器。",
  "storage.warning.title": "儲存安全警告",
  "storage.warning.body": "您的瀏覽器不支援 IndexedDB，但錢包資料已使用 AES-256-GCM 加密。建議更換瀏覽器以獲得更好的隔離保護。",

  "address.empty": "地址為空",
  "address.invalid_format": "無效的地址格式（應為 0x + 40 個十六進位字元）",
  "address.zero_address": "此為零地址 — 資金將永久丟失",
  "address.burn_address": "此地址為燒毀地址 — 資金將永久丟失",

  "wallet.connect": "連接錢包",
  "wallet.disconnect": "斷開連線",
  "wallet.connecting": "連線中...",
  "wallet.copy_address": "複製地址",
  "wallet.copied": "已複製！",
  "wallet.view_on_explorer": "在瀏覽器查看",
  "wallet.retry": "重試",
  "wallet.connection_failed": "連線失敗",
  "wallet.scan_qr": "使用錢包 App 掃描",

  "embedded.generate": "建立錢包",
  "embedded.import": "匯入錢包",
  "embedded.backup_seed": "備份助記詞",
  "embedded.backup_warning": "任何人取得您的助記詞都可以存取您的資金。請安全儲存。",
  "embedded.backup_done": "我已儲存助記詞",
  "embedded.wipe": "移除錢包",
  "embedded.wipe_confirm": "確定要移除嗎？此操作無法復原。",
};

const locales = { en, zh } as const;

let currentLocale: Locale = "en";

export function setLocale(locale: Locale): void {
  currentLocale = locale;
}

export function getLocale(): Locale {
  return currentLocale;
}

export function t(key: keyof typeof en): string {
  return locales[currentLocale][key] ?? locales.en[key] ?? key;
}
