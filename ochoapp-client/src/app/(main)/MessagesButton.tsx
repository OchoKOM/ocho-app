"use client";

import { Button } from "@/components/ui/button";
import { t } from "@/context/LanguageContext";
import kyInstance from "@/lib/ky";
import { NotificationCountInfo } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircleMore } from "lucide-react";
import OchoLink from "@/components/ui/OchoLink";
import { usePathname } from "next/navigation";
import { useSocket } from "@/components/providers/SocketProvider";
import { useEffect } from "react";

interface MessagesButtonProps {
  initialState: NotificationCountInfo;
  className?: string;
}

export default function MessagesButton({
  initialState,
  className,
}: MessagesButtonProps) {
  const pathname = usePathname();
  const isMessagesPage = pathname.startsWith("/messages");
  
  // 1. Récupération du socket et du client de requête
  const { socket, isConnected } = useSocket();
  const queryClient = useQueryClient();

  const { messages } = t(['messages']);

  // 2. Requête pour obtenir le nombre de rooms non lues
  const { data } = useQuery({
    queryKey: ["unread", "rooms", "count"],
    queryFn: () =>
      kyInstance
        .get("/api/rooms/unread-count")
        .json<NotificationCountInfo>(),
    initialData: initialState,
    // On ne refetch pas automatiquement au focus pour éviter le spam, 
    // on laisse le socket gérer les mises à jour
    refetchOnWindowFocus: false, 
  });

  // 3. Effet pour écouter les événements Socket
  useEffect(() => {
    if (!socket || !isConnected) return;

    // Fonction helper pour invalider le cache et forcer un rafraîchissement
    const refreshUnreadCount = () => {
      // Invalide la requête active correspondant à la clé ["unread", "rooms", "count"]
      // React Query va automatiquement relancer la requête API en arrière-plan
      queryClient.invalidateQueries({ queryKey: ["unread", "rooms", "count"] });
    };

    // A. Si on reçoit un nouveau message dans n'importe quelle room
    socket.on("unread_count_increment", refreshUnreadCount);

    // B. Si on marque une room comme lue
    socket.on("unread_count_cleared", refreshUnreadCount);

    // C. Si un message est supprimé (peut potentiellement changer le statut lu/non lu d'une room)
    socket.on("message_deleted", refreshUnreadCount);
    
    // D. Si on quitte une room
    socket.on("left_room", refreshUnreadCount);

    return () => {
      // Nettoyage des écouteurs
      socket.off("unread_count_increment", refreshUnreadCount);
      socket.off("unread_count_cleared", refreshUnreadCount);
      socket.off("message_deleted", refreshUnreadCount);
      socket.off("left_room", refreshUnreadCount);
    };
  }, [socket, isConnected, queryClient]);

  const { unreadCount } = data;

  return (
    <Button
      variant="ghost"
      className={cn(
        "flex items-center justify-start max-sm:h-fit max-sm:flex-1 max-sm:p-1.5 sm:gap-3",
        className,
      )}
      title={messages}
      asChild
    >
      <OchoLink
        href="/messages"
        className={cn("items-center max-sm:flex max-sm:flex-col text-inherit", className)}
      >
        <div className="relative">
          <MessageCircleMore />
          {!!unreadCount && (
            <span className="absolute -right-1 -top-1 rounded-full bg-[#dc143c] border-background border-[1px] px-1 text-xs font-medium tabular-nums text-white animate-in zoom-in duration-300">
              {unreadCount > 15 ? "15+" : unreadCount}
            </span>
          )}
        </div>
        <span className="text-xs sm:hidden">{messages}</span>
        <span className={cn("max-lg:hidden", isMessagesPage && "hidden")}>{messages}</span>
      </OchoLink>
    </Button>
  );
}