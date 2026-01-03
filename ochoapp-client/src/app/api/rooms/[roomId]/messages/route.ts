import { validateRequest } from "@/auth";
import prisma from "@/lib/prisma";
import {
  getMessageDataInclude,
  MessageData,
  MessagesSection,
} from "@/lib/types";

export async function GET(
  req: Request,
  {
    params,
  }: {
    params: Promise<{ roomId: string }>;
  },
) {
  const {roomId} = await params
  try {
    const url = new URL(req.url);
    const cursor = url.searchParams.get("cursor") || undefined;
    const pageSize = 10;

    const { user } = await validateRequest();

    if (!user) {
      return Response.json({ error: "Action non autorisée" }, { status: 401 });
    }

    let messages: MessageData[];

    // Vérifier si on récupère des messages d'un canal ou des messages sauvegardés
    if (roomId === `saved-${user.id}`) {
      // Récupérer les messages sauvegardés (envoyés à soi-même)
      messages = await prisma.message.findMany({
        where: {
          senderId: user.id,
          type: "SAVED",
        },
        include: getMessageDataInclude(user.id),
        orderBy: { createdAt: "desc" },
        take: pageSize + 1,
        cursor: cursor ? { id: cursor } : undefined,
      });
      if (messages[0]) {
        // modifier les types des messages qui n'ont pas "created" comme contenu et qui ne sont pas en premier message en "CONTENT"
        messages = messages.map((message) => {
          if (message.content !== `create-${user.id}`) {
            message.type = "CONTENT";
          }
          return message;
        });
      }
    } else {
      // Récupérer les messages d'un canal spécifique
      const room = await prisma.room.findFirst({
        where: {
          id: roomId,
        },
      });
      if (!room) {
        return Response.json(
          { error: "Le canal n'existe pas" },
          { status: 400 },
        );
      }

      messages = await prisma.message.findMany({
        where: { roomId },
        include: getMessageDataInclude(user.id),
        orderBy: { createdAt: "desc" },
        take: pageSize + 1, // Récupère une page supplémentaire pour vérifier s'il y a une page suivante
        cursor: cursor ? { id: cursor } : undefined,
      });
    }

    const nextCursor =
      messages.length > pageSize ? messages[pageSize].id : null;
    const roomData = await prisma.room.findUnique({
      where: { id: roomId },
    });

    const isGroup = roomData?.isGroup;

    if (isGroup) {
      const member = await prisma.roomMember.findUnique({
        where: {
          roomId_userId: {
            roomId,
            userId: user.id,
          },
        },
      });
      if (!member) {
        return Response.json(
          { error: "Vous n'êtes pas membre de ce groupe" },
          { status: 403 },
        );
      }
      if (member.type === "BANNED") {
        return Response.json(
          { error: "Vous avez été suspendu de ce groupe par un administrateur" },
          { status: 403 },
        );
      }

      const leftDate = member.leftAt;
      if (leftDate) {
        // Filters messages dates older than leftdate
        messages = messages.filter((message) => message.createdAt < leftDate);
      }
    }
    messages =  messages.map(message=>{
      const formattedMsg: MessageData = {
        ...message
      } 
      return formattedMsg
    })

    const data: MessagesSection = {
      messages: messages.slice(0, pageSize),
      nextCursor,
    };

    return Response.json(data);
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: "Erreur interne du serveur" },
      { status: 500 },
    );
  }
}
