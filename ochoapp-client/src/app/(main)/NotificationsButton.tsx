"use client";

import { Button, ButtonProps } from "@/components/ui/button";
import { t } from "@/context/LanguageContext";
import kyInstance from "@/lib/ky";
import { NotificationCountInfo } from "@/lib/types";
import { cn } from "@/lib/utils";
import { VocabularyKey } from "@/lib/vocabulary";
import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import OchoLink from "@/components/ui/OchoLink";
import { usePathname } from "next/navigation";

interface NotificationsButtonProps extends ButtonProps {
  initialState: NotificationCountInfo;
  className?: string;
}

export default function NotificationsButton({
  initialState,
  className,
  ...props
}: NotificationsButtonProps) {
  const { activity, activityCenter, notifications } = t(['activity', 'activityCenter', 'notifications']);
  const pathname = usePathname();
  const isMessagesPage = pathname.startsWith("/messages");

  const { data } = useQuery({
    queryKey: ["notification", "count"],
    queryFn: () =>
      kyInstance
        .get("/api/notifications/unread-count")
        .json<NotificationCountInfo>(),
    initialData: initialState,
    refetchInterval: 5000,
    refetchOnMount: true,
  });

  return (
    <Button
      {...props}
      variant="ghost"
      className={cn(
        "flex items-center justify-start max-sm:h-fit max-sm:flex-1 max-sm:p-1.5 sm:gap-3",
        className,
      )}
      title={activityCenter}
      asChild
    >
      <OchoLink
        href="/notifications"
        className={cn("items-center max-sm:flex max-sm:flex-col text-inherit",
          className,
        )}
      >
        <div className="relative">
          <Bell />
          {!!data.unreadCount && (
            <span className="absolute -right-1 -top-1 rounded-full bg-[#dc143c] border-background border-[1px] px-1 text-xs font-medium tabular-nums text-white">
              {data.unreadCount}
            </span>
          )}
        </div>
        <span className="text-xs sm:hidden">{activity}</span>
        <span className={cn("max-lg:hidden", isMessagesPage && "hidden")}>{notifications}</span>
      </OchoLink>
    </Button>
  );
}
