import { PostData } from "@/lib/types";
import { useState } from "react";
import { useSubmitCommentMutation } from "./mutations";
import { Button } from "../ui/button";
import { Loader2, SendIcon } from "lucide-react";
import { Textarea } from "../ui/textarea";
import { useSession } from "@/app/(main)/SessionProvider";
import UserAvatar from "../UserAvatar";
import { useToast } from "../ui/use-toast";
import { t } from "@/context/LanguageContext";
import { useProgress } from "@/context/ProgressContext";

interface CommentInput {
  post: PostData;
}

export default function CommentInput({ post }: CommentInput) {
  const [input, setInput] = useState("");
  const { user } = useSession();
  const { toast } = useToast();

  const {
    invalidInput,
    commentAs
  } = t([
    "invalidInput",
    "commentAs"
  ]);

  const {startNavigation: navigate} = useProgress();

  const mutation = useSubmitCommentMutation(post.id);


  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!input.trim() || input.trim().length > 1000) {
      toast({
        variant: "destructive",
        description: invalidInput,
      });
      return;
    }

    mutation.mutate(
      {
        post,
        content: input.trim(),
      },
      {
        onSuccess: (newComment) => {
          navigate(`/posts/${post.id}?comment=${newComment.id}`);
          setInput("");
        },
      },
    );
  }

  return (
    <form
      className="flex w-full items-center p-2 max-sm:outline max-sm:outline-muted max-sm:has-[.reply-input]/comments:hidden"
      onSubmit={onSubmit}
    >
      <div className="flex w-full items-end gap-2 rounded-3xl border border-input bg-background p-1 ring-primary ring-offset-background transition-all duration-75 has-[textarea:focus-visible]:outline-none has-[textarea:focus-visible]:ring-2 has-[textarea:focus-visible]:ring-ring has-[textarea:focus-visible]:ring-offset-2">
        <UserAvatar userId={user.id} avatarUrl={user.avatarUrl} size={40} />
        <Textarea
          placeholder={commentAs.replace("[name]", user.displayName.split(" ")[0])}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          autoFocus={!post._count.comments}
          className="max-h-40 flex-1 rounded-none border-none bg-transparent p-0 py-1.5 outline-none focus-visible:ring-transparent"
          rows={1}
          maxLength={1000}
        />
        <Button
          type="submit"
          size="icon"
          className="flex-shrink-0 rounded-full"
          disabled={!input.trim() || mutation.isPending}
        >
          {mutation.isPending ? (
            <Loader2 className="animate-spin" />
          ) : (
            <SendIcon />
          )}
        </Button>
      </div>
    </form>
  );
}
