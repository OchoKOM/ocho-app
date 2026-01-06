import UserAvatar from "@/components/UserAvatar";
import { RoomData, MessageData, ReadInfo } from "@/lib/types";
import { useSession } from "../SessionProvider";
import Linkify from "@/components/Linkify";
import { MessageType } from "@prisma/client";
import { QueryKey, useQuery, useQueryClient } from "@tanstack/react-query";
import Time from "@/components/Time";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import kyInstance from "@/lib/ky";
import { t } from "@/context/LanguageContext";
import { useSocket } from "@/components/providers/SocketProvider";
import { MoreVertical, Undo2 } from "lucide-react";
import ReactionOverlay, {
  ReactionData,
  ReactionDetailsPopover,
  ReactionList,
} from "./reaction/ReactionOverlay";

// --- TYPES ---
type MessageProps = {
  message: MessageData;
  room: RoomData;
  showTime?: boolean;
  highlight?: string; // Nouvelle prop
};

// --- SOUS-COMPOSANT DE SURBRILLANCE ---
function HighlightText({ text, highlight, isOwner }: { text: string; highlight?: string, isOwner: boolean }) {
  if (!highlight || !highlight.trim()) {
    return <Linkify className={cn(isOwner && "font-semibold text-[#001645]")}>{text}</Linkify>;
  }

  const safeHighlight = highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${safeHighlight})`, 'gi'));

  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === highlight.toLowerCase() ? (
          <span key={i} className="bg-amber-500/50 p-0 rounded-[8px] px-[1px] leading-none border border-amber-500 h-fit">
            <Linkify className={cn(isOwner && "font-semibold text-[#001645]")}>{part}</Linkify>
          </span>
        ) : (
          <Linkify key={i} className={cn(isOwner && "font-semibold text-[#001645]")}>{part}</Linkify>
          
        )
      )}
    </>
  );
}

// --- SOUS-COMPOSANT
export function DeletionPlaceholder({
  onCancel,
  duration = 5000,
}: {
  onCancel: () => void;
  duration?: number;
}) {
  const [progress, setProgress] = useState(100);
  const [timeLeft, setTimeLeft] = useState(duration);

  // Paramètres du cercle SVG (agrandi pour accueillir le texte)
  const size = 18; // Taille totale du SVG
  const stroke = 2; // Épaisseur du trait
  const center = size / 2;
  const radius = size / 2 - stroke / 2;
  const circumference = radius * 2 * Math.PI;

  useEffect(() => {
    const intervalTime = 50;
    const step = (100 * intervalTime) / duration;

    const timer = setInterval(() => {
      setProgress((prev) => {
        const nextValue = prev - step;
        if (nextValue <= 0) {
          clearInterval(timer);
          return 0;
        }
        return nextValue;
      });

      // Mise à jour du temps restant pour l'affichage textuel
      setTimeLeft((prev) => Math.max(0, prev - intervalTime));
    }, intervalTime);

    return () => clearInterval(timer);
  }, [duration]);

  if (progress === 0) {
    return null;
  }
  // Calcul du décalage pour l'animation du cercle
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  // Conversion du temps restant en secondes (arrondi au supérieur pour éviter d'afficher 0 trop tôt)
  const secondsLeft = Math.ceil(timeLeft / 1000);

  return (
    <div className="relative flex w-full justify-end z-20">
      <div className="relative flex w-fit select-none flex-col items-end">
        {/* Conteneur principal avec un border-radius maximal (rounded-full) */}
        <div className="relative flex w-fit items-center justify-between gap-2 overflow-hidden rounded-full border border-destructive/40 bg-destructive/5 p-1.5 pe-4 text-destructive shadow-sm backdrop-blur-sm">
          {/* Barre de progression linéaire discrète en bas */}
          <div
            className="absolute bottom-0 left-0 h-1 bg-destructive/30 transition-all duration-75 ease-linear"
            style={{ width: `${progress}%` }}
          />

          <button
            onClick={onCancel}
            className="z-10 flex items-center gap-1 rounded-full border border-muted-foreground/40 bg-background/40 p-1 text-xs font-bold text-foreground shadow-sm transition-all hover:border-muted-foreground/60 hover:bg-background/30 active:scale-95 dark:border-muted/50 hover:dark:border-muted/60"
          >
            {/* Conteneur du Cercle et du Chiffre */}
            <div className="relative flex items-center justify-center">
              <svg height={size} width={size} className="-rotate-90 transform">
                {/* Piste du cercle (fond) */}
                <circle
                  stroke="currentColor"
                  fill="transparent"
                  strokeWidth={stroke}
                  className="text-muted-foreground/40 dark:text-muted/50"
                  r={radius}
                  cx={center}
                  cy={center}
                />
                {/* Progression active */}
                <circle
                  stroke="currentColor"
                  fill="transparent"
                  strokeWidth={stroke}
                  strokeDasharray={circumference}
                  style={{
                    strokeDashoffset,
                    transition: "stroke-dashoffset 75ms linear",
                  }}
                  strokeLinecap="round"
                  className="text-destructive"
                  r={radius}
                  cx={center}
                  cy={center}
                />
              </svg>
              {/* Texte des secondes au centre du cercle */}
              <span className="absolute inset-0 flex items-center justify-center text-destructive">
                {secondsLeft}
              </span>
            </div>

            <div className="flex items-center gap-0.5 pe-1.5 text-xs font-normal text-primary">
              <Undo2 size={12} strokeWidth={3} />
              <span className="uppercase">Annuler</span>
            </div>
          </button>

          <span className="z-10 italic tracking-wider">{t("deleting")}</span>
        </div>
      </div>
    </div>
  );
}

// --- SOUS-COMPOSANT : CONTENU DE LA BULLE ---
export const MessageBubbleContent = ({
  message,
  isOwner,
  unavailableMessage,
  onContextMenu,
  isClone = false,
  toggleCheck,
  highlight, // Nouvelle prop
}: {
  message: MessageData;
  isOwner: boolean;
  unavailableMessage: string;
  onContextMenu?: (e: React.MouseEvent) => void;
  isClone?: boolean;
  toggleCheck?: () => void;
  highlight?: string;
}) => {
  return (
    <div className={cn("relative w-fit", isClone && "h-full")}>
      <Linkify
        className={cn(
          isOwner && "font-semiboldtext-[#001645]",
        )}
      >
        <div
          onClick={!isClone ? toggleCheck : undefined}
          onContextMenu={!isClone ? onContextMenu : (e) => e.preventDefault()}
          className={cn(
            "w-fit select-none rounded-3xl px-4 py-2 transition-all duration-200 *:font-bold",
            isOwner
              ? "bg-primary text-primary-foreground bg-[#007AFF] text-white"
              : "bg-primary/10",
            !message.content &&
              "bg-transparent text-muted-foreground outline outline-2 outline-muted-foreground",
            isClone && "cursor-default shadow-lg ring-2 ring-background/50",
          )}
        >
          {message.content ? (
            <HighlightText text={message.content} highlight={highlight} isOwner={isOwner} />
          ) : (
            <span className="italic">{unavailableMessage}</span>
          )}
        </div>
      </Linkify>
    </div>
  );
};
// --- COMPOSANT PRINCIPAL ---
export default function Message({
  message,
  room,
  showTime = false,
  highlight, // Nouvelle prop
}: MessageProps) {
  const { user: loggedUser } = useSession();
  const queryClient = useQueryClient();
  const { socket } = useSocket();
  const messageId = message.id;
  const roomId = room.id;
  const [isChecked, setIsChecked] = useState(showTime);

  const [activeOverlayRect, setActiveOverlayRect] = useState<DOMRect | null>(
    null,
  );
  const [activeDetailsRect, setActiveDetailsRect] = useState<DOMRect | null>(
    null,
  );
  const [selectedReaction, setSelectedReaction] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Refs
  const messageRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);

  const {
    appUser,
    newMember,
    youAddedMember,
    addedYou,
    addedMember,
    memberLeft,
    youRemovedMember,
    removedYou,
    removedMember,
    memberBanned,
    youBannedMember,
    bannedYou,
    bannedMember,
    youCreatedGroup,
    createdGroup,
    canChatWithYou,
    youReactedToYourMessage,
    youReactedToMessage,
    reactedToMessage,
    reactedMemberMessage,
    messageYourself,
    sent,
    seenBy,
    seenByAnd,
    noPreview,
    unavailableMessage,
    deletedChat,
  } = t();

  const seen = seenByAnd.match(/-(.*?)-/)?.[1] || "Seen";

  // --- REQUETES REACTIONS ---
  const reactionsQueryKey: QueryKey = ["reactions", messageId];
  const { data: reactions = [] } = useQuery({
    queryKey: reactionsQueryKey,
    queryFn: () =>
      kyInstance
        .get(`/api/message/${messageId}/reactions`)
        .json<ReactionData[]>(),
    staleTime: Infinity,
  });

  // --- SOCKET REACTIONS ---
  useEffect(() => {
    if (!socket) return;

    const handleReactionUpdate = (data: {
      messageId: string;
      reactions: ReactionData[];
    }) => {
      if (data.messageId === messageId) {
        // Le serveur envoie maintenant la structure complète avec les utilisateurs
        queryClient.setQueryData(reactionsQueryKey, data.reactions);
      }
    };

    socket.on("message_reaction_update", handleReactionUpdate);

    return () => {
      socket.off("message_reaction_update", handleReactionUpdate);
    };
  }, [socket, messageId, queryClient, reactionsQueryKey]);

  // Actions
  const handleSendReaction = (emoji: string) => {
    if (!socket) return;

    // Check if we are removing (clicking the same emoji we already have)
    const existingReaction = reactions.find(
      (r) => r.content === emoji && r.hasReacted,
    );

    if (existingReaction) {
      socket.emit("remove_reaction", { messageId, roomId });
    } else {
      socket.emit("add_reaction", { messageId, roomId, content: emoji });
    }
  };

  const handleRemoveMyReaction = () => {
    if (!socket) return;
    socket.emit("remove_reaction", { messageId, roomId });
  };

  const handleShowDetails = (
    event: React.MouseEvent,
    reactionContent?: string,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setActiveDetailsRect(event.currentTarget.getBoundingClientRect());
    if (reactionContent) {
      setSelectedReaction(reactionContent);
    } else {
      setSelectedReaction(null);
    }
  };

  // --- LOGIQUE SUPPRESSION MESSAGE ---
  const DELETION_DELAY = 8000;
  const deleteTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isDeleting && !deleteTimerRef.current) {
      deleteTimerRef.current = setTimeout(() => {
        if (socket) {
          socket.emit("delete_message", {
            messageId: message.id,
            roomId: room.id,
          });
        }
      }, DELETION_DELAY);
    }
    return () => {
      if (deleteTimerRef.current) {
        clearTimeout(deleteTimerRef.current);
      }
    };
  }, [isDeleting, socket, message.id, room.id]);

  const handleCancelDelete = () => {
    if (deleteTimerRef.current) {
      clearTimeout(deleteTimerRef.current);
      deleteTimerRef.current = null;
    }
    setIsDeleting(false);
  };

  const handleRequestDelete = () => {
    setIsDeleting(true);
  };

  // --- READ STATUS (VUES) ---
  const queryKey: QueryKey = ["message", "views", message.id];

  // 1. Fetch initial via HTTP (comme avant)
  const { data } = useQuery({
    queryKey,
    queryFn: () =>
      kyInstance
        .get(`/api/message/${messageId}/reads`, { throwHttpErrors: false })
        .json<ReadInfo>(),
    staleTime: Infinity,
    // On enlève le polling (refetchInterval) car le socket s'en charge
    throwOnError: false,
  });

  const reads = data?.reads ?? [];

  // 2. Logique Socket pour Marquer comme Lu et Mettre à jour
  useEffect(() => {
    if (!socket || !loggedUser || !room) return;

    // A. Si je ne suis pas l'envoyeur, je marque le message comme lu
    // On vérifie aussi si on ne l'a pas déjà lu pour éviter trop d'emits
    const isSender = message.senderId === loggedUser.id;
    const hasRead = reads.some((r) => r.id === loggedUser.id);

    if (!isSender && !hasRead) {
      // On émet l'événement vers le serveur
      socket.emit("mark_message_read", { messageId, roomId });
    }

    // B. Écouter les mises à jour des lectures venant du serveur
    const handleReadUpdate = (data: { messageId: string; reads: any[] }) => {
      if (data.messageId === messageId) {
        // Mise à jour immédiate du cache React Query sans refetch
        queryClient.setQueryData(queryKey, { reads: data.reads });
      }
    };

    socket.on("message_read_update", handleReadUpdate);

    return () => {
      socket.off("message_read_update", handleReadUpdate);
    };
  }, [
    socket,
    messageId,
    roomId,
    loggedUser,
    message.senderId,
    reads,
    queryClient,
    queryKey,
  ]);

  const showDetail = isChecked || showTime;

  function toggleCheck() {
    setIsChecked(!isChecked);
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isDeleting) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setActiveOverlayRect(rect);
  };

  if (!loggedUser) return null;

  const views = reads
    .filter((read) => read.id !== loggedUser.id)
    .filter((read) => read.id !== message.senderId)
    .map((read) => read.displayName.split(" ")[0]);

  const otherUser =
    room.id === `saved-${loggedUser.id}`
      ? { user: loggedUser, userId: loggedUser.id }
      : room?.members?.filter((member) => member.userId !== loggedUser.id)[0];
  const messageType: MessageType = message.type;

  const otherUserFirstName =
    otherUser?.user?.displayName.split(" ")[0] || appUser;
  const senderFirstName = message.sender?.displayName.split(" ")[0] || appUser;
  const recipientFirstName =
    message.recipient?.displayName.split(" ")[0] || appUser;
  const isSender = message.senderId === loggedUser.id;
  const isRecipient = message.recipient?.id === loggedUser.id;

  let newMemberMsg, oldMemberMsg;
  if (message.recipient && room.isGroup) {
    const memberName = recipientFirstName;
    if (messageType === "NEWMEMBER") {
      newMemberMsg = newMember.replace("[name]", memberName);
      if (message.sender) {
        isSender
          ? (newMemberMsg = youAddedMember.replace("[name]", memberName))
          : (newMemberMsg = isRecipient
              ? addedYou.replace("[name]", senderFirstName)
              : addedMember
                  .replace("[name]", senderFirstName)
                  .replace("[member]", memberName));
      }
    }
    if (messageType === "LEAVE") {
      oldMemberMsg = memberLeft.replace("[name]", memberName);
      if (message.sender) {
        isSender
          ? (oldMemberMsg = youRemovedMember.replace("[name]", memberName))
          : (oldMemberMsg = isRecipient
              ? removedYou.replace("[name]", senderFirstName)
              : removedMember
                  .replace("[name]", senderFirstName)
                  .replace("[member]", memberName));
      }
    }
    if (messageType === "BAN") {
      oldMemberMsg = memberBanned.replace("[name]", memberName);
      if (message.sender) {
        isSender
          ? (oldMemberMsg = youBannedMember.replace("[name]", memberName))
          : (oldMemberMsg = isRecipient
              ? bannedYou.replace("[name]", senderFirstName)
              : bannedMember
                  .replace("[name]", senderFirstName)
                  .replace("[member]", memberName));
      }
    }
  }

  const contentsTypes = {
    CREATE: room.isGroup
      ? isSender
        ? youCreatedGroup.replace("[name]", senderFirstName)
        : createdGroup.replace("[name]", senderFirstName)
      : canChatWithYou.replace("[name]", otherUserFirstName || appUser),
    CONTENT: message.content,
    CLEAR: noPreview,
    DELETE: deletedChat,
    SAVED: messageYourself,
    NEWMEMBER: newMemberMsg,
    LEAVE: oldMemberMsg,
    BAN: oldMemberMsg,
    REACTION: isSender
      ? isRecipient
        ? youReactedToYourMessage
            .replace("[name]", senderFirstName)
            .replace("[r]", message.content)
        : youReactedToMessage
            .replace("[name]", senderFirstName)
            .replace("[r]", message.content)
            .replace("[member]", recipientFirstName)
      : isRecipient
        ? reactedToMessage
            .replace("[name]", senderFirstName)
            .replace("[r]", message.content)
        : reactedMemberMessage
            .replace("[name]", senderFirstName)
            .replace("[r]", message.content)
            .replace("[member]", recipientFirstName),
  };

  const messageDate = new Date(message.createdAt);
  const currentDate = new Date();
  const timeDifferenceInDays = Math.floor(
    (currentDate.getTime() - messageDate.getTime()) / (24 * 60 * 60 * 1000),
  );

  const messageContent = contentsTypes[messageType];
  const isOwner = message.senderId === loggedUser.id;

  if (messageType !== "CONTENT") {
    return messageType !== "REACTION" ? (
      <div className="relative flex w-full flex-col gap-2">
        <div
          className={cn(
            "flex w-full select-none justify-center overflow-hidden rounded-sm text-center text-sm transition-all",
            !showTime ? "h-0 opacity-0" : "h-6 opacity-100",
          )}
        >
          <div className="rounded-sm bg-primary/30 p-0.5 px-2">
            <Time time={message.createdAt} full />
          </div>
        </div>
        <div
          className={`top-0 flex select-none justify-center text-center text-sm text-primary ${messageType === "CREATE" ? "flex-1" : ""}`}
        >
          {messageContent}
        </div>
      </div>
    ) : null;
  }

  return (
    <>
      {isDeleting ? (
        <DeletionPlaceholder
          onCancel={handleCancelDelete}
          duration={DELETION_DELAY}
        />
      ) : (
        <>
          {activeOverlayRect && (
            <ReactionOverlay
              message={message}
              originalRect={activeOverlayRect}
              onClose={() => setActiveOverlayRect(null)}
              isOwner={isOwner}
              unavailableMessage={unavailableMessage}
              onDeleteRequest={handleRequestDelete}
              onReact={handleSendReaction}
              currentReactions={reactions}
            />
          )}

          {activeDetailsRect && (
            <ReactionDetailsPopover
              reactions={reactions}
              currentUserId={loggedUser.id}
              initialTab={selectedReaction}
              onClose={() => {
                setActiveDetailsRect(null);
                setSelectedReaction(null);
              }}
              onRemoveReaction={handleRemoveMyReaction}
              anchorRect={activeDetailsRect}
            />
          )}

          <div
            className={cn(
              "relative flex w-full flex-col gap-2",
              activeOverlayRect ? "z-0" : "",
            )}
            ref={messageRef}
          >
            <div
              className={cn(
                "flex w-full select-none justify-center overflow-hidden text-center text-sm transition-all",
                !showDetail ? "h-0 opacity-0" : "h-5 opacity-100",
                showTime && "h-6",
              )}
            >
              <div
                className={cn(
                  showTime && "rounded-sm bg-primary/30 p-0.5 px-2",
                )}
              >
                <Time
                  time={message.createdAt}
                  full
                  relative={showTime && timeDifferenceInDays < 2}
                />
              </div>
            </div>

            <div
              className={cn(
                "flex w-full gap-2",
                message.senderId === loggedUser.id && "flex-row-reverse",
              )}
            >
              {message.senderId !== loggedUser.id && (
                <span className="py-2 z-20">
                  <UserAvatar
                    userId={message.senderId}
                    avatarUrl={message.sender?.avatarUrl}
                    size={20}
                    className="flex-none"
                  />
                </span>
              )}
              <div
                className={
                  "group/message relative w-fit max-w-[75%] select-none"
                }
              >
                {message.senderId !== loggedUser.id && (
                  <div className="ps-2 text-xs font-semibold text-muted-foreground py-0.5 z-20">
                    {message.sender?.displayName || "Utilisateur OchoApp"}
                  </div>
                )}
                <div
                  className={cn(
                    "flex w-fit flex-col",
                    isOwner ? "items-end" : "items-start",
                  )}
                  >
                  <div
                    className={cn(
                      "flex w-fit items-center gap-1 z-20",
                      !isOwner && "flex-row-reverse",
                    )}
                    onContextMenu={handleContextMenu}
                  >
                    <div className="relative h-fit w-fit">
                      <div
                        ref={bubbleRef}
                        className={cn(
                          activeOverlayRect ? "opacity-0" : "opacity-100",
                        )}
                      >
                        <MessageBubbleContent
                          message={message}
                          isOwner={isOwner}
                          unavailableMessage={unavailableMessage}
                          toggleCheck={toggleCheck}
                          highlight={highlight} // Propager la recherche
                        />
                      </div>
                    </div>
                  </div>

                  <div
                    className={cn(
                      activeOverlayRect ? "opacity-0" : "opacity-100",
                      "px-2 z-20 relative",
                    )}
                  >
                    <ReactionList
                      reactions={reactions}
                      onReact={handleSendReaction}
                      onShowDetails={handleShowDetails}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div
              className={cn(
                "flex w-full select-none overflow-hidden px-4 py-2 pt-3 text-justify text-xs transition-all",
                !showDetail ? "h-0 opacity-0" : "opacity-100",
                message.senderId === loggedUser.id
                  ? "flex-row-reverse"
                  : "ps-10",
              )}
              onClick={toggleCheck}
            >
              <p
                className={cn(
                  showDetail ? "animate-appear-b" : "hidden",
                  "max-h-40 w-fit max-w-[50%] text-ellipsis text-start",
                )}
              >
                {!!views.length ? (
                  room.isGroup ? (
                    <span>
                      <span className="font-bold">{seen}</span>
                      {views.length > 1
                        ? seenByAnd
                            .replace(/-.*?-/, "")
                            .replace(
                              "[names]",
                              views.slice(0, views.length - 1).join(", "),
                            )
                            .replace("[name]", views[views.length - 1])
                        : seenBy
                            .replace(/-.*?-/, "")
                            .replace("[name]", views[views.length - 1])}
                    </span>
                  ) : (
                    <span className="font-bold">{seen}</span>
                  )
                ) : (
                  <span className="font-bold">{isSender ? sent : seen}</span>
                )}
              </p>
            </div>
          </div>
        </>
      )}
    </>
  );
}