"use client";

import {
  InfiniteData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import kyInstance from "@/lib/ky";
import { RoomData, MessagesSection, MessageData } from "@/lib/types";
import Message from "./Message";
import InfiniteScrollContainer from "@/components/InfiniteScrollContainer";
import {
  AlertCircle,
  ArrowLeft,
  Frown,
  Loader2,
  RefreshCw,
  Search,
  Send,
  X,
} from "lucide-react";
import { useSession } from "../SessionProvider";
import MessagesSkeleton from "./skeletons/MessagesSkeleton";
import { toast } from "@/components/ui/use-toast";
import RoomHeader from "./RoomHeader";
import { useMenuBar } from "@/context/MenuBarContext";
import { useEffect, useRef, useState, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { t } from "@/context/LanguageContext";
import ChatSkeleton from "./skeletons/ChatSkeleton";
import { useProgress } from "@/context/ProgressContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { useSocket } from "@/components/providers/SocketProvider";
import { MessageType } from "@prisma/client";
import Linkify from "@/components/Linkify";
import UserAvatar from "@/components/UserAvatar";
import { createPortal } from "react-dom";
import Time from "@/components/Time"; // Import du composant Time modifié

interface ChatProps {
  roomId: string | null;
  initialData: RoomData | undefined;
  onClose: () => void;
}

// Interface pour nos messages locaux temporaires
interface SentMessageState {
  tempId: string;
  roomId: string;
  content: string;
  recipientId?: string;
  type: MessageType;
  status: "sending" | "error";
}

// --- FONCTION UTILITAIRE DE CLUSTERING AVANCÉE ---
const MAX_TIME_DIFF = 20 * 60 * 1000; // 20 minutes en millisecondes

function groupMessages(messages: MessageData[], limit: number = 5) {
  const groups: MessageData[][] = [];
  let currentGroup: MessageData[] = [];
  messages.forEach((msg, index) => {
    if (currentGroup.length === 0) {
      currentGroup.push(msg);
      return;
    }
    
    const newerMsg = currentGroup[currentGroup.length - 1];
    
    const isSameSender = newerMsg.senderId === msg.senderId;
    
    const isContent = msg.type === "CONTENT" && newerMsg.type === "CONTENT";
    
    const isNotFull = currentGroup.length < limit;
    
    const date1 = new Date(msg.createdAt);
    const date2 = new Date(newerMsg.createdAt);
    const isSameDay = 
      date1.getDate() === date2.getDate() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getFullYear() === date2.getFullYear();

    const diffTime = Math.abs(date2.getTime() - date1.getTime());
    const isCloseInTime = diffTime < MAX_TIME_DIFF;

    if (isSameSender && isContent && isNotFull && isSameDay && isCloseInTime) {
      currentGroup.push(msg);
    } else {
      // On ferme le groupe actuel et on en commence un nouveau
      groups.push(currentGroup);
      currentGroup = [msg];
    }
  });

  // Ne pas oublier d'ajouter le dernier groupe en cours
  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  return groups;
}

// --- NOUVEAU COMPOSANT : HEADER DE DATE ---
function DateHeader({ date }: { date: Date | string }) {
  return (
    <div className="flex w-full justify-center py-4">
      <div className="rounded-full bg-muted/50 border border-border px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur-sm">
        <Time time={new Date(date)} calendar />
      </div>
    </div>
  );
}


export default function Chat({ roomId, initialData, onClose }: ChatProps) {
  // AJOUT : on récupère isConnecting pour gérer l'état de reconnexion si besoin
  const { socket, isConnected, retryConnection } = useSocket();
  const { isVisible, setIsVisible } = useMenuBar();
  const pathname = usePathname();
  const router = useRouter();
  const { startNavigation: navigate } = useProgress();
  const [prevPathname, setPrevPathname] = useState(pathname);
  const [messageInputExpanded, setMessageInputExpanded] = useState(true);

  // --- NOUVEAU : État pour le menu contextuel (Click Droit) ---
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);

  // State pour la recherche locale de messages
  const [searchQuery, setSearchQuery] = useState("");

  // État pour gérer les messages en cours d'envoi (Optimistic UI géré manuellement)
  const [sentMessages, setSentMessages] = useState<SentMessageState[]>([]);
  const [newMessages, setNewMessages] = useState<MessageData[]>([]);

  const { unableToLoadChat, noMessage, dataError, search } = t([
    "unableToLoadChat",
    "noMessage",
    "dataError",
    "search",
  ]);
  const queryClient = useQueryClient();
  const { user: loggedUser } = useSession();

  // --- ÉTAT POUR LES UTILISATEURS QUI ÉCRIVENT ---
  const [typingUsers, setTypingUsers] = useState<
    { id: string; displayName: string; avatarUrl: string }[]
  >([]);

  // --- NOUVEAU : RESET DES ÉTATS AU CHANGEMENT DE ROOM ---
  useEffect(() => {
    setNewMessages([]);
    setSentMessages([]);
    setTypingUsers([]);
    setSearchQuery(""); // Reset search
    setContextMenuPos(null); // Reset menu contextuel
  }, [roomId]);

  // --- GESTION DU SOCKET : JOIN / LEAVE / EVENTS ---
  useEffect(() => {
    if (!socket || !roomId) return;

    // Si on est connecté, on rejoint la room
    if (isConnected) {
      socket.emit("join_room", roomId);
    }

    const handleJoinError = (error: string) => {
      toast({ variant: "destructive", description: error });
    };

    // 2. Écouter la confirmation de réception (Broadcast du serveur)
    const handleReceiveMessage = (data: {
      newMessage: MessageData;
      roomId: string;
      tempId?: string; // On reçoit l'ID temporaire pour le nettoyage
    }) => {
      if (data.roomId === roomId) {
        
        // 1. Mettre à jour le cache React Query directement
        queryClient.setQueryData<InfiniteData<MessagesSection>>(
          ["room", "messages", roomId],
          (oldData) => {
            if (!oldData) return oldData;

            const newPages = oldData.pages.map((page, index) => {
              if (index === 0) {
                return {
                  ...page,
                  messages: [data.newMessage, ...page.messages],
                };
              }
              return page;
            });

            return {
              ...oldData,
              pages: newPages,
            };
          }
        );

        // 2. SUPPRIMER le message temporaire correspondant dans sentMessages
        if (data.tempId) {
          setSentMessages((prev) => prev.filter((msg) => msg.tempId !== data.tempId));
        }
      }
    };

    const handleTypingUpdate = (data: {
      roomId: string;
      typingUsers: { id: string; displayName: string; avatarUrl: string }[];
    }) => {
      if (data.roomId === roomId) {
        setTypingUsers(data.typingUsers.filter((u) => u.id !== loggedUser?.id));
      }
    };

    // --- GESTION DE LA SUPPRESSION ---
    const handleMessageDeleted = (data: {
      messageId: string;
      roomId: string;
    }) => {
      if (data.roomId !== roomId) return;

      // 1. Mettre à jour les "newMessages" (ceux reçus via socket avant refresh)
      setNewMessages((prev) => prev.filter((msg) => msg.id !== data.messageId));

      // 2. Mettre à jour le cache React Query (Infinite Query)
      queryClient.setQueryData<MessagesSection>(
        ["room", "messages", roomId],
        (oldData: any) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            pages: oldData.pages.map((page: any) => ({
              ...page,
              messages: page.messages.filter(
                (msg: MessageData) => msg.id !== data.messageId,
              ),
            })),
          };
        },
      );
    };

    socket.on("typing_update", handleTypingUpdate);

    // 3. Gestion des erreurs d'envoi
    const handleError = (error: { message: string }) => {
      toast({ variant: "destructive", description: error.message });
      // En cas d'erreur globale, on marque tous les messages "sending" comme "error"
      // L'utilisateur pourra réessayer individuellement
      setSentMessages((prev) =>
        prev.map((msg) => (msg.status === "sending" ? { ...msg, status: "error" } : msg)),
      );
    };

    socket.on("room_error", handleJoinError);
    socket.on("receive_message", handleReceiveMessage);
    socket.on("message_deleted", handleMessageDeleted);
    socket.on("error", handleError);

    // CLEANUP : C'est ici que la magie opère quand on change de room ou qu'on quitte
    return () => {
      socket.off("room_error", handleJoinError);
      socket.off("receive_message", handleReceiveMessage);
      socket.off("message_deleted", handleMessageDeleted);
      socket.off("error", handleError);
      socket.off("typing_update", handleTypingUpdate);

      setTypingUsers([]); // Reset la liste visuelle
    };
  }, [socket, isConnected, roomId, loggedUser?.id, queryClient]);

  // --- GESTION NAVIGATION & UI ---
  useEffect(() => {
    setIsVisible(!roomId);
    if (roomId && window.location.pathname !== "/messages/chat") {
      window.history.pushState(null, "", "/messages/chat");
      navigate("/messages/chat");
    }
    return () => {
      setIsVisible(true);
    };
  }, [isVisible, setIsVisible, router, pathname, roomId, navigate]);

  const handlePopState = () => {
    const currentPathname = window.location.pathname;
    if (prevPathname === "/messages/chat" && currentPathname === "/messages") {
      onClose();
    }
    setPrevPathname(currentPathname);
  };

  useEffect(() => {
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prevPathname]);

  useEffect(() => {
    setPrevPathname(pathname);
  }, [pathname]);

  // --- DATA FETCHING ---
  const {
    data: room,
    isError: isRoomError,
    isLoading,
  } = useQuery({
    queryKey: ["room", "data", roomId],
    queryFn: () =>
      kyInstance.get(`/api/rooms/${roomId}/chat-data`).json<RoomData>(),
    initialData,
    staleTime: Infinity,
    throwOnError: false,
    refetchOnWindowFocus: false,
    enabled: !!roomId,
  });

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, status } =
    useInfiniteQuery({
      queryKey: ["room", "messages", roomId],
      queryFn: ({ pageParam }) =>
        kyInstance
          .get(
            `/api/rooms/${roomId}/messages`,
            pageParam ? { searchParams: { cursor: pageParam } } : {},
          )
          .json<MessagesSection>(),
      initialPageParam: null as string | null,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      staleTime: Infinity,
      refetchOnMount: true,
      throwOnError: false,
      enabled: !!roomId,
    });

  const allMessages = data?.pages.flatMap((page) => page?.messages) || [];

  // --- FILTRAGE LOCAL DES MESSAGES ---
  // On filtre si une recherche est active
  const filteredMessages = useMemo(() => {
    if (!searchQuery) return allMessages;
    return allMessages.filter(
      (msg) =>
        msg.content &&
        msg.content.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [allMessages, searchQuery]);

  // Idem pour les nouveaux messages socket
  const filteredNewMessages = useMemo(() => {
    if (!searchQuery) return newMessages;
    return newMessages.filter(
      (msg) =>
        msg.content &&
        msg.content.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [newMessages, searchQuery]);

  // --- CLUSTERING MEMOISÉ ---
  const clusteredMessages = useMemo(() => groupMessages(filteredMessages), [filteredMessages]);
  const clusteredNewMessages = useMemo(() => groupMessages(filteredNewMessages), [filteredNewMessages]);

  if (!roomId) return null;
  if (isLoading) return <ChatSkeleton onChatClose={onClose} />;

  const roomName = room?.name || roomId || "Chat";

  if (!room || isRoomError || !loggedUser) {
    if (!isLoading) {
      toast({
        variant: "destructive",
        description: unableToLoadChat.replace("[name]", roomName),
      });
      onClose();
    }
    return null;
  }

  const loggedMember = room.members.find(
    (member) => member.userId === loggedUser.id,
  );
  const isSaved = room.id === `saved-${loggedMember?.userId}`;
  const isMember = !(
    loggedMember?.type === "OLD" || loggedMember?.type === "BANNED"
  );
  let message = "Envoi de messages non autorisés";

  const otherUser = !room.isGroup
    ? room.members.find((user) => user?.userId !== loggedMember?.userId)
        ?.user || null
    : null;

  const handleTypingStart = () => {
    if (!socket || !roomId) return;
    socket.emit("typing_start", roomId);
  };

  const handleTypingStop = () => {
    if (!socket || !roomId) return;
    socket.emit("typing_stop", roomId);
  };

  // --- FONCTION D'ENVOI DE MESSAGE ---
  const handleSendMessage = async (content: string) => {
    if (!socket || !roomId) return;

    if (!isConnected) {
      console.log("Socket déconnecté, tentative de reconnexion...");
      retryConnection()
    }

    handleTypingStop();

    const tempId = Math.random().toString(36).slice(2);
    
    // NOUVELLE LOGIQUE :
    // Au lieu de mettre à jour le cache React Query "optimistiquement" et de risquer des états incohérents,
    // on délègue la gestion de l'affichage temporaire à "sentMessages".
    
    setSentMessages((prev) => [
      ...prev,
      {
        tempId,
        content: content.trim(),
        roomId,
        type: "CONTENT",
        status: "sending",
      }
    ]);

    socket.emit("send_message", {
      content: content.trim(),
      roomId,
      type: "CONTENT",
      tempId, // On envoie l'ID temporaire pour faire le lien au retour
    });
  };

  // Fonction pour rééssayer l'envoi
  function handleRetryMessage(msg: SentMessageState) {
    if (!socket) return;
    
    // Même logique pour le retry : on s'assure d'être connecté
    if (!isConnected) {
        socket.connect();
    }

    // Remettre en statut "sending"
    setSentMessages((prev) =>
      prev.map((m) =>
        m.tempId === msg.tempId ? { ...m, status: "sending" } : m,
      ),
    );

    socket.emit("send_message", {
      content: msg.content,
      roomId: msg.roomId,
      type: msg.type,
      recipientId: msg.recipientId,
      tempId: msg.tempId, // On garde le même ID temporaire
    });
  }

  // --- GESTION DU CLIC DROIT (CONTEXT MENU) ---
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault(); 
    setContextMenuPos({ x: e.clientX, y: e.clientY });
  };

  // --- RENDER HELPER POUR LES GROUPES ---
  const renderCluster = (group: MessageData[], groupIndex: number, allGroups: MessageData[][]) => {
    const oldestMessageInGroup = group[group.length - 1];
    
    // Pour savoir si on affiche le header de date, on regarde le groupe suivant (qui est plus ancien dans le tableau de groupes)
    const nextGroup = allGroups[groupIndex + 1];
    const oldestMessageInNextGroup = nextGroup ? nextGroup[0] : null; // On prend le premier (le plus récent) du groupe suivant pour comparer les dates frontières

    let showDateHeader = false;

    if (!nextGroup) {
      // C'est le tout dernier groupe de la liste (le plus vieux chargé) -> On affiche toujours la date
      showDateHeader = true;
    } else if (oldestMessageInNextGroup) {
      const currentDate = new Date(oldestMessageInGroup.createdAt);
      const prevDate = new Date(oldestMessageInNextGroup.createdAt);

      if (
        currentDate.getDate() !== prevDate.getDate() ||
        currentDate.getMonth() !== prevDate.getMonth() ||
        currentDate.getFullYear() !== prevDate.getFullYear()
      ) {
        showDateHeader = true;
      }
    }

    // Rendu du cluster
    return (
      <div key={`cluster-${groupIndex}`} className="contents">
            
        <div className="flex flex-col-reverse w-full">
          {group.map((msg, msgIndex) => {
            const isVisuallyLast = msgIndex === 0; // Le dernier envoyé (bas)
            const isFirstInCluster = msgIndex === group.length - 1; // Le premier envoyé (haut)
            const isMiddleInCluster = msgIndex > 0 && msgIndex < group.length - 1;
            const isOnlyMessageInCluster = group.length === 1;
            const showTime =
              (groupIndex === clusteredMessages.length - 1 && msgIndex === group.length - 1) ||
              (groupIndex % 5 === 0 && msgIndex === 0 && groupIndex !== 0);

            return (
              <Message
                key={msg.id || msgIndex}
                message={msg}
                room={room}
                showTime={showTime}
                highlight={searchQuery}
                isLastInCluster={isVisuallyLast} 
                isFirstInCluster={isFirstInCluster}
                isMiddleInCluster={isMiddleInCluster}
                isOnlyMessageInCluster={isOnlyMessageInCluster}
              />
            );
          })}
        </div>

        {/* HEADER DE DATE : Placé ici pour apparaître au-dessus du groupe en flex-reverse */}
        {showDateHeader && <DateHeader date={oldestMessageInGroup.createdAt} />}
      </div>
    );
  };

  return (
    // RETRAIT de onContextMenu ici
    <div className="absolute flex h-full w-full flex-1 flex-col max-sm:bg-card/30">
      {/* HEADER */}
      <div className="flex w-full items-center gap-2 px-4 py-3 max-sm:bg-card/50">
        <div
          className="flex cursor-pointer hover:text-red-500"
          onClick={onClose}
          title="Fermer la discussion"
        >
          <ArrowLeft size={35} className="sm:hidden" />
        </div>
        <RoomHeader
          initialRoom={room}
          roomId={room.id}
          onDelete={onClose}
          isGroup={room.isGroup}
        />
        <div
          className="flex cursor-pointer hover:text-red-500"
          onClick={onClose}
          title="Fermer la discussion"
        >
          <X size={25} className="max-sm:hidden" />
        </div>
      </div>

      {/* ZONE DE MESSAGES - AJOUT DE onContextMenu ICI */}
      <div 
        className="relative flex flex-1 flex-col-reverse overflow-y-auto overflow-x-hidden pb-[74px] shadow-inner scrollbar-track-primary scrollbar-track-rounded-full has-[.reaction-open]:z-50 sm:bg-background/50"
      >
        <div className="absolute z-10 w-full h-full" onContextMenu={handleContextMenu}/>
        <InfiniteScrollContainer
          className="flex w-full flex-col-reverse gap-4 p-4 px-2"
          onBottomReached={() => {
            // On désactive le scroll infini si on est en train de chercher pour éviter des comportements étranges
            if (!searchQuery) {
              hasNextPage && !isFetchingNextPage && fetchNextPage();
            }
          }}
          reversed
        >
          {status === "pending" && <MessagesSkeleton />}

          {/* État vide : Seulement si aucun message TOTAL (pas juste le filtre) */}
          {status === "success" &&
            !hasNextPage &&
            !allMessages.length &&
            sentMessages.length === 0 && (
              <p className="my-auto flex w-full flex-1 select-none items-center justify-center px-2 text-center italic text-muted-foreground">
                {noMessage}
              </p>
            )}

          {/* État recherche vide : Si on a des messages mais que le filtre ne renvoie rien */}
          {status === "success" &&
            allMessages.length > 0 &&
            filteredMessages.length === 0 &&
            filteredNewMessages.length === 0 &&
            searchQuery && (
              <div className="my-auto flex w-full flex-1 select-none flex-col items-center justify-center gap-2 px-2 text-center italic text-muted-foreground">
                <Search className="opacity-50" />
                <p>Aucun message trouvé pour "{searchQuery}"</p>
              </div>
            )}

          {status === "error" && (
            <div className="flex w-full flex-1 select-none flex-col items-center px-3 py-8 text-center italic text-muted-foreground">
              <Frown size={100} />
              <h2 className="text-xl">{dataError}</h2>
            </div>
          )}

          {status === "success" && (
            <>
              {/* Indicateur de frappe  */}
              <TypingIndicator typingUsers={typingUsers} />

              {/* Messages "live" reçus via socket avant refresh (filtrés) */}
              {clusteredNewMessages.map((group, i) => renderCluster(group, i, clusteredNewMessages))}

              {/* Messages en cours d'envoi (échecs ou loading) - Géré par SentMessage */}
              {/* Note: On ne clusterise pas les messages "sending" pour l'instant car ils ont un statut spécial */}
              {sentMessages.map((msg) => (
                <SendingMessage
                  key={msg.tempId}
                  content={msg.content}
                  status={msg.status}
                  onRetry={() => handleRetryMessage(msg)}
                />
              ))}

              {/* MESSAGES CONFIRMÉS (Venant de la DB via React Query - Filtrés) */}
              {clusteredMessages.map((group, i) => renderCluster(group, i, clusteredMessages))}
            </>
          )}
        </InfiniteScrollContainer>
        {isFetchingNextPage && !searchQuery && (
          <div className="flex w-full justify-center">
            <Loader2 className="mx-auto my-3 animate-spin" />
          </div>
        )}
      </div>

      {/* BARRE DE SAISIE */}
      <div className="absolute bottom-0 w-full bg-gradient-to-t from-card/80 to-transparent">
        <div className={cn("flex p-2", !messageInputExpanded && "gap-2")}>
          <div
            className={cn(
              "flex w-fit items-end gap-0 transition-all duration-75",
              !messageInputExpanded && "w-full gap-3",
            )}
          >
            <Button
              variant="outline"
              onClick={() => {
                setMessageInputExpanded(!messageInputExpanded);
                if (messageInputExpanded) {
                  // Si on passe en mode recherche (input visible), on focus
                } else {
                  // Si on ferme, on vide la recherche
                  setSearchQuery("");
                }
              }}
              title={search}
              className={cn(
                "aspect-square size-12 cursor-pointer p-2 outline-input",
                !messageInputExpanded &&
                  searchQuery &&
                  "bg-primary text-primary-foreground",
              )}
            >
              {!messageInputExpanded ? <X /> : <Search className="size-5" />}
            </Button>
            {
              <div
                className={cn(
                  "relative flex w-full items-end gap-1 rounded-3xl border border-input bg-background p-1 ring-primary ring-offset-background transition-[width] duration-75 has-[input:focus-visible]:outline-none has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-ring has-[input:focus-visible]:ring-offset-2",
                  messageInputExpanded
                    ? "invisible w-0 overflow-hidden"
                    : "w-full",
                )}
              >
                <Input
                  placeholder={search + "..."}
                  className={cn(
                    "max-h-[10rem] min-h-10 w-full overflow-y-auto rounded-none border-none bg-transparent px-4 py-2 pr-0.5 outline-none ring-offset-transparent transition-all duration-75 focus-visible:ring-transparent",
                  )}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            }
          </div>

          {/* Logique d'affichage du formulaire selon les droits */}
          {!isSaved
            ? !room.isGroup &&
              !otherUser?.id && (
                <div className="relative flex w-full select-none items-center justify-center gap-1 rounded-3xl border border-input bg-background p-1 px-5 py-1.5 text-center font-semibold ring-primary ring-offset-background transition-[width] duration-75">
                  <p>{message}</p>
                </div>
              )
            : !!roomId && (
                <MessageForm
                  expanded={messageInputExpanded}
                  onExpanded={() => setMessageInputExpanded(true)}
                  onSubmit={handleSendMessage}
                  onTypingStart={handleTypingStart}
                  onTypingStop={handleTypingStop}
                />
              )}
          {!isMember ? (
            <div className="relative flex w-full select-none items-center justify-center gap-1 rounded-3xl border border-input bg-background p-1 px-5 py-1.5 text-center font-semibold ring-primary ring-offset-background transition-[width] duration-75">
              <p>{message}</p>
            </div>
          ) : (
            !!roomId &&
            ((!room.isGroup && otherUser?.id) || room.isGroup) && (
              <MessageForm
                expanded={messageInputExpanded}
                onExpanded={() => setMessageInputExpanded(true)}
                onSubmit={handleSendMessage}
                onTypingStart={handleTypingStart}
                onTypingStop={handleTypingStop}
              />
            )
          )}
        </div>
      </div>

      {/* MENU CONTEXTUEL (Click Droit) */}
      {contextMenuPos && (
        <ChatContextMenu
          position={contextMenuPos}
          onClose={() => setContextMenuPos(null)}
          onCloseChat={onClose}
        />
      )}
    </div>
  );
}

// --- SOUS-COMPOSANTS ---

// --- NOUVEAU : COMPOSANT MENU CONTEXTUEL ---
interface ChatContextMenuProps {
  position: { x: number; y: number };
  onClose: () => void;
  onCloseChat: () => void;
}

function ChatContextMenu({ position, onClose, onCloseChat }: ChatContextMenuProps) {
  // On utilise un Portal pour être sûr d'être au-dessus de tout (z-50)
  // On réutilise les classes de ReactionOverlay (backdrop-blur, animate-in, etc.)
  return createPortal(
    <div className="fixed inset-0 isolate z-50 flex flex-col font-sans" onContextMenu={(e) => e.preventDefault()}>
      {/* Backdrop invisible mais qui ferme le menu au clic */}
      <div
        className="absolute inset-0 bg-background/10 backdrop-blur-[2px] transition-opacity duration-200"
        onClick={onClose}
      />

      {/* Le Menu */}
      <div
        className="absolute min-w-[200px] overflow-hidden rounded-xl border border-border bg-popover/90 py-1 shadow-2xl backdrop-blur-xl transition-all duration-200 animate-in fade-in zoom-in-95"
        style={{
          top: position.y,
          left: position.x,
        }}
      >
        <button
          onClick={() => {
            onCloseChat();
            onClose();
          }}
          className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-destructive transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <X size={16} />
          {t("closeChat")}
        </button>
      </div>
    </div>,
    document.body
  );
}

interface MessageFormProps {
  expanded: boolean;
  onExpanded: () => void;
  onSubmit: (content: string) => void;
  onTypingStart?: () => void; // Trigger de début de saisie
  onTypingStop?: () => void; // Trigger de fin de saisie
}

export function MessageForm({
  expanded,
  onExpanded,
  onSubmit,
  onTypingStart,
  onTypingStop,
}: MessageFormProps) {
  const { typeMessage } = t(['typeMessage']);
  const [input, setInput] = useState("");
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Gère l'envoi et réinitialise le typing
  const triggerSubmit = () => {
    if (input.trim()) {
      onSubmit(input);
      setInput("");
      // On arrête immédiatement l'indicateur typing lors de l'envoi
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      onTypingStop?.();
    }
  };

  function handleBtnClick() {
    if (expanded) {
      triggerSubmit();
    } else {
      onExpanded();
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isEnter = e.key === "Enter";
    const isPhysicalKeyboard = window.matchMedia("(pointer: fine)").matches;

    if (isEnter && !e.shiftKey && isPhysicalKeyboard) {
      e.preventDefault();
      triggerSubmit();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);

    // Déclencher le début de saisie
    onTypingStart?.();

    // Gérer la fin de saisie (debounce)
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      onTypingStop?.();
    }, 3000);
  };

  return (
    <div
      className={cn(
        "relative flex w-full items-end gap-1 rounded-3xl border border-input bg-background p-1 ring-primary ring-offset-background transition-[width] duration-75 has-[textarea:focus-visible]:outline-none has-[textarea:focus-visible]:ring-2 has-[textarea:focus-visible]:ring-ring has-[textarea:focus-visible]:ring-offset-2 z-20",
        expanded ? "" : "aspect-square w-fit rounded-full p-0",
      )}
    >
      <Textarea
        placeholder={typeMessage}
        className={cn(
          "max-h-[10rem] min-h-10 w-full resize-none overflow-y-auto rounded-none border-none bg-transparent px-4 py-2 pr-0.5 ring-offset-transparent transition-all duration-75 focus-visible:ring-transparent",
          expanded ? "relative w-full" : "invisible absolute w-0",
        )}
        rows={1}
        value={input}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
      />
      <Button
        size={!expanded ? "icon" : "default"}
        disabled={expanded && !input.trim()}
        onClick={handleBtnClick}
        className={cn(
          "rounded-full p-2",
          expanded
            ? ""
            : "h-[50px] w-[50px] rounded-full border-none outline-none",
        )}
        variant={expanded && input.trim() ? "default" : "outline"}
      >
        <Send />
      </Button>
    </div>
  );
}

interface SendingMessageProps {
  content: string;
  status: "sending" | "error";
  onRetry: () => void;
}

function SendingMessage({ content, status, onRetry }: SendingMessageProps) {
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetryClick = () => {
    setIsRetrying(true);
    onRetry();
    // Reset visual loading state after delay
    setTimeout(() => setIsRetrying(false), 2000);
  };

  return (
    <div className="relative flex w-full flex-col gap-3 duration-300">
      <div className="flex w-full flex-row-reverse gap-1">
        <div className="group/message relative flex w-fit max-w-[75%] select-none flex-col items-end">
          <div className="flex w-fit items-center gap-1">
            {/* Bouton Retry */}
            {status === "error" && (
              <button
                onClick={handleRetryClick}
                disabled={isRetrying}
                className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title="Réessayer l'envoi"
              >
                <RefreshCw
                  className={cn("h-4 w-4", isRetrying && "animate-spin")}
                />
              </button>
            )}

            {/* Bulle Message */}
            <div className="relative h-fit w-fit">
              <Linkify>
                <p
                  className={cn(
                    "w-fit select-none rounded-3xl px-4 py-2 transition-all duration-300 *:font-bold",
                    status === "sending"
                      ? "cursor-wait bg-[#007AFF]/70 text-emerald-50 opacity-80"
                      : "",
                    status === "error"
                      ? "border border-destructive/50 bg-destructive/10 text-destructive"
                      : "",
                  )}
                >
                  {content}
                </p>
              </Linkify>
            </div>
          </div>

          {/* Status Text */}
          <div className="mt-1 flex justify-end px-1">
            <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
              {status === "sending" && (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" /> {t("sending")}
                </>
              )}
              {status === "error" && (
                <span className="flex items-center gap-1 text-destructive">
                  <AlertCircle className="h-3 w-3" /> Échec
                </span>
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

type TypingIndicatorProps = {
  typingUsers: {
    id: string;
    displayName: string;
    avatarUrl: string;
  }[];
};

export function TypingIndicator({ typingUsers = [] }: TypingIndicatorProps) {
  if (!typingUsers.length) return null;
  const MAX_AVATARS = 4;
  const hasMore = typingUsers.length > MAX_AVATARS;
  const visibleUsers = typingUsers.slice(
    0,
    hasMore ? MAX_AVATARS - 1 : MAX_AVATARS,
  );
  const remainingCount = typingUsers.length - visibleUsers.length;

  return (
    <div className="relative z-0 mb-4 flex w-full select-none gap-2 duration-300 animate-in fade-in slide-in-from-bottom-2">
      {typingUsers.length === 1 ? (
        <UserAvatar
          userId={typingUsers[0].id}
          avatarUrl={typingUsers[0].avatarUrl}
          size={24}
          key={typingUsers[0].id}
          className="border-2 border-background"
        />
      ) : (
        <div className="z-10 flex size-6 min-h-6 min-w-6 items-center justify-center rounded-full bg-muted text-sm font-bold text-muted-foreground">
          {typingUsers.length || 0}
        </div>
      )}
      <div className="relative flex w-full items-start gap-2">
        {typingUsers.length > 1 && (
          <div className="absolute left-0 top-full z-[2] flex h-8 -translate-y-[30%] items-center -space-x-2 overflow-hidden py-1">
            {visibleUsers.map((user, index) => (
              <UserAvatar
                avatarUrl={user.avatarUrl}
                size={20}
                userId={user.id}
                key={user.id}
                className="animate-appear-r border-2 border-background"
              />
            ))}

            {hasMore && (
              <div className="z-10 flex h-6 w-6 animate-appear-r items-center justify-center rounded-full border-2 border-background bg-muted text-xs text-muted-foreground">
                +{remainingCount}
              </div>
            )}
          </div>
        )}

        <div className="group/message relative w-fit max-w-[75%] select-none">
          <div className="mb-1 ps-2 text-xs font-medium text-slate-500 transition-opacity dark:text-slate-400">
            {typingUsers.length === 1
              ? `${typingUsers[0].displayName.split(" ")[0]}`
              : typingUsers.length === 2
                ? `${typingUsers[0].displayName.split(" ")[0]} et ${typingUsers[1].displayName.split(" ")[0]} écrivent...`
                : `${typingUsers[0].displayName.split(" ")[0]}, ${typingUsers[1].displayName.split(" ")[0]} et ${typingUsers.length - 2 == 1 ? typingUsers[2].displayName.split(" ")[0] : `${typingUsers.length - 2} autres`} écrivent...`}
          </div>

          <div className="relative h-fit w-fit">
            <div
              className={cn(
                "w-fit select-none rounded-3xl bg-primary/10 p-3.5",
              )}
            >
              <div className="flex gap-1">
                <div className="h-2 w-2 animate-bounce-half rounded-full bg-muted-foreground/50 [animation-delay:-0.5s]"></div>
                <div className="h-2 w-2 animate-bounce-half rounded-full bg-muted-foreground/50 [animation-delay:-0.25s]"></div>
                <div className="h-2 w-2 animate-bounce-half rounded-full bg-muted-foreground/50"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}