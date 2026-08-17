import { Laptop, Moon, Sun } from "lucide-react";
import { Button } from "../ui/button";
import { useThemeStore, type ThemeMode } from "../../features/theme/store";

const themeOptions: Array<{ icon: typeof Sun; label: string; value: ThemeMode }> = [
  { icon: Sun, label: "浅色", value: "light" },
  { icon: Moon, label: "深色", value: "dark" },
  { icon: Laptop, label: "系统", value: "system" },
];

export function ThemeControl() {
  const mode = useThemeStore((state) => state.mode);
  const setMode = useThemeStore((state) => state.setMode);

  return (
    <div className="flex items-center gap-1 rounded-lg bg-muted p-1" role="group" aria-label="外观模式">
      {themeOptions.map(({ icon: Icon, label, value }) => (
        <Button
          aria-pressed={mode === value}
          className={mode === value ? "bg-card text-foreground shadow-sm" : ""}
          key={value}
          onClick={() => setMode(value)}
          size="icon"
          title={label}
          variant="ghost"
        >
          <Icon aria-hidden="true" className="h-4 w-4" />
          <span className="sr-only">{label}</span>
        </Button>
      ))}
    </div>
  );
}
