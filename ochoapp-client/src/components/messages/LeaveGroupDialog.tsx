import { RoomData } from "@/lib/types";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { LogOutIcon } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "../ui/use-toast";
import LoadingButton from "../LoadingButton";
import { useSession } from "@/app/(main)/SessionProvider";
import { t } from "@/context/LanguageContext";
import { useSocket } from "@/components/providers/SocketProvider";

interface LeaveGroupDialogProps {
  room: RoomData;
  onDelete: () => void;
}

export default function LeaveGroupDialog({ room, onDelete }: LeaveGroupDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [deleteGroup, setDeleteGroup] = useState(false);
  const [loading, setLoading] = useState(false); // État de chargement unifié

  const { user: loggedUser } = useSession();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { socket } = useSocket();
  const {
    leave,
    leaveAndDelete,
    cancel,
    leaveGroup,
    leaveGroupPrompt,
    leaveGroupInfo,
    thisGroup,
    groupLeftSuccess,
  } = t();

  const memberId = loggedUser.id;
  const roomId = room.id;
  const member = room.members.find((member) => member.userId === memberId);

  function onClose() {
    setIsOpen(false);
  }

  function handleLeave(shouldDelete: boolean) {
    if (!socket) return;
    setDeleteGroup(shouldDelete);
    setLoading(true);

    socket.emit("group_leave", { roomId, deleteGroup: shouldDelete }, (res: any) => {
      setLoading(false);
      
      if (res.success) {
        // Invalider le cache
        const queryKey = ["chat", roomId];
        queryClient.invalidateQueries({ queryKey });

        toast({
          description: groupLeftSuccess.replace(
            "[name]",
            room.name || "ce groupe",
          ),
        });
        
        onClose();
        
        if (shouldDelete) {
            onDelete();
        }
      } else {
        console.error(res.error);
        toast({
          variant: "destructive",
          description: res.error || "Une erreur est survenue",
        });
      }
    });
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <div className="flex items-center space-x-2">
          <div
            className={`relative flex aspect-square h-fit min-h-[35px] w-fit min-w-fit items-center justify-center overflow-hidden rounded-full bg-destructive`}
          >
            <LogOutIcon
              className="absolute flex items-center justify-center text-white"
              size={35 - 16}
            />
          </div>
          <p>{leaveGroup}</p>
        </div>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>{leaveGroup}</DialogTitle>
        <p>
          {leaveGroupPrompt.replace(
            "[name]",
            room.name || thisGroup.toLowerCase(),
          )}
        </p>
        {member?.type === "OWNER" && <p>{leaveGroupInfo}</p>}
        <DialogFooter className="p-2">
          <Button variant="secondary" onClick={onClose}>
            {cancel}
          </Button>
          <LoadingButton
            loading={loading && !deleteGroup}
            variant="destructive"
            onClick={() => handleLeave(false)}
          >
            {leave}
          </LoadingButton>
          {member?.type === "OWNER" && (
            <LoadingButton
              loading={loading && deleteGroup}
              variant="destructive"
              onClick={() => handleLeave(true)}
            >
              {leaveAndDelete}
            </LoadingButton>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}