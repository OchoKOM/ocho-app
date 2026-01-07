import { RoomData } from "@/lib/types";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useToast } from "../ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { CircleX } from "lucide-react";
import LoadingButton from "../LoadingButton";
import { t } from "@/context/LanguageContext";
import { useSocket } from "@/components/providers/SocketProvider";

interface BanDialogProps {
  memberId: string;
  room: RoomData;
}

export default function BanDialog({ memberId, room }: BanDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { socket } = useSocket();
  const {
    appUser,
    banFromGroup,
    groupBanPrompt,
    groupBanInfo,
    cancel,
    ban,
    thisGroup,
    groupBanSuccess,
  } = t();

  function onClose() {
    setIsOpen(false);
  }

  const roomId = room.id;
  const member = room.members.find((member) => member.userId === memberId);

  function handleSubmit() {
    if (!socket) return;
    setLoading(true);

    socket.emit("group_ban_member", { roomId, memberId }, (res: any) => {
      setLoading(false);
      
      if (res.success) {
        const queryKey = ["chat", roomId];
        queryClient.invalidateQueries({ queryKey });

        toast({
          description: groupBanSuccess
            .replace("[name]", member?.user?.displayName || "un utilisateur")
            .replace("[group]", room.name || "ce groupe"),
        });
        onClose();
      } else {
        console.error(res.error);
        toast({
          variant: "destructive",
          description: res.error || "Erreur lors du bannissement",
        });
      }
    });
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="destructive"
          className="flex w-full justify-center gap-3"
        >
          <CircleX size={24} /> {banFromGroup}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>{banFromGroup}</DialogTitle>
        <p>
          {groupBanPrompt
            .replace("[name]", member?.user?.displayName || appUser)
            .replace("[group]", room.name || thisGroup)}
        </p>
        <p>{groupBanInfo}</p>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {cancel}
          </Button>
          <LoadingButton
            loading={loading}
            variant="destructive"
            onClick={handleSubmit}
          >
            {ban}
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}