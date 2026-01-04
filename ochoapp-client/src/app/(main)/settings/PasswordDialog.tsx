import { useState, useEffect } from "react";
import { t } from "@/context/LanguageContext";
import { VocabularyKey } from "@/lib/vocabulary";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, CheckCircle } from "lucide-react";
import { PasswordInput } from "@/components/PasswordInput";
import { useSession } from "../SessionProvider";

export default function PasswordDialog() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const {user} = useSession()

  useEffect(() => {
    const fetchHasPassword = async () => {
      try {
        const response = await fetch('/api/users/has-password');
        const data = await response.json();
        setHasPassword(data.hasPassword);
      } catch (err) {
        console.error('Failed to fetch password status:', err);
        setHasPassword(false); // Default to false on error
      }
    };

    fetchHasPassword();
  }, []);

  const lang = t([
    'currentPassword',
    'newPassword',
    'confirmPassword',
    'changePassword',
    'passwordRequirements',
    'passwordChanged',
    'passwordChangeError',
    'passwordMismatch',
    'passwordTooWeak',
    'enterCurrentPassword'
  ]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || !confirmPassword) return;
    if (hasPassword && !currentPassword) return;

    if (newPassword !== confirmPassword) {
      setError(lang.passwordMismatch);
      return;
    }

    if (newPassword.length < 8) {
      setError(lang.passwordTooWeak);
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const body: any = { password: newPassword };
      if (hasPassword) {
        body.currentPassword = currentPassword;
      }

      const response = await fetch('/api/users/update', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(true);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        setError(data.error || lang.passwordChangeError);
      }
    } catch (err) {
      setError(lang.passwordChangeError);
    } finally {
      setIsLoading(false);
    }
  };

  const isFormValid = () => {
    if (hasPassword === null) return false; // Still loading
    if (!newPassword || !confirmPassword) return false;
    if (newPassword !== confirmPassword) return false;
    if (newPassword.length < 8) return false;
    if (hasPassword && !currentPassword) return false;
    return true;
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="text-center">
        <h4 className="text-xl font-semibold mb-2">{lang.changePassword}</h4>
        <p className="text-sm text-muted-foreground">
          {t('passwordSecurityNote')}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {hasPassword && (
          <div>
            <label htmlFor="currentPassword" className="text-sm font-medium">
              {lang.currentPassword}
            </label>
            <PasswordInput
              id="currentPassword"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder={lang.currentPassword}
              disabled={isLoading}
              className="mt-1"
            />
          </div>
        )}

        <div>
          <label htmlFor="newPassword" className="text-sm font-medium">
            {lang.newPassword}
          </label>
          <PasswordInput
            id="newPassword"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder={lang.newPassword}
            disabled={isLoading}
            className="mt-1"
          />
        </div>

        <div>
          <label htmlFor="confirmPassword" className="text-sm font-medium">
            {lang.confirmPassword}
          </label>
          <PasswordInput
            id="confirmPassword"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder={lang.confirmPassword}
            disabled={isLoading}
            className="mt-1"
          />
        </div>

        <p className="text-xs text-muted-foreground">
          {lang.passwordRequirements}
        </p>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>{lang.passwordChanged}</AlertDescription>
          </Alert>
        )}

        <Button
          type="submit"
          disabled={!isFormValid() || isLoading}
          className="w-full"
        >
          {isLoading ? t('updating') : lang.changePassword}
        </Button>
      </form>
    </div>
  );
}
