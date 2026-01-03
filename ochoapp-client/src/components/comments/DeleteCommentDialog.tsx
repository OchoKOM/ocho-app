import { CommentData } from "@/lib/types";
import { useDeleteCommentMutation, useDeleteReplyMutation } from "./mutations";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import LoadingButton from "../LoadingButton";
import { Button } from "../ui/button";
import { t } from "@/context/LanguageContext";

interface DeleteCommentDialogProps {
  comment: CommentData;
  open: boolean;
  onClose: () => void;
}

export default function DeleteCommentDialog({
  comment,
  open,
  onClose,
}: DeleteCommentDialogProps) {
  const mutation = useDeleteCommentMutation();
  const replyMutation = useDeleteReplyMutation();
  const { commentDeleteConfirmPrompt, cancel, delete: deleteText } = t(
    ["commentDeleteConfirmPrompt", "cancel", "delete"]
  );

  function handleOpenChange(open: boolean) {
    if (!open || !mutation.isPending || !replyMutation.isPending) {
      onClose();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{deleteText}</DialogTitle>
          <DialogDescription>
            <p className="">{commentDeleteConfirmPrompt}</p>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <LoadingButton
            variant="destructive"
            onClick={() => {
              comment.type === "COMMENT"
                ? mutation.mutate(comment.id, { onSuccess: onClose })
                : replyMutation.mutate(comment.id, { onSuccess: onClose });
            }}
            loading={mutation.isPending || replyMutation.isPending}
          >
            {deleteText}
          </LoadingButton>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={mutation.isPending || replyMutation.isPending}
          >
            {cancel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
