import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { useThemeStore, type ThemeAccent } from "../../features/theme/store";

const accentOptions: Array<{ dotClass: string; label: string; value: ThemeAccent }> = [
  { dotClass: "bg-teal-600", label: "青绿", value: "teal" },
  { dotClass: "bg-blue-600", label: "蓝色", value: "blue" },
  { dotClass: "bg-violet-600", label: "紫色", value: "violet" },
  { dotClass: "bg-orange-600", label: "橙色", value: "orange" },
];

export function AccentControl() {
  const accent = useThemeStore((state) => state.accent);
  const setAccent = useThemeStore((state) => state.setAccent);

  return (
    <ToggleGroup
      aria-label="主题色"
      className="gap-1.5"
      onValueChange={(value) => value && setAccent(value as ThemeAccent)}
      type="single"
      value={accent}
    >
      {accentOptions.map(({ dotClass, label, value }) => (
        <ToggleGroupItem
          aria-label={label}
          className="h-8 gap-1.5 px-2"
          key={value}
          title={label}
          value={value}
        >
          <span aria-hidden="true" className={`size-3 rounded-full ${dotClass}`} />
          <span className="sr-only">{label}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
