"use client";

import {
  UserRound,
  LockKeyholeIcon,
  SunMoonIcon,
  EarthIcon,
  LogOutIcon,
  Cake,
  AtSign,
  CarFront,
  Snowflake,
  Trash2,
  CirclePower,
  Paintbrush2,
  SunIcon,
  Moon,
} from "lucide-react";
import Settings, { SettingsOption } from "./Settings";
import { logout } from "@/app/(auth)/actions";
import { useQueryClient } from "@tanstack/react-query";
import French from "@/components/flags/French";
import { useTheme } from "next-themes";
import US from "@/components/flags/US";
import { t, useLanguage } from "@/context/LanguageContext";
import { Language } from "@/lib/vocabulary";
import { useProgress } from "@/context/ProgressContext";
import BirthdayDialog from "./BirthdayDialog";
import PasswordDialog from "./PasswordDialog";
import UsernameDialog from "./UsernameDialog";
import ExportDataDialog from "./ExportDataDialog";
import DisableAccountDialog from "./DisableAccountDialog";
import DeleteAccountDialog from "./DeleteAccountDialog";
import ProfileVisibilityDialog from "./ProfileVisibilityDialog";
import PostPrivacyDialog from "./PostPrivacyDialog";
import MessagePrivacyDialog from "./MessagePrivacyDialog";
import OnlineStatusVisibilityDialog from "./OnlineStatusVisibilityDialog";

interface OptionsProps {
  setting?: string | null;
  subOption?: boolean;
}

export default function Options({
  setting = null,
  subOption = false,
}: OptionsProps) {
  const { startNavigation: navigate } = useProgress();
  const { theme, setTheme } = useTheme();
  const { language, setLanguage } = useLanguage();

  const {
    account,
    privacy,
    display,
    language: languageText,
    logout: logoutText,
    birthday,
    password,
    username,
    exportMyData,
    disableMyAccount,
    deleteMyAccount,
    onlineStatus,
    system,
    light,
    dark,
    profileVisibility,
    postPrivacy,
    messagePrivacy,
    onlineStatusVisibility,
  } = t([
    "account",
    "privacy",
    "display",
    "language",
    "logout",
    "birthday",
    "password",
    "username",
    "exportMyData",
    "disableMyAccount",
    "deleteMyAccount",
    "onlineStatus",
    "system",
    "light",
    "dark",
    "profileVisibility",
    "postPrivacy",
    "messagePrivacy",
    "onlineStatusVisibility",
  ]
  );

  const queryClient = useQueryClient();

  const subOptions: Record<string, SettingsOption[]> = {
    account: [
      {
        value: "birthday",
        label: birthday,
        icon: <Cake size={24} />,
        action: "default" as const,
        onClick: (value) => {
          console.log(value);
        },
        dialogElement: <BirthdayDialog />,
      },
      {
        value: "password",
        label: password,
        icon: <LockKeyholeIcon size={24} />,
        action: "default",
        onClick: (value: string) => console.log(value),
        dialogElement: <PasswordDialog />,
      },
      {
        value: "username",
        label: username,
        icon: <AtSign size={24} />,
        action: "default",
        onClick: (value: string) => console.log(value),
        dialogElement: <UsernameDialog />,
      },
      {
        value: "export",
        label: exportMyData,
        icon: <CarFront size={24} />,
        action: "default",
        onClick: (value: string) => console.log(value),
        dialogElement: <ExportDataDialog />,
      },
      {
        value: "hibernate",
        label: disableMyAccount,
        icon: <Snowflake size={24} />,
        action: "destructive",
        onClick: (value: string) => console.log(value),
        dialogElement: <DisableAccountDialog />,
      },
      {
        value: "delete",
        label: deleteMyAccount,
        icon: <Trash2 size={24} />,
        action: "destructive",
        onClick: (value: string) => console.log(value),
        dialogElement: <DeleteAccountDialog />,
      },
    ],
    privacy: [
      {
        value: "profile-visibility",
        label: profileVisibility,
        icon: <UserRound size={24} />,
        action: "default",
        onClick: (value: string) => console.log(value),
        dialogElement: <ProfileVisibilityDialog />,
      },
      {
        value: "post-privacy",
        label: postPrivacy,
        icon: <LockKeyholeIcon size={24} />,
        action: "default",
        onClick: (value: string) => console.log(value),
        dialogElement: <PostPrivacyDialog />,
      },
      {
        value: "online-status-visibility",
        label: onlineStatusVisibility,
        icon: <CirclePower size={24} />,
        action: "default",
        onClick: (value: string) => console.log(value),
        dialogElement: <OnlineStatusVisibilityDialog />,
      },
    ],
    display: [
      {
        value: "default",
        label: system,
        icon: <Paintbrush2 size={24} />,
        action: "default",
        active: theme === "system",
        onClick: () => setTheme("system"),
      },
      {
        value: "light",
        label: light,
        icon: <SunIcon size={24} />,
        action: "default",
        active: theme === "light",
        onClick: (value: string) => setTheme(value),
      },
      {
        value: "dark",
        label: dark,
        icon: <Moon size={24} />,
        action: "default",
        active: theme === "dark",
        onClick: (value: string) => setTheme(value),
      },
    ],
    language: [
      {
        value: "fr",
        label: "Français",
        icon: <French size={24} />,
        action: "default",
        active: language === "fr",
        onClick: (value: string | Language) => setLanguage(value as Language),
      },
      {
        value: "en",
        label: "English",
        icon: <US size={24} />,
        action: "default",
        active: language === "en",
        onClick: (value: string | Language) => setLanguage(value as Language),
      },
    ],
  };
  const options: SettingsOption[] = [
    {
      value: "account",
      label: account,
      icon: <UserRound size={24} />,
      action: "default",
      onClick: (value) => navigate(`/settings/${value}`),
      hasSubMenu: !!subOptions.account,
    },
    {
      value: "privacy",
      label: privacy,
      icon: <LockKeyholeIcon size={24} />,
      action: "default",
      onClick: (value) => navigate(`/settings/${value}`),
      hasSubMenu: !!subOptions.privacy,
    },
    {
      value: "display",
      label: display,
      icon: <SunMoonIcon size={24} />,
      action: "default",
      onClick: (value) => navigate(`/settings/${value}`),
      hasSubMenu: !!subOptions.display,
    },
    {
      value: "language",
      label: languageText,
      icon: <EarthIcon size={24} />,
      action: "default",
      onClick: (value) => navigate(`/settings/${value}`),
      hasSubMenu: !!subOptions.language,
    },
    {
      value: "logout",
      label: logoutText,
      icon: <LogOutIcon size={24} />,
      action: "destructive",
      onClick: () => {
        queryClient.clear();
        logout();
      },
    },
  ];

  // Verifier si l'option est un sous-menu si oui trouver le label dans les options et la liste des menus dans subOptions
  if (subOption && setting) {
    const option: SettingsOption[] =
      subOptions[setting as keyof typeof subOptions];
    const label = options.find((option) => option.value === setting)?.label;
    if (!option || !label) {
      navigate("/settings");
      return null;
    }
    return <Settings options={option} setting={setting} label={label} />;
  }


  return <Settings options={options} setting={setting} />;
}
