import { MessageData } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Plus, Search, X, Reply, Copy, Forward, Trash2, UserMinus, HeartOff } from "lucide-react";
import { useState, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { SKIN_TONES, QUICK_REACTIONS, EMOJI_CATEGORIES } from "../lists/emoji-lists";
import { MessageBubbleContent } from "../Message";
import UserAvatar from "@/components/UserAvatar";
import { useSession } from "../../SessionProvider";

export interface ReactionData {
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


const applySkinTone = (
  emojiChar: string,
  supportsSkinTone: boolean,
  toneModifier: string,
) => {
  if (!supportsSkinTone || !toneModifier) return emojiChar;
  return emojiChar + toneModifier;
};

export default function ReactionOverlay({
  message,
  originalRect,
  onClose,
  isOwner,
  unavailableMessage,
  onDeleteRequest,
  onReact,
  currentReactions
}: {
  message: MessageData;
  originalRect: DOMRect;
  onClose: () => void;
  isOwner: boolean;
  unavailableMessage: string;
  onDeleteRequest: () => void;
  onReact: (emoji: string) => void;
  currentReactions: ReactionData[];
}){
  const [verticalOffset, setVerticalOffset] = useState(0);
  const [showFullPicker, setShowFullPicker] = useState(false);
  const [currentSkinTone, setCurrentSkinTone] = useState(SKIN_TONES[0]);
  const [mounted, setMounted] = useState(false);

  // Check if user has already reacted with a specific emoji to handle toggle
  const hasReactedWith = (emoji: string) => {
      return currentReactions.some(r => r.content === emoji && r.hasReacted);
  }

  useEffect(() => {
    setMounted(true);
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useLayoutEffect(() => {
    const windowHeight = window.innerHeight;
    const spaceBelow = windowHeight - originalRect.bottom;
    const MENU_HEIGHT_ESTIMATE = 400;

    if (spaceBelow < MENU_HEIGHT_ESTIMATE) {
      const neededShift = MENU_HEIGHT_ESTIMATE - spaceBelow + 20;
      setVerticalOffset(-neededShift);
    }
  }, [originalRect]);

  const handleReact = (emoji: string) => {
    onReact(emoji); 
    onClose();
  };

  const overlayContent = (
    <div className="fixed inset-0 isolate z-50 flex flex-col font-sans">
      <div
        className={cn(
          "absolute inset-0 bg-background/60 backdrop-blur-sm transition-opacity duration-200",
          mounted ? "opacity-100" : "opacity-0",
        )}
        onClick={onClose}
      />

      <div
        className="absolute transition-transform duration-300 ease-out will-change-transform"
        style={{
          top: originalRect.top,
          left: originalRect.left,
          width: originalRect.width,
          height: originalRect.height,
          transform: `translateY(${verticalOffset}px)`,
        }}
      >
        <div className="pointer-events-none z-20 h-full w-full">
          <MessageBubbleContent
            message={message}
            isOwner={isOwner}
            unavailableMessage={unavailableMessage}
            isClone={true}
          />
        </div>

        <div
          className={cn(
            "absolute top-full z-10 mt-2 flex flex-col gap-2 transition-all duration-300",
            isOwner ? "right-0 items-end" : "left-0 items-start",
            mounted ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0",
          )}
        >
          <div
            className={cn(
              "flex w-[320px] flex-col gap-2 transition-all duration-300",
              isOwner ? "items-end" : "items-start",
            )}
          >
            {!showFullPicker ? (
              <div
                className={cn(
                  "flex items-center gap-1 rounded-full border border-border bg-popover p-1.5 shadow-2xl",
                  isOwner ? "origin-top-right" : "origin-top-left",
                )}
              >
                {QUICK_REACTIONS.map((emoji) => {
                   const isActive = hasReactedWith(emoji);
                   return (
                  <button
                    key={emoji}
                    onClick={() => handleReact(emoji)}
                    className={cn(
                        "font-emoji flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-2xl transition-transform hover:scale-125 active:scale-95",
                        isActive ? "bg-primary/20 ring-2 ring-primary" : "hover:bg-muted"
                    )}
                  >
                    {emoji}
                  </button>
                )})}
                <div className="mx-1 h-6 w-[1px] bg-border"></div>
                <button
                  onClick={() => setShowFullPicker(true)}
                  className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
                >
                  <Plus size={20} />
                </button>
              </div>
            ) : (
              <div
                className={cn(
                  "flex w-full flex-col overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl duration-200 animate-in zoom-in-95",
                  isOwner ? "origin-top-right" : "origin-top-left",
                )}
              >
                <div className="flex items-center gap-2 border-b border-border p-3">
                  <Search size={16} className="text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Rechercher..."
                    autoFocus
                    className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                  />
                  <button
                    onClick={() => setShowFullPicker(false)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Teint
                  </span>
                  <div className="flex gap-1">
                    {SKIN_TONES.map((tone) => (
                      <button
                        key={tone.id}
                        onClick={() => setCurrentSkinTone(tone)}
                        className={cn(
                          "h-5 w-5 rounded-full border-2 transition-transform hover:scale-110",
                          currentSkinTone.id === tone.id
                            ? "scale-110 border-primary"
                            : "border-transparent",
                        )}
                        style={{ backgroundColor: tone.color }}
                      />
                    ))}
                  </div>
                </div>
                <div className="h-64 overflow-y-auto p-2 scrollbar-thin">
                  {EMOJI_CATEGORIES.map((cat) => {
                    const { icon: Icon } = cat;
                    return (
                      <div key={cat.id} className="mb-4">
                        <h3 className="sticky top-0 z-10 mb-2 flex items-center gap-1 bg-popover/95 px-1 py-1 text-xs font-bold text-muted-foreground backdrop-blur">
                          <Icon size={18} /> {cat.name}
                        </h3>
                        <div className={cn("grid grid-cols-7 gap-1 font-emoji")}>
                          {cat.emojis.map((emojiObj, idx) => {
                            const finalEmoji = applySkinTone(
                              emojiObj.char,
                              emojiObj.s,
                              currentSkinTone.modifier,
                            );
                            const isActive = hasReactedWith(finalEmoji);
                            return (
                              <button
                                key={idx}
                                onClick={() => handleReact(finalEmoji)}
                                className={cn(
                                    "flex h-9 w-9 cursor-pointer select-none items-center justify-center rounded-lg text-xl transition-colors",
                                    isActive ? "bg-primary/20 ring-2 ring-primary" : "hover:bg-muted"
                                )}
                              >
                                {finalEmoji}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {!showFullPicker && (
            <div
              className={cn(
                "w-48 overflow-hidden rounded-xl border border-border bg-popover/90 py-1 shadow-2xl backdrop-blur-xl transition-all duration-300 animate-in fade-in slide-in-from-top-2",
                isOwner ? "origin-top-right" : "origin-top-left",
              )}
            >
              <button className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted">
                <Reply size={14} /> Répondre
              </button>
              <button
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
                onClick={() => {
                  navigator.clipboard.writeText(message.content || "");
                  onClose();
                }}
              >
                <Copy size={14} /> Copier
              </button>
              <button className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted">
                <Forward size={14} /> Transférer
              </button>
              {isOwner && (
                <>
                  <div className="my-1 h-[1px] bg-border" />
                  <button 
                    onClick={() => {
                      onDeleteRequest();
                      onClose();
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
                  >
                    <Trash2 size={14} /> Supprimer
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(overlayContent, document.body);
};

// --- COMPOSANT LISTE DE REACTION ---
export function ReactionList ({ 
  reactions, 
  onReact,
  onShowDetails
}: { 
  reactions: ReactionData[], 
  onReact: (emoji: string) => void,
  onShowDetails: (event: React.MouseEvent) => void
}){
  const {user: {id: currentUserId}} = useSession()
  if (!reactions || reactions.length === 0) return null;

  
  return (
    <div className="flex flex-wrap gap-1 mt-1 z-10">
      {reactions.map((reaction, index) => {
        const hasReacted = reaction.users.some(user => user.id === currentUserId);
        return(
        <button
          key={`${reaction.content}-${index}`}
          onClick={(e) => {
            e.stopPropagation();
            onShowDetails(e);
          }}
          className={cn(
            "flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border transition-all hover:scale-105 active:scale-95",
            hasReacted 
              ? "bg-primary/20 border-primary/50 text-primary shadow-sm" 
              : "bg-muted/50 border-transparent hover:bg-muted text-muted-foreground"
          )}
        >
          <span className="font-emoji">{reaction.content}</span>
          <span className="text-xs font-bold">{reaction.count}</span>
        </button>
      )})}
    </div>
  );
};

// --- SOUS-COMPOSANT : DETAILS REACTION (POPOVER) ---
export function ReactionDetailsPopover({
  reactions,
  currentUserId,
  onClose,
  onRemoveReaction,
  anchorRect,
}: {
  reactions: ReactionData[];
  currentUserId: string;
  onClose: () => void;
  onRemoveReaction: () => void;
  anchorRect: DOMRect;
}) {
  const [activeTab, setActiveTab] = useState<string>(reactions[0]?.content || "");
  const activeReaction = reactions.find(r => r.content === activeTab);

  return createPortal(
    <>
      <div className="fixed inset-0 z-50 bg-transparent" onClick={onClose} />
      <div
        className="fixed z-50 flex w-72 flex-col overflow-hidden rounded-2xl border border-border bg-popover shadow-xl animate-in fade-in zoom-in-95 duration-200"
        style={{
          top: anchorRect.bottom + 8,
          left: Math.min(anchorRect.left, window.innerWidth - 300),
        }}
      >
        {/* Header Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto border-b border-border bg-muted/30 p-2 scrollbar-none">
          {reactions.map((r) => (
            <button
              key={r.content}
              onClick={() => setActiveTab(r.content)}
              className={cn(
                "flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium transition-colors",
                activeTab === r.content
                  ? "bg-background shadow-sm text-foreground"
                  : "hover:bg-background/50 text-muted-foreground"
              )}
            >
              <span className="font-emoji">{r.content}</span>
              <span className="text-xs opacity-70">{r.count}</span>
            </button>
          ))}
        </div>

        {/* User List */}
        <div className="flex max-h-60 flex-col overflow-y-auto p-2">
          {activeReaction?.users.map((user) => {
            const isMe = user.id === currentUserId;
            return (
              <div key={user.id} className="flex items-center justify-between rounded-lg p-2 hover:bg-muted/50">
                <div className="flex items-center gap-3">
                  <UserAvatar
                    userId={user.id}
                    avatarUrl={user.avatarUrl}
                    size={32}
                  />
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold">
                      {isMe ? "Vous" : user.displayName}
                    </span>
                    <span className="text-xs text-muted-foreground">@{user.username}</span>
                  </div>
                </div>
                
                {isMe && (
                   <button
                    onClick={() => {
                        onRemoveReaction();
                        onClose();
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                    title="Retirer ma réaction"
                   >
                       <HeartOff size={16} />
                   </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>,
    document.body
  );
};
