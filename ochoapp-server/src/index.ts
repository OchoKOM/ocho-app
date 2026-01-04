import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import { MessageType, PrismaClient } from "@prisma/client";
import cookieParser from "cookie-parser";
import chalk from "chalk";
import { getChatRoomDataInclude, getMessageDataInclude } from "./types";
import {
  getFormattedRooms,
  getMessageReactions,
  getMessageReads,
  socketHandler,
  validateSession,
} from "./utils";
import path from "path";

dotenv.config();

const app = express();
const server = http.createServer(app);
const prisma = new PrismaClient();

const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";

app.use(
  cors({
    origin: CLIENT_URL,
    methods: ["GET", "POST"],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

app.get("/", (req, res) => {
  res.json({message:"Hello from the server"});
});

app.post("/api/auth/session", validateSession);

interface TypingUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}
const typingUsersByRoom = new Map<string, Map<string, TypingUser>>();

const io = new Server(server, {
  cors: { origin: CLIENT_URL, methods: ["GET", "POST"], credentials: true },
});

io.use(socketHandler);

io.on("connection", async (socket) => {
  const userId = socket.data.user.id;
  const username = socket.data.user.username;
  const displayName = socket.data.user.displayName || username;
  const avatarUrl = socket.data.user.avatarUrl;

  await prisma.user.update({
    where: { id: userId },
    data: { isOnline: true },
  });

  socket.join(userId);

  socket.on(
    "start_chat",
    async ({ targetUserId, isGroup, name, membersIds }) => {
      try {
        let members = isGroup
          ? [...membersIds, userId]
          : [userId, targetUserId];
        members = [...new Set(members)];

        if (isGroup && members.length < 2) {
          socket.emit(
            "error_message",
            "Un groupe doit avoir au moins 2 membres."
          );
          return;
        }

        if (!isGroup) {
          const existingRoom = await prisma.room.findFirst({
            where: {
              isGroup: false,
              AND: [
                { members: { some: { userId: members[0] } } },
                { members: { some: { userId: members[1] } } },
              ],
            },
            include: getChatRoomDataInclude(),
          });

          if (existingRoom) {
            socket.emit("room_ready", existingRoom);
            return;
          }
        }

        const newRoom = await prisma.$transaction(async (tx) => {
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

          const message = await tx.message.create({
            data: {
              content: "created",
              roomId: room.id,
              senderId: isGroup ? userId : null,
              type: "CREATE",
            },
          });

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

          return { ...room, messages: [message] };
        });
        
        // CORRECTION : On s'assure que le créateur rejoint immédiatement la room socket
        socket.join(newRoom.id);
        
        members.forEach((memberId) => {
          if (memberId !== userId) {
            io.to(memberId).emit("new_room_created", newRoom);
          }
        });

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

  socket.on("join_room", async (roomId: string) => {
    const userId = socket.data.user.id;
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

  socket.on("leave_room", (roomId: string) => {
    socket.leave(roomId);
    console.log(
      chalk.gray(`${displayName} a quitté le salon (socket): ${roomId}`)
    );
  });

  socket.on("typing_start", async (roomId: string) => {
    if (!roomId.startsWith("saved-")) {
      const membership = await prisma.roomMember.findUnique({
        where: { roomId_userId: { roomId, userId } },
        select: { leftAt: true, type: true },
      });
      if (!membership || membership.leftAt || membership.type === "BANNED")
        return;
    }

    if (!typingUsersByRoom.has(roomId)) {
      typingUsersByRoom.set(roomId, new Map());
    }

    const roomTyping = typingUsersByRoom.get(roomId)!;
    roomTyping.set(userId, { id: userId, displayName, avatarUrl });

    const typingUsers = Array.from(roomTyping.values());

    socket.to(roomId).emit("typing_update", { roomId, typingUsers });
  });

  socket.on("typing_stop", (roomId: string) => {
    const roomTyping = typingUsersByRoom.get(roomId);
    if (roomTyping) {
      roomTyping.delete(userId);
      if (roomTyping.size === 0) {
        typingUsersByRoom.delete(roomId);
      }
      const typingList = Array.from(roomTyping?.values() || []).filter(
        (u) => u.id !== userId
      );
      socket
        .to(roomId)
        .emit("typing_update", { roomId, typingUsers: typingList });
    }
  });

  socket.on(
    "mark_message_read",
    async ({ messageId, roomId }: { messageId: string; roomId: string }) => {
      try {
        const userId = socket.data.user.id;

        if (!roomId.startsWith("saved-")) {
          const membership = await prisma.roomMember.findUnique({
            where: { roomId_userId: { roomId, userId } },
          });

          if (
            !membership ||
            membership.type === "BANNED" ||
            membership.leftAt
          ) {
            return;
          }
        }

        const message = await prisma.message.findUnique({
          where: { id: messageId },
        });

        if (!message) return;

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
          update: {}, 
        });

        const updatedReads = await getMessageReads(messageId);

        io.to(roomId).emit("message_read_update", {
          messageId,
          reads: updatedReads,
        });

        io.to(userId).emit("unread_count_cleared", { roomId });
      } catch (error) {
        console.error("Erreur mark_message_read:", error);
      }
    }
  );

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

        const originalMessage = await prisma.message.findUnique({
          where: { id: messageId },
          select: {
            senderId: true,
            roomId: true,
            sender: { select: { id: true, username: true } },
          },
        });

        if (!originalMessage) return;

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

        if (userId !== originalMessage.senderId) {
          await prisma.message.deleteMany({
            where: {
              senderId: userId,
              recipientId: originalMessage.senderId,
              roomId: originalMessage.roomId,
              type: "REACTION",
              reactionId: reaction.id,
            },
          });

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
          
          if (reactionMessage.id && originalMessage.roomId) {
            await prisma.lastMessage.deleteMany({
              where: {
                roomId: originalMessage.roomId,
                userId: { in: [userId, originalMessage.senderId] },
              },
            });

            await prisma.lastMessage.createMany({
              data: [
                {
                  userId: userId,
                  roomId: originalMessage.roomId,
                  messageId: reactionMessage.id,
                },
                {
                  userId: originalMessage.senderId,
                  roomId: originalMessage.roomId,
                  messageId: reactionMessage.id,
                },
              ],
            });

            if (originalMessage.sender?.username && originalMessage.senderId) {
              const [roomsForSender, roomsForRecipient] = await Promise.all([
                getFormattedRooms(userId, username),
                getFormattedRooms(
                  originalMessage.senderId,
                  originalMessage.sender.username
                ),
              ]);

              io.to(userId).emit("room_list_updated", roomsForSender);

              io.to(originalMessage.senderId).emit(
                "room_list_updated",
                roomsForRecipient
              );
            }
          }
        }

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

        if (!message || !message.reactions[0]) return;

        const reactionId = message.reactions[0].id;
        const originalSenderId = message.senderId;

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

        if (originalSenderId && message.roomId) {
          const refreshLastMessage = async (targetId: string) => {
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
              await prisma.lastMessage.deleteMany({
                where: { userId: targetId, roomId: message.roomId as string },
              });
            }
          };

          await Promise.all([
            refreshLastMessage(userId),
            refreshLastMessage(originalSenderId),
          ]);

          if (message.sender?.username) {
            const [roomsForRemover, roomsForAuthor] = await Promise.all([
              getFormattedRooms(userId, username),
              getFormattedRooms(originalSenderId, message.sender.username),
            ]);

            io.to(userId).emit("room_list_updated", roomsForRemover);
            io.to(originalSenderId).emit("room_list_updated", roomsForAuthor);
          }
        }

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
  socket.on(
    "delete_message",
    async ({ messageId, roomId }: { messageId: string; roomId: string }) => {
      console.log(
        chalk.red(`Tentative de suppression: msg ${messageId} par ${userId}`)
      );

      try {
        const messageToDelete = await prisma.message.findUnique({
          where: { id: messageId },
        });

        if (!messageToDelete) {
          return socket.emit("error", { message: "Message introuvable" });
        }

        if (messageToDelete.senderId !== userId) {
          return socket.emit("error", {
            message: "Vous n'avez pas l'autorisation",
          });
        }

        if (roomId === "saved-" + userId) {
          await prisma.message.delete({
            where: { id: messageId },
          });
          io.to(roomId).emit("message_deleted", { messageId, roomId });
          const updatedRooms = await getFormattedRooms(userId, username);
          io.to(userId).emit("room_list_updated", updatedRooms);

          return;
        }

        await prisma.$transaction(async (tx) => {
          const nextLatestMessage = await tx.message.findFirst({
            where: {
              roomId: roomId,
              id: { not: messageId },
            },
            orderBy: { createdAt: "desc" },
          });
          
          if (nextLatestMessage) {
            await tx.lastMessage.updateMany({
              where: {
                roomId: roomId,
                messageId: messageId,
              },
              data: {
                messageId: nextLatestMessage.id,
                createdAt: nextLatestMessage.createdAt,
              },
            });
          } else {
            await tx.lastMessage.deleteMany({
              where: { roomId: roomId, messageId: messageId },
            });
          }

          await tx.message.delete({
            where: { id: messageId },
          });
        });

        io.to(roomId).emit("message_deleted", { messageId, roomId });

        
        const activeMembers = await prisma.roomMember.findMany({
          where: { roomId, leftAt: null, type: { not: "BANNED" } },
          include: { user: true },
        });
        
        await Promise.all(
          activeMembers.map(async (member) => {
            if (member.userId && member.user) {
              try {
                const updatedRooms = await getFormattedRooms(
                  member.userId,
                  member.user.username
                );
                io.to(member.userId).emit("room_list_updated", updatedRooms);
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
      tempId?: string; // AJOUT : ID temporaire envoyé par le client
    }) => {
      const userId = socket.data.user.id;
      const username = socket.data.user.username;
      const { content, roomId, type, recipientId, tempId } = data;

      console.log(chalk.blue("Envoi du message:", content));

      try {
        const isSavedMessage = roomId === `saved-${userId}`;
        let newMessage;

        if (isSavedMessage) {
          const savedMsg = await prisma.message.create({
            data: {
              content,
              senderId: userId,
              type: "SAVED",
            },
            include: getMessageDataInclude(userId),
          });
          
          let emissionType = "CONTENT";
          if (content === "create-" + userId) {
            emissionType = "SAVED";
          }
          const newMessage = { ...savedMsg, type: emissionType };

          socket.join(roomId);
          // AJOUT : Renvoyer tempId au client
          io.to(roomId).emit("receive_message", { newMessage, roomId, tempId });
          
          const updatedRooms = await getFormattedRooms(userId, username);
          io.to(userId).emit("room_list_updated", updatedRooms);
        } else {
          
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

          const activeMembers = await prisma.roomMember.findMany({
            where: { roomId, leftAt: null, type: { not: "BANNED" } },
            include: { user: true },
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
          socket.join(roomId);

          // AJOUT : Renvoyer tempId au client
          io.to(roomId).emit("receive_message", {
            newMessage,
            roomId,
            newRoom: roomData,
            tempId // Important pour le mapping côté client
          });
          
          await Promise.all(
            activeMembers.map(async (member) => {
              if (member.userId && member.user) {
                try {
                  const updatedRooms = await getFormattedRooms(
                    member.userId,
                    member.user.username
                  );
                  io.to(member.userId).emit("room_list_updated", updatedRooms);

                  if (member.userId !== userId) {
                    io.to(member.userId).emit("unread_count_increment", {
                      roomId,
                    });
                  }
                } catch (e) {
                  console.error("Erreur refresh member:", member.userId);
                }
              }
            })
          );
        }
      } catch (error) {
        console.error("Erreur send_message:", error);
        // On pourrait ajouter le tempId ici aussi si on voulait gérer l'erreur spécifiquement
        socket.emit("error", { message: "Erreur lors de l'envoi" });
      }
    }
  );

  socket.on("check_user_status", async ({ userId }) => {
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { isOnline: true, lastSeen: true, id: true },
    });

    if (targetUser) {
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

// @ts-expect-error - L'argument de type 'string' n'est pas attribuable au paramètre de type 'number'.
server.listen(PORT, "0.0.0.0", () => {
  console.log(chalk.blueBright(`🚀 Serveur de chat prêt sur le port ${PORT}`));
});