
import UserAvatar from "@/components/UserAvatar";
import { RoomData, MessageData, ReadInfo } from "@/lib/types";
import { useSession } from "../SessionProvider";
import Linkify from "@/components/Linkify";
import { MessageType } from "@prisma/client";
import { QueryKey, useQuery, useQueryClient } from "@tanstack/react-query";
import Time from "@/components/Time";
import { useEffect, useRef, useState, useLayoutEffect } from "react";
import { cn } from "@/lib/utils";
import UserTooltip from "@/components/UserTooltip";
import kyInstance from "@/lib/ky";
import Reaction from "@/components/Reaction";
import { t } from "@/context/LanguageContext";
import { useSocket } from "@/components/providers/SocketProvider";
import {
  Search,
  Plus,
  X,
  Copy,
  Reply,
  Trash2,
  Forward,
  MoreVertical,
  Undo2,
  Loader2,
} from "lucide-react";
import { createPortal } from "react-dom";
import { EMOJI_CATEGORIES } from "./lists/emoji-lists";

// --- CONFIGURATION DES REACTIONS (Importé de Reaction.tsx) ---
const SKIN_TONES = [
  { id: "default", color: "#FFDC5D", modifier: "" },
  { id: "light", color: "#F7DECE", modifier: "\u{1F3FB}" },
  { id: "medium-light", color: "#F3CFB3", modifier: "\u{1F3FC}" },
  { id: "medium", color: "#D1A279", modifier: "\u{1F3FD}" },
  { id: "medium-dark", color: "#A67C52", modifier: "\u{1F3FE}" },
  { id: "dark", color: "#5C3E36", modifier: "\u{1F3FF}" },
];

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "😡"];

const applySkinTone = (
  emojiChar: string,
  supportsSkinTone: boolean,
  toneModifier: string,
) => {
  if (!supportsSkinTone || !toneModifier) return emojiChar;
  return emojiChar + toneModifier;
};

// --- TYPES ---
type MessageProps = {
  message: MessageData;
  room: RoomData;
  showTime?: boolean;
};

// --- SOUS-COMPOSANT : Barre de suppression (Décompte) ---
const DeletionPlaceholder = ({
  onCancel,
  duration = 5000,
}: {
  onCancel: () => void;
  duration?: number;
}) => {
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    // Calcul de l'intervalle pour que ça prenne exactement 'duration' ms
    const intervalTime = 50; // Update tous les 50ms pour fluidité
    const step = (100 * intervalTime) / duration;

    const timer = setInterval(() => {
      setProgress((prev) => Math.max(0, prev - step));
    }, intervalTime);

    return () => clearInterval(timer);
  }, [duration]);

  return (
    <div className="relative flex w-[200px] items-center justify-between gap-2 overflow-hidden rounded-3xl border border-destructive/30 bg-destructive/10 px-4 py-2 text-destructive">
      {/* Barre de progression en arrière-plan */}
      <div 
        className="absolute bottom-0 left-0 h-1 bg-destructive/50 transition-all duration-75 ease-linear"
        style={{ width: `${progress}%` }}
      />
      
      <span className="z-10 text-xs font-semibold italic">Suppression...</span>
      
      <button
        onClick={(e) => {
          e.stopPropagation();
          onCancel();
        }}
        className="z-10 flex items-center gap-1 rounded-full bg-background/80 px-2 py-0.5 text-xs font-bold text-foreground shadow-sm transition-transform hover:scale-105 active:scale-95"
      >
        <Undo2 size={12} /> Annuler
      </button>
    </div>
  );
};

// --- SOUS-COMPOSANT : CONTENU DE LA BULLE ---
const MessageBubbleContent = ({
  message,
  isOwner,
  unavailableMessage,
  onContextMenu,
  isClone = false,
  toggleCheck,
}: {
  message: MessageData;
  isOwner: boolean;
  unavailableMessage: string;
  onContextMenu?: (e: React.MouseEvent) => void;
  isClone?: boolean;
  toggleCheck?: () => void;
}) => {
  return (
    <div className={cn("relative w-fit", isClone && "h-full")}>
      <Linkify className={cn(isOwner && "text-emerald-300 dark:text-white font-semibold")}>
        <div
          onClick={!isClone ? toggleCheck : undefined}
          onContextMenu={!isClone ? onContextMenu : (e) => e.preventDefault()}
          className={cn(
            "w-fit select-none rounded-3xl px-4 py-2 transition-all duration-200 *:font-bold",
            isOwner
              ? "bg-primary text-primary-foreground dark:bg-indigo-800 dark:text-indigo-100"
              : "bg-primary/10",
            !message.content &&
              "bg-transparent text-muted-foreground outline outline-2 outline-muted-foreground",
            isClone && "cursor-default shadow-lg ring-2 ring-background/50",
          )}
        >
          {message.content ?? (
            <span className="italic">{unavailableMessage}</span>
          )}
        </div>
      </Linkify>
    </div>
  );
};

// --- SOUS-COMPOSANT : OVERLAY (SPOTLIGHT) ---
const ReactionOverlay = ({
  message,
  originalRect,
  onClose,
  isOwner,
  unavailableMessage,
  onDeleteRequest,
}: {
  message: MessageData;
  originalRect: DOMRect;
  onClose: () => void;
  isOwner: boolean;
  unavailableMessage: string;
  onDeleteRequest: () => void;
}) => {
  const [verticalOffset, setVerticalOffset] = useState(0);
  const [showFullPicker, setShowFullPicker] = useState(false);
  const [currentSkinTone, setCurrentSkinTone] = useState(SKIN_TONES[0]);
  const [mounted, setMounted] = useState(false);

  // Animation d'entrée
  useEffect(() => {
    setMounted(true);
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useLayoutEffect(() => {
    const windowHeight = window.innerHeight;
    const spaceBelow = windowHeight - originalRect.bottom;
    const MENU_HEIGHT_ESTIMATE = 400;

    if (spaceBelow < MENU_HEIGHT_ESTIMATE) {
      const neededShift = MENU_HEIGHT_ESTIMATE - spaceBelow + 20;
      setVerticalOffset(-neededShift);
    }
  }, [originalRect]);

  const handleReact = (emoji: string) => {
    console.log("React with:", emoji);
    onClose();
  };

  const overlayContent = (
    <div className="fixed inset-0 isolate z-50 flex flex-col font-sans">
      <div
        className={cn(
          "absolute inset-0 bg-background/60 backdrop-blur-sm transition-opacity duration-200",
          mounted ? "opacity-100" : "opacity-0",
        )}
        onClick={onClose}
      />

      <div
        className="absolute transition-transform duration-300 ease-out will-change-transform"
        style={{
          top: originalRect.top,
          left: originalRect.left,
          width: originalRect.width,
          height: originalRect.height,
          transform: `translateY(${verticalOffset}px)`,
        }}
      >
        <div className="pointer-events-none z-20 h-full w-full">
          <MessageBubbleContent
            message={message}
            isOwner={isOwner}
            unavailableMessage={unavailableMessage}
            isClone={true}
          />
        </div>

        <div
          className={cn(
            "absolute top-full z-10 mt-2 flex flex-col gap-2 transition-all duration-300",
            isOwner ? "right-0 items-end" : "left-0 items-start",
            mounted ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0",
          )}
        >
          <div
            className={cn(
              "flex w-[320px] flex-col gap-2 transition-all duration-300",
              isOwner ? "items-end" : "items-start",
            )}
          >
            {!showFullPicker ? (
              <div
                className={cn(
                  "flex items-center gap-1 rounded-full border border-border bg-popover p-1.5 shadow-2xl",
                  isOwner ? "origin-top-right" : "origin-top-left",
                )}
              >
                {QUICK_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => handleReact(emoji)}
                    className="font-emoji flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-2xl transition-transform hover:scale-125 hover:bg-muted active:scale-95"
                  >
                    {emoji}
                  </button>
                ))}
                <div className="mx-1 h-6 w-[1px] bg-border"></div>
                <button
                  onClick={() => setShowFullPicker(true)}
                  className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
                >
                  <Plus size={20} />
                </button>
              </div>
            ) : (
              <div
                className={cn(
                  "flex w-full flex-col overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl duration-200 animate-in zoom-in-95",
                  isOwner ? "origin-top-right" : "origin-top-left",
                )}
              >
                {/* Header Picker */}
                <div className="flex items-center gap-2 border-b border-border p-3">
                  <Search size={16} className="text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Rechercher..."
                    autoFocus
                    className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                  />
                  <button
                    onClick={() => setShowFullPicker(false)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X size={16} />
                  </button>
                </div>
                {/* Skin Tones */}
                <div className="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Teint
                  </span>
                  <div className="flex gap-1">
                    {SKIN_TONES.map((tone) => (
                      <button
                        key={tone.id}
                        onClick={() => setCurrentSkinTone(tone)}
                        className={cn(
                          "h-5 w-5 rounded-full border-2 transition-transform hover:scale-110",
                          currentSkinTone.id === tone.id
                            ? "scale-110 border-primary"
                            : "border-transparent",
                        )}
                        style={{ backgroundColor: tone.color }}
                      />
                    ))}
                  </div>
                </div>
                {/* Emojis Grid */}
                <div className="h-64 overflow-y-auto p-2 scrollbar-thin">
                  {EMOJI_CATEGORIES.map((cat) => {
                    const { icon: Icon } = cat;
                    return (
                      <div key={cat.id} className="mb-4">
                        <h3 className="sticky top-0 z-10 mb-2 flex items-center gap-1 bg-popover/95 px-1 py-1 text-xs font-bold text-muted-foreground backdrop-blur">
                          <Icon size={18} /> {cat.name}
                        </h3>
                        <div className={cn("grid grid-cols-7 gap-1 font-emoji")}>
                          {cat.emojis.map((emojiObj, idx) => {
                            const finalEmoji = applySkinTone(
                              emojiObj.char,
                              emojiObj.s,
                              currentSkinTone.modifier,
                            );
                            return (
                              <button
                                key={idx}
                                onClick={() => handleReact(finalEmoji)}
                                className="flex h-9 w-9 cursor-pointer select-none items-center justify-center rounded-lg text-xl transition-colors hover:bg-muted"
                              >
                                {finalEmoji}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {!showFullPicker && (
            <div
              className={cn(
                "w-48 overflow-hidden rounded-xl border border-border bg-popover/90 py-1 shadow-2xl backdrop-blur-xl transition-all duration-300 animate-in fade-in slide-in-from-top-2",
                isOwner ? "origin-top-right" : "origin-top-left",
              )}
            >
              <button className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted">
                <Reply size={14} /> Répondre
              </button>
              <button
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
                onClick={() => {
                  navigator.clipboard.writeText(message.content || "");
                  onClose();
                }}
              >
                <Copy size={14} /> Copier
              </button>
              <button className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted">
                <Forward size={14} /> Transférer
              </button>
              {isOwner && (
                <>
                  <div className="my-1 h-[1px] bg-border" />
                  <button 
                    onClick={() => {
                      onDeleteRequest(); // On demande la suppression
                      onClose(); // On ferme l'overlay
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
                  >
                    <Trash2 size={14} /> Supprimer
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(overlayContent, document.body);
};

// --- COMPOSANT PRINCIPAL ---
export default function Message({
  message,
  room,
  showTime = false,
}: MessageProps) {
  const { user: loggedUser } = useSession();
  const queryClient = useQueryClient();
  const { socket } = useSocket();
  const messageId = message.id;
  const roomId = room.id;
  const [isChecked, setIsChecked] = useState(showTime);
  
  // Nouveaux états
  const [activeOverlayRect, setActiveOverlayRect] = useState<DOMRect | null>(null);
  const [isDeleting, setIsDeleting] = useState(false); // État de suppression visuelle

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

  // --- LOGIQUE DE SUPPRESSION DIFFERÉE ---
  const DELETION_DELAY = 5000; 
  const deleteTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Si on entre en mode suppression, on lance le timer final
    if (isDeleting && !deleteTimerRef.current) {
      deleteTimerRef.current = setTimeout(() => {
        if (socket) {
           socket.emit("delete_message", { messageId: message.id, roomId: room.id });
        }
        // Pas besoin de reset isDeleting, le composant sera démonté par le parent une fois l'event socket reçu
      }, DELETION_DELAY);
    }

    return () => {
      // Nettoyage si le composant est démonté avant la fin (rare, mais safe)
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

  // --- REST OF THE COMPONENT (READ STATUS, ETC) ---

  const queryKey: QueryKey = ["reads-info", message.id];
  const { data } = useQuery({
    queryKey,
    queryFn: () =>
      kyInstance
        .get(`/api/message/${messageId}/read`, { throwHttpErrors: false })
        .json<ReadInfo>(),
    staleTime: Infinity,
    refetchInterval: 5000,
    throwOnError: false,
  });

  const reads = data?.reads ?? [];

  const { status } = useQuery({
    queryKey: ["read-status", messageId, loggedUser.id],
    queryFn: async () => {
      const isRead = !!reads.find((read) => read.id === loggedUser.id);
      if (!isRead) {
        queryClient.setQueryData<ReadInfo>(queryKey, (oldData) => ({
          reads: [
            ...(oldData?.reads ?? []),
            {
              id: loggedUser.id,
              username: loggedUser.username,
              displayName: loggedUser.displayName,
            },
          ],
        }));
        return kyInstance.post(`/api/message/${messageId}/read`);
      }
      return {};
    },
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

  if (status === "success") {
    queryClient.setQueryData(["unread-chat-messages", room.id], {
      unreadCount: 0,
    });
    queryClient.invalidateQueries({ queryKey: ["unread-messages"] });
  }

  const showDetail = isChecked || showTime;

  function toggleCheck() {
    setIsChecked(!isChecked);
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isDeleting) return; // Pas de menu si en cours de suppression
    const rect = e.currentTarget.getBoundingClientRect();
    setActiveOverlayRect(rect);
  };

  if (!loggedUser) return null;

  // --- VUES ET MEMBRES ---
  const views = reads
    .filter((read) => read.id !== loggedUser.id)
    .filter((read) => read.id !== message.senderId)
    .map((read) => read.displayName.split(" ")[0]);

  const otherUser =
    room.id === `saved-${loggedUser.id}`
      ? { user: loggedUser, userId: loggedUser.id }
      : room?.members?.filter((member) => member.userId !== loggedUser.id)[0];
  const messageType: MessageType = message.type;

  const senderMember = room.members.find(
    (member) => member.userId === message.sender?.id,
  );

  const otherUserFirstName = otherUser?.user?.displayName.split(" ")[0] || appUser;
  const senderFirstName = message.sender?.displayName.split(" ")[0] || appUser;
  const recipientFirstName = message.recipient?.displayName.split(" ")[0] || appUser;
  const isSender = message.sender?.id === loggedUser.id;
  const isRecipient = message.recipient?.id === loggedUser.id;

  // Text Logic for System Messages
  let newMemberMsg, oldMemberMsg;
  if (message.recipient && room.isGroup) {
     // ... (Votre logique de traduction existante inchangée)
     // Je garde le bloc pour la brièveté de la réponse, assurez-vous de garder votre logique originale ici
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
        ? youReactedToYourMessage.replace("[name]", senderFirstName).replace("[r]", message.content)
        : youReactedToMessage.replace("[name]", senderFirstName).replace("[r]", message.content).replace("[member]", recipientFirstName)
      : isRecipient
        ? reactedToMessage.replace("[name]", senderFirstName).replace("[r]", message.content)
        : reactedMemberMessage.replace("[name]", senderFirstName).replace("[r]", message.content).replace("[member]", recipientFirstName),
  };

  const messageDate = new Date(message.createdAt);
  const currentDate = new Date();
  const timeDifferenceInDays = Math.floor(
    (currentDate.getTime() - messageDate.getTime()) / (24 * 60 * 60 * 1000),
  );

  const messageContent = contentsTypes[messageType];
  const isOwner = message.senderId === loggedUser.id;

  if (messageType !== "CONTENT") {
    // ... Rendu messages systèmes (inchangé)
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
      {activeOverlayRect && (
        <ReactionOverlay
          message={message}
          originalRect={activeOverlayRect}
          onClose={() => setActiveOverlayRect(null)}
          isOwner={isOwner}
          unavailableMessage={unavailableMessage}
          onDeleteRequest={handleRequestDelete} // On passe la fonction de demande
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
          <div className={cn(showTime && "rounded-sm bg-primary/30 p-0.5 px-2")}>
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
            <span className="py-2">
               <UserAvatar
                  userId={message.senderId}
                  avatarUrl={message.sender?.avatarUrl}
                  size={20}
                  className="flex-none"
                />
            </span>
          )}
          <div className={"group/message relative w-fit max-w-[75%] select-none"}>
            {message.senderId !== loggedUser.id && (
              <div className="ps-2 text-xs font-semibold text-muted-foreground">
                {message.sender?.displayName || "Utilisateur OchoApp"}
              </div>
            )}
            <div
              className={cn(
                "flex w-fit items-center gap-1",
                !isOwner && "flex-row-reverse",
              )}
            >
              <div
                className={cn(
                  "flex size-8 cursor-pointer items-center justify-center rounded-full hover:bg-muted/50",
                  isDeleting && "invisible", // Cache le bouton More pendant le compte à rebours
                )}
                onClick={handleContextMenu}
              >
                <MoreVertical className="size-5 text-muted-foreground" />
              </div>

              <div className="relative h-fit w-fit">
                {/* SI EN COURS DE SUPPRESSION : AFFICHER LE PLACEHOLDER */}
                {isDeleting ? (
                  <DeletionPlaceholder 
                    onCancel={handleCancelDelete} 
                    duration={DELETION_DELAY}
                  />
                ) : (
                  /* SINON : AFFICHER LE MESSAGE NORMAL */
                  <div
                    ref={bubbleRef}
                    onContextMenu={handleContextMenu}
                    className={cn(
                      activeOverlayRect ? "opacity-0" : "opacity-100",
                    )}
                  >
                    <MessageBubbleContent
                      message={message}
                      isOwner={isOwner}
                      unavailableMessage={unavailableMessage}
                      toggleCheck={toggleCheck}
                    />
                  </div>
                )}

                {/* Réactions (cachées si suppression en cours) */}
                {!isDeleting && (
                  <Reaction
                    message={message}
                    className={cn(
                      "absolute rounded-2xl border-2 border-solid border-background bg-card p-1 px-2",
                      isOwner ? "right-0" : "left-0",
                      activeOverlayRect ? "opacity-0" : "opacity-100",
                    )}
                    isOwner={isOwner}
                    open={false}
                    onOpenChange={() => {}}
                    size={12}
                    position="bottom"
                    quickReaction={false}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        <div
          className={cn(
            "flex w-full select-none overflow-hidden px-4 py-2 pt-3 text-justify text-xs transition-all",
            !showDetail ? "h-0 opacity-0" : "opacity-100",
            message.senderId === loggedUser.id ? "flex-row-reverse" : "ps-10",
          )}
          onClick={toggleCheck}
        >
          {/* ... Statut de lecture ... */}
           <p className={cn(showDetail ? "animate-appear-b" : "hidden", "max-h-40 w-fit max-w-[50%] text-ellipsis text-start")}>
            {!!views.length ? (
              room.isGroup ? (
                <span>
                  <span className="font-bold">{seen}</span>
                  {views.length > 1 ? "..." : "..."} 
                  {/* (J'ai abrégé ici pour la lisibilité, gardez votre code original) */}
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
          size={20}
          key={typingUsers[0].id}
          className="border-2 border-background"
        />
      ) : (
        <div className="z-10 flex size-5 min-h-5 min-w-5 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
          {typingUsers.length || 0}
        </div>
      )}
      <div className="relative flex w-full items-start gap-2">
        {/* Container des Avatars (Stack avec limite) */}
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

            {/* Badge pour le reste des personnes */}
            {hasMore && (
              <div className="z-10 flex h-6 w-6 animate-appear-r items-center justify-center rounded-full border-2 border-background bg-muted text-xs text-muted-foreground">
                +{remainingCount}
              </div>
            )}
          </div>
        )}

        {/* Bulle animée */}
        <div className="group/message relative w-fit max-w-[75%] select-none">
          {/* Label textuel dynamique - Adapté pour "User 1, User 2 et X autres" */}
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
