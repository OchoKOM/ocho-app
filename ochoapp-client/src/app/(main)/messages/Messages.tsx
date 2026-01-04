"use client";

import { useEffect, useState } from "react";
import { useSession } from "../SessionProvider";
import ChatList from "./SideBar";
import { RoomData } from "@/lib/types";
import Chat from "./Chat";
import { useActiveRoom } from "@/context/ChatContext";
import NewChat from "./NewChat";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import AppLogo from "@/components/AppLogo";
import { t } from "@/context/LanguageContext";
import { useProgress } from "@/context/ProgressContext";
import { useSocket } from "@/components/providers/SocketProvider";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, WifiOff } from "lucide-react";

export default function Messages() {
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [newChat, setNewChat] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<RoomData>();
  const { user } = useSession();
  const { activeRoomId, setActiveRoomId } = useActiveRoom();
  const queryClient = useQueryClient();
  const { startNavigation: navigate } = useProgress();
  const { socket, isConnected, isConnecting, retryConnection } = useSocket();
  const { messagesOnApp, selectChatToStart } = t([
    "messagesOnApp",
    "selectChatToStart",
  ]);

  if (!user) {
    return null;
  }

  const handleRoomSelect = (roomId: string) => {
    queryClient.invalidateQueries({ queryKey: ["unread-chat-messages"] });
    queryClient.invalidateQueries({ queryKey: ["unread-messages"] });
    setSelectedRoomId(roomId);
  };

  const closeNewChat = () => {
    setNewChat(false);
  };

  // Fonction manuelle pour retenter la connexion
  const handleRetryConnection = () => {
    if (socket) {
      // When automatic reconnection fails, call retryConnection
      if (!isConnected && !isConnecting) {
        retryConnection();
      }
    } else {
      window.location.reload();
    }
  };

  // NOTE: L'ancien blocage "if (!isConnected && !isConnecting)" a été supprimé
  // pour permettre l'affichage des données en cache/HTTP.

  return (
    <div className="flex h-full flex-col sm:rounded-2xl bg-card shadow-sm transition-all max-sm:relative max-sm:h-full max-sm:w-screen max-sm:bg-transparent">
      
      {/* Bandeau de notification hors ligne (non bloquant) */}
      {!isConnected && !isConnecting && (
        <div className="flex w-full flex-none items-center justify-between bg-destructive/10 px-4 py-2 text-sm text-destructive dark:bg-destructive/20">
          <div className="flex items-center gap-2">
            <WifiOff size={16} />
            <span className="font-medium">
              Serveur déconnecté.
            </span>
            <span className="hidden opacity-80 sm:inline">
               L'envoi de messages peut être limité.
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRetryConnection}
            className="h-7 border-destructive/50 bg-transparent text-destructive hover:bg-destructive hover:text-destructive-foreground flex items-center gap-2 active:scale-95 duration-200"
          >
            <RefreshCw size={14} className={cn(isConnecting && "animate-spin")} />
            {t("retry")}
          </Button>
        </div>
      )}

      {/* Conteneur principal (Layout Chat) */}
      <div
        className={cn(
          "flex flex-1 sm:w-full w-fit transition-transform duration-300 ease-in-out h-full",
          (activeRoomId || newChat) && "max-sm:-translate-x-[100vw]",
        )}
      >
        <div className="h-full w-screen min-w-60 max-sm:min-w-[100vw] sm:w-1/3 sm:border-r-2">
          <ChatList
            onRoomSelect={handleRoomSelect}
            activeRoom={(room) => setSelectedRoom(room)}
            selectedRoomId={selectedRoomId}
            onNewChat={() => setNewChat(true)}
            onCloseChat={() => {
              setSelectedRoomId(null);
              setSelectedRoom(undefined);
              setActiveRoomId(null);
            }}
          />
        </div>
        <div className="relative flex h-full w-screen flex-col max-sm:min-w-screen sm:w-3/4">
          {!activeRoomId && (
            <div className="flex h-full select-none flex-col items-center justify-center px-4 text-center">
              <div className="text-muted-foreground/50">
                <AppLogo
                  logo="LOGO"
                  size={150}
                  className="text-muted-foreground/50"
                />
              </div>
              <h2 className="text-xl">{messagesOnApp}</h2>
              <p className="text-muted-foreground">{selectChatToStart}</p>
            </div>
          )}
          <Chat
            roomId={activeRoomId || selectedRoomId}
            initialData={selectedRoom}
            onClose={() => {
              navigate(`/messages`);
              setSelectedRoomId(null);
              setSelectedRoom(undefined);
              setActiveRoomId(null);
            }}
          />
          <NewChat
            onClose={closeNewChat}
            onChatStart={(id) => {
              if (activeRoomId !== id) {
                setSelectedRoomId(null);
                setSelectedRoom(undefined);
                setActiveRoomId(null);
              }
              setActiveRoomId(id);
            }}
            className={cn(
              !newChat && "pointer-events-none select-none opacity-0",
              "z-20",
            )}
          />
        </div>
      </div>
    </div>
  );
}