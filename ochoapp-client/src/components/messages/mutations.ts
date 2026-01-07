import { useToast } from "@/components/ui/use-toast";
import {
  InfiniteData,
  QueryKey,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  addAdmin,
  addMembers,
  banMember,
  deleteMessage,
  leaveGroup,
  removeMember,
  restoreMember,
} from "./actions";
import { t } from "@/context/LanguageContext";


export function useAddMemberMutation() {
  const { toast } = useToast();
  const { somethingWentWrong, groupAddError, groupAddSuccess } = t()

  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: addMembers,
    onSuccess: async ({ newMembersList, userId }) => {
      const queryKey = ["chat-rooms", userId];
      // Vérifier si createInfo est défini avant de l'assigner à newMessage
      if (!newMembersList.length) {
        toast({
          variant: "destructive",
          description:
            groupAddError,
        });
        return;
      }
      queryClient.invalidateQueries({ queryKey });

      toast({
        description: groupAddSuccess,
      });
      return { newMembersList };
    },
    onError(error) {
      console.error(error);
      toast({
        variant: "destructive",
        description: somethingWentWrong,
      });
    },
  });
  return mutation;
}
export function useAddAdminMutation() {
  const { toast } = useToast();
  const { somethingWentWrong } = t()

  const mutation = useMutation({
    mutationFn: addAdmin,
    onSuccess: ({ newRoomMember }) => {
      return { newRoomMember };
    },
    onError(error) {
      console.error(error);
      toast({
        variant: "destructive",
        description: somethingWentWrong,
      });
    },
  });
  return mutation;
}
export function useRemoveMemberMutation() {
  const { toast } = useToast();
  const { somethingWentWrong } = t()

  const mutation = useMutation({
    mutationFn: removeMember,
    onError(error) {
      console.error(error);
      toast({
        variant: "destructive",
        description: somethingWentWrong,
      });
    },
  });
  return mutation;
}
export function useBanMemberMutation() {
  const { toast } = useToast();
  const { somethingWentWrong } = t()

  const mutation = useMutation({
    mutationFn: banMember,
    onError(error) {
      console.error(error);
      toast({
        variant: "destructive",
        description: somethingWentWrong,
      });
    },
  });
  return mutation;
}
export function useRestoreMemberMutation() {
  const { toast } = useToast();
  const { somethingWentWrong } = t()

  const mutation = useMutation({
    mutationFn: restoreMember,
    onError(error) {
      console.error(error);
      toast({
        variant: "destructive",
        description: somethingWentWrong,
      });
    },
  });
  return mutation;
}

export function useLeaveGroupMutation() {
  const { toast } = useToast();
  const { somethingWentWrong } = t()

  const mutation = useMutation({
    mutationFn: leaveGroup,
    onError(error) {
      console.error(error);
      toast({
        variant: "destructive",
        description: somethingWentWrong,
      });
    },
  });
  return mutation;
}
