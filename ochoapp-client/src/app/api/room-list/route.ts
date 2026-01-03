import { validateRequest } from "@/auth";
import prisma from "@/lib/prisma";
import {
  RoomsSection,
  getChatRoomDataInclude,
  RoomData,
  getMessageDataInclude,
  MessageData,
} from "@/lib/types";
import { createRoomSchema } from "@/lib/validation";
import { NextRequest } from "next/server";
import { getUserDataSelect } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    const cursor = req.nextUrl.searchParams.get("cursor") || undefined;
    const pageSize = 10;

    const { user: loggedInUser } = await validateRequest();

    if (!loggedInUser) {
      return Response.json({ error: "Action non autorisée" }, { status: 401 });
    }

    const user = await prisma.user.findFirst({
      where: {
        id: loggedInUser.id,
      },
      select: getUserDataSelect(loggedInUser.id, loggedInUser.username),
    });

    if (!user) {
      return Response.json({ error: "Action non autorisée" }, { status: 401 });
    }

    const userId = user.id;
    const username = user.username;
    const displayName = user.displayName || username;
    const avatarUrl = user.avatarUrl;

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
      cursor: cursor
        ? { userId_roomId: { userId, roomId: cursor } }
        : undefined,
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

    return Response.json({ rooms, nextCursor });
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: "Erreur interne du serveur" },
      { status: 500 },
    );
  }
}
