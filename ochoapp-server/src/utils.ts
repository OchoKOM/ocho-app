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
import { DefaultEventsMap, ExtendedError, Server, Socket } from "socket.io";
import chalk from "chalk";
import z from "zod";

const prisma = new PrismaClient();

const JWT_SECRET =
  process.env.JWT_SECRET || "super_secret_key_change_me_in_prod";
const INTERNAL_SECRET = process.env.INTERNAL_SERVER_SECRET || "default_secret";

export async function getUnreadRoomsCount(userId: string): Promise<number> {
  const unreadCount = await prisma.room.count({
    where: {
      members: {
        some: {
          AND: [
            { userId: userId },
            {
              joinedAt: {
                lte: new Date(),
              },
            },
            { OR: [{ leftAt: { lt: new Date() } }, { leftAt: null }] },
          ],
        },
      },
      messages: {
          some: {
            AND: [
              { type: { not: "CREATE" } },
              {
                reads: {
                  none: {
                    userId: user.id,
                  },
                },
              },
              {
                OR: [
                  {
                    AND: [
                      { senderId: { not: user.id } },
                      {
                        type: {
                          not: "REACTION",
                        },
                      },
                    ],
                  },
                  {
                    AND: [
                      {
                        type: "REACTION",
                      },
                      {
                        OR: [{ recipientId: user.id }, { senderId: user.id }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
    },
  });
  return unreadCount;
}
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


const requiredString = z.string().trim().min(1, "Champ obligatoire");
const requiredThreeChars = requiredString.min(3, "Ce champ doit contenir au moins trois caractères")
export const singleEmojiSchema = z
  .string()
  .trim()
  .regex(
    /^[\p{Emoji}\p{Emoji_Presentation}][\u200D\p{Emoji}\p{Emoji_Presentation}]*$/u,
    "Emoji invalide",
  )
  .refine((str) => [...str].length === 1, {
    message: "Un seul emoji s'il vous plaît",
  });

export const signupSchema = z.object({
  email: requiredString.email("Adresse email invalide"),
  username: requiredThreeChars.regex(
    /^[a-zA-Z0-9_-]+$/,
    "Nom d'utilisateur doit contenir uniquement des lettres, des chiffres, des tirets ou des tirets bas",
  ),
  password: z
    .string()
    .min(8, "Mot de passe doit contenir au moins 8 caractères"),
});

export type SignupValues = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  username: requiredString,
  password: requiredString,
});

export type LoginValues = z.infer<typeof loginSchema>;

export const sessionSchema = z.object({
  id: requiredString,
  userId: requiredString,
});

export type SessionValues = z.infer<typeof sessionSchema>;


export const MessageSchema = z.object({
  content: z.string(),
  roomId: z.string(),
  senderId: z.string(),
});


export const addMemberSchema = z.object({
  roomId: z.string(),
  members: z.array(z.string()),
});
export const addAdminSchema = z.object({
  roomId: z.string(),
  member: z.string(),
});
export const memberActionSchema = z.object({
  roomId: z.string(),
  memberId: z.string().optional(),
  deleteGroup: z.boolean().optional(),
});
export const saveMessageSchema = z.object({
  name: z.string().optional(),
  recipientId: z.string().optional(),
  members: z.array(z.string()).optional(),
});

export const createPostSchema = z.object({
  content: z.string(),
  mediaIds: z.array(z.string()).max(5, "Vous pouvez ajouter jusqu'à 5 médias"),
  gradient: z.number().int().optional(),
});

export const updateUserProfileSchema = z.object({
  displayName: requiredString.optional(),
  bio: z.string().max(1000, "La bio ne peut pas depasser 1000 caractères.").optional(),
  birthday: z.date().optional(),
});

export type UpdateUserProfileValues = z.infer<typeof updateUserProfileSchema>;

export const updateGroupChatProfileSchema = z.object({
  id: requiredString,
  name: z.string().trim(),
  description: z.string().trim().max(2000, "La description ne peut pas depasser 2000 caractères."),
});

export type UpdateGroupChatProfileValues = z.infer<typeof updateGroupChatProfileSchema>;

export const createCommentSchema = z.object({
  content: requiredString.trim().max(3000, "Le commentaire ne peut pas depasser 3000 caractères."),
});

export function groupManagment(io: Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,{ userId, username, displayName, avatarUrl }: { userId: string; username: string; displayName: string; avatarUrl: string | null; }) {
  // --- GESTION DE GROUPE VIA SOCKET ---

  // 1. Ajouter des membres
  socket.on("group_add_members", async (input: { roomId: string; members: string[] }, callback: (data: any)=>void) => {
    try {
      const { roomId, members } = addMemberSchema.parse(input);

      if (!members?.length) throw new Error("Selectionnez au moins un utilisateur");

      const room = await prisma.room.findUnique({ where: { id: roomId }, include: { members: true } });
      if (!room || !room.isGroup) throw new Error("Groupe invalide");

      const existingMembers = room.members;
      if (existingMembers.length >= room.maxMembers) throw new Error("Groupe plein");

      const newMembers = members.filter(
        (memberId) => !existingMembers.some((em) => em.userId === memberId)
      );

      const newMembersCreated = await prisma.roomMember.createMany({
        data: newMembers.map((mid) => ({ userId: mid, roomId })),
      });

      if (!newMembersCreated) throw new Error("Erreur ajout membres");

      // Création des messages système et notifications
      const sentInfoMessages = await Promise.all(
        newMembers.map(async (memberId) => {
          const message = await prisma.message.create({
            data: {
              content: "add-" + memberId,
              senderId: userId,
              recipientId: memberId,
              type: "NEWMEMBER",
              roomId,
            },
            include: getMessageDataInclude(userId),
          });
          
          // Mise à jour pour TOUS les membres actifs du groupe (Add est public)
          const activeMemberIds = room.members
            .filter(m => !["OLD", "BANNED"].includes(m.type))
            .map(m => {
              if (!m.userId) return
              return m.userId
            })
            .filter(uid => ( uid !== memberId))
            .filter((uid): uid is string => uid !== null)
            .concat(newMembers);

          await Promise.all(activeMemberIds.map(mid => 
            prisma.lastMessage.upsert({
               where: { userId_roomId: { userId: mid, roomId } },
               create: { userId: mid, messageId: message.id, roomId },
               update: { messageId: message.id, createdAt: new Date() }
            })
          ));
          
          return message;
        })
      );

      const updatedRoom = await prisma.room.findUnique({
          where: { id: roomId },
          include: getChatRoomDataInclude()
      });
      
      io.to(roomId).emit("room_updated", updatedRoom);
      sentInfoMessages.forEach(msg => {
          io.to(roomId).emit("receive_message", { newMessage: msg, roomId });
      });

      const allMembersToUpdate = (updatedRoom?.members.filter(m => !["OLD", "BANNED"].includes(m.type)).map(m => m.userId) || []).filter((uid) => uid !== undefined) as string[];
      allMembersToUpdate.forEach(async (mid) => {
         const userRooms = await getFormattedRooms(mid, "");
         io.to(mid).emit("room_list_updated", userRooms);
         if (newMembers.includes(mid)) {
             io.to(mid).emit("added_to_group", updatedRoom);
         }
      });

      callback({ success: true, data: { roomId } });

    } catch (error: any) {
      console.error("Erreur group_add_members:", error);
      callback({ success: false, error: error.message || "Erreur serveur" });
    }
  });

  // 2. Ajouter/Retirer Admin
  socket.on("group_add_admin", async (input, callback) => {
    try {
        const { roomId, member: targetId } = addAdminSchema.parse(input);
        
        const roomMember = await prisma.roomMember.findUnique({
            where: { roomId_userId: { roomId, userId: targetId } }
        });

        if (!roomMember || ["OLD", "BANNED"].includes(roomMember.type)) {
            throw new Error("Membre invalide");
        }

        const newType = roomMember.type === "ADMIN" ? "MEMBER" : "ADMIN";
        const newRoomMember = await prisma.roomMember.update({
            where: { roomId_userId: { roomId, userId: targetId } },
            data: { type: newType }
        });

        io.to(roomId).emit("member_role_updated", { 
            roomId, 
            userId: targetId, 
            newType 
        });

        callback({ success: true, data: { newRoomMember } });

    } catch(error: any) {
        callback({ success: false, error: error.message });
    }
  });

  // 3. Retirer un membre (Kick)
  socket.on("group_remove_member", async (input, callback) => {
    try {
        const { roomId, memberId: targetId } = memberActionSchema.parse(input);
        if (!targetId) throw new Error("Membre invalide");

        const roomMember = await prisma.roomMember.findUnique({
            where: { roomId_userId: { roomId, userId: targetId } }
        });
        if (!roomMember || ["OLD", "BANNED"].includes(roomMember.type)) {
             throw new Error("Membre déjà parti ou invalide");
        }


        const removeMsg = await prisma.message.create({
            data: {
                content: "leave",
                roomId,
                type: "LEAVE",
                senderId: userId, 
                recipientId: targetId
            },
            include: getMessageDataInclude(userId)
        });

        // Mise à jour UNIQUE pour le banni et l'admin qui a fait l'action (consigne : pas les autres)
        const relevantUsers = [userId, targetId];
        await Promise.all(relevantUsers.map(uid => 
            prisma.lastMessage.upsert({
                where: { userId_roomId: { userId: uid, roomId } },
                create: { userId: uid, roomId, messageId: removeMsg.id },
                update: { messageId: removeMsg.id, createdAt: new Date() }
            })
        ));
        await prisma.roomMember.update({
            where: { roomId_userId: { roomId, userId: targetId } },
            data: { type: "OLD", leftAt: new Date() }
        });

        io.to(roomId).emit("member_removed", { roomId, userId: targetId });
        io.to(roomId).emit("receive_message", { newMessage: removeMsg, roomId });
        
        // Rafraichir seulement pour les concernés
        for(const uid of relevantUsers) {
            const userRooms = await getFormattedRooms(uid, "");
            io.to(uid).emit("room_list_updated", userRooms);
        }

        callback({ success: true });

    } catch(error: any) {
        callback({ success: false, error: error.message });
    }
  });

  // 4. Bannir un membre
  socket.on("group_ban_member", async (input, callback) => {
    try {
        const { roomId, memberId: targetId } = memberActionSchema.parse(input);
        if (!targetId) throw new Error("Membre invalide");

        await prisma.roomMember.update({
            where: { roomId_userId: { roomId, userId: targetId } },
            data: { type: "BANNED", leftAt: new Date() }
        });

        const banMsg = await prisma.message.create({
            data: {
                content: "ban",
                roomId,
                type: "BAN",
                senderId: userId,
                recipientId: targetId
            },
            include: getMessageDataInclude(userId)
        });

        // Mise à jour UNIQUE pour le banni et l'admin
        const relevantUsers = [userId, targetId];
        await Promise.all(relevantUsers.map(uid => 
            prisma.lastMessage.upsert({
                where: { userId_roomId: { userId: uid, roomId } },
                create: { userId: uid, roomId, messageId: banMsg.id },
                update: { messageId: banMsg.id, createdAt: new Date() }
            })
        ));

        io.to(roomId).emit("member_banned", { roomId, userId: targetId });
        io.to(roomId).emit("receive_message", { newMessage: banMsg, roomId });

        for(const uid of relevantUsers) {
            const userRooms = await getFormattedRooms(uid, "");
            io.to(uid).emit("room_list_updated", userRooms);
        }

        callback({ success: true });
    } catch(error: any) {
        callback({ success: false, error: error.message });
    }
  });

  // 5. Quitter le groupe (Volontaire)
  socket.on("group_leave", async (input, callback) => {
      try {
        const { roomId, deleteGroup } = memberActionSchema.parse(input);
        
        const room = await prisma.room.findUnique({
            where: { id: roomId },
            include: { members: true }
        });
        
        if (!room) throw new Error("Groupe introuvable");

        const roomMember = room.members.find(m => m.userId === userId);
        if (!roomMember) throw new Error("Non membre");

        let groupDeleted = false;

        if (roomMember.type === "OWNER") {
            const activeMembers = room.members.filter(m => !["OLD", "BANNED"].includes(m.type));
            
            if (activeMembers.length === 1 || deleteGroup) {
                await prisma.room.delete({ where: { id: roomId } });
                groupDeleted = true;
            } else {
                 const nextOwner = activeMembers
                    .filter(m => m.userId !== userId)
                    .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime())[0];
                 
                 if (nextOwner) {
                     await prisma.roomMember.update({
                         where: { roomId_userId: { roomId, userId: nextOwner.userId || "" } },
                         data: { type: "OWNER" }
                     });
                     io.to(roomId).emit("member_role_updated", { roomId, userId: nextOwner.userId, newType: "OWNER" });
                 }
            }
        }

        if (groupDeleted) {
            io.to(roomId).emit("room_deleted", { roomId });
            const userRooms = await getFormattedRooms(userId, username);
            io.to(userId).emit("room_list_updated", userRooms);
        } else {
            const leaveMsg = await prisma.message.create({
                data: { content: "leave", roomId, type: "LEAVE", recipientId: userId },
                include: getMessageDataInclude(userId)
            });
            await prisma.roomMember.update({
                where: { roomId_userId: { roomId, userId } },
                data: { type: "OLD", leftAt: new Date() }
            });

            // Pour un départ volontaire, on met à jour pour TOUS les membres actifs restants + celui qui part
            const activeMemberIds = room.members
                .filter(m => !["OLD", "BANNED"].includes(m.type))
                .map(m => m.userId)
                .filter((uid): uid is string => uid !== null);

            await Promise.all(activeMemberIds.map(uid => 
                prisma.lastMessage.upsert({
                    where: { userId_roomId: { userId: uid, roomId } },
                    create: { userId: uid, roomId, messageId: leaveMsg.id },
                    update: { messageId: leaveMsg.id, createdAt: new Date() }
                })
            ));

            io.to(roomId).emit("member_left", { roomId, userId });
            io.to(roomId).emit("receive_message", { newMessage: leaveMsg, roomId });

            activeMemberIds.forEach(async (uid) => {
                const userRooms = await getFormattedRooms(uid, "");
                io.to(uid).emit("room_list_updated", userRooms);
            });
        }
        
        callback({ success: true });

      } catch (error: any) {
          callback({ success: false, error: error.message });
      }
  });

  // 6. Restaurer un membre
  socket.on("group_restore_member", async (input, callback) => {
      try {
          const { roomId, memberId: targetId } = memberActionSchema.parse(input);
          if (!targetId) throw new Error("Membre invalide");
          
          await prisma.roomMember.update({
              where: { roomId_userId: { roomId, userId: targetId } },
              data: { type: "MEMBER", leftAt: null }
          });

          const msg = await prisma.message.create({
              data: {
                  content: "add-" + targetId,
                  senderId: userId,
                  recipientId: targetId,
                  type: "NEWMEMBER",
                  roomId
              },
              include: getMessageDataInclude(userId)
          });

          // Mise à jour pour TOUS les membres actifs (restauration publique)
          const room = await prisma.room.findUnique({ where: { id: roomId }, include: { members: true } });
          const activeMemberIds = (room?.members.filter(m => !["OLD", "BANNED"].includes(m.type)).map(m => m.userId) || []).filter((uid): uid is string => uid !== null);

          await Promise.all(activeMemberIds.map(uid => 
            prisma.lastMessage.upsert({
                where: { userId_roomId: { userId: uid, roomId } },
                create: { userId: uid, roomId, messageId: msg.id },
                update: { messageId: msg.id, createdAt: new Date() }
            })
          ));

          io.to(roomId).emit("member_restored", { roomId, userId: targetId });
          io.to(roomId).emit("receive_message", { newMessage: msg, roomId });

          activeMemberIds.forEach(async (uid) => {
            const userRooms = await getFormattedRooms(uid, "");
            io.to(uid).emit("room_list_updated", userRooms);
          });
          
          callback({ success: true });
      } catch (error: any) {
          callback({ success: false, error: error.message });
      }
  });
}