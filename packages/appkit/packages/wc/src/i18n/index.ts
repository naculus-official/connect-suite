/**
 * Shared i18n — used by both Stencil WCs and React components.
 *
 * Locale data is co-located with WCs for hot reload in Stencil dev server.
 * React imports the same source via path alias or from the built WC package.
 */

export type { TranslationKeys, Locale } from "./types"
export { en } from "./locales/en"
export { zhTW } from "./locales/zh-TW"
export { getTranslations } from "./translator"
