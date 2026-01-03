import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import { $Enums, MessageType, PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import chalk from "chalk";
import { getChatRoomDataInclude, getMessageDataInclude } from "./types";
import { getFormattedRooms, getMessageReactions, getMessageReads } from "./utils";

dotenv.config();

const app = express();
const server = http.createServer(app);
const prisma = new PrismaClient();

// --- CONFIGURATION ---
const PORT = process.env.PORT || 5000;
const JWT_SECRET =
  process.env.JWT_SECRET || "super_secret_key_change_me_in_prod";
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";
const INTERNAL_SECRET = process.env.INTERNAL_SERVER_SECRET || "default_secret";

// --- MIDDLEWARES ---
app.use(
  cors({
    origin: CLIENT_URL,
    methods: ["GET", "POST"],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// --- LOGIQUE DE VÉRIFICATION UTILISATEUR ---

async function validateUserInDb(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  return !!user;
}

// --- ROUTES AUTHENTIFICATION ---
app.get("/", (req, res) => {
  res.send("Server ready");
});

app.post("/api/auth/session", async (req, res) => {
  console.log(req);

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
    res.status(500).json({ error: "Erreur serveur" });
  }
});

interface TypingUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}
const typingUsersByRoom = new Map<string, Map<string, TypingUser>>();

// --- SOCKET.IO SETUP ---

const io = new Server(server, {
  cors: { origin: CLIENT_URL, methods: ["GET", "POST"], credentials: true },
});

const onlineUsers = new Map<string, Set<string>>();

/**
 * Middleware Socket.io : Authentification
 */
io.use(async (socket, next) => {
  console.log(chalk.yellow("Un client tente de se connecter..."));

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
      return next(new Error("Session invalide"));
    }

    // On stocke l'user dans le socket pour un accès facile plus tard
    socket.data.user = session.user;
    next();
  } catch (err) {
    console.log(chalk.red("Impossible de connecter le client"));
    next(new Error("Erreur interne du serveur"));
  }
});

io.on("connection", async (socket) => {
  const userId = socket.data.user.id;
  const username = socket.data.user.username;
  const displayName = socket.data.user.displayName || username;
  const avatarUrl = socket.data.user.avatarUrl;

  // Marquer l'utilisateur comme en ligne
  await prisma.user.update({
    where: { id: userId },
    data: { isOnline: true },
  });

  socket.join(userId); // Rejoindre sa room personnelle pour les notifs privées / sidebar

  socket.on(
    "start_chat",
    async ({ targetUserId, isGroup, name, membersIds }) => {
      try {
        // 1. Préparation des membres
        // On s'assure que l'utilisateur actuel est inclus
        let members = isGroup
          ? [...membersIds, userId]
          : [userId, targetUserId];
        members = [...new Set(members)]; // Supprimer les doublons

        // Validation basique
        if (isGroup && members.length < 2) {
          socket.emit(
            "error_message",
            "Un groupe doit avoir au moins 2 membres."
          );
          return;
        }

        // 2. Vérification d'une room existante (LOGIQUE DE VOTRE POST HTTP)
        if (!isGroup) {
          const existingRoom = await prisma.room.findFirst({
            where: {
              isGroup: false,
              AND: [
                { members: { some: { userId: members[0] } } },
                { members: { some: { userId: members[1] } } },
              ],
            },
            include: getChatRoomDataInclude(), // On utilise votre include standard
          });

          if (existingRoom) {
            socket.emit("room_ready", existingRoom);
            return;
          }
        }

        // 3. Création de la Room et du Message Initial (Transaction pour la sécurité)
        const newRoom = await prisma.$transaction(async (tx) => {
          // A. Créer la room
          const room = await tx.room.create({
            data: {
              name: isGroup ? name : null,
              isGroup: isGroup,
              members: {
                create: members.map((id) => ({ userId: id })),
              },
            },
            include: getChatRoomDataInclude(),
          });

          // B. Créer le message "CREATE"
          // C'est ce message qui va générer le LastMessage et rendre la room visible
          const message = await tx.message.create({
            data: {
              content: "created",
              roomId: room.id,
              senderId: isGroup ? userId : null, // null pour MP, user pour groupe
              type: "CREATE",
            },
          });

          // C. Créer/Mettre à jour LastMessage pour tous les membres
          // C'est CRUCIAL pour respecter votre logique de tri (orderBy createdAt)
          for (const memberId of members) {
            await tx.lastMessage.upsert({
              where: {
                userId_roomId: { userId: memberId, roomId: room.id },
              },
              update: { messageId: message.id, createdAt: message.createdAt },
              create: {
                userId: memberId,
                roomId: room.id,
                messageId: message.id,
              },
            });
          }

          return { ...room, messages: [message] }; // On renvoie la room avec le message
        });

        // 4. Notification Socket
        // On fait rejoindre le créateur à la room socket
        socket.join(newRoom.id);

        // Pour les autres participants :
        // On leur envoie l'info qu'une room a été créée (pour mettre à jour leur liste)
        // Et on demande à leur socket connecté de rejoindre le canal
        members.forEach((memberId) => {
          if (memberId !== userId) {
            // Emet un event à la room personnelle de l'autre utilisateur
            io.to(memberId).emit("new_room_created", newRoom);

            // Note: On ne peut pas forcer le socket distant à faire .join() ici facilement
            // sans une gestion avancée des sockets connectés.
            // Le plus simple est que le client réagisse à "new_room_created"
          }
        });

        // 5. Réponse au créateur
        socket.emit("room_ready", newRoom);
      } catch (error) {
        console.error("Erreur start_chat:", error);
        socket.emit("error_message", "Impossible de créer la discussion.");
      }
    }
  );

  socket.on("get_rooms", async ({ cursor }: { cursor?: string | null }) => {
    try {
      const response = await getFormattedRooms(userId, username, cursor);
      socket.emit("rooms_list_data", response);
    } catch (error) {
      socket.emit("error_message", "Impossible de récupérer les discussions.");
    }
  });

  // ÉVÉNEMENT POUR REJOINDRE UNE ROOM SÉCURISÉE (Active Chat)
  socket.on("join_room", async (roomId: string) => {
    const userId = socket.data.user.id;
    // console.log(userId);

    console.log(
      chalk.yellow(
        socket.data.user.username || userId,
        "Tente de rejoindre le salon:",
        roomId
      )
    );

    if (roomId === "saved-" + userId) {
      socket.join(roomId);
      console.log(
        chalk.green(
          socket.data.user.username || userId,
          "a rejoins le salon:",
          roomId
        )
      );
      return;
    }

    const membership = await prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });

    // Sécurité : Si banni ou a quitté, on interdit le join
    if (membership && membership.type !== "BANNED" && !membership.leftAt) {
      socket.join(roomId);
      console.log(
        chalk.green(
          socket.data.user.username || userId,
          "a rejoins le salon:",
          roomId
        )
      );
    }
  });

  // --- NOUVEL ÉVÉNEMENT : LEAVE_ROOM ---
  // Essentiel pour arrêter d'écouter une room quand on change de page/conversation
  socket.on("leave_room", (roomId: string) => {
    socket.leave(roomId);
    console.log(chalk.gray(`${displayName} a quitté le salon (socket): ${roomId}`));
  });

  // --- GESTION DU TYPING (SAISIE) ---

  socket.on("typing_start", async (roomId: string) => {
    // console.log(chalk.magenta(displayName, "ecrit..."));

    if (!roomId.startsWith("saved-")) {
      const membership = await prisma.roomMember.findUnique({
        where: { roomId_userId: { roomId, userId } },
        select: { leftAt: true, type: true },
      });
      if (!membership || membership.leftAt || membership.type === "BANNED")
        return;
    }

    // Ajouter l'utilisateur à la liste des "écrivains" pour cette room
    if (!typingUsersByRoom.has(roomId)) {
      typingUsersByRoom.set(roomId, new Map());
    }

    const roomTyping = typingUsersByRoom.get(roomId)!;
    roomTyping.set(userId, { id: userId, displayName, avatarUrl });

    // On envoie la liste de TOUS ceux qui écrivent dans cette room
    const typingUsers = Array.from(roomTyping.values());

    // 5. Diffusion
    // On utilise socket.to(roomId) pour informer tous les AUTRES membres
    socket.to(roomId).emit("typing_update", { roomId, typingUsers });
  });

  socket.on("typing_stop", (roomId: string) => {
    const roomTyping = typingUsersByRoom.get(roomId);
    if (roomTyping) {
      roomTyping.delete(userId);
      if (roomTyping.size === 0) {
        typingUsersByRoom.delete(roomId);
      }
      // Notifier l'arrêt de la saisie
      const typingList = Array.from(roomTyping?.values() || []).filter(
        (u) => u.id !== userId
      );
      socket
        .to(roomId)
        .emit("typing_update", { roomId, typingUsers: typingList });
    }
  });

  // --- GESTION DES LECTURES (READS / VUES) ---
  socket.on(
    "mark_message_read",
    async ({ messageId, roomId }: { messageId: string; roomId: string }) => {
      try {
        const userId = socket.data.user.id;

        // 1. Validation de l'appartenance à la room (sauf messages sauvegardés)
        if (!roomId.startsWith("saved-")) {
          const membership = await prisma.roomMember.findUnique({
            where: { roomId_userId: { roomId, userId } },
          });
          
          if (!membership || membership.type === "BANNED" || membership.leftAt) {
            // Utilisateur non autorisé ou parti
            return; 
          }
        }

        // 2. Vérification que le message existe
        const message = await prisma.message.findUnique({
          where: { id: messageId },
        });

        if (!message) return;

        // 3. Application de votre logique "Read Upsert"
        await prisma.read.upsert({
          where: {
            userId_messageId: {
              userId: userId,
              messageId,
            },
          },
          create: {
            userId: userId,
            messageId,
          },
          update: {}, // Rien à mettre à jour si existe déjà
        });

        // 4. Récupérer la liste mise à jour des lecteurs pour l'envoyer au front
        const updatedReads = await getMessageReads(messageId);

        // 5. Diffuser à tout le monde dans la room (y compris l'expéditeur)
        io.to(roomId).emit("message_read_update", {
          messageId,
          reads: updatedReads,
        });

      } catch (error) {
        console.error("Erreur mark_message_read:", error);
      }
    }
  );

  // --- GESTION DES RÉACTIONS ---
  socket.on(
    "add_reaction",
    async ({
      messageId,
      roomId,
      content,
    }: {
      messageId: string;
      roomId: string;
      content: string;
    }) => {
      try {
        const userId = socket.data.user.id;
        const username = socket.data.user.username;

        // 1. Validation de l'appartenance à la room
        if (!roomId.startsWith("saved-")) {
          const membership = await prisma.roomMember.findUnique({
            where: { roomId_userId: { roomId, userId } },
          });
          if (
            !membership ||
            membership.type === "BANNED" ||
            membership.leftAt
          ) {
            return socket.emit("error", { message: "Non autorisé" });
          }
        }

        // 2. Récupération du message original pour identifier l'auteur
        const originalMessage = await prisma.message.findUnique({
          where: { id: messageId },
          select: {
            senderId: true,
            roomId: true,
            sender: { select: { id: true, username: true } },
          },
        });

        if (!originalMessage) return;

        // 3. UPSERT de la réaction (création ou mise à jour)
        const reaction = await prisma.reaction.upsert({
          where: {
            userId_messageId: {
              userId,
              messageId,
            },
          },
          create: {
            userId,
            messageId,
            content,
          },
          update: {
            content,
            readAt: new Date(),
          },
          select: { id: true },
        });

        // 4. Gestion de la notification via Message de type REACTION
        // Uniquement si l'utilisateur réagit au message de quelqu'un d'autre
        if (userId !== originalMessage.senderId) {
          // Suppression des anciennes notifications identiques pour cette réaction
          await prisma.message.deleteMany({
            where: {
              senderId: userId,
              recipientId: originalMessage.senderId,
              roomId: originalMessage.roomId,
              type: "REACTION",
              reactionId: reaction.id,
            },
          });

          // Création du message de notification technique
          const reactionMessage = await prisma.message.create({
            data: {
              senderId: userId,
              recipientId: originalMessage.senderId,
              type: "REACTION",
              content: content,
              roomId: originalMessage.roomId,
              reactionId: reaction.id,
            },
          });

          // 5. MISE À JOUR DES LAST MESSAGES (Uniquement pour les 2 concernés)
          if (reactionMessage.id && originalMessage.roomId) {
            // On utilise une transaction pour supprimer et recréer proprement
            // Cela garantit que le "LastMessage" pointe bien sur la dernière réaction
            await prisma.lastMessage.deleteMany({
              where: {
                roomId: originalMessage.roomId,
                userId: { in: [userId, originalMessage.senderId] },
              },
            });

            await prisma.lastMessage.createMany({
              data: [
                {
                  userId: userId, // L'envoyeur de la réaction
                  roomId: originalMessage.roomId,
                  messageId: reactionMessage.id,
                },
                {
                  userId: originalMessage.senderId, // L'auteur du message original
                  roomId: originalMessage.roomId,
                  messageId: reactionMessage.id,
                },
              ],
            });

            // 6. MISE À JOUR DES ROOMS (Emission ciblée)
            
            if (originalMessage.sender?.username && originalMessage.senderId) {
              // Récupération des listes de salons formatées pour les deux utilisateurs
              const [roomsForSender, roomsForRecipient] = await Promise.all([
                getFormattedRooms(userId, username),
                getFormattedRooms(
                  originalMessage.senderId,
                  originalMessage.sender.username
                ),
              ]);
              
              // Envoyer la mise à jour à l'auteur de la réaction
              io.to(userId).emit("rooms_list_data", roomsForSender);

              // Envoyer la mise à jour à l'auteur du message original
              io.to(originalMessage.senderId).emit(
                "rooms_list_data",
                roomsForRecipient
              );
            }
          }
        }

        // 7. Diffusion globale de la mise à jour visuelle des réactions dans le tchat
        const reactionsData = await getMessageReactions(messageId, userId);
        io.to(roomId).emit("message_reaction_update", {
          messageId,
          reactions: reactionsData,
        });
      } catch (error) {
        console.error("Erreur add_reaction:", error);
        socket.emit("error", { message: "Impossible d'ajouter la réaction" });
      }
    }
  );

  socket.on(
    "remove_reaction",
    async ({ messageId, roomId }: { messageId: string; roomId: string }) => {
      try {
        const userId = socket.data.user.id;
        const username = socket.data.user.username;

        // 1. Récupération des informations nécessaires avant suppression
        const message = await prisma.message.findUnique({
          where: { id: messageId },
          select: {
            senderId: true,
            roomId: true,
            sender: { select: { id: true, username: true } },
            reactions: {
              where: { userId },
              select: { id: true },
            },
          },
        });

        // Si le message n'existe pas ou si l'utilisateur n'a pas réagi, on arrête
        if (!message || !message.reactions[0]) return;

        const reactionId = message.reactions[0].id;
        const originalSenderId = message.senderId;

        // 2. Suppression atomique de la réaction et du message de notification
        await prisma.$transaction([
          prisma.reaction.delete({
            where: { id: reactionId },
          }),
          prisma.message.deleteMany({
            where: {
              senderId: userId,
              recipientId: originalSenderId,
              roomId: message.roomId,
              reactionId: reactionId,
              type: "REACTION",
            },
          }),
        ]);

        // 3. MISE À JOUR DES LAST MESSAGES (Uniquement pour les 2 concernés)
        // Après suppression, on doit recalculer quel est le dernier message réel pour ces deux utilisateurs
        if (originalSenderId && message.roomId) {
          // Fonction utilitaire locale pour restaurer le dernier message valide
          const refreshLastMessage = async (targetId: string) => {
            // On cherche le dernier message de la room qui n'est pas une notification de réaction supprimée
            const lastValidMessage = await prisma.message.findFirst({
              where: { roomId: message.roomId },
              orderBy: { createdAt: "desc" },
              select: { id: true },
            });

            if (lastValidMessage) {
              await prisma.lastMessage.upsert({
                where: {
                  userId_roomId: {
                    userId: targetId,
                    roomId: message.roomId as string,
                  },
                },
                create: {
                  userId: targetId,
                  roomId: message.roomId as string,
                  messageId: lastValidMessage.id,
                },
                update: { messageId: lastValidMessage.id },
              });
            } else {
              // Si plus aucun message dans la room, on nettoie
              await prisma.lastMessage.deleteMany({
                where: { userId: targetId, roomId: message.roomId as string },
              });
            }
          };

          // On rafraîchit pour l'auteur de la réaction et l'auteur du message
          await Promise.all([
            refreshLastMessage(userId),
            refreshLastMessage(originalSenderId),
          ]);

          // 4. MISE À JOUR DES ROOMS (Emission ciblée)
          if (message.sender?.username) {
            const [roomsForRemover, roomsForAuthor] = await Promise.all([
              getFormattedRooms(userId, username),
              getFormattedRooms(originalSenderId, message.sender.username),
            ]);

            // --- CORRECTION ICI : PAS d'imbrication { rooms: ... } ---
            io.to(userId).emit("rooms_list_data", roomsForRemover);
            io.to(originalSenderId).emit("rooms_list_data", roomsForAuthor);
          }
        }

        // 5. Diffusion globale de la mise à jour visuelle des réactions
        const reactionsData = await getMessageReactions(messageId, userId);
        io.to(roomId).emit("message_reaction_update", {
          messageId,
          reactions: reactionsData,
        });
      } catch (error) {
        console.error("Erreur remove_reaction:", error);
        socket.emit("error", {
          message: "Impossible de supprimer la réaction",
        });
      }
    }
  );
  // --- GESTION DE LA SUPPRESSION (Optimisée pour tout le monde) ---
  socket.on(
    "delete_message",
    async ({ messageId, roomId }: { messageId: string; roomId: string }) => {
      console.log(
        chalk.red(`Tentative de suppression: msg ${messageId} par ${userId}`)
      );

      try {
        // 1. Récupérer le message pour vérifier l'auteur
        const messageToDelete = await prisma.message.findUnique({
          where: { id: messageId },
        });

        if (!messageToDelete) {
          return socket.emit("error", { message: "Message introuvable" });
        }

        // Sécurité : Seul l'auteur peut supprimer
        if (messageToDelete.senderId !== userId) {
          return socket.emit("error", {
            message: "Vous n'avez pas l'autorisation",
          });
        }

        if (roomId === "saved-" + userId) {
          // Suppression de message enregistré
          await prisma.message.delete({
            where: { id: messageId },
          });
          
          // EMISSION CORRECTE : Utiliser io.to(roomId) et non socket.emit
          io.to(roomId).emit("message_deleted", { messageId, roomId });

          // Rafraîchir la liste des rooms (sidebar)
          const updatedRooms = await getFormattedRooms(userId, username);
          // EMISSION CORRECTE : Utiliser io.to(userId)
          io.to(userId).emit("rooms_list_data", updatedRooms);

          return;
        }

        // TRANSACTION DE SUPPRESSION ET MISE A JOUR
        await prisma.$transaction(async (tx) => {
          // 2. Trouver quel sera le NOUVEAU dernier message si on supprime celui-ci
          // On cherche le message le plus récent qui N'EST PAS celui qu'on supprime
          const nextLatestMessage = await tx.message.findFirst({
            where: {
              roomId: roomId,
              id: { not: messageId }, // Exclure le message actuel
            },
            orderBy: { createdAt: "desc" },
          });

          // 3. Mettre à jour la table LastMessage pour TOUS les utilisateurs de cette room
          if (nextLatestMessage) {
            await tx.lastMessage.updateMany({
              where: {
                roomId: roomId,
                messageId: messageId, // Seulement ceux qui pointaient sur CE message
              },
              data: {
                messageId: nextLatestMessage.id,
                createdAt: nextLatestMessage.createdAt,
              },
            });
          } else {
            // Cas rare : Plus aucun message. On nettoie LastMessage.
            await tx.lastMessage.deleteMany({
              where: { roomId: roomId, messageId: messageId },
            });
          }

          // 4. Supprimer le message
          await tx.message.delete({
            where: { id: messageId },
          });
        });

        // 5. Notifier tout le monde dans la room que le message a disparu
        io.to(roomId).emit("message_deleted", { messageId, roomId });

        // 6. DIFFUSION INTELLIGENTE DE LA MISE A JOUR SIDEBAR
        // On doit re-calculer la liste des rooms pour *chaque membre* car le contenu peut varier

        // A. Trouver tous les membres actifs (pas bannis, pas partis)
        // On include 'user' pour avoir le username nécessaire à getFormattedRooms
        const activeMembers = await prisma.roomMember.findMany({
          where: { roomId, leftAt: null, type: { not: "BANNED" } },
          include: { user: true },
        });

        // B. Boucle parallèle pour mettre à jour tout le monde
        // On utilise Promise.all pour ne pas bloquer le serveur séquentiellement
        await Promise.all(
          activeMembers.map(async (member) => {
            if (member.userId && member.user) {
              try {
                // On génère la vue spécifique à ce membre
                const updatedRooms = await getFormattedRooms(
                  member.userId,
                  member.user.username
                );
                // On envoie à SON canal socket personnel (userId)
                io.to(member.userId).emit("rooms_list_data", updatedRooms);
              } catch (e) {
                console.error(
                  `Erreur refresh sidebar pour ${member.userId}:`,
                  e
                );
              }
            }
          })
        );
      } catch (error) {
        console.error("Erreur delete_message:", error);
        socket.emit("error", { message: "Impossible de supprimer le message" });
      }
    }
  );

  socket.on(
    "send_message",
    async (data: {
      content: string;
      roomId: string;
      type: MessageType;
      recipientId: string | undefined;
    }) => {
      const userId = socket.data.user.id;
      const username = socket.data.user.username; // Capture username
      const { content, roomId, type, recipientId } = data;

      console.log(chalk.blue("Envoi du message:", content));

      try {
        const isSavedMessage = roomId === `saved-${userId}`;
        let newMessage;

        if (isSavedMessage) {
          // 1. Logique Messages Sauvegardés
          const savedMsg = await prisma.message.create({
            data: {
              content,
              senderId: userId,
              type: "SAVED",
            },
            include: getMessageDataInclude(userId),
          });
          
          // Logique stricte de Type : 
          // Si content est EXACTEMENT "created", type = CREATE
          // Sinon, type = CONTENT (ce qui corrige le bug "toujours created")
          let emissionType = "CONTENT";
          if (content === "create-" + userId) {
            emissionType = "SAVED";
          }
          const newMessage = { ...savedMsg, type: emissionType };
          
          // EMISSION CORRECTE : Utiliser io.to(roomId) pour que tous les onglets reçoivent
          io.to(roomId).emit("receive_message", { newMessage, roomId });
          
          // Rafraîchir la liste pour soi-même
          const updatedRooms = await getFormattedRooms(userId, username);
          // EMISSION CORRECTE : Utiliser io.to(userId)
          io.to(userId).emit("rooms_list_data", updatedRooms);
        } else {
          // 2. Vérification de sécurité (doublon du join_room pour l'envoi)
          const membership = await prisma.roomMember.findUnique({
            where: { roomId_userId: { roomId, userId } },
          });

          if (
            !membership ||
            membership.type === "BANNED" ||
            membership.leftAt
          ) {
            return socket.emit("error", { message: "Action non autorisée" });
          }

          // 3. Création du message et mise à jour des LastMessage
          // On utilise une transaction pour garantir que tout passe ou rien
          const [createdMessage, roomData] = await prisma.$transaction([
            prisma.message.create({
              data: {
                content,
                roomId,
                senderId: userId,
                type,
                recipientId,
              },
              include: getMessageDataInclude(userId),
            }),
            prisma.room.findUnique({
              where: { id: roomId },
              include: getChatRoomDataInclude(),
            }),
          ]);

          newMessage = createdMessage;

          // 4. Mise à jour des LastMessage pour les membres actifs
          const activeMembers = await prisma.roomMember.findMany({
            where: { roomId, leftAt: null, type: { not: "BANNED" } },
            include: { user: true }, // Ajout pour récupérer le username
          });

          for (const member of activeMembers) {
            if (member.userId) {
              await prisma.lastMessage.upsert({
                where: { userId_roomId: { userId: member.userId, roomId } },
                create: {
                  userId: member.userId,
                  roomId,
                  messageId: newMessage.id,
                },
                update: { messageId: newMessage.id, createdAt: new Date() },
              });
            }
          }

          // 5. DIFFUSION : On envoie à tout le monde dans la room
          io.to(roomId).emit("receive_message", {
            newMessage,
            roomId,
            newRoom: roomData, // Utile pour remonter la sidebar chez les autres
          });

          // 6. FORCER LE RE-CALCUL DE GET_ROOMS POUR TOUS LES MEMBRES ACTIFS
          // Mêmes correctifs que pour delete_message : on loop sur tout le monde
          await Promise.all(
            activeMembers.map(async (member) => {
              if (member.userId && member.user) {
                try {
                  const updatedRooms = await getFormattedRooms(
                    member.userId,
                    member.user.username
                  );
                  io.to(member.userId).emit("rooms_list_data", updatedRooms);
                } catch (e) {
                  console.error("Erreur refresh member:", member.userId);
                }
              }
            })
          );
        }
      } catch (error) {
        console.error("Erreur send_message:", error);
        socket.emit("error", { message: "Erreur lors de l'envoi" });
      }
    }
  );

  // Côté Serveur (io.on("connection"))
  socket.on("check_user_status", async ({ userId }) => {
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { isOnline: true, lastSeen: true, id: true },
    });

    if (targetUser) {
      // On renvoie l'info uniquement au demandeur (socket.emit)
      socket.emit("user_status_change", {
        userId: targetUser.id,
        isOnline: targetUser.isOnline,
        lastSeen: targetUser.lastSeen,
      });
    }
  });
  socket.broadcast.emit("user_status_change", {
    userId: userId,
    isOnline: true,
  });

  console.log(chalk.green(`${displayName} est en ligne.`));

  socket.on("disconnect", async () => {
    const lastSeen = new Date();
    await prisma.user.update({
      where: { id: userId },
      data: { isOnline: false, lastSeen },
    });

    socket.broadcast.emit("user_status_change", {
      userId: userId,
      isOnline: false,
      lastSeen: lastSeen,
    });

    console.log(chalk.yellow(`${displayName} s'est déconnecté.`));
  });
});

const hostname = "0.0.0.0";
server.listen(PORT, () => {
  console.log(`🚀 Serveur de chat prêt à l'adresse http://localhost:${PORT}`);
});