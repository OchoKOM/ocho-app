import { useState } from "react";
import { t } from "@/context/LanguageContext";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, CheckCircle } from "lucide-react";
import { PasswordInput } from "@/components/PasswordInput";
import { logout } from "@/app/(auth)/actions";
import { useQueryClient } from "@tanstack/react-query";

export default function DeleteAccountDialog() {
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const queryClient = useQueryClient();

  const lang = t([
    'deleteMyAccount',
    'password',
    'delete',
    'cancel',
    'deleting',
    'accountDeleted',
    'accountDeleteError',
    'passwordRequired',
    'deleteAccountWarning',
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError(lang.passwordRequired);
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch('/api/users/delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(true);
        queryClient.clear();
        // Redirect to logout after a short delay
        setTimeout(() => {
          logout();
        }, 2000);
      } else {
        setError(data.error || lang.accountDeleteError);
      }
    } catch (err) {
      setError(lang.accountDeleteError);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="text-center">
        <h4 className="text-xl font-semibold mb-2">{lang.deleteMyAccount}</h4>
        <p className="text-sm text-muted-foreground mb-4">
          {lang.deleteAccountWarning}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="deletePassword" className="text-sm font-medium">
            {lang.password}
          </label>
          <PasswordInput
            id="deletePassword"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={lang.password}
            disabled={isLoading}
            className="mt-1"
          />
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
            <AlertDescription>{lang.accountDeleted}</AlertDescription>
          </Alert>
        )}

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setPassword("");
              setError(null);
              setSuccess(false);
            }}
            disabled={isLoading}
            className="flex-1"
          >
            {lang.cancel}
          </Button>
          <Button
            type="submit"
            variant="destructive"
            disabled={!password || isLoading}
            className="flex-1"
          >
            {isLoading ? lang.deleting : lang.delete}
          </Button>
        </div>
      </form>
    </div>
  );
}
