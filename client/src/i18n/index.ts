import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import zh from "./locales/zh.json";
import ru from "./locales/ru.json";

const resources = {
  en: { translation: en },
  zh: { translation: zh },
  ru: { translation: ru },
};

let savedLanguage = "en";
try {
  savedLanguage = localStorage.getItem("language") || "en";
} catch {
  savedLanguage = "en";
}

i18n.use(initReactI18next).init({
  resources,
  lng: savedLanguage,
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;

export const languages = [
  { code: "en", name: "English", flag: "🇺🇸" },
  { code: "zh", name: "中文", flag: "🇨🇳" },
  { code: "ru", name: "Русский", flag: "🇷🇺" },
];

export const changeLanguage = (lang: string) => {
  i18n.changeLanguage(lang);
  localStorage.setItem("language", lang);
};
