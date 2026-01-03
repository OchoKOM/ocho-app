"use client";

import { Button } from "@/components/ui/button";
import { Compass, Home, Search, Settings, Settings2Icon } from "lucide-react";
import OchoLink from "@/components/ui/OchoLink";
import NotificationsButton from "./NotificationsButton";
import { useSession } from "./SessionProvider";
import { useSearch } from "@/context/SearchContext";
import { useNavigation } from "@/context/NavigationContext";
import { cn } from "@/lib/utils";
import MessagesButton from "./MessagesButton";
import { t } from "@/context/LanguageContext";
import { VocabularyObject } from "@/lib/vocabulary";
import { usePathname } from "next/navigation";

interface MenuBarProps {
  className?: string;
}

export default function MenuBar({ className }: MenuBarProps) {
  const { user } = useSession();
  const { setSearchActive } = useSearch();
  const { currentNavigation } = useNavigation();

  const { home, explore, search, settings, menu }: VocabularyObject = t(['home', 'explore', 'search', 'settings', 'menu']);
  const pathname = usePathname();
  const isMessagesPage = pathname.startsWith("/messages");

  if (!user) return null;

  return (
    <div className={cn(className, isMessagesPage && "xl:w-fit")}>
      <Button
        variant="ghost"
        className={cn(
          "flex items-center justify-start max-sm:h-fit max-sm:flex-1 max-sm:p-1.5 sm:gap-3",
          currentNavigation === "home" &&
            "bg-accent text-primary hover:text-primary",
        )}
        title={home}
        asChild
      >
        <OchoLink
          href="/"
          className={cn(
            "items-center text-inherit max-sm:flex max-sm:flex-col",
            currentNavigation === "home" &&
              "bg-accent text-primary hover:text-primary",
          )}
        >
          <Home />
          <span className="text-xs sm:hidden">{home}</span>
          <span className={cn("max-lg:hidden", isMessagesPage && "hidden")}>{home}</span>
        </OchoLink>
      </Button>
      <Button
        variant="ghost"
        className={cn(
          "flex items-center justify-start max-sm:h-fit max-sm:flex-1 max-sm:p-1.5 sm:hidden sm:gap-3",
          currentNavigation === "explore" &&
            "bg-accent text-primary hover:text-primary",
        )}
        title={explore}
        asChild
      >
        <OchoLink
          href="/explore"
          className={cn(
            "items-center text-inherit max-sm:flex max-sm:flex-col",
            currentNavigation === "explore" &&
              "text-primary hover:text-primary",
          )}
        >
          <Compass />
          <span className="text-xs">{explore}</span>
        </OchoLink>
      </Button>
      <Button
        variant="ghost"
        className={cn(
          "flex items-center justify-start max-sm:hidden max-sm:h-fit max-sm:flex-1 max-sm:p-1.5 sm:gap-3",
          currentNavigation === "explore" &&
            "bg-accent text-primary hover:text-primary",
        )}
        title={search}
        asChild
      >
        <OchoLink
          href="/search"
          className={cn(
            "text-inherit",
            currentNavigation === "explore" &&
              "text-primary hover:text-primary",
          )}
          onClick={() => setSearchActive(true)}
        >
          <Search />
          <span className={cn("max-lg:hidden", isMessagesPage && "hidden")}>{search}</span>
        </OchoLink>
      </Button>

      <NotificationsButton
        initialState={{ unreadCount: 0 }}
        className={cn(
          currentNavigation === "activity" &&
            "bg-accent text-primary hover:text-primary",
        )}
      />
      <MessagesButton
        initialState={{ unreadCount: 0 }}
        className={cn(
          currentNavigation === "messages" &&
            "bg-accent text-primary hover:text-primary",
        )}
      />
      <Button
        variant="ghost"
        className={cn(
          "flex items-center justify-start max-sm:h-fit max-sm:flex-1 max-sm:p-1.5 sm:hidden sm:gap-3",
        )}
        title={menu}
        asChild
      >
        <OchoLink
          href="/settings"
          className={cn(
            "items-center text-inherit max-sm:flex max-sm:flex-col",
            currentNavigation === "settings" &&
              "bg-accent text-primary hover:text-primary",
          )}
        >
          <Settings2Icon />
          <span className="text-xs">{menu}</span>
        </OchoLink>
      </Button>
      <Button
        variant="ghost"
        className={cn(
          "flex items-center justify-start max-sm:hidden max-sm:h-fit max-sm:flex-1 max-sm:p-1.5 sm:gap-3",
        )}
        title={settings}
        asChild
      >
        <OchoLink
          href="/settings"
          className={cn(
            "items-center text-inherit max-sm:hidden max-sm:flex-col",
            currentNavigation === "settings" &&
              "bg-accent text-primary hover:text-primary",
          )}
        >
          <Settings className="max-sm" />
          <span className={cn("max-lg:hidden", isMessagesPage && "hidden")}>{settings}</span>
        </OchoLink>
      </Button>
    </div>
  );
}
