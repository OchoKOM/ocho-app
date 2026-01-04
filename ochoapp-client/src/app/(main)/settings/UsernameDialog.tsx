import { useState } from "react";
import { useSession } from "../SessionProvider";
import { t } from "@/context/LanguageContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, CheckCircle } from "lucide-react";

export default function UsernameDialog() {
  const { user } = useSession();
  const [newUsername, setNewUsername] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const lang = t([
    'currentUsername',
    'newUsername',
    'changeUsername',
    'usernameRequirements',
    'usernameChanged',
    'usernameChangeError',
    'usernameTaken',
    'usernameTooFrequent'
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim()) return;

    setIsLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch('/api/users/update', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: newUsername.trim() }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(true);
        // Update the session user data if needed
        window.location.reload(); // Simple refresh to update UI
      } else {
        setError(data.error || lang.usernameChangeError);
      }
    } catch (err) {
      setError(lang.usernameChangeError);
    } finally {
      setIsLoading(false);
    }
  };

  const isValidUsername = (username: string) => {
    return /^[a-zA-Z0-9_]{3,20}$/.test(username);
  };

  const canChangeUsername = () => {
    if (!user?.lastUsernameChange) return true;

    const now = new Date();
    const lastChange = new Date(user.lastUsernameChange);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    return lastChange <= oneMonthAgo;
  };

  const getDaysUntilNextChange = (): number => {
    if (!user?.lastUsernameChange) return 0;

    const now = new Date();
    const lastChange = new Date(user.lastUsernameChange);
    const nextChangeDate = new Date(lastChange.getTime() + 30 * 24 * 60 * 60 * 1000);
    const diffTime = nextChangeDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return Math.max(0, diffDays);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="text-center">
        <h4 className="text-xl font-semibold mb-2">{lang.changeUsername}</h4>
        <p className="text-sm text-muted-foreground">
          {lang.currentUsername}: @{user?.username}
        </p>
      </div>

      {!canChangeUsername() && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {t('usernameChangeLimit', { days: getDaysUntilNextChange() })}
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="username" className="text-sm font-medium">
            {lang.newUsername}
          </label>
          <Input
            id="username"
            type="text"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            placeholder="new_username"
            disabled={!canChangeUsername() || isLoading}
            className="mt-1"
          />
          <p className="text-xs text-muted-foreground mt-1">
            {lang.usernameRequirements}
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>{lang.usernameChanged}</AlertDescription>
          </Alert>
        )}

        <Button
          type="submit"
          disabled={
            !canChangeUsername() ||
            !isValidUsername(newUsername) ||
            newUsername === user?.username ||
            isLoading
          }
          className="w-full"
        >
          {isLoading ? t('updating') : lang.changeUsername}
        </Button>
      </form>
    </div>
  );
}
