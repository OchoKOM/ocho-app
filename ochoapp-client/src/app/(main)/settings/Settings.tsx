"use client";

import UserAvatar from "@/components/UserAvatar";
import { useSession } from "../SessionProvider";
import OchoLink from "@/components/ui/OchoLink";
import { Button } from "@/components/ui/button";
import { Language,  } from "@/lib/vocabulary";
import { t } from "@/context/LanguageContext";
import { CheckCircle2, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export type SettingsOption = {
  value: string;
  label: string;
  icon: JSX.Element;
  action: "default" | "destructive";
  onClick: (value: string | Language) => void;
  active?: boolean;
  hasSubMenu?: boolean;
  dialogElement?: JSX.Element;
};

interface SettingsProps {
  setting?: string | null;
  label?: string | null;
  options: SettingsOption[];
}

export default function Settings({
  setting = null,
  label = null,
  options,
}: SettingsProps) {
  const { user } = useSession();
  const [currentDialog, setCurrentDialog] = useState<JSX.Element | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTitle, setDialogTitle] = useState<string | null>(null);
  const viewProfile = t("viewProfile");

  if (!user) return null;
  return (
    <>
      <Dialog
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setCurrentDialog(null);
        }}
        open={dialogOpen}
      >
        <DialogContent>
          <DialogTitle>{dialogTitle}</DialogTitle>
          {currentDialog}
        </DialogContent>
      </Dialog>
      <div className="flex w-full min-w-0 flex-col gap-5 pb-3">
        <div className="flex w-full flex-col items-center gap-5">
          {setting && label ? (
            <h2 className="text-center text-2xl font-bold">{label}</h2>
          ) : (
            <>
              <UserAvatar userId={user.id} avatarUrl={user.avatarUrl} size={100} />
              <div className="flex flex-col items-center">
                <h1 className="text-3xl font-extrabold">{user.displayName}</h1>
                <span className="text-muted-foreground">@{user.username}</span>
              </div>
              <OchoLink
                href={`/users/${user.username}`}
                className="text-inherit"
              >
                <Button variant="outline">{viewProfile}</Button>
              </OchoLink>
            </>
          )}
        </div>
        <div className="w-full select-none">
          <ul className="flex w-full flex-col gap-2 rounded-2xl bg-card p-2 shadow-sm max-sm:rounded-none max-sm:bg-card/50">
            {options
              .filter(({ action }) => action === "default")
              .map(
                ({
                  value,
                  label,
                  icon,
                  onClick,
                  hasSubMenu,
                  active,
                  dialogElement,
                }) => (
                  <li
                    key={value}
                    className="flex cursor-pointer items-center gap-3 rounded-2xl p-2 text-lg hover:bg-accent max-sm:rounded-sm"
                    onClick={() => {
                      if (dialogElement) {
                        setDialogTitle(label);
                        setDialogOpen(true);
                        setCurrentDialog(dialogElement);
                      } else {
                        onClick(value);
                      }
                    }}
                  >
                    {icon}
                    <span className="flex-1">{label}</span>
                    {active && <CheckCircle2 />}
                    {hasSubMenu && <ChevronRight size={24} />}
                  </li>
                ),
              )}
          </ul>
          <ul className="flex w-full flex-col gap-2 rounded-2xl py-2 shadow-sm max-sm:px-2">
            {options
              .filter(({ action }) => action === "destructive")
              .map(
                ({
                  value,
                  label,
                  icon,
                  onClick,
                  active,
                  hasSubMenu,
                  dialogElement,
                }) => (
                  <li
                    key={value}
                    className="flex cursor-pointer items-center gap-3 rounded-2xl p-2 px-4 text-lg text-destructive hover:bg-accent max-sm:rounded-sm max-sm:px-2"
                    onClick={() => {
                      if (dialogElement) {
                        setDialogTitle(label);
                        setDialogOpen(true);
                        setCurrentDialog(dialogElement);
                      } else {
                        onClick(value);
                      }
                    }}
                  >
                    {icon}
                    <span className="flex-1">{label}</span>
                    {active && <CheckCircle2 />}
                    {hasSubMenu && <ChevronRight size={24} />}
                  </li>
                ),
              )}
          </ul>
        </div>
      </div>
    </>
  );
}
