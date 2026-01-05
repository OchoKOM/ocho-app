import { useEffect, useState } from "react";
import { useSession } from "../SessionProvider";
import { t } from "@/context/LanguageContext";
import Time from "@/components/Time";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useUpdateUserMutation } from "@/components/users/mutations";

// Fonction utilitaire pour savoir si une année est bissextile
function isLeapYear(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

// Fonction pour connaître le nombre de jours dans un mois donné
function getDaysInMonth(month: number, year: number) {
  if (month === 1) {
    // Février
    return isLeapYear(year) ? 29 : 28;
  }
  const monthDays = [31, 30, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return monthDays[month];
}

export default function BirthdayDialog() {
  const { user } = useSession();
  const lang = t(['noBirthdate', 'day', 'year', 'updateBirthdate', 'mustBeAtLeast13', 'month']);
  const updateUserMutation = useUpdateUserMutation();

  const today = new Date();
  const currentYear = today.getFullYear();
  const minimumYear = currentYear - 13;

  const currentBirthday = user?.birthday;
  console.log(currentBirthday);
  
  const [selectedDate, setSelectedDate] = useState<Date>(
    currentBirthday ?? new Date(minimumYear, today.getMonth(), today.getDate()),
  );


  const day = selectedDate.getDate();
  const month = selectedDate.getMonth();
  const year = selectedDate.getFullYear();

  const [tempYear, setTempYear] = useState<string>(year.toString());
  const [tempDay, setTempDay] = useState<string>(day.toString());

  const maxDaysInSelectedMonth = getDaysInMonth(month, year);

  function isAtLeast13YearsOld(date: Date, refDate: Date) {
    const age = refDate.getFullYear() - date.getFullYear();
    const hasHadBirthdayThisYear =
      refDate.getMonth() > date.getMonth() ||
      (refDate.getMonth() === date.getMonth() &&
        refDate.getDate() >= date.getDate());
    return age > 13 || (age === 13 && hasHadBirthdayThisYear);
  }

  const isValidBirthday = isAtLeast13YearsOld(selectedDate, today);

  // Gestion sécurisée des modifications
  const handleDayChange = (value: string) => {
    setTempDay(value);
    
    if (value === "") return;
    
    const numValue = Number(value);
    if (isNaN(numValue)) return;
    
    // Si l'utilisateur a entré 2 chiffres (jour complet)
    if (value.length === 2) {
      const newDay = Math.max(1, Math.min(numValue, maxDaysInSelectedMonth));
      setSelectedDate(new Date(year, month, newDay));
      setTempDay(newDay.toString()); // Réinitialise si nécessaire
    }
  };

  const handleMonthChange = (newMonth: number) => {
    const maxDays = getDaysInMonth(newMonth, year);
    const newDay = Math.min(day, maxDays);
    setSelectedDate(new Date(year, newMonth, newDay));
    if (tempDay === "" || isNaN(Number(tempDay))) {
      setTempDay(day.toString());
    } else {
      const numDay = Number(tempDay);
      const validDay = Math.max(1, Math.min(numDay, maxDaysInSelectedMonth));
      if (numDay !== validDay) {
        setTempDay(validDay.toString());
        setSelectedDate(new Date(year, month, validDay));
      }
    }
  };

  const handleYearChange = (value: string) => {
    if (tempDay === "" || isNaN(Number(tempDay))) {
      setTempDay(day.toString());
    } else {
      const numDay = Number(tempDay);
      const validDay = Math.max(1, Math.min(numDay, maxDaysInSelectedMonth));
      if (numDay !== validDay) {
        setTempDay(validDay.toString());
        setSelectedDate(new Date(year, month, validDay));
      }
    }
    setTempYear(value);
    if (value === "") return;

    const numValue = Number(value);
    if (isNaN(numValue)) return;

    // On ne met à jour que si l'année est complète (4 chiffres)
    if (value.length === 4) {
      const newYear = Math.max(1900, Math.min(numValue, minimumYear));
      const maxDays = getDaysInMonth(month, newYear);
      const newDay = Math.min(day, maxDays);
      setSelectedDate(new Date(newYear, month, newDay));
    }
  };

  return (
    <div className="flex flex-col items-center gap-5">
      <h4 className="text-center text-xl">
        {currentBirthday ? <Time time={currentBirthday} /> : lang.noBirthdate}
      </h4>

      <div className="flex flex-col items-center gap-5">
        <div className="flex gap-3">
          <Input
            type="number"
            max={maxDaysInSelectedMonth}
            min={1}
            step={1}
            id="day"
            value={tempDay}
            onChange={(e) => handleDayChange(e.target.value)}
            onBlur={() => {
              if (tempDay === "" || isNaN(Number(tempDay))) {
                setTempDay(day.toString());
              } else {
                const numDay = Number(tempDay);
                const validDay = Math.max(1, Math.min(numDay, maxDaysInSelectedMonth));
                if (numDay !== validDay) {
                  setTempDay(validDay.toString());
                  setSelectedDate(new Date(year, month, validDay));
                }
              }
            }}
            placeholder={lang.day}
          />
          <MonthSelect currentMonth={month} onMonthSelect={handleMonthChange} />
          <Input
            type="number"
            min={1900}
            max={minimumYear}
            step={1}
            id="year"
            value={tempYear}
            onChange={(e) => handleYearChange(e.target.value)}
            onBlur={() => {
              if (tempYear === "" || isNaN(Number(tempYear))) {
                setTempYear(year.toString());
              } else if (tempYear.length < 4) {
                // Si l'année n'est pas complète, on réinitialise
                setTempYear(year.toString());
              }
              if (tempDay === "" || isNaN(Number(tempDay))) {
                setTempDay(day.toString());
              } else {
                const numDay = Number(tempDay);
                const validDay = Math.max(1, Math.min(numDay, maxDaysInSelectedMonth));
                if (numDay !== validDay) {
                  setTempDay(validDay.toString());
                  setSelectedDate(new Date(year, month, validDay));
                }
              }
            }}
            placeholder={lang.year}
          />
        </div>

        <Button
          disabled={!isValidBirthday || updateUserMutation.isPending}
          aria-disabled={!isValidBirthday || updateUserMutation.isPending}
          onClick={() => updateUserMutation.mutate({ birthday: selectedDate })}
        >
          {lang.updateBirthdate}
        </Button>

        {!isValidBirthday && (
          <p className="text-sm text-red-500">{lang.mustBeAtLeast13}</p>
        )}
      </div>
    </div>
  );
}

interface MonthSelectProps {
  currentMonth: number;
  onMonthSelect: (month: number) => void;
}

function MonthSelect({ currentMonth, onMonthSelect }: MonthSelectProps) {
  const lang = t(['month']);

  const getLabels = (month: number) =>
    new Date(0, month).toLocaleString("default", { month: "long" });

  const months = Array.from({ length: 12 }, (_, i) => (
    <SelectItem key={i} value={`${i}`}>
      {getLabels(i)}
    </SelectItem>
  ));

  return (
    <div className="*:rounded-md *:border *:border-input *:bg-background *:px-3 *:py-2 *:text-sm *:ring-offset-background *:placeholder:text-muted-foreground *:focus-visible:outline-none *:focus-visible:ring-2 *:focus-visible:ring-ring *:focus-visible:ring-offset-2 *:disabled:cursor-not-allowed *:disabled:opacity-50">
      <Select
        onValueChange={(value) => onMonthSelect(Number(value))}
        value={`${currentMonth}`}
      >
        <SelectTrigger>
          <SelectValue placeholder={lang.month} />
        </SelectTrigger>
        <SelectContent>{months}</SelectContent>
      </Select>
    </div>
  );
}
