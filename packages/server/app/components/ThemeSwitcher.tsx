import { Moon, Sun } from "lucide-react";
import { useTheme } from "~/theme/ThemeContext";
import type { ThemePreference } from "~/theme";
import { useLocale } from "~/i18n/LocaleContext";
import { cn } from "~/lib/utils";

/**
 * Icon theme toggle: click cycles light ↔ dark (stores explicit preference).
 * Sun shown when currently light; moon when dark. Animated rotate/fade swap.
 */
export function ThemeSwitcher({
    className,
    size = "sm",
}: {
    className?: string;
    size?: "sm" | "md";
}) {
    const { resolved, setPreference } = useTheme();
    const { t } = useLocale();

    const isDark = resolved === "dark";
    const dim = size === "sm" ? "h-9 w-9" : "h-10 w-10";
    const icon = size === "sm" ? "h-4 w-4" : "h-5 w-5";

    function toggle() {
        const next: ThemePreference = isDark ? "light" : "dark";
        setPreference(next);
    }

    return (
        <button
            type="button"
            onClick={toggle}
            className={cn(
                "relative inline-flex items-center justify-center rounded-full border border-input bg-background",
                "text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline-none",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                "ring-offset-background overflow-hidden",
                dim,
                className,
            )}
            aria-label={
                isDark ? t("theme.switchToLight") : t("theme.switchToDark")
            }
            title={isDark ? t("theme.switchToLight") : t("theme.switchToDark")}
        >
            {/* Sun: visible in light mode */}
            <Sun
                className={cn(
                    icon,
                    "absolute transition-all duration-300 ease-out",
                    isDark
                        ? "rotate-90 scale-0 opacity-0"
                        : "rotate-0 scale-100 opacity-100 text-amber-500",
                )}
                aria-hidden
            />
            {/* Moon: visible in dark mode */}
            <Moon
                className={cn(
                    icon,
                    "absolute transition-all duration-300 ease-out",
                    isDark
                        ? "rotate-0 scale-100 opacity-100 text-indigo-300"
                        : "-rotate-90 scale-0 opacity-0",
                )}
                aria-hidden
            />
            <span className="sr-only">
                {isDark ? t("theme.dark") : t("theme.light")}
            </span>
        </button>
    );
}
