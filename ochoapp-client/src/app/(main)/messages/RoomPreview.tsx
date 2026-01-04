"use client";

import UserAvatar from "@/components/UserAvatar";
import { RoomData, NotificationCountInfo, UserData } from "@/lib/types";
import { useSession } from "../SessionProvider";
import GroupAvatar from "@/components/GroupAvatar";
import { MessageType, VerifiedType } from "@prisma/client";
import Time from "@/components/Time";
import { cn } from "@/lib/utils";
import { QueryKey, useQuery, useQueryClient } from "@tanstack/react-query";
import kyInstance from "@/lib/ky";
import FormattedInt from "@/components/FormattedInt";
import { t } from "@/context/LanguageContext";
import Verified from "@/components/Verified";
import { useProgress } from "@/context/ProgressContext";
import { useEffect, useState, useMemo } from "react";
import { useSocket } from "@/components/providers/SocketProvider";

interface RoomProps {
  room: RoomData;
  active: boolean;
  onSelect: () => void;
  highlight?: string; // Prop pour la recherche
}

// --- Composant utilitaire pour la surbrillance ---
function HighlightText({
  text,
  highlight,
}: {
  text: string;
  highlight?: string;
}) {
  if (!highlight || !highlight.trim()) {
    return <>{text}</>;
  }

  // Échapper les caractères spéciaux regex
  const safeHighlight = highlight.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${safeHighlight})`, "gi"));

  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === highlight.toLowerCase() ? (
          <span
            key={i}
            className="h-fit rounded border border-amber-500 bg-amber-500/50 p-0 px-[1px] leading-none"
          >
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

export default function RoomPreview({
  room,
  active,
  onSelect,
  highlight,
}: RoomProps) {
  const { user: loggedinUser } = useSession();
  const { socket, isConnected } = useSocket();
  const [typing, setTyping] = useState<{
    isTyping: boolean;
    typingUsers: {
      id: string;
      displayName: string;
      avatarUrl: string;
    }[];
  }>({ isTyping: false, typingUsers: [] });

  const queryClient = useQueryClient();

  // --- GESTION DES MESSAGES NON LUS EN TEMPS RÉEL ---
  useEffect(() => {
    if (!socket || !isConnected) return;

    // 1. Gestionnaire pour incrémenter le compteur (nouveau message reçu)
    const handleIncrement = ({ roomId: targetRoomId }: { roomId: string }) => {
      if (targetRoomId === room.id) {
        // Mise à jour optimiste du cache React Query
        queryClient.setQueryData<NotificationCountInfo>(
          ["room", "unread", room.id],
          (old) => {
             const currentCount = old?.unreadCount || 0;
             return { unreadCount: currentCount + 1 };
          }
        );
      }
    };

    // 2. Gestionnaire pour remettre à zéro le compteur (lecture effectuée)
    const handleClear = ({ roomId: targetRoomId }: { roomId: string }) => {
      if (targetRoomId === room.id) {
        queryClient.setQueryData<NotificationCountInfo>(
          ["room", "unread", room.id],
          {
            unreadCount: 0,
          },
        );
      }
    };

    socket.on("unread_count_increment", handleIncrement);
    socket.on("unread_count_cleared", handleClear);

    return () => {
      socket.off("unread_count_increment", handleIncrement);
      socket.off("unread_count_cleared", handleClear);
    };
  }, [socket, isConnected, room.id, queryClient]);

  useEffect(() => {
    if (!socket || !isConnected || !room.id) return;
    socket.on(
      "typing_update",
      (data: {
        roomId: string;
        typingUsers: { id: string; displayName: string; avatarUrl: string }[];
      }) => {
        const isTyping = !!data.typingUsers
          .filter((u) => u.id !== loggedinUser?.id)
          .filter((u) => u.displayName !== undefined).length;
        if (data.roomId === room.id) {
          setTyping({
            isTyping,
            typingUsers: data.typingUsers
              .filter((u) => u.id !== loggedinUser?.id)
              .filter((u) => u.displayName !== undefined),
          });
        }
      },
    );
    return () => {
      socket.off("typing_update");
    };
  }, [socket, isConnected, room.id, loggedinUser?.id]);

  const {
    appUser,
    groupChat,
    you,
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
    noPreview,
    canNoLongerInteract,
    noMessage,
    deletedChat,
    savedMessages,
    userTyping,
    andOthersTyping,
    multipleTyping,
  } = t([
    "appUser",
    "groupChat",
    "you",
    "newMember",
    "youAddedMember",
    "addedYou",
    "addedMember",
    "memberLeft",
    "youRemovedMember",
    "removedYou",
    "removedMember",
    "memberBanned",
    "youBannedMember",
    "bannedYou",
    "bannedMember",
    "youCreatedGroup",
    "createdGroup",
    "canChatWithYou",
    "youReactedToYourMessage",
    "youReactedToMessage",
    "reactedToMessage",
    "reactedMemberMessage",
    "messageYourself",
    "noPreview",
    "canNoLongerInteract",
    "noMessage",
    "deletedChat",
    "savedMessages",
    "userTyping",
    "andOthersTyping",
    "multipleTyping",
  ]);

  const typingText = !!typing.typingUsers.length
    ? typing.typingUsers.length === 1
      ? userTyping
      : typing.typingUsers.length === 2
        ? andOthersTyping.replace("[count]", "1")
        : multipleTyping
            .replace(
              "[names]",
              typing.typingUsers[0].displayName.split(" ")[0] || appUser,
            )
            .replace("[name]", typing.typingUsers[1].displayName.split(" ")[0])
            .replace("[count]", (typing.typingUsers.length - 2).toString())
    : "";
  const { startNavigation: navigate } = useProgress();

  const queryKey: QueryKey = ["room", "unread", room.id];

  const { data } = useQuery({
    queryKey,
    queryFn: () =>
      kyInstance
        .get(`/api/rooms/${room.id}/unread-count`)
        .json<NotificationCountInfo>(),
    initialData: { unreadCount: 0 },
    staleTime: Infinity, 
  });

  const { unreadCount } = data;
  const isSaved = room.id === `saved-${loggedinUser.id}`;

  const currentUser = room.members.find(
    (member) => member.userId === loggedinUser.id,
  )?.user
    ? {
        ...room.members.find((member) => member.userId === loggedinUser.id)
          ?.user,
        ...loggedinUser,
        name: savedMessages,
        dissplayName: savedMessages,
      }
    : {
        ...loggedinUser,
        name: savedMessages,
        displayName: savedMessages,
      };

  const otherUser: UserData | null = isSaved
    ? currentUser
    : room?.members?.filter((member) => member.userId !== loggedinUser.id)[0]
        .user;

  const expiresAt = otherUser?.verified?.[0]?.expiresAt;
  const canExpire = !!(expiresAt ? new Date(expiresAt).getTime() : null);

  const expired = canExpire && expiresAt ? new Date() < expiresAt : false;

  const isVerified =
    (isSaved ? !!otherUser?.verified[0] : !!otherUser?.verified[0]) &&
    !expired &&
    !room.isGroup;
  const verifiedType: VerifiedType | undefined = isVerified
    ? otherUser?.verified[0].type || "STANDARD"
    : undefined;

  const verifiedCheck = isVerified ? (
    <Verified type={verifiedType} prompt={false} />
  ) : null;

  const messagePreview = room?.messages[0] || {
    id: "",
    content: "",
    senderId: null,
    sender: null,
    roomId: room.id,
    type: "CLEAR",
    createdAt: Date.now(),
  };

  let messageType: MessageType = messagePreview?.type;
  const isSender = messagePreview.sender?.id === loggedinUser.id;
  const currentMember = room.members.find(
    (member) => member.userId === loggedinUser.id,
  );

  const otherUserFirstName = otherUser?.displayName.split(" ")[0] || appUser;
  const senderFirstName =
    messagePreview.sender?.displayName.split(" ")[0] || appUser;
  const recipientFirstName =
    messagePreview.recipient?.displayName.split(" ")[0] || appUser;

  const sender = isSender
    ? you
    : room.isGroup
      ? senderFirstName
      : otherUserFirstName;
  const recipient = room?.messages[0]?.recipient || null;
  let newMemberMsg, oldMemberMsg;
  const memberName = recipient?.displayName.split(" ")[0] || appUser;

  if (recipient && room.isGroup) {
    // Check if message type is info of added member
    if (messageType === "NEWMEMBER") {
      newMemberMsg = newMember.replace("[name]", memberName);
      if (room?.messages[0].sender) {
        room?.messages[0].sender.id === loggedinUser.id
          ? (newMemberMsg = youAddedMember.replace("[name]", memberName))
          : (newMemberMsg =
              recipient.id === loggedinUser.id
                ? addedYou.replace("[name]", sender || appUser)
                : addedMember
                    .replace("[name]", sender || appUser)
                    .replace("[member]", memberName));
      }
    }
    if (messageType === "LEAVE") {
      oldMemberMsg = memberLeft.replace("[name]", memberName);
      if (room?.messages[0].sender) {
        room?.messages[0].sender.id === loggedinUser.id
          ? (oldMemberMsg = youRemovedMember.replace("[name]", memberName))
          : (oldMemberMsg =
              recipient.id === loggedinUser.id
                ? removedYou.replace("[name]", sender || appUser)
                : removedMember
                    .replace("[name]", sender || appUser)
                    .replace("[member]", memberName));
      }
    }
    if (messageType === "BAN") {
      oldMemberMsg = memberBanned.replace("[name]", memberName);
      if (room?.messages[0].sender) {
        room?.messages[0].sender.id === loggedinUser.id
          ? (oldMemberMsg = youBannedMember.replace("[name]", memberName))
          : (oldMemberMsg =
              recipient.id === loggedinUser.id
                ? bannedYou.replace("[name]", sender || appUser)
                : bannedMember
                    .replace("[name]", sender || appUser)
                    .replace("[member]", memberName));
      }
    }
  }
  const showUserPreview = room.isGroup || isSender;
  const contentsTypes = {
    CREATE: room.isGroup
      ? messagePreview.sender?.id === loggedinUser.id
        ? youCreatedGroup.replace("[name]", sender || appUser)
        : createdGroup.replace("[name]", sender || appUser)
      : canChatWithYou.replace("[name]", otherUserFirstName || appUser),
    CONTENT: `${showUserPreview ? sender || appUser : ""}${showUserPreview ? ": " : ""}${messagePreview.content.length > 100 ? messagePreview.content.slice(0, 100) : messagePreview.content}`,
    CLEAR: noPreview,
    DELETE: deletedChat,
    SAVED: messageYourself,
    NEWMEMBER: newMemberMsg,
    LEAVE: oldMemberMsg,
    BAN: oldMemberMsg,
    REACTION: isSender
      ? recipient?.id === loggedinUser.id
        ? youReactedToYourMessage.replace("[name]", sender || appUser)
        : youReactedToMessage
            .replace("[name]", sender || appUser)
            .replace("[member]", recipientFirstName || appUser)
      : recipient?.id === loggedinUser.id
        ? reactedToMessage.replace("[name]", sender || appUser)
        : reactedMemberMessage
            .replace("[name]", sender || appUser)
            .replace("[member]", recipientFirstName || appUser),
  };

  let messagePreviewContent = contentsTypes[messageType];

  if (currentMember?.type === "OLD" || currentMember?.type === "BANNED") {
    messagePreviewContent = canNoLongerInteract;
    messageType = "CLEAR";
  }

  const now = Date.now();

  const select = async () => {
    onSelect();
    // Mise à jour de la clé de cache correcte pour effacer les notifications
    queryClient.setQueryData(["room", "unread", room.id], {
      unreadCount: 0,
    });
    navigate("/messages/chat");
  };

  const chatName = isSaved
    ? savedMessages
    : room.name ||
      `${otherUser?.displayName || appUser} ${isSaved ? `(${you})` : ""}` ||
      (room.isGroup ? groupChat : appUser);

  return (
    <li
      key={room.id}
      className={`cursor-pointer p-2 ${active && "bg-accent/50"}`}
      onClick={select}
      title={
        messagePreviewContent?.replace("[r]", messagePreview.content) ||
        noMessage
      }
    >
      <div className="flex items-center gap-2">
        {room.isGroup ? (
          <GroupAvatar size={45} avatarUrl={room.groupAvatarUrl} />
        ) : (
          <UserAvatar
            userId={otherUser?.id || ""}
            avatarUrl={otherUser?.avatarUrl}
            size={45}
            hideBadge={false}
          />
        )}
        <div className="flex-1 overflow-hidden">
          <span
            className={cn(
              "block truncate font-semibold",
              isVerified && "flex items-center",
            )}
          >
            {/* Surbrillance dans le nom */}
            <HighlightText text={chatName} highlight={highlight} />
            {verifiedCheck}
          </span>
          <div className="flex w-full items-center gap-1 text-sm text-muted-foreground">
            <span
              className={cn(
                "line-clamp-2 text-ellipsis break-all",
                (messageType !== "CONTENT" || typing.isTyping) &&
                  "text-xs text-primary",
                typing.isTyping && "animate-pulse",
              )}
            >
              {typing.isTyping
                ? typingText
                : (messagePreviewContent &&
                    (messageType === "REACTION" ? (
                      <>
                        {messagePreviewContent.split("[r]")[0]}
                        <span className="font-emoji">
                          {messagePreview.content}
                        </span>
                        {messagePreviewContent.split("[r]")[1]}
                      </>
                    ) : /* Surbrillance dans le dernier message si c'est du texte */
                    messageType === "CONTENT" ? (
                      <HighlightText
                        text={messagePreviewContent}
                        highlight={highlight}
                      />
                    ) : (
                      messagePreviewContent
                    ))) ||
                  noMessage}
            </span>
            {!typing.isTyping && (
              <>
                <span className="flex-shrink-0">•</span>
                <span className="line-clamp-1 min-w-fit flex-shrink-0">
                  <Time time={messagePreview.createdAt} full={false} />
                </span>
              </>
            )}
          </div>
        </div>
        {!!unreadCount && (
          <span className="relative flex items-center justify-end pl-2">
            <span className="relative min-w-fit rounded-full bg-primary px-1 text-xs font-medium tabular-nums text-primary-foreground">
              <FormattedInt number={unreadCount} />
            </span>
          </span>
        )}
      </div>
    </li>
  );
}