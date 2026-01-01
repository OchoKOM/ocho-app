import { PrismaClient } from "@prisma/client";
import { getChatRoomDataInclude, getMessageDataInclude, getUserDataSelect, MessageData, RoomData, RoomsSection } from "./types";

const prisma = new PrismaClient();
//Fonction Helper pour formater les réactions avec les utilisateurs
export async function getMessageReactions(messageId: string, currentUserId: string) {
  const allReactions = await prisma.reaction.findMany({
    where: { messageId },
    select: {
      content: true,
      userId: true,
      user: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
          username: true,
        },
      },
    },
  });

  const groupedMap = new Map<
    string,
    {
      content: string;
      count: number;
      hasReacted: boolean;
      users: {
        id: string;
        displayName: string;
        avatarUrl: string | null;
        username: string;
      }[];
    }
  >();

  allReactions.forEach((r) => {
    if (!groupedMap.has(r.content)) {
      groupedMap.set(r.content, {
        content: r.content,
        count: 0,
        hasReacted: false,
        users: [],
      });
    }
    const entry = groupedMap.get(r.content)!;
    entry.count++;
    entry.users.push(r.user);
    if (r.user.id === currentUserId) {
      entry.hasReacted = true;
    }
  });

  return Array.from(groupedMap.values());
}

// --- LOGIQUE RÉUTILISABLE POUR OBTENIR LES ROOMS ---
export async function getFormattedRooms(
  userId: string,
  username: string,
  cursor?: string | null
): Promise<RoomsSection> {
  const pageSize = 10;
  // On récupère d'abord l'user pour être sûr d'avoir ses infos à jour si besoin
  // Note: Dans une app optimisée, on pourrait passer l'objet user directement si on l'a déjà
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: getUserDataSelect(userId, username),
  });

  if (!user) throw new Error("User not found");

  const lastMessages = await prisma.lastMessage.findMany({
    where: { userId },
    select: {
      roomId: true,
      messageId: true,
      message: { include: getMessageDataInclude(userId) },
      room: { include: getChatRoomDataInclude() },
    },
    orderBy: { createdAt: "desc" },
    take: pageSize + 1,
    cursor: cursor ? { userId_roomId: { userId, roomId: cursor } } : undefined,
  });

  const rooms: RoomData[] = lastMessages
    .map((lm) => {
      const lastMsg = lm.message as MessageData | null;
      const roomData = lm.room;
      if (!roomData) return null;
      return {
        ...roomData,
        messages: lastMsg ? [lastMsg] : [],
        members: roomData.members || [],
      } as RoomData;
    })
    .filter((r): r is RoomData => r !== null);

  if (!cursor) {
    const selfMessage = await prisma.message.findFirst({
      where: { senderId: userId, type: "SAVED" },
      include: getMessageDataInclude(userId),
      orderBy: { createdAt: "desc" },
    });

    if (selfMessage) {
      const selfRoom: RoomData = {
        id: `saved-${userId}`,
        name: null,
        description: null,
        groupAvatarUrl: null,
        privilege: "MANAGE",
        isGroup: false,
        createdAt: selfMessage.createdAt,
        maxMembers: 1,
        members: [
          {
            user,
            userId: user.id,
            type: "OWNER",
            joinedAt: user.createdAt,
            leftAt: null,
          },
        ],
        messages: [selfMessage as MessageData],
      };
      rooms.unshift(selfRoom);
    }
  }

  let nextCursor: string | null = null;
  if (rooms.length > pageSize) {
    const nextItem = rooms.pop();
    nextCursor = nextItem ? nextItem.id : null;
  }

  return { rooms, nextCursor };
}