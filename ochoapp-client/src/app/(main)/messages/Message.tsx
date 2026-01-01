import UserAvatar from "@/components/UserAvatar";
import { RoomData, MessageData, ReadInfo } from "@/lib/types";
import { useSession } from "../SessionProvider";
import Linkify from "@/components/Linkify";
import { MessageType } from "@prisma/client";
import { QueryKey, useQuery, useQueryClient } from "@tanstack/react-query";
import Time from "@/components/Time";
import { useEffect, useRef, useState, useLayoutEffect } from "react";
import { cn } from "@/lib/utils";
import kyInstance from "@/lib/ky";
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
  UserMinus,
} from "lucide-react";
import { createPortal } from "react-dom";
import { EMOJI_CATEGORIES, QUICK_REACTIONS, SKIN_TONES } from "./lists/emoji-lists";
import ReactionOverlay, { ReactionData, ReactionDetailsPopover, ReactionList } from "./reaction/ReactionOverlay";

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
    const intervalTime = 50;
    const step = (100 * intervalTime) / duration;
    const timer = setInterval(() => {
      setProgress((prev) => Math.max(0, prev - step));
    }, intervalTime);
    return () => clearInterval(timer);
  }, [duration]);

  return (
    <div className="relative flex items-center justify-between gap-2 rounded-3xl border border-destructive/30 bg-destructive/10 px-4 py-2 text-destructive">
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
export const MessageBubbleContent = ({
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
  
  const [activeOverlayRect, setActiveOverlayRect] = useState<DOMRect | null>(null);
  const [activeDetailsRect, setActiveDetailsRect] = useState<DOMRect | null>(null);
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

    const handleReactionUpdate = (data: { messageId: string; reactions: ReactionData[] }) => {
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
    const existingReaction = reactions.find(r => r.content === emoji && r.hasReacted);
    
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

  const handleShowDetails = (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setActiveDetailsRect(event.currentTarget.getBoundingClientRect());
  }

  // --- LOGIQUE SUPPRESSION MESSAGE ---
  const DELETION_DELAY = 5000; 
  const deleteTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isDeleting && !deleteTimerRef.current) {
      deleteTimerRef.current = setTimeout(() => {
        if (socket) {
           socket.emit("delete_message", { messageId: message.id, roomId: room.id });
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

  // --- READ STATUS ---
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

  const otherUserFirstName = otherUser?.user?.displayName.split(" ")[0] || appUser;
  const senderFirstName = message.sender?.displayName.split(" ")[0] || appUser;
  const recipientFirstName = message.recipient?.displayName.split(" ")[0] || appUser;
  const isSender = message.sender?.id === loggedUser.id;
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
          onDeleteRequest={handleRequestDelete}
          onReact={handleSendReaction}
          currentReactions={reactions}
        />
      )}

      {activeDetailsRect && (
          <ReactionDetailsPopover
             reactions={reactions}
             currentUserId={loggedUser.id}
             onClose={() => setActiveDetailsRect(null)}
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
                "flex w-fit flex-col",
                isOwner ? "items-end" : "items-start"
              )}
            >
              <div
                className={cn(
                  "flex w-fit items-center gap-1",
                  !isOwner && "flex-row-reverse",
                )}
              >
                <div
                  className={cn(
                    "flex size-8 cursor-pointer items-center justify-center rounded-full hover:bg-muted/50",
                    isDeleting && "invisible",
                  )}
                  onClick={handleContextMenu}
                >
                  <MoreVertical className="size-5 text-muted-foreground" />
                </div>

                <div className="relative h-fit w-fit">
                  {isDeleting ? (
                    <DeletionPlaceholder 
                      onCancel={handleCancelDelete} 
                      duration={DELETION_DELAY}
                    />
                  ) : (
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
                </div>
              </div>
              
              <div className={cn(
                activeOverlayRect ? "opacity-0" : "opacity-100",
                "px-2"
              )}>
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
            message.senderId === loggedUser.id ? "flex-row-reverse" : "ps-10",
          )}
          onClick={toggleCheck}
        >
           <p className={cn(showDetail ? "animate-appear-b" : "hidden", "max-h-40 w-fit max-w-[50%] text-ellipsis text-start")}>
            {!!views.length ? (
              room.isGroup ? (
                <span>
                  <span className="font-bold">{seen}</span>
                  {views.length > 1 ? "..." : "..."} 
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
