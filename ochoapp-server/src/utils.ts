import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import { Request, Response } from "express";
import {
  getChatRoomDataInclude,
  getMessageDataInclude,
  getUserDataSelect,
  MessageData,
  RoomData,
  RoomsSection,
} from "./types";
import { DefaultEventsMap, ExtendedError, Socket } from "socket.io";
import chalk from "chalk";

const prisma = new PrismaClient();

const JWT_SECRET =
  process.env.JWT_SECRET || "super_secret_key_change_me_in_prod";
const INTERNAL_SECRET = process.env.INTERNAL_SERVER_SECRET || "default_secret";



export async function validateUserInDb(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  return !!user;
}
export async function validateSession(req: Request<{ userId: string }>, res: Response) {
  try {
      const { userId } = req.body;
      const internalSecret = req.headers["x-internal-secret"];
  
      if (internalSecret !== INTERNAL_SECRET) {
        return res.status(401).json({ error: "Accès refusé" });
      }
  
      const userExists = await validateUserInDb(userId);
      if (!userExists)
        return res.status(404).json({ error: "Utilisateur introuvable" });
  
      const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" });
      res.json({ token });
    } catch (error) {
      console.error("Validate Session Error:", error);
      res.status(500).json({ error: "Impossible de valider la session" });
    }
}

export async function socketHandler(socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>, next: ((err?: ExtendedError | undefined) => void)) {
  try {
    const { token } = socket.handshake.auth;
    const session = await prisma.session.findUnique({
      where: {
        id: token,
      },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            username: true,
            avatarUrl: true,
            isOnline: true,
            lastSeen: true,
          },
        },
      },
    });

    if (!session || !session.user) {
      console.log(chalk.red("Impossible de connecter le client"));
      return next(new Error("Session introuvable"));
    }

    socket.data.user = session.user;
    next();
  } catch (error) {
    console.log(chalk.red("Impossible de connecter le client: ", error));
    next(new Error("Erreur de connexion"));
  }
}
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

// RÉCUPÉRER LES LECTURES (READS) ---
export async function getMessageReads(messageId: string) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      reads: {
        select: {
          user: {
            select: {
              id: true,
              displayName: true,
              username: true,
              avatarUrl: true,
            },
          },
        },
      },
    },
  });

  if (!message) return [];
  
  // On retourne la liste des utilisateurs qui ont lu, format identique à votre API
  return message.reads.map((read) => read.user);
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