"use client";

import { TimeFormatter } from "@/lib/formatters";
import { useLanguage } from "@/context/LanguageContext";

interface TimeProps {
  time: Date;
  clock?: boolean;
  relative?: boolean;
  full?: boolean;
  long?: boolean;
  lowerCase?: boolean;
  upperCase?: boolean;
  calendar?: boolean;
  withTime?: boolean;
}

export default function Time({
  time,
  relative,
  full,
  clock = false,
  long = false,
  lowerCase = false,
  upperCase = false,
  withTime = false,
  calendar = false,
}: TimeProps) {
  // Récupérer la langue de l'utilisateur
  const { language: lang } = useLanguage();

  const timeFormatter = new TimeFormatter(time, { lang, long, full, relative, calendar, withTime, clock });
  const formatTime = timeFormatter.format();

  const formattedTime = !(lowerCase || upperCase)
    ? formatTime
    : lowerCase
      ? formatTime.toLowerCase()
      : formatTime.toUpperCase();

  return <time>{formattedTime}</time>;
}