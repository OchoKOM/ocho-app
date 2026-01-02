import { PrismaClient } from "@prisma/client";
import {
  getChatRoomDataInclude,
  getMessageDataInclude,
  getUserDataSelect,
  MessageData,
  RoomData,
  RoomsSection,
} from "./types";

const prisma = new PrismaClient();

// --- HELPER: FORMATAGE DES RÉACTIONS ---
export async function getMessageReactions(
  messageId: string,
  currentUserId: string
) {
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

  // 1. Récupération de l'utilisateur
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: getUserDataSelect(userId, username),
  });

  if (!user) throw new Error("User not found");

  // 2. Récupération des conversations standard via LastMessage
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

  // 3. Injection de la "Self Room" (Messages Enregistrés)
  if (!cursor) {
    const savedMessage = await prisma.message.findFirst({
      where: { senderId: userId, type: "SAVED" },
      include: getMessageDataInclude(userId),
      orderBy: { createdAt: "desc" },
    });

    if (savedMessage) {
      // Logique visuelle : si le contenu est technique "create-userId", on le garde en SAVED (caché/système)
      let type = "CONTENT";
      if (savedMessage.content === "create-" + userId) {
        type = "SAVED";
      }

      const selfMessage = { ...savedMessage, type };

      // Création de la room virtuelle en mémoire
      const selfRoom: RoomData = {
        id: `saved-${userId}`, // ID Virtuel
        name: "Messages enregistrés",
        description: null,
        groupAvatarUrl: null,
        privilege: "MANAGE",
        isGroup: false,
        createdAt: savedMessage.createdAt,
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

      // On l'ajoute au tout début de la liste
      rooms.unshift(selfRoom);
    }
  }

  // 4. Gestion de la pagination
  let nextCursor: string | null = null;
  if (rooms.length > pageSize) {
    const nextItem = rooms.pop();
    nextCursor = nextItem ? nextItem.id : null;
  }

  return { rooms, nextCursor };
}