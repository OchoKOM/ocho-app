# Translations Needed

This file lists all plain text strings that need to be translated in the client-side code. These strings are not using the t() function and need to be added to the vocabulary and wrapped with t().

## Files Requiring Translations

### src/app/layout.tsx
- Line ~25: `<title>{%s - OchoApp}</title>`
  - Translation key: `appTitle`
  - English: "{title} - OchoApp"
  - French: "{title} - OchoApp"

- Line ~29: `<meta name="description" content="The social media app for power nerd" />`
  - Translation key: `appDescription`
  - English: "The social media app for power nerd"
  - French: "L'application de réseau social pour les nerds puissants"

### src/app/(mobile)/redirect/page.tsx
- Line ~15: `<h1 className="text-xl font-bold">Redirection</h1>`
  - Translation key: `redirection`
  - English: "Redirection"
  - French: "Redirection"

- Line ~20: `<p>Si l&apos;application ne s&apos;ouvre pas automatiquement, veuillez autoriser les redirections ou <a href={...}>cliquez ici</a>.</p>`
  - Translation key: `appNotOpening`
  - English: "If the application does not open automatically, please allow redirections or click here."
  - French: "Si l'application ne s'ouvre pas automatiquement, veuillez autoriser les redirections ou cliquez ici."

- Line ~25: `<p>Vous pouvez fermer cet onglet si l&apos;application a été ouverte.</p>`
  - Translation key: `closeTabIfOpened`
  - English: "You can close this tab if the application has been opened."
  - French: "Vous pouvez fermer cet onglet si l'application a été ouverte."

- Line ~28: `<p>Vous pouvez fermer cet onglet si aucune redirection n&apos;est en cours.</p>`
  - Translation key: `closeTabNoRedirection`
  - English: "You can close this tab if no redirection is in progress."
  - French: "Vous pouvez fermer cet onglet si aucune redirection n'est en cours."

- Line ~35: `<span className="hidden @[11rem]:inline">Telecharger l&apos;application</span>`
  - Translation key: `downloadApp`
  - English: "Download the application"
  - French: "Télécharger l'application"

- Line ~42: `<span className="hidden @[11rem]:inline">Revenir à l&apos;accueil</span>`
  - Translation key: `backToHome`
  - English: "Back to home"
  - French: "Revenir à l'accueil"

### src/app/(main)/posts/[postId]/page.tsx
- Line ~90: `<h2 className="text-xl font-bold">A propos de {user.displayName}</h2>`
  - Translation key: `aboutUser`
  - English: "About {name}"
  - French: "À propos de {name}"

- Line ~25: `<p className="w-fit text-destructive">Vous n&apos;êtes pas autorisé à afficher cette page. veuillez d&apos;abord vous connecter ou creer un compte</p>`
  - Translation key: `unauthorizedAccess`
  - English: "You are not authorized to view this page. Please log in or create an account first."
  - French: "Vous n'êtes pas autorisé à afficher cette page. Veuillez d'abord vous connecter ou créer un compte."

### src/app/(main)/messages/Message.tsx
- Line ~10: `<span className="uppercase">Annuler</span>`
  - Translation key: `cancel`
  - English: "Cancel"
  - French: "Annuler"

- Line ~15: `<span className="z-10 italic tracking-wider">Suppression...</span>`
  - Translation key: `deleting`
  - English: "Deleting..."
  - French: "Suppression..."

### src/app/(main)/messages/Chat.tsx
- Line ~300: `title="Fermer la discussion"`
  - Translation key: `closeChat`
  - English: "Close chat"
  - French: "Fermer la discussion"

- Line ~400: `<p>Aucun message trouvé pour "{searchQuery}"</p>`
  - Translation key: `noMessageFoundFor`
  - English: "No message found for \"{searchQuery}\"."
  - French: "Aucun message trouvé pour \"{searchQuery}\"."

- Line ~450: `<p>{message}</p>` where message = "Envoi de messages non autorisés"
  - Translation key: `messageSendingNotAllowed`
  - English: "Sending messages not allowed"
  - French: "Envoi de messages non autorisés"

- Line ~550: `<>Envoi...</>`
  - Translation key: `sending`
  - English: "Sending..."
  - French: "Envoi..."

- Line ~560: `<>Échec</>`
  - Translation key: `failed`
  - English: "Failed"
  - French: "Échec"

- Line ~570: `title="Réessayer l'envoi"`
  - Translation key: `retrySend`
  - English: "Retry sending"
  - French: "Réessayer l'envoi"

- Line ~620: `écrivent...`
  - Translation key: `areTyping`
  - English: "are typing..."
  - French: "écrivent..."

### src/components/OchoKOMLogo.tsx
- Line ~5: `<div className="text-muted-foreground">from</div>`
  - Translation key: `from`
  - English: "from"
  - French: "de"

- Line ~10: `<span className="text-logo-text">Ocho</span>`
  - Translation key: `ocho`
  - English: "Ocho"
  - French: "Ocho"

- Line ~15: `<span className="text-logo">KOM</span>`
  - Translation key: `kom`
  - English: "KOM"
  - French: "KOM"

### src/app/(auth)/Buttons.tsx
- Line ~5: `<Button onClick={() => navigate("/")}>Accueil</Button>`
  - Translation key: `home`
  - English: "Home"
  - French: "Accueil"

- Line ~8: `<Button variant="secondary" onClick={() => navigate("/signup")}>Inscription</Button>`
  - Translation key: `signup`
  - English: "Sign Up"
  - French: "Inscription"

### src/app/(main)/notifications/Notifications.tsx
- Line ~10: `<h2 className="text-xl">Vos activités s&apos;afficheront ici.</h2>`
  - Translation key: `activitiesWillShowHere`
  - English: "Your activities will be displayed here."
  - French: "Vos activités s'afficheront ici."

- Line ~20: `<h2 className="text-xl">Quelque chose s&apos;est mal passé.</h2>`
  - Translation key: `somethingWentWrong`
  - English: "Something went wrong."
  - French: "Quelque chose s'est mal passé."

### src/app/(main)/messages/SideBar.tsx
- Line ~340: `<p>Aucun résultat trouvé pour "{searchQuery}"</p>`
  - Translation key: `noSearchResultFor`
  - English: "No result for \"{searchQuery}\"."
  - French: "Aucun résultat trouvé pour \"{searchQuery}\"."

### src/app/(main)/messages/RoomPreview.tsx
- Line ~90: `Utilisateur OchoApp écrit...`
  - Translation key: `userTyping`
  - English: "OchoApp User is typing..."
  - French: "Utilisateur OchoApp écrit..."

- Line ~92: `et ... écrivent...`
  - Translation key: `andOthersTyping`
  - English: "and [count] others are typing..."
  - French: "et [count] autres écrivent..."

- Line ~94: `, ... et ... écrivent...`
  - Translation key: `multipleTyping`
  - English: "[names], [name] and [count] others are typing..."
  - French: "[names], [name] et [count] autres écrivent..."

### src/components/messages/StartChatForm.tsx
- Line ~15: `<span>Créer un groupe de discussion</span>`
  - Translation key: `createGroupChat`
  - English: "Create group chat"
  - French: "Créer un groupe de discussion"

### src/components/messages/StartChatDialog.tsx
- Line ~10: `<DialogTitle>Nouvelle discussion</DialogTitle>`
  - Translation key: `newChat`
  - English: "New chat"
  - French: "Nouvelle discussion"

### src/components/messages/DeleteMessageDialog.tsx
- Line ~8: `<DialogTitle>Supprimer ?</DialogTitle>`
  - Translation key: `deleteQuestion`
  - English: "Delete?"
  - French: "Supprimer ?"

- Line ~12: `<DialogDescription>Êtes-vous sûr de vouloir supprimer ce message ?</DialogDescription>`
  - Translation key: `deleteMessageConfirm`
  - English: "Are you sure you want to delete this message?"
  - French: "Êtes-vous sûr de vouloir supprimer ce message ?"

- Line ~20: `>Supprimer</LoadingButton>`
  - Translation key: `delete`
  - English: "Delete"
  - French: "Supprimer"

- Line ~25: `>Annuler</Button>`
  - Translation key: `cancel`
  - English: "Cancel"
  - French: "Annuler"

### src/components/posts/Post.tsx
- Line ~150: `<p className="text-destructive">Format media non supporté</p>`
  - Translation key: `unsupportedMediaFormat`
  - English: "Unsupported media format"
  - French: "Format media non supporté"

### src/components/Reaction.tsx
- Line ~50: `<span>Aucune réaction</span>`
  - Translation key: `noReactions`
  - English: "No reactions"
  - French: "Aucune réaction"

### src/components/Zoomable.tsx
- Line ~80: `title="Reinitialiser"`
  - Translation key: `reset`
  - English: "Reset"
  - French: "Réinitialiser"

- Line ~87: `title="Réduire"`
  - Translation key: `zoomOut`
  - English: "Zoom out"
  - French: "Réduire"

- Line ~94: `title="Agrandir"`
  - Translation key: `zoomIn`
  - English: "Zoom in"
  - French: "Agrandir"

### src/components/ui/carousel.tsx
- Line ~15: `<span className="sr-only">Previous slide</span>`
  - Translation key: `previousSlide`
  - English: "Previous slide"
  - French: "Diapositive précédente"

- Line ~25: `<span className="sr-only">Next slide</span>`
  - Translation key: `nextSlide`
  - English: "Next slide"
  - French: "Diapositive suivante"

### src/components/ui/dialog.tsx
- Line ~50: `<span className="sr-only">Close</span>`
  - Translation key: `close`
  - English: "Close"
  - French: "Fermer"

## Status
- [ ] Add translations to vocabulary.ts
- [ ] Apply t() function to all listed strings
- [ ] Test translations in both languages
