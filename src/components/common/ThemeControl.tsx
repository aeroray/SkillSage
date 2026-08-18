import { Laptop, Moon, Sun } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
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
    <ToggleGroup
      aria-label="外观模式"
      onValueChange={(value) => value && setMode(value as ThemeMode)}
      type="single"
      value={mode}
    >
      {themeOptions.map(({ icon: Icon, label, value }) => (
        <ToggleGroupItem aria-label={label} key={value} title={label} value={value}>
          <Icon aria-hidden="true" />
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
