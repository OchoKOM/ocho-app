"use client";

import { createContext, useContext, useState, useEffect } from "react";
import {
  allVocabularyKeys,
  Language,
  vocabulary,
  VocabularyKey,
  VocabularyObject,
} from "@/lib/vocabulary";
import Cookies from "js-cookie";
import { useSession } from "@/app/(main)/SessionProvider";
import { useProgress } from "./ProgressContext";

type LanguageContextType = {
  language: Language;
  setLanguage: (lang: Language) => void;
};

// Contexte initial
const LanguageContext = createContext<LanguageContextType>({
  language: "en",
  setLanguage: () => {},
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [language, setLanguage] = useState<Language>("en");
  const { user } = useSession();
  const { startNavigation: navigate } = useProgress();

  const userId = user?.id || "guest";

  // Charger la langue au démarrage
  useEffect(() => {
    const browserLang = navigator.language.startsWith("fr") ? "fr" : "en";
    const storedLang =
      Cookies.get(`lang-${userId}`) ||
      localStorage.getItem(`lang-${userId}`) ||
      browserLang;

    const shortLang = storedLang.split("-")[0] as Language;
    setLanguage(shortLang as Language);

    // Sauvegarder la langue côté serveur (cookie) si non défini
    if (!Cookies.get(`lang-${userId}`)) {
      Cookies.set(`lang-${userId}`, shortLang, { expires: 365 });
      Cookies.set(`lang-guest`, shortLang, { expires: 365 });
    }
  }, [userId]);
  
  // Mettre à jour la langue côté client et serveur
  const changeLanguage = (lang: Language) => {
    setLanguage(lang);
    localStorage.setItem(`lang-${userId}`, lang);
    localStorage.setItem(`lang-guest`, lang);
    Cookies.set(`lang-${userId}`, lang, { expires: 365 });
    Cookies.set(`lang-guest`, lang, { expires: 365 });
    navigate(); // Recharger pour refléter la nouvelle langue si nécessaire
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage: changeLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
};

// Hook pour utiliser le contexte de langue
export const useLanguage = () => useContext(LanguageContext);

// Fonction pour récupérer une ou plusieurs traductions côté client
export function t(keys: VocabularyKey[]): Record<VocabularyKey, string>;
export function t(keys: VocabularyKey): string;
export function t( keys: VocabularyKey | VocabularyKey[], replacements: Record<string, string | number>): string;
export function t(): VocabularyObject;
export function t(
  keys?: VocabularyKey | VocabularyKey[],
  replacements?: Record<string, string | number>,
): VocabularyObject | string | Record<VocabularyKey, string> {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { language } = useLanguage();

  if (keys === undefined) {
    // Return full object
    return allVocabularyKeys.reduce(
      (acc, key) => {
        acc[key] = vocabulary[language][key];
        return acc;
      },
      {} as VocabularyObject,
    );
  }

  // Si replacements est fourni, traiter comme interpolation pour une clé unique
  if (replacements && !Array.isArray(keys)) {
    let translation = vocabulary[language][keys];
    Object.entries(replacements).forEach(([key, value]) => {
      translation = translation.replace(new RegExp(`\\[${key}\\]`, 'g'), String(value));
      translation = translation.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
    });
    return translation;
  }

  // Convertir une clé unique en tableau pour simplifier le traitement
  const keysArray = Array.isArray(keys) ? keys : [keys];

  // Construire un objet avec les traductions demandées
  const result = keysArray.reduce(
    (acc, key) => {
      acc[key] = vocabulary[language][key];
      return acc;
    },
    {} as Record<string, string>,
  );

  return Array.isArray(keys) ? result : result[keys];
}
