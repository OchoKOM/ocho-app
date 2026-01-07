export interface TimeOptions {
  lang?: string;
  long?: boolean;
  full?: boolean;
  relative?: boolean;
  withTime?: boolean;
  calendar?: boolean; 
  clock?: boolean;
}

export class TimeFormatter {
  private full: boolean;
  private lang: string;
  private long: boolean;
  private time: Date;
  private withTime?: boolean = false;
  private relative: boolean;
  private calendar: boolean; // Nouvelle propriété
  private currentDate: Date;
  private clock?: boolean = false;

  // Le constructeur accepte maintenant soit un nombre, soit une instance de Date
  constructor(
    time: number | Date,
    {
      lang = "en-US",
      long = true,
      full = true,
      relative = false,
      withTime = false,
      calendar = false,
      clock = false
    }: TimeOptions,
  ) {
    this.full = full;
    this.long = long;
    this.lang = lang;
    this.relative = relative;
    this.withTime = withTime;
    this.calendar = calendar;
    this.currentDate = new Date();
    this.clock = clock;

    // Si 'time' est un nombre, on le traite comme un timestamp
    if (time instanceof Date) {
      this.time = time;
    } else {
      const timetamp =
        time.toString().length < Date.now().toString().length
          ? time * 1000
          : time;
      this.time = new Date(timetamp);
    }
  }

  private formatNumber(number: number): string {
    return number < 10 ? "0" + number : number.toString();
  }

  private getDocumentLang(): string {
    return this.lang;
  }

  format(): string {
     if (this.clock) {
      return this.formatClock();
    }
    if (this.calendar) {
      return this.formatCalendar();
    }
    if (this.relative) {
      return this.formatRelativeTime();
    }
    return this.full ? this.formatFullTime() : this.formatTime();
  }

  formatTime(): string {
    const length: "long" | "short" = this.long ? "long" : "short";
    const yearOption: Intl.DateTimeFormatOptions = {
      day: "numeric",
      month: length,
      year: "numeric",
    };
    const monthOption: Intl.DateTimeFormatOptions = {
      day: "numeric",
      month: length,
    };
    const weekOption: Intl.DateTimeFormatOptions = { weekday: length };

    const sameYear = this.time.getFullYear() === this.currentDate.getFullYear();
    const timeDifferenceInDays = Math.floor(
      (this.currentDate.getTime() - this.time.getTime()) /
        (24 * 60 * 60 * 1000),
    );

    const hours = this.formatNumber(this.time.getHours());
    const minutes = this.formatNumber(this.time.getMinutes());

    const lang = this.getDocumentLang();

    let formattedTime =
      sameYear &&
      this.time.toLocaleDateString() === this.currentDate.toLocaleDateString()
        ? `${hours}:${minutes}`
        : sameYear
          ? new Intl.DateTimeFormat(
              lang,
              timeDifferenceInDays > 6 ? monthOption : weekOption,
            ).format(this.time)
          : new Intl.DateTimeFormat(lang, yearOption).format(this.time);

    formattedTime = formattedTime[0].toUpperCase() + formattedTime.slice(1);

    if (
      length === "long" &&
      lang.toLowerCase().startsWith("fr") &&
      timeDifferenceInDays > 6
    ) {
      return `le ${formattedTime}`;
    }

    return formattedTime;
  }

  formatFullTime(): string {
    const length: "long" | "short" = this.long ? "long" : "short";
    const yearOption: Intl.DateTimeFormatOptions = {
      day: "numeric",
      month: length,
      year: "numeric",
    };
    const monthOption: Intl.DateTimeFormatOptions = {
      day: "numeric",
      month: length,
    };
    const weekOption: Intl.DateTimeFormatOptions = { weekday: length };

    const sameYear = this.time.getFullYear() === this.currentDate.getFullYear();
    const timeDifferenceInDays = Math.floor(
      (this.currentDate.getTime() - this.time.getTime()) /
        (24 * 60 * 60 * 1000),
    );

    const hours = this.formatNumber(this.time.getHours());
    const minutes = this.formatNumber(this.time.getMinutes());

    const lang = this.getDocumentLang();

    let formattedTime =
      sameYear &&
      this.time.toLocaleDateString() === this.currentDate.toLocaleDateString()
        ? `${hours}:${minutes}`
        : sameYear
          ? `${new Intl.DateTimeFormat(lang, timeDifferenceInDays > 6 ? monthOption : weekOption).format(this.time)}, ${hours}:${minutes}`
          : new Intl.DateTimeFormat(lang, yearOption).format(this.time);

    formattedTime = formattedTime[0].toUpperCase() + formattedTime.slice(1);

    if (
      length === "long" &&
      lang.toLowerCase().startsWith("fr") &&
      timeDifferenceInDays > 6
    ) {
      return `le ${formattedTime}`;
    }

    return formattedTime;
  }

  private formatCalendar(): string {
    const now = new Date();
    const target = new Date(this.time);

    const cleanNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const cleanTarget = new Date(
      target.getFullYear(),
      target.getMonth(),
      target.getDate(),
    );

    const diffDays = Math.floor(
      (cleanNow.getTime() - cleanTarget.getTime()) / 86400000,
    );

    // Aujourd'hui
    if (diffDays === 0) {
      if (this.withTime) {
        return new Intl.RelativeTimeFormat(this.lang, { numeric: "auto" }).format(
        0,
        "day",
      ) + `, ${this.formatClock()}`;
      }
      return new Intl.RelativeTimeFormat(this.lang, { numeric: "auto" }).format(
        0,
        "day",
      );
    }

    // Hier
    if (diffDays === 1) {
      if (this.withTime) {
        return new Intl.RelativeTimeFormat(this.lang, { numeric: "auto" }).format(
        -1,
        "day",
      ) + `, ${this.formatClock()}`;
      }
      return new Intl.RelativeTimeFormat(this.lang, { numeric: "auto" }).format(
        -1,
        "day",
      );
    }

    const startOfWeek = (d: Date) => {
      const day = d.getDay() || 7;
      const res = new Date(d);
      res.setDate(d.getDate() - day + 1);
      return res;
    };

    if (
      startOfWeek(cleanNow).getTime() === startOfWeek(cleanTarget).getTime()
    ) {
      if (this.withTime) {
        return new Intl.DateTimeFormat(this.lang, {
          weekday: "long",
        }).format(target) + `, ${this.formatClock()}`;
      }
      return new Intl.DateTimeFormat(this.lang, {
        weekday: "long",
      }).format(target);
    }

    // Même année
    if (now.getFullYear() === target.getFullYear()) {
      if (this.withTime) {
        return new Intl.DateTimeFormat(this.lang, {
          day: "2-digit", 
          month: "long",
        }).format(target) + `, ${this.formatClock()}`;
      }
      return new Intl.DateTimeFormat(this.lang, {
        day: "2-digit",
        month: "long",
      }).format(target);
    }

    // Année différente
    if (this.withTime) {
      return new Intl.DateTimeFormat(this.lang, {
        day: "2-digit",
        month: "long",
        year: "numeric",
      }).format(target) + `, ${this.formatClock()}`;
    }
    return new Intl.DateTimeFormat(this.lang, {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(target);
  }
  private formatClock(): string {
  const now = new Date();
  const target = new Date(this.time);

  const diffSeconds = Math.floor((now.getTime() - target.getTime()) / 1000);

  // Moins d'une minute → "maintenant"
  if (diffSeconds < 60) {
    return new Intl.RelativeTimeFormat(this.lang, { numeric: "auto" })
      .format(0, "second");
  }

  // Heure localisée
  return new Intl.DateTimeFormat(this.lang, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(target);
}


  formatRelativePeriod(
    maxUnit: keyof typeof TimeFormatter.timeUnits = "year",
    minUnit: keyof typeof TimeFormatter.timeUnits = "second",
  ): string {
    const timestamp = this.time.getTime();
    const now = Date.now();
    const diffInMs = timestamp - now;
    const diffInSeconds = Math.round(diffInMs / 1000);

    const unitsStartTime: {
      [key in keyof typeof TimeFormatter.timeUnits]: number;
    } = {
      second: now,
      minute: new Date().setSeconds(0, 0),
      hour: new Date().setMinutes(0, 0, 0),
      day: new Date().setHours(0, 0, 0, 0),
      week: (() => {
        const date = new Date();
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1);
        return new Date(date.setDate(diff)).setHours(0, 0, 0, 0);
      })(),
      month: new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        1,
      ).setHours(0, 0, 0, 0),
      year: new Date(new Date().getFullYear(), 0, 1).setHours(0, 0, 0, 0),
    };

    const lang = this.getDocumentLang();
    const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });

    let chosenUnit: keyof typeof TimeFormatter.timeUnits | undefined;
    let chosenValue: number | undefined;

    const unitOrder: (keyof typeof TimeFormatter.timeUnits)[] = [
      "second",
      "minute",
      "hour",
      "day",
      "week",
      "month",
      "year",
    ];
    const maxUnitIndex = unitOrder.indexOf(maxUnit);
    const minUnitIndex = unitOrder.indexOf(minUnit);

    for (const unit of unitOrder) {
      const valueInSeconds = TimeFormatter.timeUnits[unit];
      const absValue = Math.abs(diffInSeconds);
      if (absValue < valueInSeconds || unit === "year") {
        chosenUnit = unit;
        chosenValue = Math.round(diffInSeconds / valueInSeconds);
        break;
      }
    }

    const chosenUnitIndex = unitOrder.indexOf(chosenUnit!);

    if (chosenUnitIndex > maxUnitIndex) {
      return this.full ? this.formatFullTime() : this.formatTime();
    }

    if (chosenUnitIndex < minUnitIndex) {
      chosenUnit = minUnit;
      chosenValue = Math.round(
        diffInSeconds / TimeFormatter.timeUnits[minUnit],
      );
    }

    const relativeTime = rtf.format(chosenValue!, chosenUnit!);
    return relativeTime;
  }

  private static timeUnits = {
    second: 1,
    minute: 60,
    hour: 60 * 60,
    day: 60 * 60 * 24,
    week: 60 * 60 * 24 * 7,
    month: 60 * 60 * 24 * 30, // Approximation
    year: 60 * 60 * 24 * 365, // Approximation
  };

  formatRelativeTime(): string {
    const now = new Date();
    const timestamp = this.time.getTime() - 2000;

    const diffInSeconds = Math.floor((timestamp - now.getTime()) / 1000);

    // Choisir le style du format en fonction de this.full
    const style = this.long ? "long" : "short";
    const rtf = new Intl.RelativeTimeFormat(this.getDocumentLang(), {
      numeric: "auto",
      style,
    });

    const timeFrames = [
      { unit: "year", seconds: 60 * 60 * 24 * 365 },
      { unit: "month", seconds: 60 * 60 * 24 * 30 },
      { unit: "week", seconds: 60 * 60 * 24 * 7 },
      { unit: "day", seconds: 60 * 60 * 24 },
      { unit: "hour", seconds: 60 * 60 },
      { unit: "minute", seconds: 60 },
      { unit: "second", seconds: 1 },
    ];

    for (const frame of timeFrames) {
      const elapsed = diffInSeconds / frame.seconds;
      if (Math.abs(elapsed) >= 1) {
        return rtf.format(
          Math.round(elapsed),
          frame.unit as Intl.RelativeTimeFormatUnit,
        );
      }
    }

    return rtf.format(0, "second");
  }
}

export class NumberFormatter {
  private number: number;
  private lang: string;

  constructor(number: number, lang = "en-US") {
    this.number = number;
    this.lang = lang;
  }

  formatNumber(): string {
    const number = this.number;
    const formatter = new Intl.NumberFormat(this.lang, {
      notation: "compact",
      maximumFractionDigits: 1,
    });

    return formatter.format(number);
  }

  formatTime(): string {
    const nombre = this.number;
    const conversions = [
      { seuil: 60, unite: "second", diviseur: 1 },
      { seuil: 3600, unite: "minute", diviseur: 60 },
      { seuil: 3600 * 24, unite: "hour", diviseur: 3600 },
      { seuil: 604800, unite: "day", diviseur: 86400 },
      { seuil: 2629800, unite: "week", diviseur: 604800 },
      { seuil: 31557600, unite: "month", diviseur: 2629800 },
      { seuil: Infinity, unite: "year", diviseur: 31557600 },
    ];

    const { seuil, unite, diviseur } =
      conversions.find(({ seuil }) => nombre < seuil) ||
      conversions[conversions.length - 1];
    const quotient =
      seuil === Infinity ? nombre : Math.floor(nombre / diviseur);

    const options: Intl.NumberFormatOptions = {
      style: "unit",
      unit: unite,
    };

    const formateur = new Intl.NumberFormat(this.lang, options);
    return formateur.format(quotient);
  }
}
