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

export default function Messages() {
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [newChat, setNewChat] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<RoomData>();
  const { user } = useSession();
  const { activeRoomId, setActiveRoomId } = useActiveRoom();
  const queryClient = useQueryClient();
  const { startNavigation: navigate } = useProgress();
  const { socket, isConnected, isConnecting } = useSocket();
  const { messagesOnApp, selectChatToStart } = t(['messagesOnApp', 'selectChatToStart']);

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

  if (!isConnected && !isConnecting) {
    return (
      <div
        className={cn(
          "flex h-full rounded-2xl bg-card shadow-sm transition-all max-sm:relative max-sm:h-full max-sm:w-screen max-sm:bg-transparent",
        )}
      >
        <div className="flex h-full select-none flex-col items-center justify-center px-8 text-center w-full">
          <div className="text-muted-foreground/50">
            <AppLogo
              logo="LOGO"
              size={150}
              className="text-muted-foreground/50"
            />
          </div>
          <h2 className="text-xl">{messagesOnApp}</h2>
          <p className="text-muted-foreground">
            Le serveur de messages est hors ligne veuillez recharger la page
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-full rounded-2xl bg-card shadow-sm transition-all max-sm:relative max-sm:h-full max-sm:w-screen max-sm:bg-transparent",
        (activeRoomId || newChat) && "max-sm:translate-x-[-100vw]",
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
      <div
        className={
          "relative flex h-full w-screen flex-col max-sm:min-w-[100vw] sm:w-3/4"
        }
      >
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
  );
}
