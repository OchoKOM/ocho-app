# Files Needing Translations

This file lists all files that display plain text without using the `t()` function or `gettranslation` function. Each file includes the lines that need translations.

## src/components/ui/dialog.tsx
- `<span className="sr-only">Close</span>`

## src/components/ui/carousel.tsx
- `<span className="sr-only">Previous slide</span>`
- `<span className="sr-only">Next slide</span>`

## src/components/OchoKOMLogo.tsx
- `<div className="text-muted-foreground">from</div>`
- `<span className="text-logo-text">Ocho</span>`
- `<span className="text-logo">KOM</span>`

## src/components/messages/StartChatDialog.tsx
- `<DialogTitle>Nouvelle discussion</DialogTitle>`

## src/components/messages/DeleteMessageDialog.tsx
- `>Supprimer</LoadingButton>`
- `>Annuler</Button>`

## src/app/(mobile)/redirect/page.tsx
- `<h1 className="text-xl font-bold">Redirection</h1>`

## src/app/(main)/messages/Message.tsx
- `<span className="uppercase">Annuler</span>`

## src/app/(auth)/layout.tsx
- `<p>En utilisant OchoApp, vous acceptez les présentes <a href="/terms-of-use" className="text-primary hover:underline max-sm:underline">Conditions d&apos;Utilisation</a> et avez lu la <a href="/privacy" className="text-primary hover:underline max-sm:underline">politique de confidentialité</a>.</p>`

## src/app/(auth)/Buttons.tsx
- `<Button onClick={() => navigate("/")}>Accueil</Button>`
- `<Button variant="secondary" onClick={() => navigate("/signup")}>Inscription</Button>`
- `<Button variant="secondary" onClick={() => navigate("/login")}>Connexion</Button>`
