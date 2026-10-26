import type { TranslationKeys, Locale } from "./types"
import { en } from "./locales/en"
import { zhTW } from "./locales/zh-TW"

/**
 * Get typed translations for a given locale.
 * Zero dependencies, works in any environment.
 */
export function getTranslations(locale: Locale): TranslationKeys {
  switch (locale) {
    case "zh-TW":
      return zhTW
    default:
      return en
  }
}
