import i18n from 'i18next'
import { initReactI18next, useTranslation } from 'react-i18next'
import { APP_LANGUAGES, type AppLanguage } from '../../shared/ipc-types'
import en from './locales/en.json'
import zh from './locales/zh.json'

export type TranslationKey = keyof typeof en

export const APP_LOCALES: Record<AppLanguage, string> = {
  en: 'en-US',
  zh: 'zh-CN',
}

void i18n.use(initReactI18next).init({
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  keySeparator: false,
  lng: 'en',
  resources: {
    en: { translation: en },
    zh: { translation: zh },
  },
})

export function normalizeAppLanguage(language: string | undefined): AppLanguage {
  return language === 'zh' ? 'zh' : 'en'
}

export function useI18n() {
  const { i18n: instance, t } = useTranslation()
  const language = normalizeAppLanguage(instance.resolvedLanguage ?? instance.language)

  return {
    language,
    locale: APP_LOCALES[language],
    t: (key: TranslationKey) => t(key),
  }
}

export { APP_LANGUAGES, i18n }
