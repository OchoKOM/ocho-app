import { useSession } from "@/app/(main)/SessionProvider";
import {
  useCreateChatRoomMutation,
  useSaveMessageMutation,
} from "./mutations";
import LoadingButton from "../LoadingButton";
import { MessageCircleMore, Send } from "lucide-react";
import { useToast } from "../ui/use-toast";
import { useActiveRoom } from "@/context/ChatContext";
import { useRouter } from "next/navigation"; // Importation de useRouter
import { ButtonProps } from "../ui/button";
import { cn } from "@/lib/utils";
import { t } from "@/context/LanguageContext";
import { useProgress } from "@/context/ProgressContext";
import { UserData } from "@/lib/types";
import { useState } from "react";
import { useSocket } from "../providers/SocketProvider";

interface MessageButtonProps extends ButtonProps {
  userId: string;
}

export default function MessageButton({
  userId,
  className,
  ...props
}: MessageButtonProps) {
  const { user: loggedinUser } = useSession();
  const { setActiveRoomId } = useActiveRoom();
  const { toast } = useToast();
  const { message } = t();
  const [isPending, setIsPending] = useState(false);
  const { socket } = useSocket();

  const onChatStart = (roomId: string) => {
    setActiveRoomId(roomId);
  }

  const handleChatStart = (user: UserData | null = null) => {
      if (isPending) return;
      if (!socket) return;
  
      setIsPending(true);
  
      // Définir les callbacks pour la réponse du serveur
      // On utilise .once pour n'écouter qu'une seule fois la réponse
      const handleRoomReady = (room: any) => {
        setIsPending(false);
  
        // Nettoyage des écouteurs pour éviter les doublons
        socket.off("room_ready", handleRoomReady);
        socket.off("error_message", handleError);
      };
  
      const handleError = (msg: string) => {
        setIsPending(false);
        toast({ variant: "destructive", description: msg });
        socket.off("room_ready", handleRoomReady);
        socket.off("error_message", handleError);
      };
  
      socket.on("room_ready", handleRoomReady);
      socket.on("error_message", handleError);
  
      // Logique d'envoi
      if (user) {
        // Cas 1 : Message Privé (1v1)
        const userId = user.id;
  
        // Cas spécial : Message à soi-même (Saved Messages)
        if (loggedinUser.id === userId) {
          onChatStart("saved-" + loggedinUser.id);
          return;
        }
  
        socket.emit("start_chat", {
          targetUserId: userId,
          isGroup: false,
        });
      }
    };

  const handleSubmit = () => {
    if (loggedinUser) {
      handleChatStart(loggedinUser);
    }
  };

  return (
    <LoadingButton
      loading={isPending}
      className={cn("bg-primary", className)}
      onClick={handleSubmit}
      {...props}
    >
      {!(isPending) && <MessageCircleMore size={24} />}{" "}
      {message}
    </LoadingButton>
  );
}
