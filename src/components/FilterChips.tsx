"use client";

interface FilterChipsProps {
  label: string;
  options: string[];
  selected: string | null;
  onSelect: (value: string | null) => void;
}

export function FilterChips({ label, options, selected, onSelect }: FilterChipsProps) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-1" role="group" aria-label={label}>
      <button
        onClick={() => onSelect(null)}
        className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors duration-150 cursor-pointer ${
          selected === null
            ? "bg-upcoming text-white"
            : "bg-card text-muted border border-border hover:text-foreground"
        }`}
      >
        全部
      </button>
      {options.map((option) => (
        <button
          key={option}
          onClick={() => onSelect(option === selected ? null : option)}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors duration-150 cursor-pointer ${
            selected === option
              ? "bg-upcoming text-white"
              : "bg-card text-muted border border-border hover:text-foreground"
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
